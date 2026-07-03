/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { EIssuesStoreType, TIssue, TIssueGroupByOptions, TIssueOrderByOptions } from "@plane/types";
import type { GroupDropLocation } from "@/components/issues/issue-layouts/utils";
import { handleGroupDragDrop } from "@/components/issues/issue-layouts/utils";
import { ISSUE_FILTER_DEFAULT_DATA } from "@/store/issue/helpers/base-issues.store";
import { useIssueDetail } from "./store/use-issue-detail";
import { useIssues } from "./store/use-issues";
import { useProjectState } from "./store/use-project-state";
import { useIssuesActions } from "./use-issues-actions";

// DK fork: workflow order of state groups, for the parent->children
// forward-cascade. Higher index = further along the board.
const STATE_GROUP_ORDER: Record<string, number> = {
  backlog: 0,
  unstarted: 1,
  started: 2,
  completed: 3,
  cancelled: 4,
};

type DNDStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.PROFILE
  | EIssuesStoreType.ARCHIVED
  | EIssuesStoreType.WORKSPACE_DRAFT
  | EIssuesStoreType.TEAM
  | EIssuesStoreType.TEAM_VIEW
  | EIssuesStoreType.EPIC
  | EIssuesStoreType.TEAM_PROJECT_WORK_ITEMS;

export const useGroupIssuesDragNDrop = (
  storeType: DNDStoreType,
  orderBy: TIssueOrderByOptions | undefined,
  groupBy: TIssueGroupByOptions | undefined,
  subGroupBy?: TIssueGroupByOptions
) => {
  const { workspaceSlug } = useParams();

  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { updateIssue } = useIssuesActions(storeType);
  const {
    issues: { getIssueIds, addCycleToIssue, removeCycleFromIssue, changeModulesInIssue },
    issueMap,
  } = useIssues(storeType);
  const { getStateById } = useProjectState();

  /**
   * DK fork: forward-cascade for sub-work-items.
   * When a PARENT is dragged to a new state:
   *  - moving FORWARD (target group later in the workflow): children whose
   *    state is at-or-behind the target are pulled forward to it. Children
   *    already ahead stay put.
   *  - moving BACKWARD: parent moves alone, children stay.
   */
  const cascadeStateToChildren = (projectId: string, parentIssueId: string, newStateId: string) => {
    if (!updateIssue) return;
    const newState = getStateById(newStateId);
    if (!newState) return;
    const newOrder = STATE_GROUP_ORDER[newState.group] ?? -1;

    const parent = getIssueById(parentIssueId);
    const oldState = getStateById(parent?.state_id);
    const oldOrder = oldState ? (STATE_GROUP_ORDER[oldState.group] ?? -1) : -1;
    // sequence disambiguates states within the same group
    const movingForward =
      newOrder > oldOrder || (newOrder === oldOrder && !!oldState && newState.sequence > oldState.sequence);
    if (!movingForward) return;

    // find in-project children of this parent from the issue map
    const childIds = Object.keys(issueMap ?? {}).filter((id) => issueMap[id]?.parent_id === parentIssueId);
    let movedCount = 0;
    for (const childId of childIds) {
      const child = issueMap[childId];
      if (!child || child.state_id === newStateId) continue;
      const childState = getStateById(child.state_id);
      const childOrder = childState ? (STATE_GROUP_ORDER[childState.group] ?? -1) : -1;
      const childBehindOrEqual =
        childOrder < newOrder ||
        (childOrder === newOrder && !!childState && childState.sequence <= newState.sequence);
      if (!childBehindOrEqual) continue; // child is ahead — never pull backward
      movedCount += 1;
      updateIssue(child.project_id ?? projectId, childId, { state_id: newStateId }).catch(() =>
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "A sub-work-item could not follow its parent",
        })
      );
    }
    if (movedCount > 0)
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Moved together",
        message: `${movedCount} sub-work-item${movedCount === 1 ? "" : "s"} moved forward with the parent`,
      });
  };

  /**
   * update Issue on Drop, checks if modules or cycles are changed and then calls appropriate functions
   * @param projectId
   * @param issueId
   * @param data
   * @param issueUpdates
   */
  const updateIssueOnDrop = async (
    projectId: string,
    issueId: string,
    data: Partial<TIssue>,
    issueUpdates: {
      [groupKey: string]: {
        ADD: string[];
        REMOVE: string[];
      };
    }
  ) => {
    const errorToastProps = {
      type: TOAST_TYPE.ERROR,
      title: "Error!",
      message: "Error while updating work item",
    };
    const moduleKey = ISSUE_FILTER_DEFAULT_DATA["module"];
    const cycleKey = ISSUE_FILTER_DEFAULT_DATA["cycle"];

    const isModuleChanged = Object.keys(data).includes(moduleKey);
    const isCycleChanged = Object.keys(data).includes(cycleKey);

    if (isCycleChanged && workspaceSlug) {
      if (data[cycleKey]) {
        addCycleToIssue(workspaceSlug.toString(), projectId, data[cycleKey]?.toString() ?? "", issueId).catch(() =>
          setToast(errorToastProps)
        );
      } else {
        removeCycleFromIssue(workspaceSlug.toString(), projectId, issueId).catch(() => setToast(errorToastProps));
      }
      delete data[cycleKey];
    }

    if (isModuleChanged && workspaceSlug && issueUpdates[moduleKey]) {
      changeModulesInIssue(
        workspaceSlug.toString(),
        projectId,
        issueId,
        issueUpdates[moduleKey].ADD,
        issueUpdates[moduleKey].REMOVE
      ).catch(() => setToast(errorToastProps));
      delete data[moduleKey];
    }

    // DK fork: if this drop changes the state, cascade forward to
    // sub-work-items BEFORE updating the parent (we need the parent's
    // old state to know the drag direction).
    if (data.state_id) cascadeStateToChildren(projectId, issueId, data.state_id);

    updateIssue && updateIssue(projectId, issueId, data).catch(() => setToast(errorToastProps));
  };

  const handleOnDrop = async (source: GroupDropLocation, destination: GroupDropLocation) => {
    if (
      source.columnId &&
      destination.columnId &&
      destination.columnId === source.columnId &&
      destination.id === source.id
    )
      return;

    await handleGroupDragDrop(
      source,
      destination,
      getIssueById,
      getIssueIds,
      updateIssueOnDrop,
      groupBy,
      subGroupBy,
      orderBy !== "sort_order"
    ).catch((err) => {
      setToast({
        title: "Error!",
        type: TOAST_TYPE.ERROR,
        message: err?.detail ?? "Failed to perform this action",
      });
    });
  };

  return handleOnDrop;
};
