import { create } from "zustand";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  getWallpaperTheme,
  parseAppearancePreferences,
  serializeAppearancePreferences,
  type WallpaperMode,
} from "../../data/wallpapers";
import { FILE_SYSTEM, type FileItem } from "../../data/fileSystem";
import {
  applyGrabCursor,
  captureOnDesktop,
  clearGrabCursor,
  clampDesktopPosition,
  clientToDesktopLocal,
  defaultDesktopPosition,
  DESKTOP_DOCK_H,
  DESKTOP_ICON_H,
  DESKTOP_ICON_W,
  DESKTOP_MENU_H,
  DESKTOP_SCREEN_H,
  DESKTOP_SCREEN_W,
  DRAG_THRESHOLD_PX,
  hitTestDrop,
  releaseDesktopCapture,
  type DraggedItem,
  type DropTarget,
} from "../desktop/fileDrag";

export type FileActionLabel = "MOVE_TO_TRASH" | "MOVE_TO_DESKTOP" | "MOVE_TO_FOLDER" | "MOVE_ON_DESKTOP" | "CREATE_FOLDER" | "RENAME_FOLDER" | "RESTORE_FROM_TRASH";
export type RenameFolderResult = { ok: true; name: string } | { ok: false; error: string };

export type AccentName = "blue" | "purple" | "green" | "orange" | "graphite";

export const ACCENT_HEX: Record<AccentName, string> = {
  blue: "#0A84FF",
  purple: "#BF5AF2",
  green: "#30D158",
  orange: "#FF9F0A",
  graphite: "#8E8E93",
};

export { WALLPAPER_THEMES, DEFAULT_WALLPAPER_THEME, DEFAULT_WALLPAPER_MODE, getWallpaperTheme } from "../../data/wallpapers";
export type { WallpaperMode, WallpaperTheme } from "../../data/wallpapers";

export type { DraggedItem, DropTarget };

interface FileSnapshot {
  trashItems: string[];
  /** The root of the trash action that hid each item; separate actions stay separate on restore. */
  trashOrigins: Record<string, string>;
  desktopIds: string[];
  fileSystem: Record<string, FileItem[]>;
  desktopPositions: Record<string, { x: number; y: number }>;
}

interface HistoryEntry extends FileSnapshot {
  label: FileActionLabel;
}

interface PendingDrag {
  item: DraggedItem;
  startX: number;
  startY: number;
  grabOffset: { x: number; y: number };
  pointerId: number;
}

interface SystemState {
  appearanceHydrated: boolean;
  hydrateAppearance: () => void;
  theme: "dark" | "light";
  wallpaper: string;
  wallpaperMode: WallpaperMode;
  accent: AccentName;
  reduceMotion: boolean;
  dockMagnification: boolean;
  dockSize: number;
  finderSidebarVisible: boolean;
  finderPathBarVisible: boolean;
  finderStatusBarVisible: boolean;
  trashItems: string[];
  trashOrigins: Record<string, string>;
  deletedIds: string[];
  desktopIds: string[];
  fileSystem: Record<string, FileItem[]>;
  desktopPositions: Record<string, { x: number; y: number }>;
  past: HistoryEntry[];
  future: HistoryEntry[];
  isDragging: boolean;
  draggedItem: DraggedItem | null;
  dragPosition: { x: number; y: number };
  dragGrabOffset: { x: number; y: number };
  dropTarget: DropTarget;
  dropFolderId: string | null;
  pendingDrag: PendingDrag | null;
  dragPointerId: number | null;
  isOverTrash: boolean;
  setTheme: (theme: "dark" | "light") => void;
  /** Wallpaper THEME name (see WALLPAPER_THEMES); resolved per color scheme. */
  setWallpaper: (themeName: string) => void;
  setWallpaperMode: (mode: WallpaperMode) => void;
  setAccent: (accent: AccentName) => void;
  setReduceMotion: (on: boolean) => void;
  setDockMagnification: (on: boolean) => void;
  setDockSize: (size: number) => void;
  toggleFinderSidebar: () => void;
  toggleFinderPathBar: () => void;
  toggleFinderStatusBar: () => void;
  createFolder: (parentId?: string, name?: string) => string | null;
  renameFolder: (id: string, name: string) => RenameFolderResult;
  canRestoreFromTrash: (id: string) => boolean;
  restoreFromTrash: (id: string) => void;
  addToTrash: (id: string) => void;
  emptyTrash: () => void;
  moveToDesktop: (id: string, position?: { x: number; y: number }) => void;
  moveToFolder: (id: string, folderId: string) => void;
  undo: () => void;
  redo: () => void;
  beginPointerDrag: (input: {
    item: DraggedItem;
    position: { x: number; y: number };
    grabOffset: { x: number; y: number };
    pointerId: number;
  }) => void;
  onDragPointerMove: (x: number, y: number) => void;
  onDragPointerUp: (x: number, y: number) => void;
  onDragPointerCancel: () => void;
  endDrag: () => void;
  isHidden: (id: string) => boolean;
  getFileItem: (id: string) => FileItem | null;
}

const INITIAL_DESKTOP_IDS = ["projects", "about-me"];
const HISTORY_LIMIT = 50;
let folderSequence = 0;

function cloneFs(fs: Record<string, FileItem[]>): Record<string, FileItem[]> {
  const out: Record<string, FileItem[]> = {};
  for (const key of Object.keys(fs)) {
    out[key] = fs[key].map((item) => ({ ...item }));
  }
  return out;
}

function snapshot(state: Pick<SystemState, "trashItems" | "trashOrigins" | "desktopIds" | "fileSystem" | "desktopPositions">): FileSnapshot {
  return {
    trashItems: [...state.trashItems],
    trashOrigins: { ...state.trashOrigins },
    desktopIds: [...state.desktopIds],
    fileSystem: cloneFs(state.fileSystem),
    desktopPositions: { ...state.desktopPositions },
  };
}

function findFileItem(fs: Record<string, FileItem[]>, id: string): FileItem | null {
  for (const items of Object.values(fs)) {
    const found = items.find((file) => file.id === id);
    if (found) return found;
  }
  return null;
}

function findParentFolder(fs: Record<string, FileItem[]>, id: string): string | null {
  for (const [folderId, items] of Object.entries(fs)) {
    if (items.some((file) => file.id === id)) return folderId;
  }
  return null;
}

function isUnavailable(state: Pick<SystemState, "fileSystem" | "trashItems" | "deletedIds">, id: string): boolean {
  const seen = new Set<string>();
  let current: string | null = id;
  while (current && !seen.has(current)) {
    if (state.trashItems.includes(current) || state.deletedIds.includes(current)) return true;
    seen.add(current);
    current = findParentFolder(state.fileSystem, current);
  }
  return false;
}

function isWritableFolder(state: Pick<SystemState, "fileSystem" | "trashItems" | "deletedIds">, id: string): boolean {
  if (id === "bin" || isUnavailable(state, id) || !Object.hasOwn(state.fileSystem, id)) return false;
  return id === "desktop" || id === "documents" || findFileItem(state.fileSystem, id)?.type === "folder";
}

function canRestoreItem(state: Pick<SystemState, "fileSystem" | "trashItems" | "trashOrigins" | "deletedIds">, id: string): boolean {
  if (!state.trashItems.includes(id) || state.deletedIds.includes(id) || (state.trashOrigins[id] ?? id) !== id) return false;
  const parentId = findParentFolder(state.fileSystem, id);
  return !!parentId && isWritableFolder(state, parentId);
}

function normalizeFolderName(name: string): string | null {
  const normalized = name.trim().normalize("NFC");
  if (!normalized || normalized === "." || normalized === ".." || normalized.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

function siblingNames(state: Pick<SystemState, "fileSystem" | "trashItems" | "deletedIds">, parentId: string, exceptId?: string): Set<string> {
  return new Set((state.fileSystem[parentId] ?? [])
    .filter((item) => item.id !== exceptId && !isUnavailable(state, item.id))
    .map((item) => item.name.trim().normalize("NFC").toLowerCase()));
}

function availableName(base: string, existing: Set<string>): string {
  let name = base;
  let suffix = 2;
  while (existing.has(name.toLowerCase())) name = `${base} ${suffix++}`;
  return name;
}

function removeFromTree(fs: Record<string, FileItem[]>, id: string): Record<string, FileItem[]> {
  const next = cloneFs(fs);
  for (const folderId of Object.keys(next)) {
    next[folderId] = next[folderId].filter((file) => file.id !== id);
  }
  return next;
}

function addToFolder(fs: Record<string, FileItem[]>, folderId: string, item: FileItem): Record<string, FileItem[]> {
  const next = cloneFs(fs);
  if (!next[folderId]) next[folderId] = [];
  if (!next[folderId].some((file) => file.id === item.id)) {
    next[folderId] = [...next[folderId], { ...item }];
  }
  return next;
}

function collectDescendantIds(fs: Record<string, FileItem[]>, rootId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([rootId]);
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    const children = fs[cur];
    if (!children) continue;
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child.id);
      if (fs[child.id]) stack.push(child.id);
    }
  }
  return out;
}

function isNestedUnder(fs: Record<string, FileItem[]>, folderId: string, ancestorId: string): boolean {
  if (folderId === ancestorId) return true;
  const children = fs[ancestorId] || [];
  for (const child of children) {
    if (child.id === folderId || isNestedUnder(fs, folderId, child.id)) return true;
  }
  return false;
}

function initialDesktopPositions(ids: string[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  ids.forEach((id, index) => {
    positions[id] = defaultDesktopPosition(index);
  });
  return positions;
}

function newDesktopFolderPosition(state: Pick<SystemState, "desktopIds" | "desktopPositions">): { x: number; y: number } {
  const maxX = DESKTOP_SCREEN_W - DESKTOP_ICON_W;
  const maxY = DESKTOP_SCREEN_H - DESKTOP_DOCK_H - DESKTOP_ICON_H;
  // Keep all saved positions occupied, including folders in Bin that may return.
  const occupied = Object.values(state.desktopPositions);
  const isFree = ({ x, y }: { x: number; y: number }) => x >= 0 && x <= maxX && y >= DESKTOP_MENU_H && y <= maxY &&
    occupied.every((position) => x >= position.x + DESKTOP_ICON_W || x + DESKTOP_ICON_W <= position.x ||
      y >= position.y + DESKTOP_ICON_H || y + DESKTOP_ICON_H <= position.y);
  const preferred = defaultDesktopPosition(state.desktopIds.length);
  if (isFree(preferred)) return preferred;

  const first = defaultDesktopPosition(0);
  for (let x = first.x; x >= 0; x -= 104) {
    for (let y = first.y; y <= maxY; y += 88) {
      const position = { x, y };
      if (isFree(position)) return position;
    }
  }
  // A completely full desktop may overlap, but the new editor stays reachable.
  return clampDesktopPosition(preferred.x, preferred.y);
}

const EMPTY_DRAG = {
  isDragging: false,
  draggedItem: null,
  dragPosition: { x: 0, y: 0 },
  dragGrabOffset: { x: 0, y: 0 },
  dropTarget: null as DropTarget,
  dropFolderId: null as string | null,
  pendingDrag: null as PendingDrag | null,
  dragPointerId: null as number | null,
  isOverTrash: false,
};

function resetDragVisuals(pointerId: number | null) {
  releaseDesktopCapture(pointerId);
  clearGrabCursor();
}

export const useSystemStore = create<SystemState>((set, get) => ({
  ...DEFAULT_APPEARANCE,
  appearanceHydrated: false,
  hydrateAppearance: () => {
    if (get().appearanceHydrated || typeof window === "undefined") return;
    let preferences = DEFAULT_APPEARANCE;
    try {
      preferences = parseAppearancePreferences(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
    } catch { /* Private/restricted storage still permits this session. */ }
    set({ ...preferences, appearanceHydrated: true });
  },
  accent: "blue",
  reduceMotion: false,
  dockMagnification: true,
  dockSize: 1,
  finderSidebarVisible: true,
  finderPathBarVisible: true,
  finderStatusBarVisible: true,
  trashItems: [],
  trashOrigins: {},
  deletedIds: [],
  desktopIds: INITIAL_DESKTOP_IDS,
  fileSystem: cloneFs(FILE_SYSTEM),
  desktopPositions: initialDesktopPositions(INITIAL_DESKTOP_IDS),
  past: [],
  future: [],
  ...EMPTY_DRAG,
  setTheme: (theme) => set({ theme }),
  setWallpaper: (wallpaper) => set({ wallpaper: getWallpaperTheme(wallpaper).id }),
  setWallpaperMode: (wallpaperMode) => set({ wallpaperMode }),
  setAccent: (accent) => set({ accent }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setDockMagnification: (dockMagnification) => set({ dockMagnification }),
  setDockSize: (dockSize) =>
    set({ dockSize: Math.max(0.75, Math.min(1.5, dockSize)) }),
  toggleFinderSidebar: () => set((state) => ({ finderSidebarVisible: !state.finderSidebarVisible })),
  toggleFinderPathBar: () => set((state) => ({ finderPathBarVisible: !state.finderPathBarVisible })),
  toggleFinderStatusBar: () => set((state) => ({ finderStatusBarVisible: !state.finderStatusBarVisible })),
  createFolder: (parentId = "desktop", name) => {
    const state = get();
    if (!isWritableFolder(state, parentId)) return null;
    const names = siblingNames(state, parentId);
    const folderName = name === undefined ? availableName("Untitled Folder", names) : normalizeFolderName(name);
    if (!folderName || names.has(folderName.toLowerCase())) return null;
    let id: string;
    do { id = `folder-${Date.now()}-${++folderSequence}`; }
    while (Object.hasOwn(state.fileSystem, id) || findFileItem(state.fileSystem, id));

    const item: FileItem = { id, name: folderName, type: "folder" };
    const nextFs = addToFolder(state.fileSystem, parentId, item);
    nextFs[id] = [];
    const onDesktop = parentId === "desktop";
    set({
      past: [...state.past, { ...snapshot(state), label: "CREATE_FOLDER" as const }].slice(-HISTORY_LIMIT),
      future: [],
      fileSystem: nextFs,
      desktopIds: onDesktop ? [...state.desktopIds, id] : state.desktopIds,
      desktopPositions: onDesktop
        ? { ...state.desktopPositions, [id]: newDesktopFolderPosition(state) }
        : state.desktopPositions,
    });
    return id;
  },
  renameFolder: (id, name) => {
    const state = get();
    const item = findFileItem(state.fileSystem, id);
    const parentId = findParentFolder(state.fileSystem, id);
    if (id === "bin" || item?.type !== "folder" || !parentId || !isWritableFolder(state, parentId) || isUnavailable(state, id)) {
      return { ok: false, error: "This folder cannot be renamed here." };
    }
    const folderName = normalizeFolderName(name);
    if (!folderName) return { ok: false, error: "Enter a folder name of 1–255 characters without slashes or control characters." };
    if (siblingNames(state, parentId, id).has(folderName.toLowerCase())) {
      return { ok: false, error: `An item named “${folderName}” already exists here.` };
    }
    if (folderName === item.name) return { ok: true, name: folderName };
    const nextFs = cloneFs(state.fileSystem);
    nextFs[parentId] = nextFs[parentId].map((file) => file.id === id ? { ...file, name: folderName } : file);
    set({
      past: [...state.past, { ...snapshot(state), label: "RENAME_FOLDER" as const }].slice(-HISTORY_LIMIT),
      future: [],
      fileSystem: nextFs,
    });
    return { ok: true, name: folderName };
  },
  canRestoreFromTrash: (id) => canRestoreItem(get(), id),
  restoreFromTrash: (id) =>
    set((state) => {
      if (!canRestoreItem(state, id)) return state;
      // A descendant is restored with the action root; independently trashed children
      // can be restored separately once their original parent is visible again.
      const restoreIds = new Set([id, ...collectDescendantIds(state.fileSystem, id)].filter((childId) =>
        state.trashItems.includes(childId) && !state.deletedIds.includes(childId) && (state.trashOrigins[childId] ?? id) === id
      ));
      const nextTrash = state.trashItems.filter((trashId) => !restoreIds.has(trashId));
      const nextOrigins = { ...state.trashOrigins };
      for (const childId of restoreIds) delete nextOrigins[childId];
      const nextFs = cloneFs(state.fileSystem);
      // If a visible sibling reused a trashed name, restore without duplicate names
      // while retaining each item's ID and its original parent association.
      for (const [folderId, items] of Object.entries(nextFs)) {
        const names = new Set(items.filter((item) => !restoreIds.has(item.id) && !isUnavailable(state, item.id))
          .map((item) => item.name.trim().normalize("NFC").toLowerCase()));
        nextFs[folderId] = items.map((item) => {
          if (!restoreIds.has(item.id)) return item;
          const name = availableName(item.name, names);
          names.add(name.toLowerCase());
          return { ...item, name };
        });
      }
      return {
        past: [...state.past, { ...snapshot(state), label: "RESTORE_FROM_TRASH" as const }].slice(-HISTORY_LIMIT),
        future: [],
        trashItems: nextTrash,
        trashOrigins: nextOrigins,
        fileSystem: nextFs,
      };
    }),
  addToTrash: (id) =>
    set((state) => {
      if (id === "bin" || isUnavailable(state, id) || !findFileItem(state.fileSystem, id)) return state;
      const idsToTrash = [id, ...collectDescendantIds(state.fileSystem, id)].filter(
        (nid) => !state.deletedIds.includes(nid) && !state.trashItems.includes(nid)
      );
      if (idsToTrash.length === 0) return state;
      return {
        past: [...state.past, { ...snapshot(state), label: "MOVE_TO_TRASH" as const }].slice(-HISTORY_LIMIT),
        future: [],
        trashItems: [...state.trashItems, ...idsToTrash],
        trashOrigins: { ...state.trashOrigins, ...Object.fromEntries(idsToTrash.map((childId) => [childId, id])) },
      };
    }),
  emptyTrash: () =>
    set((state) => {
      if (state.trashItems.length === 0) return state;
      const purged = state.trashItems.filter((id) => !state.deletedIds.includes(id));
      const purgedSet = new Set(purged);
      const nextPositions = { ...state.desktopPositions };
      for (const id of purged) delete nextPositions[id];
      return {
        deletedIds: [...state.deletedIds, ...purged],
        trashItems: [],
        trashOrigins: {},
        desktopIds: state.desktopIds.filter((id) => !purgedSet.has(id)),
        desktopPositions: nextPositions,
        future: [],
      };
    }),
  moveToDesktop: (id, position) =>
    set((state) => {
      if (id === "bin" || isUnavailable(state, id)) return state;
      const item = findFileItem(state.fileSystem, id);
      if (!item) return state;
      if (siblingNames(state, "desktop", id).has(item.name.trim().normalize("NFC").toLowerCase())) return state;
      const alreadyOnDesktop = state.desktopIds.includes(id);
      const nextPos = position ?? state.desktopPositions[id] ?? defaultDesktopPosition(state.desktopIds.length);
      if (alreadyOnDesktop && !position) return state;
      if (
        alreadyOnDesktop &&
        position &&
        state.desktopPositions[id]?.x === nextPos.x &&
        state.desktopPositions[id]?.y === nextPos.y
      ) {
        return state;
      }
      let nextFs = state.fileSystem;
      if (findParentFolder(state.fileSystem, id) !== "desktop") {
        nextFs = addToFolder(removeFromTree(state.fileSystem, id), "desktop", item);
      }
      return {
        past: [
          ...state.past,
          { ...snapshot(state), label: alreadyOnDesktop ? ("MOVE_ON_DESKTOP" as const) : ("MOVE_TO_DESKTOP" as const) },
        ].slice(-HISTORY_LIMIT),
        future: [],
        fileSystem: nextFs,
        desktopIds: alreadyOnDesktop ? state.desktopIds : [...state.desktopIds, id],
        desktopPositions: { ...state.desktopPositions, [id]: nextPos },
      };
    }),
  moveToFolder: (id, folderId) =>
    set((state) => {
      if (id === "bin" || isUnavailable(state, id)) return state;
      if (folderId === id) return state;
      if (!isWritableFolder(state, folderId)) return state;
      if (isNestedUnder(state.fileSystem, folderId, id)) return state;
      const item = findFileItem(state.fileSystem, id);
      if (!item) return state;
      if (siblingNames(state, folderId, id).has(item.name.trim().normalize("NFC").toLowerCase())) return state;
      const currentParent = findParentFolder(state.fileSystem, id);
      const onDesktop = state.desktopIds.includes(id);
      if (folderId === "desktop") {
        if (onDesktop && currentParent === "desktop") return state;
        const pos = state.desktopPositions[id] ?? defaultDesktopPosition(state.desktopIds.length);
        const nextFs = addToFolder(removeFromTree(state.fileSystem, id), "desktop", item);
        return {
          past: [...state.past, { ...snapshot(state), label: "MOVE_TO_DESKTOP" as const }].slice(-HISTORY_LIMIT),
          future: [],
          fileSystem: nextFs,
          desktopIds: onDesktop ? state.desktopIds : [...state.desktopIds, id],
          desktopPositions: { ...state.desktopPositions, [id]: pos },
        };
      }
      if (currentParent === folderId && !onDesktop) return state;
      const nextPositions = { ...state.desktopPositions };
      delete nextPositions[id];
      return {
        past: [...state.past, { ...snapshot(state), label: "MOVE_TO_FOLDER" as const }].slice(-HISTORY_LIMIT),
        future: [],
        fileSystem: addToFolder(removeFromTree(state.fileSystem, id), folderId, item),
        desktopIds: state.desktopIds.filter((desktopId) => desktopId !== id),
        desktopPositions: nextPositions,
      };
    }),
  undo: () =>
    set((state) => {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      const alive = (id: string) => !state.deletedIds.includes(id);
      const nextPositions = { ...prev.desktopPositions };
      for (const id of Object.keys(nextPositions)) {
        if (!alive(id)) delete nextPositions[id];
      }
      return {
        past: state.past.slice(0, -1),
        future: [...state.future, { ...snapshot(state), label: prev.label }].slice(-HISTORY_LIMIT),
        trashItems: prev.trashItems.filter(alive),
        trashOrigins: Object.fromEntries(Object.entries(prev.trashOrigins).filter(([id, rootId]) => alive(id) && alive(rootId))),
        desktopIds: prev.desktopIds.filter(alive),
        fileSystem: cloneFs(prev.fileSystem),
        desktopPositions: nextPositions,
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[state.future.length - 1];
      if (!next) return state;
      const alive = (id: string) => !state.deletedIds.includes(id);
      const nextPositions = { ...next.desktopPositions };
      for (const id of Object.keys(nextPositions)) {
        if (!alive(id)) delete nextPositions[id];
      }
      return {
        future: state.future.slice(0, -1),
        past: [...state.past, { ...snapshot(state), label: next.label }].slice(-HISTORY_LIMIT),
        trashItems: next.trashItems.filter(alive),
        trashOrigins: Object.fromEntries(Object.entries(next.trashOrigins).filter(([id, rootId]) => alive(id) && alive(rootId))),
        desktopIds: next.desktopIds.filter(alive),
        fileSystem: cloneFs(next.fileSystem),
        desktopPositions: nextPositions,
      };
    }),
  isHidden: (id) => {
    return isUnavailable(get(), id);
  },
  getFileItem: (id) => findFileItem(get().fileSystem, id),
  beginPointerDrag: ({ item, position, grabOffset, pointerId }) => {
    const state = get();
    if (state.isDragging || state.pendingDrag) return;
    set({
      pendingDrag: { item, startX: position.x, startY: position.y, grabOffset, pointerId },
      dragPosition: position,
      dragGrabOffset: grabOffset,
      dragPointerId: pointerId,
    });
  },
  onDragPointerMove: (x, y) => {
    const state = get();
    const pending = state.pendingDrag;
    if (!state.isDragging && pending) {
      if (Math.hypot(x - pending.startX, y - pending.startY) < DRAG_THRESHOLD_PX) {
        if (state.dragPosition.x === x && state.dragPosition.y === y) return;
        set({ dragPosition: { x, y } });
        return;
      }
      captureOnDesktop(pending.pointerId);
      applyGrabCursor();
      const hit = hitTestDrop(x, y, pending.item.id);
      set({
        isDragging: true,
        draggedItem: pending.item,
        pendingDrag: null,
        dragPosition: { x, y },
        dragGrabOffset: pending.grabOffset,
        dragPointerId: pending.pointerId,
        dropTarget: hit.target,
        dropFolderId: hit.folderId,
        isOverTrash: hit.target === "trash",
      });
      return;
    }
    if (!state.isDragging || !state.draggedItem) return;
    const hit = hitTestDrop(x, y, state.draggedItem.id);
    if (
      state.dragPosition.x === x &&
      state.dragPosition.y === y &&
      state.dropTarget === hit.target &&
      state.dropFolderId === hit.folderId
    ) {
      return;
    }
    set({
      dragPosition: { x, y },
      dropTarget: hit.target,
      dropFolderId: hit.folderId,
      isOverTrash: hit.target === "trash",
    });
  },
  onDragPointerUp: (x, y) => {
    const state = get();
    if (!state.isDragging && !state.pendingDrag) return;
    const item = state.draggedItem ?? state.pendingDrag?.item ?? null;
    const wasLive = state.isDragging;
    const pointerId = state.dragPointerId;
    resetDragVisuals(pointerId);
    set({ ...EMPTY_DRAG });
    if (!wasLive || !item) return;

    const hit = hitTestDrop(x, y, item.id);
    const grab = state.dragGrabOffset;
    const applyDrop = () => {
      if (hit.target === "trash") {
        get().addToTrash(item.id);
        return;
      }
      if (hit.target === "desktop") {
        const local = clientToDesktopLocal(x, y);
        const pos = clampDesktopPosition((local?.x ?? x) - grab.x, (local?.y ?? y) - grab.y);
        get().moveToDesktop(item.id, pos);
        return;
      }
      if (hit.target === "finder" && hit.folderId) {
        get().moveToFolder(item.id, hit.folderId);
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(applyDrop);
    } else {
      applyDrop();
    }
  },
  onDragPointerCancel: () => {
    const { isDragging, pendingDrag, dragPointerId } = get();
    if (!isDragging && !pendingDrag) return;
    resetDragVisuals(dragPointerId);
    set({ ...EMPTY_DRAG });
  },
  endDrag: () => {
    const { dragPointerId, isDragging, pendingDrag, dropTarget } = get();
    if (!isDragging && !pendingDrag && !dropTarget) {
      resetDragVisuals(dragPointerId);
      return;
    }
    resetDragVisuals(dragPointerId);
    set({ ...EMPTY_DRAG });
  },
}));

// Persist only appearance, and only when appearance changes. Pointer/drag,
// filesystem and window updates must neither write storage nor be saved.
useSystemStore.subscribe((state, previous) => {
  if (!state.appearanceHydrated || typeof window === "undefined") return;
  if (previous.appearanceHydrated && state.theme === previous.theme &&
      state.wallpaper === previous.wallpaper && state.wallpaperMode === previous.wallpaperMode) return;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearancePreferences(state));
  } catch { /* Appearance remains usable when storage is unavailable. */ }
});
