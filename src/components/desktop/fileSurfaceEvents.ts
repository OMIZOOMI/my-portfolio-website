import type { KeyboardEvent, MouseEvent } from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { createFolderAndRename, useFileInteractionStore } from "./useFileInteractionStore";

export function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, [role="textbox"]'));
}

export function handleFileContextMenu(event: MouseEvent<HTMLElement>, surfaceId: string, folderId: string) {
  if (isTextEditingTarget(event.target)) return;
  const target = event.target as HTMLElement;
  const item = target.closest<HTMLElement>("[data-file-item]");
  event.preventDefault();
  event.stopPropagation();
  useFileInteractionStore.getState().showContextMenu({
    surfaceId, folderId, itemId: item?.dataset.fileItem ?? null,
    clientX: event.clientX, clientY: event.clientY,
    trigger: item?.querySelector<HTMLElement>("button") ?? event.currentTarget,
  });
}

export function handleFileSurfaceKeyDown(event: KeyboardEvent<HTMLElement>, surfaceId: string, folderId: string) {
  if (isTextEditingTarget(event.target)) return;
  const interactions = useFileInteractionStore.getState();
  const files = useSystemStore.getState();
  const focusedItem = (event.target as HTMLElement).closest<HTMLElement>("[data-file-item]");
  const selectedId = interactions.selections[surfaceId];
  const selectedItem = selectedId ? Array.from(event.currentTarget.querySelectorAll<HTMLElement>(`[data-file-item="${CSS.escape(selectedId)}"]`))
    .find((item) => (item.closest<HTMLElement>("[data-window-frame]")?.dataset.windowFrame ?? "desktop") === surfaceId) : null;
  const itemId = focusedItem?.dataset.fileItem ?? selectedItem?.dataset.fileItem ?? null;
  if (event.key === "F2") {
    event.preventDefault();
    event.stopPropagation();
    if (folderId !== "bin" && itemId) interactions.beginRename(surfaceId, itemId);
  } else if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
    event.preventDefault();
    event.stopPropagation();
    const trigger = focusedItem?.querySelector<HTMLElement>("button") ?? selectedItem?.querySelector<HTMLElement>("button") ?? event.currentTarget;
    const rect = trigger.getBoundingClientRect();
    interactions.showContextMenu({ surfaceId, folderId, itemId, trigger, clientX: rect.left + rect.width / 2, clientY: rect.top + Math.min(rect.height, 35) });
  } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "n") {
    event.preventDefault();
    event.stopPropagation();
    if (folderId !== "bin" && !files.isHidden(folderId)) createFolderAndRename(surfaceId, folderId);
  }
}
