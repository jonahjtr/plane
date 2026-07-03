/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * DK fork: board-level parent/child hierarchy rendering.
 *
 *   ┌──────────────────────────────┐
 *   │  parent card (100% width)    │
 *   └──────────────────────────────┘
 *    │ ▾ 2
 *    ├──▸ ┌───────────────────────┐
 *    │    │ child card (80%)      │
 *    │    └───────────────────────┘
 *    └──▸ ┌───────────────────────┐
 *         │ child card (80%)      │
 *         └───────────────────────┘
 *
 * The spine drops from under the parent's left edge, runs straight down
 * the 20% gutter, and hooks into each child with a horizontal branch
 * ending in an arrowhead. The spine terminates at the last child (└).
 *
 * NOTE: lines use inline `var(--border-strong)` — `bg-strong` is NOT a
 * real class in this theme and renders transparent.
 *
 * Drag behavior: every card drags independently. The forward-cascade
 * (children follow a parent moved forward) lives in use-group-dragndrop.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ChevronRight, ChevronDown, CornerDownRight } from "lucide-react";
// plane imports
import type { IIssueMap, TIssue } from "@plane/types";
// local imports
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

// ---- tree geometry ----
const CHILD_WIDTH_PCT = 80; // child card width as % of the column
const SPINE_X = 14; // px from column left to the vertical spine
const ARROW_SIZE = 5; // px half-height of the arrowhead triangle
const HOOK_Y = 34; // px from the top of a child row to its horizontal hook

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

  // Natural column order; children of an in-column parent render under it.
  const orderedEntries = useMemo(() => {
    const out: { issueId: string; parentId: string | null }[] = [];
    const seen = new Set<string>();
    for (const id of issueIds) {
      if (seen.has(id)) continue;
      const issue = issuesMap[id];
      if (!issue) continue;
      if (issue.parent_id && parentIds.has(issue.parent_id)) continue;
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

  const blockProps = {
    issuesMap,
    displayProperties,
    updateIssue,
    quickActions,
    canDropOverIssue,
    canDragIssuesInCurrentGrouping,
    canEditProperties,
    scrollableContainerRef,
    isEpic,
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
          <div key={buildDraggableId(issueId)} className="relative">
            {/* orphan badge: child whose parent lives in another column */}
            {isOrphanChild && (
              <span
                className="pointer-events-none absolute right-2 top-1 z-10 inline-flex items-center gap-1 rounded bg-layer-2/90 px-1.5 py-0.5 text-10 uppercase tracking-wide text-placeholder backdrop-blur-sm"
                title={parentId ? "Parent is in another column" : "Parent is in another column"}
              >
                <CornerDownRight className="size-3" />
                sub
              </span>
            )}

            {/* parent (or standalone) card — ALWAYS full column width */}
            <KanbanIssueBlock
              issueId={issueId}
              groupId={groupId}
              subGroupId={sub_group_id}
              shouldRenderByDefault
              draggableId={buildDraggableId(issueId)}
              {...blockProps}
            />

            {kids.length > 0 && (
              <div className="relative">
                {/* toggle row — its own relative box so the spine segment
                    behind the toggle doesn't overshoot the last child's hook */}
                <div className="relative">
                  {!isCollapsed && (
                    <span
                      className="pointer-events-none absolute top-0 w-px"
                      style={{ backgroundColor: LINE_COLOR, left: SPINE_X, height: "100%" }}
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [issueId]: !prev[issueId] }))}
                    className="relative z-10 my-0.5 flex items-center gap-1 rounded-full border px-1.5 py-px text-10 font-medium text-tertiary transition-colors hover:bg-layer-1-hover hover:text-primary"
                    style={{ marginLeft: SPINE_X - 9, borderColor: LINE_COLOR, backgroundColor: "var(--surface-2, var(--layer-1))" }}
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
                            width: `calc(${100 - CHILD_WIDTH_PCT}% - ${SPINE_X + ARROW_SIZE + 2}px)`,
                          }}
                          aria-hidden
                        />
                        {/* arrowhead pointing into the child card */}
                        <span
                          className="pointer-events-none absolute"
                          style={{
                            top: HOOK_Y - ARROW_SIZE,
                            right: `calc(${CHILD_WIDTH_PCT}% + 2px)`,
                            width: 0,
                            height: 0,
                            borderTop: `${ARROW_SIZE}px solid transparent`,
                            borderBottom: `${ARROW_SIZE}px solid transparent`,
                            borderLeft: `${ARROW_SIZE + 1}px solid ${LINE_COLOR}`,
                          }}
                          aria-hidden
                        />
                        {/* the child card — 80% width, right-aligned */}
                        <div style={{ width: `${CHILD_WIDTH_PCT}%` }}>
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
              </div>
            )}
          </div>
        );
      })}
    </>
  );
});
