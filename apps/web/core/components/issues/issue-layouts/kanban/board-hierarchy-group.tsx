/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * DK fork: board-level parent/child hierarchy rendering.
 *
 * Layout (each parent-with-children is a flat list — parent card
 * then children, no wrapper around the parent that could interfere
 * with the parent's own drag/drop target):
 *
 *   ┌──────────────────────────────┐
 *   │  parent card (100% width)    │
 *   └──────────────────────────────┘
 *    ▾ 2                            <- toggle strip (its own row)
 *    │   ├─▸ ┌─────────────────┐
 *    │   │  │ child (80%)      │
 *    │   │  └─────────────────┘
 *    └──▸ ┌─────────────────┐
 *         │ child (80%)      │
 *         └─────────────────┘
 *
 * The spine and arrows are drawn as `pointer-events-none` absolute
 * elements that don't participate in the DOM hierarchy of the cards,
 * so the parent and child each keep their own drag/drop target intact.
 *
 * DnD: every card drags independently. No "move with parent" behavior.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ChevronRight, ChevronDown, CornerDownRight } from "lucide-react";
import type { IIssueMap, TIssue } from "@plane/types";
import { KanbanIssueBlock } from "./block";

type Props = {
  issueIds: string[];
  issuesMap: IIssueMap;
  displayProperties: any;
  updateIssue?: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: any;
  canEditProperties: (projectId: string | undefined) => boolean;
  canDropOverIssue: boolean;
  canDragIssuesInCurrentGrouping: boolean;
  scrollableContainerRef: any;
  isEpic?: boolean;
  groupId?: string;
  sub_group_id?: string;
};

const SPINE_X = 14;     // px from row left to the vertical spine
const HOOK_Y = 34;     // px from child row top to the horizontal branch
const ARROW_SIZE = 5;  // px half-height of the arrowhead

const LINE_COLOR = "var(--border-strong)";

export const BoardIssueGroup = observer(function BoardIssueGroup(props: Props) {
  const {
    issueIds,
    issuesMap,
    displayProperties,
    canDropOverIssue,
    canDragIssuesInCurrentGrouping,
    updateIssue,
    quickActions,
    canEditProperties,
    scrollableContainerRef,
    isEpic = false,
    groupId = "",
    sub_group_id = "",
  } = props;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // parentId -> [childIds] for children present in THIS column
  const childrenByParent = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const id of issueIds) {
      const issue = issuesMap[id];
      if (!issue) continue;
      const pid = issue.parent_id;
      if (pid) {
        if (!map[pid]) map[pid] = [];
        if (!map[pid].includes(id)) map[pid].push(id);
      }
    }
    return map;
  }, [issueIds, issuesMap]);

  const parentIds = useMemo(() => new Set(Object.keys(childrenByParent)), [childrenByParent]);

  // Flat render order: parents (and standalone issues) in their natural order;
  // children of an in-column parent are pulled out and rendered under it.
  const orderedEntries = useMemo(() => {
    const out: { issueId: string; parentId: string | null }[] = [];
    const seen = new Set<string>();
    for (const id of issueIds) {
      if (seen.has(id)) continue;
      const issue = issuesMap[id];
      if (!issue) continue;
      if (issue.parent_id && parentIds.has(issue.parent_id)) continue; // rendered under its parent
      out.push({ issueId: id, parentId: issue.parent_id ?? null });
      seen.add(id);
      if (parentIds.has(id)) for (const kid of childrenByParent[id] ?? []) seen.add(kid);
    }
    return out;
  }, [issueIds, issuesMap, childrenByParent, parentIds]);

  const buildDraggableId = (issueId: string) => {
    let id = issueId;
    if (groupId) id = `${id}__${groupId}`;
    if (sub_group_id) id = `${id}__${sub_group_id}`;
    return id;
  };

  if (orderedEntries.length === 0) return null;

  return (
    <>
      {orderedEntries.map(({ issueId, parentId }) => {
        const issue = issuesMap[issueId];
        if (!issue) return null;

        const kids = childrenByParent[issueId] ?? [];
        const isCollapsed = collapsed[issueId] === true;
        const isOrphanChild = !!issue.parent_id && !parentIds.has(issue.parent_id);

        return (
          <ParentWithChildren
            key={buildDraggableId(issueId)}
            issueId={issueId}
            kids={kids}
            isCollapsed={isCollapsed}
            isOrphanChild={isOrphanChild}
            parentId={parentId}
            onToggleCollapsed={() =>
              setCollapsed((prev) => ({ ...prev, [issueId]: !prev[issueId] }))
            }
            buildDraggableId={buildDraggableId}
            blockProps={{
              issuesMap,
              displayProperties,
              updateIssue,
              quickActions,
              canDropOverIssue,
              canDragIssuesInCurrentGrouping,
              canEditProperties,
              scrollableContainerRef,
              isEpic,
            }}
            groupId={groupId}
            sub_group_id={sub_group_id}
          />
        );
      })}
    </>
  );
});

function ParentWithChildren(props: {
  issueId: string;
  kids: string[];
  isCollapsed: boolean;
  isOrphanChild: boolean;
  parentId: string | null;
  onToggleCollapsed: () => void;
  buildDraggableId: (id: string) => string;
  blockProps: any;
  groupId: string;
  sub_group_id: string;
}) {
  const { issueId, kids, isCollapsed, isOrphanChild, parentId, onToggleCollapsed, buildDraggableId, blockProps, groupId, sub_group_id } = props;

  return (
    <>
      {/* parent (or standalone) card — rendered as a flat sibling, NOT
          wrapped in a div with other content, so its own drop target is
          untouched. */}
      {isOrphanChild && (
        <div className="relative">
          <span
            className="pointer-events-none absolute right-2 top-1 z-10 inline-flex items-center gap-1 rounded bg-layer-2/90 px-1.5 py-0.5 text-10 uppercase tracking-wide text-placeholder backdrop-blur-sm"
            title="Parent is in another column"
          >
            <CornerDownRight className="size-3" />
            sub
          </span>
          <KanbanIssueBlock
            issueId={issueId}
            groupId={groupId}
            subGroupId={sub_group_id}
            shouldRenderByDefault
            draggableId={buildDraggableId(issueId)}
            {...blockProps}
          />
        </div>
      )}
      {!isOrphanChild && (
        <KanbanIssueBlock
          issueId={issueId}
          groupId={groupId}
          subGroupId={sub_group_id}
          shouldRenderByDefault
          draggableId={buildDraggableId(issueId)}
          {...blockProps}
        />
      )}

      {kids.length > 0 && (
        <>
          {/* collapse toggle (its own row, no parent wrapper) */}
          <div className="relative flex items-center" style={{ height: 22, marginLeft: SPINE_X - 9 }}>
            <span
              className="pointer-events-none absolute top-0 h-full w-px"
              style={{ backgroundColor: LINE_COLOR, left: 9 }}
              aria-hidden
            />
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="relative z-10 flex items-center gap-1 rounded-full border px-1.5 py-px text-10 font-medium text-tertiary transition-colors hover:bg-layer-1-hover hover:text-primary"
              style={{ borderColor: LINE_COLOR, backgroundColor: "var(--surface-2, var(--layer-1))" }}
              aria-label={isCollapsed ? `Expand ${kids.length} sub-work-items` : "Collapse sub-work-items"}
            >
              {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
              {kids.length}
            </button>
          </div>

          {!isCollapsed &&
            kids.map((kidId, i) => {
              const isLast = i === kids.length - 1;
              return (
                <div key={buildDraggableId(kidId)} className="relative flex justify-end pt-1">
                  {/* vertical spine: full height for middle children, stops at the hook on the last */}
                  <span
                    className="pointer-events-none absolute top-0 w-px"
                    style={{
                      backgroundColor: LINE_COLOR,
                      left: SPINE_X,
                      height: isLast ? HOOK_Y : "100%",
                    }}
                    aria-hidden
                  />
                  {/* horizontal branch from spine to the child card */}
                  <span
                    className="pointer-events-none absolute h-px"
                    style={{
                      backgroundColor: LINE_COLOR,
                      left: SPINE_X,
                      top: HOOK_Y,
                      right: "20%",
                    }}
                    aria-hidden
                  />
                  {/* arrowhead pointing into the child card */}
                  <span
                    className="pointer-events-none absolute"
                    style={{
                      top: HOOK_Y - ARROW_SIZE,
                      right: "calc(20% + 2px)",
                      width: 0,
                      height: 0,
                      borderTop: `${ARROW_SIZE}px solid transparent`,
                      borderBottom: `${ARROW_SIZE}px solid transparent`,
                      borderLeft: `${ARROW_SIZE + 1}px solid ${LINE_COLOR}`,
                    }}
                    aria-hidden
                  />
                  {/* the child card — 80% width, right-aligned */}
                  <div className="ml-[20%]">
                    <KanbanIssueBlock
                      issueId={kidId}
                      groupId={groupId}
                      subGroupId={sub_group_id}
                      shouldRenderByDefault
                      draggableId={buildDraggableId(kidId)}
                      {...blockProps}
                    />
                  </div>
                </div>
              );
            })}
        </>
      )}
    </>
  );
}
