/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { observable, action, computed, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TProjectGroup } from "@plane/types";
// services
import { ProjectGroupService } from "@/services/project";
// store
import type { CoreRootStore } from "../root.store";

export type TGroupedProjects = {
  /** group id, or "ungrouped" sentinel */
  groupId: string | "ungrouped";
  projectIds: string[];
};

export interface IProjectGroupStore {
  // observables
  groupMap: Record<string, TProjectGroup>;
  loader: boolean;
  assignmentVersion: number;
  // computed
  groupIds: string[];
  rootGroupIds: string[];
  // helpers
  getGroupById: (groupId: string | null | undefined) => TProjectGroup | undefined;
  getSubgroupIds: (parentId: string) => string[];
  getProjectIdsByGroup: (groupId: string | null) => string[];
  // fetch
  fetchProjectGroups: (workspaceSlug: string) => Promise<TProjectGroup[]>;
  // CRUD
  createProjectGroup: (workspaceSlug: string, data: Partial<TProjectGroup>) => Promise<TProjectGroup>;
  updateProjectGroup: (workspaceSlug: string, groupId: string, data: Partial<TProjectGroup>) => Promise<TProjectGroup>;
  deleteProjectGroup: (workspaceSlug: string, groupId: string) => Promise<void>;
  // assignment
  assignProjectToGroup: (workspaceSlug: string, projectId: string, groupId: string | null) => Promise<void>;
}

export class ProjectGroupStore implements IProjectGroupStore {
  // observables
  groupMap: Record<string, TProjectGroup> = {};
  loader: boolean = false;
  // bump this on every group assignment so computedFn invalidates
  assignmentVersion: number = 0;
  // root
  rootStore: CoreRootStore;
  // services
  projectGroupService: ProjectGroupService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      groupMap: observable,
      loader: observable,
      assignmentVersion: observable,
      // computed
      groupIds: computed,
      rootGroupIds: computed,
      // actions
      fetchProjectGroups: action,
      createProjectGroup: action,
      updateProjectGroup: action,
      deleteProjectGroup: action,
      assignProjectToGroup: action,
    });
    this.rootStore = _rootStore;
    this.projectGroupService = new ProjectGroupService();
  }

  /** All group ids, ordered by sort_order then name. */
  get groupIds(): string[] {
    const groups = sortBy(Object.values(this.groupMap), ["sort_order", "name"]);
    return groups.map((g) => g.id);
  }

  /** Top-level group ids (parent === null). */
  get rootGroupIds(): string[] {
    const groups = sortBy(
      Object.values(this.groupMap).filter((g) => !g.parent),
      ["sort_order", "name"]
    );
    return groups.map((g) => g.id);
  }

  getGroupById = computedFn((groupId: string | null | undefined): TProjectGroup | undefined => {
    if (!groupId) return undefined;
    return this.groupMap[groupId];
  });

  /** Child group ids for a given parent, ordered. */
  getSubgroupIds = computedFn((parentId: string): string[] => {
    const subs = sortBy(
      Object.values(this.groupMap).filter((g) => g.parent === parentId),
      ["sort_order", "name"]
    );
    return subs.map((g) => g.id);
  });

  /**
   * Project ids belonging to a group. Pass null for ungrouped projects.
   *
   * Reads assignmentVersion to force MobX to invalidate this computedFn
   * when a project is moved between groups (the version bump is the signal
   * that the project.group field changed somewhere in the projectMap).
   */
  getProjectIdsByGroup = computedFn((groupId: string | null): string[] => {
    // touch the version counter so MobX knows this computed depends on it
    void this.assignmentVersion;
    const { joinedProjectIds } = this.rootStore.projectRoot.project;
    const projectMap = this.rootStore.projectRoot.project.projectMap;
    return joinedProjectIds.filter((pid) => {
      const project = projectMap[pid];
      if (!project) return false;
      const pGroup = project.group ?? null;
      return pGroup === groupId;
    });
  });

  fetchProjectGroups = async (workspaceSlug: string): Promise<TProjectGroup[]> => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.projectGroupService.getProjectGroups(workspaceSlug);
      runInAction(() => {
        this.groupMap = {};
        response.forEach((group) => {
          set(this.groupMap, [group.id], group);
        });
        this.loader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  createProjectGroup = async (workspaceSlug: string, data: Partial<TProjectGroup>): Promise<TProjectGroup> => {
    const response = await this.projectGroupService.createProjectGroup(workspaceSlug, data);
    runInAction(() => {
      set(this.groupMap, [response.id], response);
    });
    return response;
  };

  updateProjectGroup = async (
    workspaceSlug: string,
    groupId: string,
    data: Partial<TProjectGroup>
  ): Promise<TProjectGroup> => {
    // optimistic
    const previous = this.groupMap[groupId];
    runInAction(() => {
      set(this.groupMap, [groupId], { ...previous, ...data });
    });
    try {
      const response = await this.projectGroupService.updateProjectGroup(workspaceSlug, groupId, data);
      runInAction(() => {
        set(this.groupMap, [response.id], response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.groupMap, [groupId], previous);
      });
      throw error;
    }
  };

  deleteProjectGroup = async (workspaceSlug: string, groupId: string): Promise<void> => {
    await this.projectGroupService.deleteProjectGroup(workspaceSlug, groupId);
    runInAction(() => {
      // remove the group and any subgroups (cascade on backend)
      const subIds = this.getSubgroupIds(groupId);
      [groupId, ...subIds].forEach((id) => {
        delete this.groupMap[id];
      });
      // bump version so project lists re-compute (projects became ungrouped)
      this.assignmentVersion++;
    });
  };

  /**
   * Assign (or unassign with groupId=null) a project to a group.
   * Optimistically updates the project map AND bumps assignmentVersion
   * so all getProjectIdsByGroup computeds invalidate immediately.
   */
  assignProjectToGroup = async (
    workspaceSlug: string,
    projectId: string,
    groupId: string | null
  ): Promise<void> => {
    const projectMap = this.rootStore.projectRoot.project.projectMap;
    const previousGroup = projectMap[projectId]?.group ?? null;

    // optimistic update — move the project in the UI immediately
    runInAction(() => {
      if (projectMap[projectId]) {
        set(projectMap, [projectId, "group"], groupId);
      }
      this.assignmentVersion++;
    });

    try {
      await this.rootStore.projectRoot.project.updateProject(workspaceSlug, projectId, {
        group: groupId,
      });
    } catch (error) {
      // rollback on failure
      runInAction(() => {
        if (projectMap[projectId]) {
          set(projectMap, [projectId, "group"], previousGroup);
        }
        this.assignmentVersion++;
      });
      throw error;
    }
  };
}
