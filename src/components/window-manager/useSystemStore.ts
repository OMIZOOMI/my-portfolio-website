import { create } from "zustand";
import { FILE_SYSTEM } from "../../data/fileSystem";

export type FileActionLabel = "MOVE_TO_TRASH" | "MOVE_TO_DESKTOP";

export interface ActiveDragItem {
  id: string;
  name: string;
  type: "folder" | "file" | "app";
  fromFolder: string;
  x: number;
  y: number;
}

interface FileSnapshot {
  trashItems: string[];
  desktopIds: string[];
}

interface HistoryEntry extends FileSnapshot {
  label: FileActionLabel;
}

interface SystemState {
  theme: "dark" | "light";
  wallpaper: string;
  trashItems: string[];
  deletedIds: string[];
  desktopIds: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  activeDrag: ActiveDragItem | null;
  isOverTrash: boolean;
  setTheme: (theme: "dark" | "light") => void;
  setWallpaper: (url: string) => void;
  addToTrash: (id: string) => void;
  emptyTrash: () => void;
  moveToDesktop: (id: string) => void;
  undo: () => void;
  redo: () => void;
  startDrag: (item: ActiveDragItem) => void;
  updateDragPos: (x: number, y: number) => void;
  endDrag: () => void;
  setOverTrash: (over: boolean) => void;
  isHidden: (id: string) => boolean;
}

const INITIAL_DESKTOP_IDS = ["projects", "about-me"];
const HISTORY_LIMIT = 50;

function snapshot(state: Pick<SystemState, "trashItems" | "desktopIds">): FileSnapshot {
  return { trashItems: [...state.trashItems], desktopIds: [...state.desktopIds] };
}

/**
 * Recursively collect every descendant id under a folder id.
 * FILE_SYSTEM maps folderId -> FileItem[]; folder items pull double duty as
 * keys (e.g. "projects" is both an item and a folder). Cycle-safe.
 */
function collectDescendantIds(rootId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([rootId]);
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    const children = FILE_SYSTEM[cur];
    if (!children) continue;
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child.id);
      if (FILE_SYSTEM[child.id]) stack.push(child.id);
    }
  }
  return out;
}

export const useSystemStore = create<SystemState>((set, get) => ({
  theme: "dark",
  wallpaper: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564",
  trashItems: [],
  deletedIds: [],
  desktopIds: INITIAL_DESKTOP_IDS,
  past: [],
  future: [],
  activeDrag: null,
  isOverTrash: false,
  setTheme: (theme) => set({ theme }),
  setWallpaper: (wallpaper) => set({ wallpaper }),
  addToTrash: (id) =>
    set((state) => {
      if (state.deletedIds.includes(id)) return state;
      // Cascade: trashing a folder also trashes everything inside it so no
      // orphaned children stay visible in Finder.
      const idsToTrash = [id, ...collectDescendantIds(id)].filter(
        (nid) => !state.deletedIds.includes(nid) && !state.trashItems.includes(nid)
      );
      if (idsToTrash.length === 0) return state;
      return {
        past: [...state.past, { ...snapshot(state), label: "MOVE_TO_TRASH" as const }].slice(
          -HISTORY_LIMIT
        ),
        future: [],
        trashItems: [...state.trashItems, ...idsToTrash],
      };
    }),
  emptyTrash: () =>
    set((state) => {
      if (state.trashItems.length === 0) return state;
      const purged = state.trashItems.filter((id) => !state.deletedIds.includes(id));
      return {
        // Permanent purge: deliberately NOT pushed to undo history, and redo
        // is cleared. undo() below also filters against deletedIds so an older
        // MOVE_TO_TRASH can never resurrect an emptied file.
        deletedIds: [...state.deletedIds, ...purged],
        trashItems: [],
        desktopIds: state.desktopIds.filter((id) => !purged.includes(id)),
        future: [],
      };
    }),
  moveToDesktop: (id) =>
    set((state) => {
      // Can't revive permanently deleted or currently trashed items via drag.
      if (state.deletedIds.includes(id)) return state;
      if (state.trashItems.includes(id)) return state;
      if (state.desktopIds.includes(id)) return state;
      return {
        past: [...state.past, { ...snapshot(state), label: "MOVE_TO_DESKTOP" as const }].slice(
          -HISTORY_LIMIT
        ),
        future: [],
        desktopIds: [...state.desktopIds, id],
      };
    }),
  undo: () =>
    set((state) => {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      // Never restore permanently deleted files.
      const alive = (id: string) => !state.deletedIds.includes(id);
      return {
        past: state.past.slice(0, -1),
        future: [
          ...state.future,
          { ...snapshot(state), label: prev.label },
        ].slice(-HISTORY_LIMIT),
        trashItems: prev.trashItems.filter(alive),
        desktopIds: prev.desktopIds.filter(alive),
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[state.future.length - 1];
      if (!next) return state;
      const alive = (id: string) => !state.deletedIds.includes(id);
      return {
        future: state.future.slice(0, -1),
        past: [...state.past, { ...snapshot(state), label: next.label }].slice(-HISTORY_LIMIT),
        trashItems: next.trashItems.filter(alive),
        desktopIds: next.desktopIds.filter(alive),
      };
    }),
  isHidden: (id) => {
    const { trashItems, deletedIds } = get();
    return trashItems.includes(id) || deletedIds.includes(id);
  },
  startDrag: (item) =>
    set(() => {
      if (typeof document !== "undefined") {
        document.body.classList.add("is-finder-dragging");
      }
      return { activeDrag: { ...item } };
    }),
  updateDragPos: (x, y) =>
    set((state) => {
      if (!state.activeDrag) return state;
      if (state.activeDrag.x === x && state.activeDrag.y === y) return state;
      return { activeDrag: { ...state.activeDrag, x, y } };
    }),
  // Idempotent: safe to call from pointerup / drop / blur + Escape.
  // Owns the cursor reset so no path can leave `grabbing` stuck on.
  endDrag: () => {
    if (typeof document !== "undefined") {
      document.body.classList.remove("is-finder-dragging");
      document
        .querySelectorAll("[data-finder-ghost]")
        .forEach((el) => el.remove());
    }
    const { activeDrag, isOverTrash } = get();
    if (!activeDrag && !isOverTrash) return;
    set({ activeDrag: null, isOverTrash: false });
  },
  setOverTrash: (over) =>
    set((state) => {
      if (state.isOverTrash === over) return state;
      return { isOverTrash: over };
    }),
}));
