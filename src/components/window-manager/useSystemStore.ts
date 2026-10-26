import { create } from "zustand";
import { FILE_SYSTEM, type FileItem } from "../../data/fileSystem";
import {
  applyGrabCursor,
  captureOnDesktop,
  clearGrabCursor,
  clampDesktopPosition,
  clientToDesktopLocal,
  defaultDesktopPosition,
  DRAG_THRESHOLD_PX,
  hitTestDrop,
  releaseDesktopCapture,
  type DraggedItem,
  type DropTarget,
} from "../desktop/fileDrag";

export type FileActionLabel = "MOVE_TO_TRASH" | "MOVE_TO_DESKTOP" | "MOVE_TO_FOLDER" | "MOVE_ON_DESKTOP" | "CREATE_FOLDER" | "RESTORE_FROM_TRASH";

export type AccentName = "blue" | "purple" | "green" | "orange" | "graphite";

export const ACCENT_HEX: Record<AccentName, string> = {
  blue: "#0A84FF",
  purple: "#BF5AF2",
  green: "#30D158",
  orange: "#FF9F0A",
  graphite: "#8E8E93",
};

export type WallpaperMode = "auto" | "light" | "dark";

export interface WallpaperTheme {
  id: string;
  name: string;
  lightUrl: string;
  darkUrl: string;
}

export const WALLPAPER_THEMES: WallpaperTheme[] = [
  {
    id: "big-sur",
    name: "Big Sur",
    lightUrl: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=2564&q=85",
    darkUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=2564&q=85",
  },
  {
    id: "monterey",
    name: "Monterey",
    lightUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2564&q=85",
    darkUrl: "https://images.unsplash.com/photo-1483347756197-71ef80e95f73?auto=format&fit=crop&w=2564&q=85",
  },
  {
    id: "ventura",
    name: "Ventura",
    lightUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=2564&q=85",
    darkUrl: "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=2564&q=85",
  },
  {
    id: "sonoma",
    name: "Sonoma",
    lightUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2564&q=85",
    darkUrl: "https://images.unsplash.com/photo-1534791547706-4d44c1f5c3d3?auto=format&fit=crop&w=2564&q=85",
  },
  {
    id: "sequoia",
    name: "Sequoia",
    lightUrl: "https://images.unsplash.com/photo-1439405326854-014607f694d7?auto=format&fit=crop&w=2564&q=85",
    darkUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2564&q=85",
  },
];

export const DEFAULT_WALLPAPER_THEME = "Big Sur";
export const DEFAULT_WALLPAPER_MODE: WallpaperMode = "light";

export function getWallpaperTheme(themeName: string): WallpaperTheme {
  return WALLPAPER_THEMES.find((theme) => theme.name === themeName) ?? WALLPAPER_THEMES[0];
}

export type { DraggedItem, DropTarget };

interface FileSnapshot {
  trashItems: string[];
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

function cloneFs(fs: Record<string, FileItem[]>): Record<string, FileItem[]> {
  const out: Record<string, FileItem[]> = {};
  for (const key of Object.keys(fs)) {
    out[key] = fs[key].map((item) => ({ ...item }));
  }
  return out;
}

function snapshot(state: Pick<SystemState, "trashItems" | "desktopIds" | "fileSystem" | "desktopPositions">): FileSnapshot {
  return {
    trashItems: [...state.trashItems],
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
  theme: "dark",
  wallpaper: DEFAULT_WALLPAPER_THEME,
  wallpaperMode: DEFAULT_WALLPAPER_MODE,
  accent: "blue",
  reduceMotion: false,
  dockMagnification: true,
  dockSize: 1,
  finderSidebarVisible: true,
  finderPathBarVisible: true,
  finderStatusBarVisible: true,
  trashItems: [],
  deletedIds: [],
  desktopIds: INITIAL_DESKTOP_IDS,
  fileSystem: cloneFs(FILE_SYSTEM),
  desktopPositions: initialDesktopPositions(INITIAL_DESKTOP_IDS),
  past: [],
  future: [],
  ...EMPTY_DRAG,
  setTheme: (theme) => set({ theme }),
  setWallpaper: (wallpaper) => set({ wallpaper }),
  setWallpaperMode: (wallpaperMode) => set({ wallpaperMode }),
  setAccent: (accent) => set({ accent }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setDockMagnification: (dockMagnification) => set({ dockMagnification }),
  setDockSize: (dockSize) =>
    set({ dockSize: Math.max(0.75, Math.min(1.5, dockSize)) }),
  toggleFinderSidebar: () => set((state) => ({ finderSidebarVisible: !state.finderSidebarVisible })),
  toggleFinderPathBar: () => set((state) => ({ finderPathBarVisible: !state.finderPathBarVisible })),
  toggleFinderStatusBar: () => set((state) => ({ finderStatusBarVisible: !state.finderStatusBarVisible })),
  createFolder: (parentId = "desktop", name = "Untitled Folder") => {
    const state = get();
    const validParent = parentId === "desktop" || !!state.fileSystem[parentId];
    if (!validParent) return null;

    let id = `folder-${Date.now()}`;
    let suffix = 2;
    while (findFileItem(state.fileSystem, id)) {
      id = `folder-${Date.now()}-${suffix}`;
      suffix += 1;
    }

    const item: FileItem = { id, name, type: "folder" };
    const nextFs = addToFolder(state.fileSystem, parentId, item);
    nextFs[id] = [];
    const onDesktop = parentId === "desktop";
    set({
      past: [...state.past, { ...snapshot(state), label: "CREATE_FOLDER" as const }].slice(-HISTORY_LIMIT),
      future: [],
      fileSystem: nextFs,
      desktopIds: onDesktop ? [...state.desktopIds, id] : state.desktopIds,
      desktopPositions: onDesktop
        ? { ...state.desktopPositions, [id]: defaultDesktopPosition(state.desktopIds.length) }
        : state.desktopPositions,
    });
    return id;
  },
  restoreFromTrash: (id) =>
    set((state) => {
      if (!state.trashItems.includes(id) || state.deletedIds.includes(id)) return state;
      return {
        past: [...state.past, { ...snapshot(state), label: "RESTORE_FROM_TRASH" as const }].slice(-HISTORY_LIMIT),
        future: [],
        trashItems: state.trashItems.filter((trashId) => trashId !== id),
      };
    }),
  addToTrash: (id) =>
    set((state) => {
      if (state.deletedIds.includes(id)) return state;
      const idsToTrash = [id, ...collectDescendantIds(state.fileSystem, id)].filter(
        (nid) => !state.deletedIds.includes(nid) && !state.trashItems.includes(nid)
      );
      if (idsToTrash.length === 0) return state;
      return {
        past: [...state.past, { ...snapshot(state), label: "MOVE_TO_TRASH" as const }].slice(-HISTORY_LIMIT),
        future: [],
        trashItems: [...state.trashItems, ...idsToTrash],
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
        desktopIds: state.desktopIds.filter((id) => !purgedSet.has(id)),
        desktopPositions: nextPositions,
        future: [],
      };
    }),
  moveToDesktop: (id, position) =>
    set((state) => {
      if (state.deletedIds.includes(id)) return state;
      if (state.trashItems.includes(id)) return state;
      const item = findFileItem(state.fileSystem, id);
      if (!item) return state;
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
      if (state.deletedIds.includes(id) || state.trashItems.includes(id)) return state;
      if (folderId === id) return state;
      const destItem = findFileItem(state.fileSystem, folderId);
      const destIsFolder =
        folderId === "desktop" || !!state.fileSystem[folderId] || destItem?.type === "folder";
      if (!destIsFolder) return state;
      if (isNestedUnder(state.fileSystem, folderId, id)) return state;
      const item = findFileItem(state.fileSystem, id);
      if (!item) return state;
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
        desktopIds: next.desktopIds.filter(alive),
        fileSystem: cloneFs(next.fileSystem),
        desktopPositions: nextPositions,
      };
    }),
  isHidden: (id) => {
    const { trashItems, deletedIds } = get();
    return trashItems.includes(id) || deletedIds.includes(id);
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
