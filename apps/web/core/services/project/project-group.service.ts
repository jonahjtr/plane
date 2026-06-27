/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TProjectGroup } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * DK fork: CRUD for sidebar project folders (workspace-scoped).
 */
export class ProjectGroupService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getProjectGroups(workspaceSlug: string): Promise<TProjectGroup[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/project-groups/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createProjectGroup(workspaceSlug: string, data: Partial<TProjectGroup>): Promise<TProjectGroup> {
    return this.post(`/api/workspaces/${workspaceSlug}/project-groups/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProjectGroup(
    workspaceSlug: string,
    groupId: string,
    data: Partial<TProjectGroup>
  ): Promise<TProjectGroup> {
    return this.patch(`/api/workspaces/${workspaceSlug}/project-groups/${groupId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteProjectGroup(workspaceSlug: string, groupId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/project-groups/${groupId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
