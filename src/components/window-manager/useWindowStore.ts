"use client";

import { create } from "zustand";
import { DEFAULT_DESKTOP_WORK_AREA, DEFAULT_DESKTOP_BOUNDS, clampWindowRect, constrainWindowPosition, getWindowContentSize, getWindowFrameSize, type DesktopWorkArea, type WindowRect } from "./windowGeometry";

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export type SettingsSection = "appearance" | "about" | "accessibility" | "dock" | "advanced";

export interface WindowState {
  id: string;
  kind: string;
  title: string;
  /** Finder identity and navigation use IDs, never display titles. */
  settingsSection?: SettingsSection;
  folderId?: string;
  folderHistory?: string[];
  folderHistoryIndex?: number;
  position: WindowPosition;
  size: WindowSize;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  /** Exact outer rectangle captured before maximize; independent of projection. */
  restoreRect?: WindowRect;
  /** Exit owns the window until removal; other controls cannot reopen it mid-exit. */
  closing: boolean;
  closeRequestId?: number;
}

interface OpenWindowConfig {
  id: string;
  kind: string;
  title: string;
  settingsSection?: SettingsSection;
  folderId?: string;
  size?: WindowSize;
  position?: WindowPosition;
}

interface WindowStoreState {
  windows: Record<string, WindowState>;
  nextZIndex: number;
  focusedWindowId: string | null;
  desktopWorkArea: DesktopWorkArea;
  /** Normal-window bounds include the space behind the dock. */
  desktopBounds: DesktopWorkArea;
  setDesktopWorkArea: (area: DesktopWorkArea, bounds?: DesktopWorkArea) => void;
  isVMLocked: boolean; // NEW: Virtual Machine Lock state
  setVMLocked: (locked: boolean) => void; // NEW: Toggles the lock
  openWindow: (config: OpenWindowConfig) => void;
  setSettingsSection: (id: string, section: SettingsSection) => void;
  closeWindow: (id: string) => void;
  beginCloseWindow: (id: string) => boolean;
  completeCloseWindow: (id: string, requestId: number) => void;
  focusWindow: (id: string) => void;
  setWindowPosition: (id: string, position: WindowPosition) => void;
  setFinderLocation: (id: string, folderId: string, title: string, historyIndex?: number) => void;
  toggleMinimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  bringAllToFront: () => void;
}

const DEFAULT_SIZE: WindowSize = { width: 640, height: 440 };
const CASCADE_STEP = 24;
const CASCADE_ORIGIN = { x: 250, y: 150 };
let nextCloseRequestId = 0;

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
    if (id !== excludeId && !w.minimized && !w.closing && w.zIndex > maxZ) {
      maxZ = w.zIndex;
      topId = id;
    }
  }
  return topId;
};

/** Compact ranks stay below desktop chrome; repeated activation cannot grow z forever. */
function orderWindows(windows: Record<string, WindowState>, frontId?: string) {
  const ordered = Object.values(windows).sort((a, b) => a.zIndex - b.zIndex);
  if (frontId) {
    const index = ordered.findIndex(window => window.id === frontId);
    if (index >= 0) ordered.push(...ordered.splice(index, 1));
  }
  let next = windows;
  ordered.forEach((window, index) => {
    const zIndex = 10 + index;
    if (window.zIndex === zIndex) return;
    if (next === windows) next = { ...windows };
    next[window.id] = { ...window, zIndex };
  });
  return { windows: next, nextZIndex: 10 + ordered.length };
}

function activateWindow(state: WindowStoreState, id: string) {
  const window = state.windows[id];
  if (!window || window.closing) return state;
  if (state.focusedWindowId === id && !window.minimized) return state;
  const windows = window.minimized ? { ...state.windows, [id]: { ...window, minimized: false } } : state.windows;
  return { ...orderWindows(windows, id), focusedWindowId: id };
}

function fitNormalWindow(window: WindowState, area: DesktopWorkArea): WindowState {
  const rect = clampWindowRect({ ...window.position, ...getWindowFrameSize(window.size) }, area);
  const size = getWindowContentSize(rect);
  if (rect.x === window.position.x && rect.y === window.position.y && size.width === window.size.width && size.height === window.size.height) return window;
  return { ...window, position: { x: rect.x, y: rect.y }, size };
}

export const useWindowStore = create<WindowStoreState>((set, get) => ({
  windows: {},
  nextZIndex: 10,
  focusedWindowId: null,
  desktopWorkArea: { ...DEFAULT_DESKTOP_WORK_AREA },
  desktopBounds: { ...DEFAULT_DESKTOP_BOUNDS },
  setDesktopWorkArea: (area, bounds = area) => set((state) => {
    if (![area.x, area.y, area.width, area.height, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || area.width <= 0 || area.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return state;
    const previous = state.desktopWorkArea;
    const previousBounds = state.desktopBounds;
    if (area.x === previous.x && area.y === previous.y && area.width === previous.width && area.height === previous.height && bounds.x === previousBounds.x && bounds.y === previousBounds.y && bounds.width === previousBounds.width && bounds.height === previousBounds.height) return state;
    let windows = state.windows;
    for (const window of Object.values(state.windows)) {
      if (window.maximized || window.closing) continue;
      const fitted = fitNormalWindow(window, bounds);
      if (fitted === window) continue;
      if (windows === state.windows) windows = { ...windows };
      windows[window.id] = fitted;
    }
    return { desktopWorkArea: { ...area }, desktopBounds: { ...bounds }, windows };
  }),
  
  isVMLocked: false, // Default is unlocked
  setVMLocked: (locked) => set(state => state.isVMLocked === locked ? state : { isVMLocked: locked }),

  openWindow: (config) => {
    const existing = get().windows[config.id] ?? (SINGLE_INSTANCE_KINDS.has(config.kind) ? findWindowByKind(get().windows, config.kind) : null);
    if (existing) {
      if (existing.closing) return;
      if ((config.kind === "finder" && config.folderId) || config.kind === "bin") {
        get().setFinderLocation(existing.id, config.folderId ?? "bin", config.title);
      }
      if (config.kind === "settings" && config.settingsSection) get().setSettingsSection(existing.id, config.settingsSection);
      set(state => activateWindow(state, existing.id));
      return;
    }
    set(state => {
      const openCount = Object.keys(state.windows).length;
      const window: WindowState = fitNormalWindow({
        id: config.id, kind: config.kind, title: config.title,
        ...(config.kind === "settings" ? { settingsSection: config.settingsSection ?? "appearance" } : {}),
        ...(config.kind === "finder" || config.kind === "bin" ? {
          folderId: config.folderId ?? (config.kind === "bin" ? "bin" : "desktop"),
          folderHistory: [config.folderId ?? (config.kind === "bin" ? "bin" : "desktop")],
          folderHistoryIndex: 0,
        } : {}),
        position: config.position ?? {
          x: CASCADE_ORIGIN.x + openCount * CASCADE_STEP,
          y: CASCADE_ORIGIN.y + openCount * CASCADE_STEP,
        },
        size: config.size ?? DEFAULT_SIZE,
        zIndex: state.nextZIndex,
        minimized: false, maximized: false, closing: false,
      }, state.desktopBounds);
      return { ...orderWindows({ ...state.windows, [config.id]: window }, config.id), focusedWindowId: config.id };
    });
  },

  setSettingsSection: (id, section) => set((state) => {
    const window = state.windows[id];
    if (!window || window.kind !== "settings" || window.closing || window.settingsSection === section) return state;
    return { windows: { ...state.windows, [id]: { ...window, settingsSection: section } } };
  }),

  closeWindow: (id) => {
    set((state) => {
      if (!state.windows[id]) return state;
      const next = { ...state.windows };
      delete next[id];
      const nextFocused = state.focusedWindowId === id ? getTopWindowId(next) : state.focusedWindowId;
      return { ...orderWindows(next), focusedWindowId: nextFocused };
    });
  },

  beginCloseWindow: (id) => {
    const current = get().windows[id];
    if (!current || current.closing) return false;
    set((state) => ({
      windows: { ...state.windows, [id]: { ...current, closing: true, closeRequestId: ++nextCloseRequestId } },
      focusedWindowId: state.focusedWindowId === id ? getTopWindowId(state.windows, id) : state.focusedWindowId,
    }));
    return true;
  },

  completeCloseWindow: (id, requestId) => {
    const current = get().windows[id];
    // An external close/relaunch may reuse the display ID before an old timer fires.
    if (current?.closing && current.closeRequestId === requestId) get().closeWindow(id);
  },

  focusWindow: (id) => set(state => activateWindow(state, id)),

  setWindowPosition: (id, position) => {
    set((state) => {
      const window = state.windows[id];
      if (!window || window.closing || window.maximized) return state;
      const next = constrainWindowPosition(position, getWindowFrameSize(window.size), state.desktopBounds);
      if (window.position.x === next.x && window.position.y === next.y) return state;
      return { windows: { ...state.windows, [id]: { ...window, position: next } } };
    });
  },

  setFinderLocation: (id, folderId, title, historyIndex) => {
    set((state) => {
      const current = state.windows[id];
      if (!current || (current.kind !== "finder" && current.kind !== "bin")) return state;
      const history = current.folderHistory ?? [current.folderId ?? "desktop"];
      const index = current.folderHistoryIndex ?? 0;
      if (historyIndex !== undefined && history[historyIndex] !== folderId) return state;
      if (current.folderId === folderId && current.title === title && (historyIndex === undefined || historyIndex === index)) return state;
      const navigating = current.folderId !== folderId && historyIndex === undefined;
      return { windows: { ...state.windows, [id]: {
        ...current,
        folderId,
        title,
        folderHistory: navigating ? [...history.slice(0, index + 1), folderId] : history,
        folderHistoryIndex: historyIndex ?? (navigating ? index + 1 : index),
      } } };
    });
  },

  toggleMinimize: (id) => {
    set(state => {
      const window = state.windows[id];
      if (!window || window.closing) return state;
      if (window.minimized) return activateWindow(state, id);
      return {
        focusedWindowId: state.focusedWindowId === id ? getTopWindowId(state.windows, id) : state.focusedWindowId,
        windows: { ...state.windows, [id]: { ...window, minimized: true } },
      };
    });
  },

  toggleMaximize: (id) => {
    set(state => {
      const window = state.windows[id];
      if (!window || window.closing || window.minimized) return state;
      if (!window.maximized) return {
        windows: { ...state.windows, [id]: { ...window, maximized: true, restoreRect: { ...window.position, ...getWindowFrameSize(window.size) } } },
      };
      const rect = clampWindowRect(window.restoreRect ?? { ...window.position, ...getWindowFrameSize(window.size) }, state.desktopBounds);
      const size = getWindowContentSize(rect);
      const position = rect.x === window.position.x && rect.y === window.position.y ? window.position : { x: rect.x, y: rect.y };
      const restoredSize = size.width === window.size.width && size.height === window.size.height ? window.size : size;
      return { windows: { ...state.windows, [id]: { ...window, maximized: false, restoreRect: undefined, position, size: restoredSize } } };
    });
  },

  bringAllToFront: () => {
    set(state => {
      let windows = state.windows;
      for (const window of Object.values(windows)) {
        if (window.closing || !window.minimized) continue;
        if (windows === state.windows) windows = { ...windows };
        windows[window.id] = { ...window, minimized: false };
      }
      const stack = orderWindows(windows);
      const focusedWindowId = getTopWindowId(stack.windows);
      if (stack.windows === state.windows && focusedWindowId === state.focusedWindowId && stack.nextZIndex === state.nextZIndex) return state;
      return { ...stack, focusedWindowId };
    });
  },
}));
