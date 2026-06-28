/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, Input } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TLogoProps, TProjectGroup } from "@plane/types";
// hooks
import { useProjectGroup } from "@/hooks/store/use-project-group";

// A small fixed palette for the fallback group color dot (used when no emoji/icon set).
const GROUP_COLORS = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#14b8a6", // teal
  "#8b5cf6", // violet
  "#6b7280", // gray
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  group?: TProjectGroup | null;
  parentId?: string | null;
};

export const ProjectGroupModal = observer(function ProjectGroupModal(props: Props) {
  const { isOpen, onClose, group = null, parentId = null } = props;
  // store
  const { createProjectGroup, updateProjectGroup } = useProjectGroup();
  // params
  const { workspaceSlug } = useParams();
  // state
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(GROUP_COLORS[0]);
  const [logoProps, setLogoProps] = useState<TLogoProps | undefined>(undefined);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  // refs
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setName(group?.name ?? "");
      setColor(group?.color ?? GROUP_COLORS[0]);
      setLogoProps(group?.logo_props && group.logo_props.in_use ? group.logo_props : undefined);
      setNameError(null);
      setIsPickerOpen(false);
      // autofocus the name field on open (after a tick so the modal is mounted)
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen, group]);

  // Esc closes the modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPickerOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, isPickerOpen, onClose]);

  const hasLogo = !!logoProps?.in_use;
  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;

  const handleSubmit = async () => {
    if (!isValid || !workspaceSlug) return;
    setNameError(null);
    setIsSubmitting(true);
    const payload: Partial<TProjectGroup> = {
      name: trimmedName,
      color,
      logo_props: logoProps ?? ({} as TLogoProps),
    };
    try {
      if (group) {
        await updateProjectGroup(workspaceSlug.toString(), group.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Group updated", message: `Renamed to "${trimmedName}".` });
      } else {
        await createProjectGroup(workspaceSlug.toString(), { ...payload, parent: parentId });
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Group created", message: `"${trimmedName}" added.` });
      }
      onClose();
    } catch (error: any) {
      // surface server validation errors inline next to the name field
      const nameErr = error?.name?.[0];
      const parentErr = error?.parent?.[0];
      if (nameErr) setNameError(String(nameErr));
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: nameErr || parentErr || error?.error || "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-[440px] rounded-lg bg-surface-1 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: title + current glyph preview */}
        <div className="mb-4 flex items-center gap-3">
          <span
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md border border-subtle bg-layer-2"
            style={!hasLogo ? { borderColor: color } : undefined}
          >
            {hasLogo ? (
              <Logo logo={logoProps} size={18} />
            ) : (
              <span className="size-3 rounded-full" style={{ backgroundColor: color }} />
            )}
          </span>
          <h3 className="text-15 font-semibold text-primary">
            {group ? "Edit group" : parentId ? "New subgroup" : "New group"}
          </h3>
        </div>

        {/* Icon + name row */}
        <div className="flex items-start gap-3">
          <div>
            <label className="mb-1 block text-13 font-medium text-secondary">Icon</label>
            <EmojiPicker
              iconType="material"
              isOpen={isPickerOpen}
              handleToggle={(val: boolean) => setIsPickerOpen(val)}
              className="flex items-center justify-center"
              buttonClassName="flex items-center justify-center"
              label={
                <span
                  className="grid h-11 w-11 place-items-center rounded-md border border-subtle bg-layer-2"
                  style={!hasLogo ? { borderColor: color } : undefined}
                >
                  {hasLogo ? (
                    <Logo logo={logoProps} size={20} />
                  ) : (
                    <span className="size-4 rounded-full" style={{ backgroundColor: color }} />
                  )}
                </span>
              }
              onChange={(val: any) => {
                let logoValue: any = {};
                if (val?.type === "emoji") logoValue = { value: val.value };
                else if (val?.type === "icon") logoValue = val.value;
                const newLogoProps: TLogoProps = {
                  in_use: val?.type,
                  [val?.type]: logoValue,
                } as TLogoProps;
                setLogoProps(newLogoProps);
                setIsPickerOpen(false);
              }}
              defaultIconColor={logoProps?.in_use === "icon" ? logoProps?.icon?.color : undefined}
              defaultOpen={
                logoProps?.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON
              }
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-13 font-medium text-secondary">Name</label>
            <Input
              ref={nameInputRef as any}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="e.g. Clients"
              className={cn("w-full", nameError && "border-danger-text")}
              hasError={!!nameError}
            />
            {nameError && (
              <p className="mt-1 text-11 text-danger-text">{nameError}</p>
            )}
          </div>
        </div>

        {/* Fallback color */}
        <div className="mt-4">
          <label className="mb-2 block text-13 font-medium text-secondary">
            Color{" "}
            {hasLogo && (
              <span className="text-placeholder">(used if you remove the icon)</span>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn("size-6 rounded-full border-2 transition-transform", {
                  "scale-110 border-primary": color === c,
                  "border-transparent": color !== c,
                })}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
            {hasLogo && (
              <button
                type="button"
                onClick={() => setLogoProps(undefined)}
                className="ml-2 rounded border border-subtle px-2 py-1 text-11 text-tertiary hover:bg-layer-1-hover"
              >
                Remove icon
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="text-11 text-placeholder">Esc to cancel · Enter to save</span>
          <div className="flex gap-2">
            <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!isValid}
            >
              {group ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
