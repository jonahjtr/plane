/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ChevronRightIcon } from "@plane/propel/icons";
// components
import { ViewListLoader } from "@/components/ui/loader/view-list-loader";
// hooks
import { useGlobalView } from "@/hooks/store/use-global-view";
// local imports
import { GlobalViewListItem } from "./view-list-item";

type Props = {
  searchQuery: string;
};

// DK fork: views named "<Prefix> · <name>" are grouped into collapsible sections in this order.
// ponytail: grouping is by name prefix, not a DB field. Upgrade path: add a `section` column to issue_views.
const SECTIONS: [prefix: string, label: string][] = [
  ["SEO", "SEO"],
  ["Ads", "Ads"],
  ["Ops", "Operations"],
  ["Sales", "Sales"],
];
export const sectionOf = (name = "") => {
  const prefix = name.split(" · ")[0];
  return SECTIONS.some(([p]) => p === prefix) && name.includes(" · ") ? prefix : "Other";
};

export function ViewSection(props: { label: string; count: number; open: boolean; children: React.ReactNode }) {
  return (
    <details open={props.open} className="group border-b border-subtle">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-13 font-medium text-primary hover:bg-layer-1-hover">
        <ChevronRightIcon className="size-4 text-tertiary transition-transform group-open:rotate-90" />
        {props.label}
        <span className="text-11 text-tertiary">{props.count}</span>
      </summary>
      {props.children}
    </details>
  );
}

export const GlobalViewsList = observer(function GlobalViewsList(props: Props) {
  const { searchQuery } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { fetchAllGlobalViews, currentWorkspaceViews, getSearchedViews, getViewDetailsById } = useGlobalView();

  useSWR(
    workspaceSlug ? `GLOBAL_VIEWS_LIST_${workspaceSlug.toString()}` : null,
    workspaceSlug ? () => fetchAllGlobalViews(workspaceSlug.toString()) : null
  );

  if (!currentWorkspaceViews) return <ViewListLoader />;

  const filteredViewsList = getSearchedViews(searchQuery) ?? [];
  const searching = searchQuery.trim() !== "";

  return (
    <>
      {[...SECTIONS, ["Other", "Other"] as [string, string]].map(([prefix, label]) => {
        const ids = filteredViewsList
          .filter((id) => sectionOf(getViewDetailsById(id)?.name) === prefix)
          .sort((a, b) =>
            String(getViewDetailsById(b)?.created_at ?? "").localeCompare(String(getViewDetailsById(a)?.created_at ?? ""))
          );
        if (ids.length === 0) return null;
        return (
          <ViewSection key={prefix} label={label} count={ids.length} open={searching}>
            {ids.map((viewId) => (
              <GlobalViewListItem key={viewId} viewId={viewId} />
            ))}
          </ViewSection>
        );
      })}
    </>
  );
});
