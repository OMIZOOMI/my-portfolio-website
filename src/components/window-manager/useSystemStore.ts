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

export type FileActionLabel = "MOVE_TO_TRASH" | "MOVE_TO_DESKTOP" | "MOVE_TO_FOLDER" | "MOVE_ON_DESKTOP";

export type AccentName = "blue" | "purple" | "green" | "orange" | "graphite";

export const ACCENT_HEX: Record<AccentName, string> = {
  blue: "#0A84FF",
  purple: "#BF5AF2",
  green: "#30D158",
  orange: "#FF9F0A",
  graphite: "#8E8E93",
};

export interface WallpaperTheme {
  name: string;
  /** Base photo URL (day version). */
  photo: string;
}

// Theme-name wallpapers: the store keeps the NAME, DesktopEnvironment resolves
// the URL for the active color scheme.
//
// True matched pairs: day AND night are the EXACT same landscape — the night
// variant is the same photo with imgix brightness/saturation grading
// (images.unsplash.com is imgix-backed), so the dynamic-theme illusion never
// breaks from mismatched scenes or unverified second URLs. The old standalone
// "Mountains" asset 404'd and is gone.
const NIGHT_PARAMS = "&bri=-38&sat=-32&con=-8";

export const WALLPAPER_THEMES: WallpaperTheme[] = [
  {
    name: "Big Sur",
    photo: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564",
  },
  {
    name: "Monterey",
    photo: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2564",
  },
  {
    name: "Ventura",
    photo: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=2564",
  },
  {
    name: "Sonoma",
    photo: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=2564",
  },
  {
    name: "Sequoia",
    photo: "https://images.unsplash.com/photo-1439405326854-014607f694d7?q=80&w=2564",
  },
];

export const DEFAULT_WALLPAPER_THEME = "Big Sur";

export function resolveWallpaper(themeName: string, isDark: boolean): string {
  const theme =
    WALLPAPER_THEMES.find((t) => t.name === themeName) ?? WALLPAPER_THEMES[0];
  return isDark ? `${theme.photo}${NIGHT_PARAMS}` : theme.photo;
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
  accent: AccentName;
  reduceMotion: boolean;
  dockMagnification: boolean;
  dockSize: number;
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
  setAccent: (accent: AccentName) => void;
  setReduceMotion: (on: boolean) => void;
  setDockMagnification: (on: boolean) => void;
  setDockSize: (size: number) => void;
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
  accent: "blue",
  reduceMotion: false,
  dockMagnification: true,
  dockSize: 1,
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
  setAccent: (accent) => set({ accent }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setDockMagnification: (dockMagnification) => set({ dockMagnification }),
  setDockSize: (dockSize) =>
    set({ dockSize: Math.max(0.75, Math.min(1.5, dockSize)) }),
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
