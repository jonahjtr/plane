/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Disclosure, Transition } from "@headlessui/react";
import { Plus, MoreHorizontal, Pencil, Trash2, FolderPlus, FolderInput, X } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ChevronRightIcon } from "@plane/propel/icons";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TProjectGroup } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectGroup } from "@/hooks/store/use-project-group";
// local imports
import { SidebarProjectsListItem } from "../projects-list-item";
import { ProjectGroupModal } from "./project-group-modal";

const UNGROUPED = "ungrouped" as const;

type MoveMenuProps = {
  projectId: string;
  currentGroupId: string | null;
};

/** Right-aligned "move to group" menu shown on hover over a project row. */
const ProjectMoveMenu = observer(function ProjectMoveMenu(props: MoveMenuProps) {
  const { projectId, currentGroupId } = props;
  const { workspaceSlug } = useParams();
  const { rootGroupIds, getGroupById, getSubgroupIds, assignProjectToGroup } = useProjectGroup();

  const move = async (groupId: string | null) => {
    if (!workspaceSlug) return;
    try {
      await assignProjectToGroup(workspaceSlug.toString(), projectId, groupId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not move project." });
    }
  };

  return (
    <CustomMenu
      customButton={
        <span className="grid place-items-center rounded p-0.5 text-placeholder hover:bg-layer-1-hover hover:text-secondary">
          <FolderInput className="size-3.5" />
        </span>
      }
      placement="bottom-end"
      closeOnSelect
    >
      <div className="px-1 py-0.5 text-11 font-medium uppercase text-placeholder">Move to</div>
      {currentGroupId !== null && (
        <CustomMenu.MenuItem onClick={() => move(null)}>
          <span className="text-tertiary">Ungrouped</span>
        </CustomMenu.MenuItem>
      )}
      {rootGroupIds.map((gid) => {
        const g = getGroupById(gid);
        if (!g) return null;
        const subIds = getSubgroupIds(gid);
        return (
          <div key={gid}>
            {gid !== currentGroupId && (
              <CustomMenu.MenuItem onClick={() => move(gid)}>
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: g.color ?? "#6b7280" }} />
                  {g.name}
                </span>
              </CustomMenu.MenuItem>
            )}
            {subIds.map((sid) => {
              const s = getGroupById(sid);
              if (!s || sid === currentGroupId) return null;
              return (
                <CustomMenu.MenuItem key={sid} onClick={() => move(sid)}>
                  <span className="flex items-center gap-2 pl-3">
                    <span className="size-2 rounded-full" style={{ backgroundColor: s.color ?? "#6b7280" }} />
                    {s.name}
                  </span>
                </CustomMenu.MenuItem>
              );
            })}
          </div>
        );
      })}
    </CustomMenu>
  );
});

type GroupSectionProps = {
  group: TProjectGroup;
  depth: number;
  filter: string;
  onEdit: (g: TProjectGroup) => void;
  onAddSub: (parentId: string) => void;
};

const GroupSection = observer(function GroupSection(props: GroupSectionProps) {
  const { group, depth, filter, onEdit, onAddSub } = props;
  const { workspaceSlug } = useParams();
  const { getProjectIdsByGroup, getSubgroupIds, deleteProjectGroup, getGroupById } = useProjectGroup();
  const { getProjectById } = useProject();

  const subgroupIds = depth === 0 ? getSubgroupIds(group.id) : [];
  const directProjectIds = getProjectIdsByGroup(group.id);

  // apply text filter
  const visibleProjectIds = useMemo(
    () =>
      directProjectIds.filter((pid) => {
        if (!filter) return true;
        const p = getProjectById(pid);
        return p?.name?.toLowerCase().includes(filter.toLowerCase());
      }),
    [directProjectIds, filter, getProjectById]
  );

  const handleDelete = async () => {
    if (!workspaceSlug) return;
    if (
      !window.confirm(
        `Delete group “${group.name}”? Projects inside it will become ungrouped. This cannot be undone.`
      )
    )
      return;
    try {
      await deleteProjectGroup(workspaceSlug.toString(), group.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Group deleted", message: `“${group.name}” removed.` });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not delete group." });
    }
  };

  const count = visibleProjectIds.length;

  return (
    <Disclosure as="div" className="flex flex-col" defaultOpen>
      {({ open }) => (
        <>
          <div
            className="group/header flex w-full items-center justify-between rounded-sm px-2 py-1 text-placeholder hover:bg-layer-transparent-hover"
            style={{ paddingLeft: `${8 + depth * 12}px` }}
          >
            <Disclosure.Button as="button" type="button" className="flex flex-1 items-center gap-1.5 overflow-hidden text-left">
              <ChevronRightIcon
                className={cn("size-3.5 flex-shrink-0 text-placeholder transition-transform", {
                  "rotate-90": open,
                })}
              />
              <span
                className="size-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: group.color ?? "#6b7280" }}
              />
              <span className="truncate text-13 font-semibold text-secondary">{group.name}</span>
              <span className="ml-1 flex-shrink-0 text-11 font-medium text-placeholder">{count}</span>
            </Disclosure.Button>
            <CustomMenu
              customButton={
                <span className="hidden grid-place-items-center rounded p-0.5 text-placeholder hover:bg-layer-1-hover hover:text-secondary group-hover/header:grid">
                  <MoreHorizontal className="size-4" />
                </span>
              }
              placement="bottom-end"
              closeOnSelect
            >
              <CustomMenu.MenuItem onClick={() => onEdit(group)}>
                <span className="flex items-center gap-2">
                  <Pencil className="size-3.5" /> Rename / recolor
                </span>
              </CustomMenu.MenuItem>
              {depth === 0 && (
                <CustomMenu.MenuItem onClick={() => onAddSub(group.id)}>
                  <span className="flex items-center gap-2">
                    <FolderPlus className="size-3.5" /> Add subgroup
                  </span>
                </CustomMenu.MenuItem>
              )}
              <CustomMenu.MenuItem onClick={handleDelete}>
                <span className="flex items-center gap-2 text-danger-text">
                  <Trash2 className="size-3.5" /> Delete group
                </span>
              </CustomMenu.MenuItem>
            </CustomMenu>
          </div>
          <Transition
            show={open}
            enter="transition duration-100 ease-out"
            enterFrom="transform scale-95 opacity-0"
            enterTo="transform scale-100 opacity-100"
            leave="transition duration-75 ease-out"
            leaveFrom="transform scale-100 opacity-100"
            leaveTo="transform scale-95 opacity-0"
          >
            <Disclosure.Panel as="div" className="flex flex-col gap-0.5" static>
              {visibleProjectIds.map((projectId, index) => (
                <div key={projectId} className="group/row relative flex items-center">
                  <div className="flex-1 overflow-hidden" style={{ paddingLeft: `${depth * 12}px` }}>
                    <SidebarProjectsListItem
                      projectId={projectId}
                      handleCopyText={() => {}}
                      projectListType="JOINED"
                      disableDrag
                      disableDrop
                      isLastChild={index === visibleProjectIds.length - 1}
                    />
                  </div>
                  <div className="absolute right-1 top-1.5 hidden group-hover/row:block">
                    <ProjectMoveMenu projectId={projectId} currentGroupId={group.id} />
                  </div>
                </div>
              ))}
              {count === 0 && !filter && (
                <div
                  className="px-2 py-1 text-11 italic text-placeholder"
                  style={{ paddingLeft: `${20 + depth * 12}px` }}
                >
                  Empty — move projects here
                </div>
              )}
              {/* nested subgroups (depth 0 only) */}
              {subgroupIds.map((sid) => {
                const sg = getGroupById(sid);
                if (!sg) return null;
                return (
                  <GroupSection
                    key={sid}
                    group={sg}
                    depth={depth + 1}
                    filter={filter}
                    onEdit={onEdit}
                    onAddSub={onAddSub}
                  />
                );
              })}
            </Disclosure.Panel>
          </Transition>
        </>
      )}
    </Disclosure>
  );
});

export const SidebarProjectGroups = observer(function SidebarProjectGroups() {
  const { rootGroupIds, getGroupById, getProjectIdsByGroup, loader } = useProjectGroup();
  const { getProjectById, joinedProjectIds } = useProject();
  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TProjectGroup | null>(null);
  const [parentForNew, setParentForNew] = useState<string | null>(null);
  // filter
  const [filter, setFilter] = useState("");

  const ungroupedIds = getProjectIdsByGroup(null).filter((pid) => {
    if (!filter) return true;
    const p = getProjectById(pid);
    return p?.name?.toLowerCase().includes(filter.toLowerCase());
  });

  const openCreate = () => {
    setEditingGroup(null);
    setParentForNew(null);
    setModalOpen(true);
  };
  const openEdit = (g: TProjectGroup) => {
    setEditingGroup(g);
    setParentForNew(null);
    setModalOpen(true);
  };
  const openAddSub = (parentId: string) => {
    setEditingGroup(null);
    setParentForNew(parentId);
    setModalOpen(true);
  };

  const hasAnyProjects = joinedProjectIds.length > 0;

  return (
    <div className="flex flex-col">
      <ProjectGroupModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        group={editingGroup}
        parentId={parentForNew}
      />

      {/* Header: title + new group */}
      <div className="group flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-placeholder">
        <span className="text-13 font-semibold text-placeholder">Projects</span>
        <button
          type="button"
          onClick={openCreate}
          className="hidden items-center gap-1 rounded px-1 py-0.5 text-11 font-medium text-placeholder hover:bg-layer-1-hover hover:text-secondary group-hover:flex"
          aria-label="New group"
        >
          <Plus className="size-3.5" /> Group
        </button>
      </div>

      {/* Filter */}
      {hasAnyProjects && (
        <div className="relative mb-1 px-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects…"
            className="w-full rounded-md border border-strong bg-transparent px-2 py-1 text-12 text-secondary placeholder:text-placeholder focus:outline-none focus:ring-1 focus:ring-accent-primary"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="absolute right-3 top-1.5 text-placeholder hover:text-secondary"
              aria-label="Clear filter"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {loader && Object.keys(rootGroupIds).length === 0 ? null : (
        <>
          {/* Groups */}
          {rootGroupIds.map((gid) => {
            const g = getGroupById(gid);
            if (!g) return null;
            return (
              <GroupSection key={gid} group={g} depth={0} filter={filter} onEdit={openEdit} onAddSub={openAddSub} />
            );
          })}

          {/* Ungrouped */}
          {ungroupedIds.length > 0 && (
            <Disclosure as="div" className="flex flex-col" defaultOpen>
              {({ open }) => (
                <>
                  <Disclosure.Button
                    as="button"
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left hover:bg-layer-transparent-hover"
                  >
                    <ChevronRightIcon
                      className={cn("size-3.5 flex-shrink-0 text-placeholder transition-transform", {
                        "rotate-90": open,
                      })}
                    />
                    <span className="text-13 font-semibold text-placeholder">Ungrouped</span>
                    <span className="ml-1 text-11 font-medium text-placeholder">{ungroupedIds.length}</span>
                  </Disclosure.Button>
                  <Disclosure.Panel as="div" className="flex flex-col gap-0.5" static>
                    {ungroupedIds.map((projectId, index) => (
                      <div key={projectId} className="group/row relative flex items-center">
                        <div className="flex-1 overflow-hidden">
                          <SidebarProjectsListItem
                            projectId={projectId}
                            handleCopyText={() => {}}
                            projectListType="JOINED"
                            disableDrag
                            disableDrop
                            isLastChild={index === ungroupedIds.length - 1}
                          />
                        </div>
                        <div className="absolute right-1 top-1.5 hidden group-hover/row:block">
                          <ProjectMoveMenu projectId={projectId} currentGroupId={null} />
                        </div>
                      </div>
                    ))}
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>
          )}
        </>
      )}
    </div>
  );
});
