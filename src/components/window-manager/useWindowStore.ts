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
  toggleMinimize: (id: string) => void;
}

const DEFAULT_SIZE: WindowSize = { width: 640, height: 440 };
const CASCADE_STEP = 24;
const CASCADE_ORIGIN = { x: 250, y: 150 };

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
}));