/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * DK fork: board-level parent/child hierarchy rendering.
 *
 * Layout per parent-with-children:
 *
 *   ┌──────────────────────────────┐
 *   │  parent card (FULL width)    │
 *   └──────────────────────────────┘
 *   ▾ 2 sub-work-items          <- toggle strip
 *      │
 *      ├─ ┌────────────────────────┐
 *      │  │ child card (indented)  │
 *      │  └────────────────────────┘
 *      └─ ┌────────────────────────┐
 *         │ child card (indented)  │
 *         └────────────────────────┘
 *
 * The spine + hooks use inline `var(--border-strong)` because the theme
 * only exposes "strong" as a border token — `bg-strong` does NOT exist
 * and silently renders transparent (learned the hard way).
 *
 * DnD is preserved — every card (parent or child) drags independently.
 * There is NO "move with parent" behavior.
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

// Indent geometry for the children block.
const SPINE_X = 10; // px from the children-block left edge to the vertical spine
const HOOK_W = 12; // px width of the horizontal branch into the child card
const CHILD_INDENT = SPINE_X + HOOK_W + 4; // total left padding for child cards (26px)
const HOOK_Y = 30; // px from the top of a child row down to where the hook meets the card

const LINE_STYLE = { backgroundColor: "var(--border-strong)" } as const;

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

  // Track which parents are collapsed (default: expanded)
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

  // Flat render order: parents (and plain issues) in their natural order;
  // children of an in-column parent are pulled out and rendered under it.
  const orderedEntries = useMemo(() => {
    const out: { issueId: string; isChild: boolean; parentId: string | null }[] = [];
    const seen = new Set<string>();
    for (const id of issueIds) {
      if (seen.has(id)) continue;
      const issue = issuesMap[id];
      if (!issue) continue;
      if (issue.parent_id && parentIds.has(issue.parent_id)) continue; // rendered under its parent
      out.push({ issueId: id, isChild: false, parentId: issue.parent_id ?? null });
      seen.add(id);
      if (parentIds.has(id)) {
        for (const kid of childrenByParent[id] ?? []) {
          if (!seen.has(kid)) seen.add(kid);
        }
      }
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
                title={parentId ? `Parent is in another column` : "Parent is in another column"}
              >
                <CornerDownRight className="size-3" />
                sub
              </span>
            )}

            {/* the card itself — ALWAYS full column width */}
            <KanbanIssueBlock
              issueId={issueId}
              groupId={groupId}
              subGroupId={sub_group_id}
              shouldRenderByDefault
              draggableId={buildDraggableId(issueId)}
              {...blockProps}
            />

            {/* toggle strip + children block */}
            {kids.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [issueId]: !prev[issueId] }))}
                  className="mt-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-11 font-medium text-tertiary transition-colors hover:bg-layer-1-hover hover:text-primary"
                  style={{ marginLeft: 2 }}
                >
                  {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                  {kids.length} sub-work-item{kids.length === 1 ? "" : "s"}
                </button>

                {!isCollapsed && (
                  <div className="relative">
                    {kids.map((kidId, i) => {
                      const isLast = i === kids.length - 1;
                      return (
                        <div key={buildDraggableId(kidId)} className="relative pt-1.5" style={{ paddingLeft: CHILD_INDENT }}>
                          {/* vertical spine segment — full height for middle children,
                              stops at the hook for the last child */}
                          <span
                            className="pointer-events-none absolute top-0 w-px"
                            style={{
                              ...LINE_STYLE,
                              left: SPINE_X,
                              height: isLast ? HOOK_Y : "100%",
                            }}
                            aria-hidden
                          />
                          {/* horizontal hook into the child card */}
                          <span
                            className="pointer-events-none absolute h-px"
                            style={{ ...LINE_STYLE, left: SPINE_X, top: HOOK_Y, width: HOOK_W }}
                            aria-hidden
                          />
                          <KanbanIssueBlock
                            issueId={kidId}
                            groupId={groupId}
                            subGroupId={sub_group_id}
                            shouldRenderByDefault
                            draggableId={buildDraggableId(kidId)}
                            {...blockProps}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
});
