/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * DK fork: board-level parent/child hierarchy rendering.
 *
 * When the user toggles "Group by parent" on in the board toolbar, this
 * component takes the flat list of issue IDs for a column and groups them
 * by parent_id. Parents render at the top of their natural position; their
 * children render indented below, with a vertical tree-guide line and a
 * small horizontal branch connecting to the child card.
 *
 * The DnD behavior of the underlying KanbanIssueBlock is preserved — every
 * card (parent or child) drags independently. There is NO "move with parent"
 * behavior.
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

const INDENT = 16; // px

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

  // Build a child index for quick lookup: parentId -> [childIds]
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

  // Build a parent index (which ids in this column ARE parents of others here)
  const parentIds = useMemo(() => new Set(Object.keys(childrenByParent)), [childrenByParent]);

  const orderedEntries = useMemo(() => {
    const out: { issueId: string; isChild: boolean; parentId: string | null }[] = [];
    const seen = new Set<string>();
    for (const id of issueIds) {
      if (seen.has(id)) continue;
      const issue = issuesMap[id];
      if (!issue) continue;
      if (issue.parent_id && parentIds.has(issue.parent_id)) continue;
      out.push({ issueId: id, isChild: false, parentId: issue.parent_id ?? null });
      seen.add(id);
      if (parentIds.has(id)) {
        const kids = childrenByParent[id] ?? [];
        for (const kid of kids) {
          if (seen.has(kid)) continue;
          out.push({ issueId: kid, isChild: true, parentId: id });
          seen.add(kid);
        }
      }
    }
    return out;
  }, [issueIds, issuesMap, childrenByParent, parentIds]);

  const toggleCollapse = (parentIssueId: string) => {
    setCollapsed((prev) => ({ ...prev, [parentIssueId]: !prev[parentIssueId] }));
  };

  if (orderedEntries.length === 0) return null;

  return (
    <>
      {orderedEntries.map(({ issueId, isChild, parentId }) => {
        const issue = issuesMap[issueId];
        if (!issue) return null;

        const draggableId = (() => {
          let id = issueId;
          if (groupId) id = `${id}__${groupId}`;
          if (sub_group_id) id = `${id}__${sub_group_id}`;
          return id;
        })();

        if (!isChild) {
          const kids = childrenByParent[issueId] ?? [];
          const isCollapsed = collapsed[issueId] === true;
          return (
            <div key={draggableId}>
              {kids.length > 0 ? (
                <div className="group/parent flex items-stretch">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(issueId)}
                    className="grid h-7 w-5 flex-shrink-0 place-items-center rounded text-placeholder transition-colors hover:bg-layer-1-hover hover:text-secondary"
                    aria-label={isCollapsed ? `Expand ${kids.length} sub-issue${kids.length === 1 ? "" : "s"}` : "Collapse"}
                  >
                    {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </button>
                  <div className="flex-1">
                    <KanbanIssueBlock
                      issueId={issueId}
                      groupId={groupId}
                      subGroupId={sub_group_id}
                      shouldRenderByDefault
                      issuesMap={issuesMap}
                      displayProperties={displayProperties}
                      updateIssue={updateIssue}
                      quickActions={quickActions}
                      draggableId={draggableId}
                      canDropOverIssue={canDropOverIssue}
                      canDragIssuesInCurrentGrouping={canDragIssuesInCurrentGrouping}
                      canEditProperties={canEditProperties}
                      scrollableContainerRef={scrollableContainerRef}
                      isEpic={isEpic}
                    />
                  </div>
                </div>
              ) : (
                <KanbanIssueBlock
                  key={draggableId}
                  issueId={issueId}
                  groupId={groupId}
                  subGroupId={sub_group_id}
                  shouldRenderByDefault
                  issuesMap={issuesMap}
                  displayProperties={displayProperties}
                  updateIssue={updateIssue}
                  quickActions={quickActions}
                  draggableId={draggableId}
                  canDropOverIssue={canDropOverIssue}
                  canDragIssuesInCurrentGrouping={canDragIssuesInCurrentGrouping}
                  canEditProperties={canEditProperties}
                  scrollableContainerRef={scrollableContainerRef}
                  isEpic={isEpic}
                />
              )}

              {!isCollapsed &&
                kids.map((kidId) => {
                  const kidDraggableId = (() => {
                    let id = kidId;
                    if (groupId) id = `${id}__${groupId}`;
                    if (sub_group_id) id = `${id}__${sub_group_id}`;
                    return id;
                  })();
                  return (
                    <BoardChildRow
                      key={kidDraggableId}
                      issueId={kidId}
                      groupId={groupId}
                      sub_group_id={sub_group_id}
                      issuesMap={issuesMap}
                      displayProperties={displayProperties}
                      updateIssue={updateIssue}
                      quickActions={quickActions}
                      canEditProperties={canEditProperties}
                      canDropOverIssue={canDropOverIssue}
                      canDragIssuesInCurrentGrouping={canDragIssuesInCurrentGrouping}
                      scrollableContainerRef={scrollableContainerRef}
                      isEpic={isEpic}
                    />
                  );
                })}
            </div>
          );
        }

        return (
          <BoardChildRow
            key={draggableId}
            issueId={issueId}
            groupId={groupId}
            sub_group_id={sub_group_id}
            issuesMap={issuesMap}
            displayProperties={displayProperties}
            updateIssue={updateIssue}
            quickActions={quickActions}
            canEditProperties={canEditProperties}
            canDropOverIssue={canDropOverIssue}
            canDragIssuesInCurrentGrouping={canDragIssuesInCurrentGrouping}
            scrollableContainerRef={scrollableContainerRef}
            isEpic={isEpic}
            orphaned
            parentId={parentId}
          />
        );
      })}
    </>
  );
});

type ChildRowProps = {
  issueId: string;
  groupId: string;
  sub_group_id: string;
  issuesMap: IIssueMap;
  displayProperties: any;
  updateIssue?: any;
  quickActions: any;
  canEditProperties: (projectId: string | undefined) => boolean;
  canDropOverIssue: boolean;
  canDragIssuesInCurrentGrouping: boolean;
  scrollableContainerRef: any;
  isEpic?: boolean;
  orphaned?: boolean;
  parentId?: string | null;
};

const INDENT_PX = 20; // how much child rows are pushed right of the column edge.
// 20px = the parent card's chevron button width (5 = w-5 = 20px), so the
// child's left edge lines up with the parent's card left edge.

const BoardChildRow = observer(function BoardChildRow(props: ChildRowProps) {
  const draggableId = (() => {
    let id = props.issueId;
    if (props.groupId) id = `${id}__${props.groupId}`;
    if (props.sub_group_id) id = `${id}__${props.sub_group_id}`;
    return id;
  })();

  // The child row is indented by INDENT_PX from the column's left edge.
  // The tree-guide vertical line sits at the start of the indent (left: 9px,
  // centered in the indent gutter). The horizontal branch hooks into the
  // card. The card itself is the full width of the indent row, so it
  // is visibly narrower than the parent card above it.
  return (
    <div className="relative my-0.5" style={{ marginLeft: INDENT_PX }}>
      {/* tree-guide vertical line: 1px wide, runs from the top of this row
          down to the top of the next sibling */}
      <span
        className="pointer-events-none absolute top-0 bottom-0 w-px bg-strong"
        style={{ left: `-${INDENT_PX / 2}px` }}
        aria-hidden
      />
      {/* tree-guide horizontal branch into the card */}
      <span
        className="pointer-events-none absolute top-3.5 h-px bg-strong"
        style={{ left: `-${INDENT_PX / 2}px`, width: `${INDENT_PX / 2}px` }}
        aria-hidden
      />
      {/* orphaned badge: top-right corner of the card, doesn't affect width */}
      {props.orphaned && (
        <span
          className="pointer-events-none absolute right-2 top-1 z-10 inline-flex items-center gap-1 rounded bg-layer-2/90 px-1.5 py-0.5 text-10 uppercase tracking-wide text-placeholder backdrop-blur-sm"
          title={props.parentId ? `Parent in another column: ${props.parentId}` : "Parent in another column"}
        >
          <CornerDownRight className="size-3" />
          sub
        </span>
      )}
      <KanbanIssueBlock
        issueId={props.issueId}
        groupId={props.groupId}
        subGroupId={props.sub_group_id}
        shouldRenderByDefault
        issuesMap={props.issuesMap}
        displayProperties={props.displayProperties}
        updateIssue={props.updateIssue}
        quickActions={props.quickActions}
        draggableId={draggableId}
        canDropOverIssue={props.canDropOverIssue}
        canDragIssuesInCurrentGrouping={props.canDragIssuesInCurrentGrouping}
        canEditProperties={props.canEditProperties}
        scrollableContainerRef={props.scrollableContainerRef}
        isEpic={props.isEpic}
      />
    </div>
  );
});
