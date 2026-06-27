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
import { Plus, MoreHorizontal, Pencil, Trash2, FolderPlus, FolderInput, X, GripVertical } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ChevronRightIcon } from "@plane/propel/icons";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TProjectGroup } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectGroup } from "@/hooks/store/use-project-group";
// local imports
import { SidebarProjectsListItem } from "../projects-list-item";
import { ProjectGroupModal } from "./project-group-modal";

const DND_TYPE = "PROJECT_GROUP_ITEM";
const INDENT_PER_LEVEL = 14; // px

type DragData = { type: typeof DND_TYPE; projectId: string; fromGroupId: string | null };

const isDragData = (data: Record<string, unknown>): data is DragData => data.type === DND_TYPE;

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

/** A single project row: draggable, with a hover "move to" menu. */
const ProjectRow = observer(function ProjectRow(props: {
  projectId: string;
  fromGroupId: string | null;
  isLastChild: boolean;
  indent: number;
}) {
  const { projectId, fromGroupId, isLastChild, indent } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: (): DragData => ({ type: DND_TYPE, projectId, fromGroupId }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [projectId, fromGroupId]);

  return (
    <div
      ref={ref}
      className={cn("group/row relative flex items-center", { "opacity-50": isDragging })}
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
};

const GroupSection = observer(function GroupSection(props: GroupSectionProps) {
  const { group, depth, filter, onEdit, onAddSub } = props;
  const { workspaceSlug } = useParams();
  const { getProjectIdsByGroup, getSubgroupIds, deleteProjectGroup, getGroupById, assignProjectToGroup } =
    useProjectGroup();
  const { getProjectById } = useProject();

  const headerRef = useRef<HTMLDivElement>(null);
  const [isDropOver, setIsDropOver] = useState(false);

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

  // group header is a drop target — drop a project here to move it into this group
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    return combine(
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => isDragData(source.data) && (source.data as DragData).fromGroupId !== group.id,
        onDragEnter: () => setIsDropOver(true),
        onDragLeave: () => setIsDropOver(false),
        onDrop: ({ source }) => {
          setIsDropOver(false);
          const data = source.data;
          if (!isDragData(data) || !workspaceSlug) return;
          assignProjectToGroup(workspaceSlug.toString(), data.projectId, group.id).catch(() =>
            setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not move project." })
          );
        },
      })
    );
  }, [group.id, workspaceSlug, assignProjectToGroup]);

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

  const count = visibleProjectIds.length;
  const headerIndent = 8 + depth * INDENT_PER_LEVEL;

  return (
    <Disclosure as="div" className="flex flex-col" defaultOpen>
      {({ open }) => (
        <>
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
            <Disclosure.Button
              as="button"
              type="button"
              className="flex flex-1 items-center gap-1.5 overflow-hidden text-left"
            >
              <ChevronRightIcon
                className={cn("size-3.5 flex-shrink-0 text-placeholder transition-transform", { "rotate-90": open })}
              />
              <GroupGlyph group={group} size={14} />
              <span className="truncate text-13 font-semibold text-secondary">{group.name}</span>
              <span className="ml-1 flex-shrink-0 text-11 font-medium text-placeholder">{count}</span>
            </Disclosure.Button>
            <CustomMenu
              customButton={
                <span className="hidden place-items-center rounded p-0.5 text-placeholder hover:bg-layer-1-hover hover:text-secondary group-hover/header:grid">
                  <MoreHorizontal className="size-4" />
                </span>
              }
              placement="bottom-end"
              closeOnSelect
            >
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
            show={open}
            enter="transition duration-100 ease-out"
            enterFrom="transform scale-95 opacity-0"
            enterTo="transform scale-100 opacity-100"
            leave="transition duration-75 ease-out"
            leaveFrom="transform scale-100 opacity-100"
            leaveTo="transform scale-95 opacity-0"
          >
            <Disclosure.Panel as="div" className="relative flex flex-col gap-0.5" static>
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
                  <GroupSection key={sid} group={sg} depth={depth + 1} filter={filter} onEdit={onEdit} onAddSub={onAddSub} />
                );
              })}
            </Disclosure.Panel>
          </Transition>
        </>
      )}
    </Disclosure>
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
      canDrop: ({ source }) => isDragData(source.data) && (source.data as DragData).fromGroupId !== null,
      onDragEnter: () => setIsDropOver(true),
      onDragLeave: () => setIsDropOver(false),
      onDrop: ({ source }) => {
        setIsDropOver(false);
        const data = source.data;
        if (!isDragData(data) || !workspaceSlug) return;
        assignProjectToGroup(workspaceSlug.toString(), data.projectId, null).catch(() =>
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not move project." })
        );
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
  const { rootGroupIds, getGroupById, loader } = useProjectGroup();
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

  const hasAnyProjects = joinedProjectIds.length > 0;

  return (
    <div className="flex flex-col">
      <ProjectGroupModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        group={editingGroup}
        parentId={parentForNew}
      />

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
            return <GroupSection key={gid} group={g} depth={0} filter={filter} onEdit={openEdit} onAddSub={openAddSub} />;
          })}
          <UngroupedSection filter={filter} />
        </>
      )}
    </div>
  );
});
