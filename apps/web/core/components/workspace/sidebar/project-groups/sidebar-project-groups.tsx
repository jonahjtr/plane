/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Disclosure, Transition } from "@headlessui/react";
import { Plus, MoreHorizontal, Pencil, Trash2, FolderPlus, FolderInput, X, GripVertical, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ChevronRightIcon } from "@plane/propel/icons";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { CustomMenu } from "@plane/ui";
import { cn, orderJoinedProjects } from "@plane/utils";
import type { TProjectGroup } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectGroup } from "@/hooks/store/use-project-group";
// components
import { CreateProjectModal } from "@/components/project/create-project-modal";
// local imports
import { SidebarProjectsListItem } from "../projects-list-item";
import { ProjectGroupModal } from "./project-group-modal";

const PROJECT_DND = "PROJECT_GROUP_ITEM";
const GROUP_DND = "PROJECT_GROUP_GROUP";
const INDENT_PER_LEVEL = 14; // px

type ProjectDragData = { type: typeof PROJECT_DND; projectId: string; fromGroupId: string | null };
type GroupDragData = { type: typeof GROUP_DND; groupId: string; depth: number };

const isProjectDrag = (data: Record<string, unknown>): data is ProjectDragData => data.type === PROJECT_DND;
const isGroupDrag = (data: Record<string, unknown>): data is GroupDragData => data.type === GROUP_DND;

/** Small group glyph: emoji/icon logo if set, else a colored dot. */
const GroupGlyph = observer(function GroupGlyph({ group, size = 14 }: { group: TProjectGroup; size?: number }) {
  if (group.logo_props?.in_use) {
    return (
      <span className="grid flex-shrink-0 place-items-center" style={{ height: size, width: size }}>
        <Logo logo={group.logo_props} size={size - 2} />
      </span>
    );
  }
  return (
    <span
      className="flex-shrink-0 rounded-full"
      style={{ height: size - 4, width: size - 4, backgroundColor: group.color ?? "#6b7280" }}
    />
  );
});

/** A single project row: draggable + drop target for reordering within a group. */
const ProjectRow = observer(function ProjectRow(props: {
  projectId: string;
  fromGroupId: string | null;
  isLastChild: boolean;
  indent: number;
  onReorder?: (sourceProjectId: string, targetProjectId: string) => void;
}) {
  const { projectId, fromGroupId, isLastChild, indent, onReorder } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDropOver, setIsDropOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      draggable({
        element: el,
        getInitialData: (): ProjectDragData => ({ type: PROJECT_DND, projectId, fromGroupId }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          isProjectDrag(source.data) &&
          (source.data as ProjectDragData).projectId !== projectId &&
          (source.data as ProjectDragData).fromGroupId === fromGroupId,
        onDragEnter: () => setIsDropOver(true),
        onDragLeave: () => setIsDropOver(false),
        onDrop: ({ source }) => {
          setIsDropOver(false);
          if (isProjectDrag(source.data)) {
            onReorder?.((source.data as ProjectDragData).projectId, projectId);
          }
        },
      })
    );
  }, [projectId, fromGroupId, onReorder]);

  return (
    <div
      ref={ref}
      className={cn("group/row relative flex items-center", {
        "opacity-50": isDragging,
        "ring-1 ring-inset ring-accent-primary/40 rounded-sm": isDropOver,
      })}
      style={{ paddingLeft: indent ? `${indent}px` : undefined }}
    >
      {/* drag handle (appears on hover) */}
      <span className="absolute left-0 z-10 hidden cursor-grab text-placeholder group-hover/row:block">
        <GripVertical className="size-3.5" />
      </span>
      <div className="flex-1 overflow-hidden">
        <SidebarProjectsListItem
          projectId={projectId}
          handleCopyText={() => {}}
          projectListType="JOINED"
          disableDrag
          disableDrop
          isLastChild={isLastChild}
          forceAccordionMode
        />
      </div>
      <div className="absolute right-1 top-1.5 hidden group-hover/row:block">
        <ProjectMoveMenu projectId={projectId} currentGroupId={fromGroupId} />
      </div>
    </div>
  );
});

type MoveMenuProps = { projectId: string; currentGroupId: string | null };

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
                  <GroupGlyph group={g} size={14} /> {g.name}
                </span>
              </CustomMenu.MenuItem>
            )}
            {subIds.map((sid) => {
              const s = getGroupById(sid);
              if (!s || sid === currentGroupId) return null;
              return (
                <CustomMenu.MenuItem key={sid} onClick={() => move(sid)}>
                  <span className="flex items-center gap-2 pl-3">
                    <GroupGlyph group={s} size={14} /> {s.name}
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
  onAddProject: (groupId: string) => void;
  forceOpen?: boolean | null; // null = no override, true = force open, false = force closed
  onToggle?: (groupId: string, isOpen: boolean) => void;
};

const GroupSection = observer(function GroupSection(props: GroupSectionProps) {
  const { group, depth, filter, onEdit, onAddSub, onAddProject, forceOpen, onToggle } = props;
  const { workspaceSlug } = useParams();
  const {
    getProjectIdsByGroup,
    getSubgroupIds,
    deleteProjectGroup,
    getGroupById,
    assignProjectToGroup,
    reorderGroup,
    groupMap,
  } = useProjectGroup();
  const { getProjectById, getPartialProjectById, updateProjectView } = useProject();

  const [localOpen, setLocalOpen] = useState(false); // ponytail: default collapsed per user request
  const isOpen = forceOpen != null ? forceOpen : localOpen;
  const toggleOpen = () => {
    const next = !isOpen;
    setLocalOpen(next);
    onToggle?.(group.id, next);
  };

  // sync local state when forceOpen changes (so clicking a group after force-collapse sticks)
  useEffect(() => {
    if (forceOpen != null) setLocalOpen(forceOpen);
  }, [forceOpen]);

  const headerRef = useRef<HTMLDivElement>(null);
  const [isDropOver, setIsDropOver] = useState(false);
  const [isGroupDragging, setIsGroupDragging] = useState(false);
  const [isGroupDropOver, setIsGroupDropOver] = useState(false);

  const subgroupIds = depth === 0 ? getSubgroupIds(group.id) : [];
  const directProjectIds = getProjectIdsByGroup(group.id);

  const visibleProjectIds = useMemo(
    () =>
      directProjectIds.filter((pid) => {
        if (!filter) return true;
        const p = getProjectById(pid);
        return p?.name?.toLowerCase().includes(filter.toLowerCase());
      }),
    [directProjectIds, filter, getProjectById]
  );

  // group header is:
  //  - draggable (carries its own group, for reorder)
  //  - drop target for projects (move project into this group)
  //  - drop target for other groups at the same level (reorder)
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    return combine(
      draggable({
        element: el,
        getInitialData: (): GroupDragData => ({ type: GROUP_DND, groupId: group.id, depth }),
        onDragStart: () => setIsGroupDragging(true),
        onDrop: () => setIsGroupDragging(false),
      }),
      dropTargetForElements({
        element: el,
        // projects: not already in this group
        // groups: only from the same level (no reparenting in this phase)
        canDrop: ({ source }) => {
          if (isProjectDrag(source.data)) {
            return (source.data as ProjectDragData).fromGroupId !== group.id;
          }
          if (isGroupDrag(source.data)) {
            const d = source.data as GroupDragData;
            return d.groupId !== group.id && d.depth === depth;
          }
          return false;
        },
        onDragEnter: () => setIsDropOver(true),
        onDragLeave: () => setIsDropOver(false),
        onDrop: ({ source }) => {
          setIsDropOver(false);
          setIsGroupDropOver(false);
          const data = source.data;
          if (!workspaceSlug) return;

          if (isGroupDrag(data)) {
            const gd = data as GroupDragData;
            // compute a new sort_order that places the dragged group just above
            // this one. The midpoint between this group's sort_order and the
            // previous sibling's gives a stable single-PATCH reorder.
            const siblings = depth === 0
              ? Object.values(groupMap).filter((g) => !g.parent).sort((a, b) => a.sort_order - b.sort_order)
              : Object.values(groupMap).filter((g) => g.parent === group.parent).sort((a, b) => a.sort_order - b.sort_order);
            const myIndex = siblings.findIndex((s) => s.id === group.id);
            const previousSort = myIndex > 0 ? siblings[myIndex - 1].sort_order : 0;
            // place dragged group just above `group`:
            // new = (previous + this) / 2
            const newSort = (previousSort + group.sort_order) / 2;
            reorderGroup(workspaceSlug.toString(), gd.groupId, newSort).catch(() =>
              setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not reorder group." })
            );
            return;
          }

          if (isProjectDrag(data)) {
            const pd = data as ProjectDragData;
            assignProjectToGroup(workspaceSlug.toString(), pd.projectId, group.id).catch(() =>
              setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not move project." })
            );
            return;
          }
        },
      })
    );
  }, [group.id, depth, group.sort_order, group.parent, workspaceSlug, assignProjectToGroup, reorderGroup, groupMap]);

  const handleDelete = async () => {
    if (!workspaceSlug) return;
    if (!window.confirm(`Delete group “${group.name}”? Projects inside it become ungrouped. This cannot be undone.`))
      return;
    try {
      await deleteProjectGroup(workspaceSlug.toString(), group.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Group deleted", message: `“${group.name}” removed.` });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not delete group." });
    }
  };

  const handleProjectReorder = (sourceId: string, targetId: string) => {
    if (!workspaceSlug) return;
    // Build ordered list of projects in this group
    const projectsList = visibleProjectIds
      .map((pid) => getPartialProjectById(pid))
      .filter(Boolean) as import("@plane/types").TProject[];
    const sourceIndex = visibleProjectIds.indexOf(sourceId);
    const destinationIndex = visibleProjectIds.indexOf(targetId);
    if (sourceIndex < 0 || destinationIndex < 0 || projectsList.length === 0) return;
    const updatedSortOrder = orderJoinedProjects(sourceIndex, destinationIndex, sourceId, projectsList);
    if (updatedSortOrder != null) {
      updateProjectView(workspaceSlug.toString(), sourceId, { sort_order: updatedSortOrder }).catch(() =>
        setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not reorder project." })
      );
    }
  };

  const count = visibleProjectIds.length;
  const headerIndent = 8 + depth * INDENT_PER_LEVEL;

  return (
    <div className="flex flex-col">
          <div
            ref={headerRef}
            className={cn(
              "group/header relative flex w-full items-center justify-between rounded-sm py-1 pr-2 text-placeholder hover:bg-layer-transparent-hover",
              { "bg-accent-primary/10 ring-1 ring-inset ring-accent-primary/40": isDropOver }
            )}
            style={{ paddingLeft: `${headerIndent}px` }}
          >
            {/* tree guide line for subgroups */}
            {depth > 0 && (
              <span
                className="absolute top-0 bottom-0 w-px bg-strong"
                style={{ left: `${8 + (depth - 1) * INDENT_PER_LEVEL + 6}px` }}
              />
            )}
            {/* drag handle (appears on hover, used to reorder group) */}
            <span className="mr-1 hidden flex-shrink-0 cursor-grab text-placeholder group-hover/header:inline-block">
              <GripVertical className="size-3.5" />
            </span>
            <button
              type="button"
              onClick={toggleOpen}
              className="flex flex-1 items-center gap-1.5 overflow-hidden text-left"
            >
              <ChevronRightIcon
                className={cn("size-3.5 flex-shrink-0 text-placeholder transition-transform", { "rotate-90": isOpen })}
              />
              <GroupGlyph group={group} size={14} />
              <span className="truncate text-13 font-semibold text-secondary">{group.name}</span>
              <span className="ml-1 flex-shrink-0 text-11 font-medium text-placeholder">{count}</span>
            </button>
            <CustomMenu
              customButton={
                <span className="hidden place-items-center rounded p-0.5 text-placeholder hover:bg-layer-1-hover hover:text-secondary group-hover/header:grid">
                  <MoreHorizontal className="size-4" />
                </span>
              }
              placement="bottom-end"
              closeOnSelect
            >
              <CustomMenu.MenuItem onClick={() => onAddProject(group.id)}>
                <span className="flex items-center gap-2">
                  <Plus className="size-3.5" /> Add project
                </span>
              </CustomMenu.MenuItem>
              <CustomMenu.MenuItem onClick={() => onEdit(group)}>
                <span className="flex items-center gap-2">
                  <Pencil className="size-3.5" /> Edit (name, icon, color)
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
            show={isOpen}
            enter="transition duration-100 ease-out"
            enterFrom="transform scale-95 opacity-0"
            enterTo="transform scale-100 opacity-100"
            leave="transition duration-75 ease-out"
            leaveFrom="transform scale-100 opacity-100"
            leaveTo="transform scale-95 opacity-0"
          >
            <div className="relative flex flex-col gap-0.5">
              {/* tree guide line down the project list for nested groups */}
              {depth >= 0 && visibleProjectIds.length > 0 && (
                <span
                  className="absolute top-0 bottom-0 w-px bg-subtle"
                  style={{ left: `${8 + depth * INDENT_PER_LEVEL + 6}px` }}
                />
              )}
              {visibleProjectIds.map((projectId, index) => (
                <ProjectRow
                  key={projectId}
                  projectId={projectId}
                  fromGroupId={group.id}
                  isLastChild={index === visibleProjectIds.length - 1}
                  indent={(depth + 1) * INDENT_PER_LEVEL}
                  onReorder={handleProjectReorder}
                />
              ))}
              {count === 0 && !filter && (
                <div className="py-1 text-11 italic text-placeholder" style={{ paddingLeft: `${headerIndent + 18}px` }}>
                  Empty — drag projects here
                </div>
              )}
              {subgroupIds.map((sid) => {
                const sg = getGroupById(sid);
                if (!sg) return null;
                return (
                  <GroupSection key={sid} group={sg} depth={depth + 1} filter={filter} onEdit={onEdit} onAddSub={onAddSub} onAddProject={onAddProject} forceOpen={forceOpen} onToggle={onToggle} />
                );
              })}
            </div>
          </Transition>
    </div>
  );
});

/** Ungrouped section — also a drop target (drop here to unassign). */
const UngroupedSection = observer(function UngroupedSection({ filter }: { filter: string }) {
  const { workspaceSlug } = useParams();
  const { getProjectIdsByGroup, assignProjectToGroup } = useProjectGroup();
  const { getProjectById } = useProject();
  const headerRef = useRef<HTMLDivElement>(null);
  const [isDropOver, setIsDropOver] = useState(false);

  const ungroupedIds = getProjectIdsByGroup(null).filter((pid) => {
    if (!filter) return true;
    const p = getProjectById(pid);
    return p?.name?.toLowerCase().includes(filter.toLowerCase());
  });

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => isProjectDrag(source.data) && (source.data as ProjectDragData).fromGroupId !== null,
      onDragEnter: () => setIsDropOver(true),
      onDragLeave: () => setIsDropOver(false),
      onDrop: ({ source }) => {
        setIsDropOver(false);
        const data = source.data;
        if (!isProjectDrag(data) || !workspaceSlug) {
          console.log("[DnD Ungrouped] Invalid drop data or no workspaceSlug", { data, workspaceSlug });
          return;
        }
        console.log("[DnD Ungrouped] Moving project", data.projectId, "from group", data.fromGroupId, "to ungrouped");
        assignProjectToGroup(workspaceSlug.toString(), data.projectId, null)
          .then(() => {
            console.log("[DnD Ungrouped] Project moved to ungrouped successfully");
          })
          .catch((err) => {
            console.error("[DnD Ungrouped] Failed to move project:", err);
            setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: `Could not move project: ${err?.message || "Unknown error"}` });
          });
      },
    });
  }, [workspaceSlug, assignProjectToGroup]);

  if (ungroupedIds.length === 0) return null;

  return (
    <Disclosure as="div" className="flex flex-col" defaultOpen>
      {({ open }) => (
        <>
          <div
            ref={headerRef}
            className={cn("rounded-sm", {
              "bg-accent-primary/10 ring-1 ring-inset ring-accent-primary/40": isDropOver,
            })}
          >
            <Disclosure.Button
              as="button"
              type="button"
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-layer-transparent-hover"
            >
              <ChevronRightIcon
                className={cn("size-3.5 flex-shrink-0 text-placeholder transition-transform", { "rotate-90": open })}
              />
              <span className="text-13 font-semibold text-placeholder">Ungrouped</span>
              <span className="ml-1 text-11 font-medium text-placeholder">{ungroupedIds.length}</span>
            </Disclosure.Button>
          </div>
          <Disclosure.Panel as="div" className="flex flex-col gap-0.5" static>
            {ungroupedIds.map((projectId, index) => (
              <ProjectRow
                key={projectId}
                projectId={projectId}
                fromGroupId={null}
                isLastChild={index === ungroupedIds.length - 1}
                indent={INDENT_PER_LEVEL}
              />
            ))}
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
});

export const SidebarProjectGroups = observer(function SidebarProjectGroups() {
  const { workspaceSlug } = useParams();
  const { rootGroupIds, getGroupById, getSubgroupIds, loader } = useProjectGroup();
  const { joinedProjectIds } = useProject();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TProjectGroup | null>(null);
  const [parentForNew, setParentForNew] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

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

  // "Add project" inside a group — opens CreateProjectModal with group pre-assigned
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectModalGroupId, setProjectModalGroupId] = useState<string | null>(null);
  const openAddProject = (groupId: string) => {
    setProjectModalGroupId(groupId);
    setProjectModalOpen(true);
  };

  // Collapse/expand all groups
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(new Set());
  const anyOpen = openGroupIds.size > 0;
  const toggleAll = () => {
    if (anyOpen) {
      setOpenGroupIds(new Set());
    } else {
      // open all root + sub groups
      const allIds = new Set<string>();
      rootGroupIds.forEach((gid) => {
        allIds.add(gid);
        const subs = getSubgroupIds(gid);
        subs.forEach((sid) => allIds.add(sid));
      });
      setOpenGroupIds(allIds);
    }
  };
  const handleGroupToggle = (groupId: string, isOpen: boolean) => {
    setOpenGroupIds((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  };
  // ponytail: forceOpen is null (individual control) — we derive per-group from openGroupIds
  const getForceOpen = (gid: string) => openGroupIds.has(gid);

  const hasAnyProjects = joinedProjectIds.length > 0;

  return (
    <div className="flex flex-col">
      <ProjectGroupModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        group={editingGroup}
        parentId={parentForNew}
      />
      {workspaceSlug && (
        <CreateProjectModal
          isOpen={projectModalOpen}
          onClose={() => setProjectModalOpen(false)}
          setToFavorite={false}
          workspaceSlug={workspaceSlug.toString()}
          data={projectModalGroupId ? { group: projectModalGroupId } : undefined}
        />
      )}

      <div className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-placeholder">
        <span className="text-13 font-semibold text-placeholder">Projects</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={toggleAll}
            className="grid h-5 w-5 place-items-center rounded text-placeholder hover:bg-layer-1-hover hover:text-secondary"
            aria-label={anyOpen ? "Collapse all groups" : "Expand all groups"}
            title={anyOpen ? "Collapse all" : "Expand all"}
          >
            {anyOpen ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="grid h-5 w-5 place-items-center rounded text-placeholder hover:bg-layer-1-hover hover:text-secondary"
            aria-label="New group"
            title="New group"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

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

      {loader && rootGroupIds.length === 0 ? null : (
        <>
          {rootGroupIds.map((gid) => {
            const g = getGroupById(gid);
            if (!g) return null;
            return <GroupSection key={gid} group={g} depth={0} filter={filter} onEdit={openEdit} onAddSub={openAddSub} onAddProject={openAddProject} forceOpen={getForceOpen(gid)} onToggle={handleGroupToggle} />;
          })}
          <UngroupedSection filter={filter} />
        </>
      )}
    </div>
  );
});
