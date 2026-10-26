"use client";

import { create } from "zustand";

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowState {
  id: string;
  kind: string;
  title: string;
  position: WindowPosition;
  size: WindowSize;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
}

interface OpenWindowConfig {
  id: string;
  kind: string;
  title: string;
  size?: WindowSize;
  position?: WindowPosition;
}

interface WindowStoreState {
  windows: Record<string, WindowState>;
  nextZIndex: number;
  focusedWindowId: string | null;
  isVMLocked: boolean; // NEW: Virtual Machine Lock state
  setVMLocked: (locked: boolean) => void; // NEW: Toggles the lock
  openWindow: (config: OpenWindowConfig) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  setWindowPosition: (id: string, position: WindowPosition) => void;
  toggleMinimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  bringAllToFront: () => void;
}

const DEFAULT_SIZE: WindowSize = { width: 640, height: 440 };
const CASCADE_STEP = 24;
const CASCADE_ORIGIN = { x: 250, y: 150 };

// Single-instance apps: launching one while ANY window of the same kind is
// open focuses the existing window instead of spawning a duplicate. This is
// matched by KIND, not id, because launchers historically use different ids
// for the same app (Dock: "app-settings" vs MenuBar Preferences: "settings").
// Finder / file-viewer stay multi-instance (one window per folder/file), as do
// the per-app About modals (unique id per app already).
const SINGLE_INSTANCE_KINDS: ReadonlySet<string> = new Set([
  "settings",
  "mail",
  "music",
  "terminal",
  "safari",
  "facetime",
  "bin",
]);

const findWindowByKind = (windows: Record<string, WindowState>, kind: string) => {
  let best: WindowState | null = null;
  for (const w of Object.values(windows)) {
    if (w.kind === kind && (!best || w.zIndex > best.zIndex)) best = w;
  }
  return best;
};

const getTopWindowId = (windows: Record<string, WindowState>, excludeId?: string) => {
  let topId: string | null = null;
  let maxZ = -1;
  for (const [id, w] of Object.entries(windows)) {
    if (id !== excludeId && !w.minimized && w.zIndex > maxZ) {
      maxZ = w.zIndex;
      topId = id;
    }
  }
  return topId;
};

export const useWindowStore = create<WindowStoreState>((set, get) => ({
  windows: {},
  nextZIndex: 10,
  focusedWindowId: null,
  
  isVMLocked: false, // Default is unlocked
  setVMLocked: (locked) => set({ isVMLocked: locked }),

  openWindow: (config) => {
    const existing = get().windows[config.id];
    if (existing) {
      get().focusWindow(config.id);
      set((state) => ({
        focusedWindowId: config.id,
        windows: {
          ...state.windows,
          [config.id]: { ...state.windows[config.id], minimized: false },
        },
      }));
      return;
    }

    // Single-instance rule: same app already open under a different id?
    // Bring it to front (and un-minimize) instead of duplicating.
    if (SINGLE_INSTANCE_KINDS.has(config.kind)) {
      const kindMatch = findWindowByKind(get().windows, config.kind);
      if (kindMatch) {
        get().focusWindow(kindMatch.id);
        set((state) => ({
          focusedWindowId: kindMatch.id,
          windows: state.windows[kindMatch.id]
            ? {
                ...state.windows,
                [kindMatch.id]: { ...state.windows[kindMatch.id], minimized: false },
              }
            : state.windows,
        }));
        return;
      }
    }

    const openCount = Object.keys(get().windows).length;
    const zIndex = get().nextZIndex;

    set((state) => ({
      nextZIndex: zIndex + 1,
      focusedWindowId: config.id,
      windows: {
        ...state.windows,
        [config.id]: {
          id: config.id,
          kind: config.kind,
          title: config.title,
          position: config.position ?? {
            x: CASCADE_ORIGIN.x + openCount * CASCADE_STEP,
            y: CASCADE_ORIGIN.y + openCount * CASCADE_STEP,
          },
          size: config.size ?? DEFAULT_SIZE,
          zIndex,
          minimized: false,
          maximized: false,
        },
      },
    }));
  },

  closeWindow: (id) => {
    set((state) => {
      const next = { ...state.windows };
      delete next[id];
      const nextFocused = state.focusedWindowId === id ? getTopWindowId(next) : state.focusedWindowId;
      return { windows: next, focusedWindowId: nextFocused };
    });
  },

  focusWindow: (id) => {
    const zIndex = get().nextZIndex;
    set((state) => {
      if (!state.windows[id]) return state;
      return {
        nextZIndex: zIndex + 1,
        focusedWindowId: id,
        windows: { ...state.windows, [id]: { ...state.windows[id], zIndex } },
      };
    });
  },

  setWindowPosition: (id, position) => {
    set((state) => {
      if (!state.windows[id]) return state;
      return { windows: { ...state.windows, [id]: { ...state.windows[id], position } } };
    });
  },

  toggleMinimize: (id) => {
    set((state) => {
      if (!state.windows[id]) return state;
      const isMinimizing = !state.windows[id].minimized;
      const nextFocused = (isMinimizing && state.focusedWindowId === id)
        ? getTopWindowId(state.windows, id)
        : (isMinimizing ? state.focusedWindowId : id);

      return {
        focusedWindowId: nextFocused,
        windows: {
          ...state.windows,
          [id]: { ...state.windows[id], minimized: isMinimizing },
        },
      };
    });
  },

  toggleMaximize: (id) => {
    set((state) => {
      if (!state.windows[id]) return state;
      return {
        windows: {
          ...state.windows,
          [id]: { ...state.windows[id], maximized: !state.windows[id].maximized },
        },
      };
    });
  },

  bringAllToFront: () => {
    set((state) => {
      const ordered = Object.values(state.windows).sort((a, b) => a.zIndex - b.zIndex);
      const windows = { ...state.windows };
      let nextZIndex = state.nextZIndex;

      for (const win of ordered) {
        windows[win.id] = { ...windows[win.id], zIndex: nextZIndex, minimized: false };
        nextZIndex += 1;
      }

      return {
        windows,
        nextZIndex,
        focusedWindowId: ordered[ordered.length - 1]?.id ?? null,
      };
    });
  },
}));
