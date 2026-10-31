"use client";

import { create } from "zustand";
import { useSystemStore } from "../window-manager/useSystemStore";
import { clientToDesktopLocal } from "./fileDrag";

export interface FolderRenameSession {
  surfaceId: string;
  itemId: string;
  token: number;
}

export interface FileContextMenuState {
  surfaceId: string;
  folderId: string;
  itemId: string | null;
  x: number;
  y: number;
  trigger: HTMLElement | null;
}

interface FileInteractionState {
  selections: Record<string, string | null>;
  rename: FolderRenameSession | null;
  contextMenu: FileContextMenuState | null;
  selectItem: (surfaceId: string, itemId: string | null) => void;
  beginRename: (surfaceId: string, itemId: string) => void;
  finishRename: (token: number) => void;
  showContextMenu: (input: {
    surfaceId: string;
    folderId: string;
    itemId: string | null;
    clientX: number;
    clientY: number;
    trigger?: HTMLElement | null;
  }) => void;
  closeContextMenu: () => void;
}

let nextRenameToken = 0;

/** Transient interaction state; deliberately separate from persisted preferences and file history. */
export const useFileInteractionStore = create<FileInteractionState>((set) => ({
  selections: {},
  rename: null,
  contextMenu: null,
  selectItem: (surfaceId, itemId) => set((state) => {
    if (state.selections[surfaceId] === itemId) return state;
    return { selections: { ...state.selections, [surfaceId]: itemId } };
  }),
  beginRename: (surfaceId, itemId) => {
    const files = useSystemStore.getState();
    const item = files.getFileItem(itemId);
    if (itemId === "bin" || item?.type !== "folder" || files.isHidden(itemId)) return;
    set((state) => ({
      selections: { ...state.selections, [surfaceId]: itemId },
      rename: { surfaceId, itemId, token: ++nextRenameToken },
      contextMenu: null,
    }));
  },
  finishRename: (token) => set((state) => state.rename?.token === token ? { rename: null } : state),
  showContextMenu: ({ surfaceId, folderId, itemId, clientX, clientY, trigger }) => {
    const point = clientToDesktopLocal(clientX, clientY);
    if (!point) return;
    // A macOS Control-click can begin as a primary pointer before contextmenu fires.
    useSystemStore.getState().onDragPointerCancel();
    set((state) => ({
      selections: { ...state.selections, [surfaceId]: itemId },
      contextMenu: { surfaceId, folderId, itemId, ...point, trigger: trigger ?? null },
    }));
  },
  closeContextMenu: () => set({ contextMenu: null }),
}));

export function createFolderAndRename(surfaceId: string, parentId = "desktop"): string | null {
  const itemId = useSystemStore.getState().createFolder(parentId);
  if (itemId) useFileInteractionStore.getState().beginRename(surfaceId, itemId);
  return itemId;
}

export function requestFolderRename(surfaceId: string, itemId: string) {
  useFileInteractionStore.getState().beginRename(surfaceId, itemId);
}
