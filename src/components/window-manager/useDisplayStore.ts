"use client";

import { create } from "zustand";
import { DISPLAY_STORAGE_KEY, DISPLAY_SIZES, ICON_SIZES, parseDisplayPreferences, type DefaultPortfolioView } from "../../data/displayPreferences";
export { DISPLAY_STORAGE_KEY, DISPLAY_SIZES, ICON_SIZES, parseDisplayPreferences } from "../../data/displayPreferences";

/** Shared page-level controls clear the same scaled dock footprint. */
export const getWorkspaceControlsOffset = (dockSize: number, interfaceScale: number) =>
  Math.ceil((56 * dockSize + 34) * interfaceScale + 24);

interface DisplayState {
  hydrated: boolean;
  screenView: boolean;
  defaultView: DefaultPortfolioView;
  previewReturnView: boolean | null;
  /** A dismissed preview must not strand a transient pointer lock/zoom. */
  instantViewChange: boolean;
  interfaceScale: number;
  iconScale: number;
  hydrate: () => void;
  setScreenView: (enabled: boolean) => void;
  setDefaultView: (view: DefaultPortfolioView) => void;
  previewScreenView: (enabled: boolean) => void;
  endViewPreview: (instant?: boolean) => void;
  setInterfaceScale: (scale: number) => void;
  setIconScale: (scale: number) => void;
}

function saveDisplayPreferences(state: DisplayState) {
  if (!state.hydrated || typeof window === "undefined") return;
  const { interfaceScale, iconScale, defaultView } = state;
  try { window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ interfaceScale, iconScale, defaultView })); } catch {}
}

export const useDisplayStore = create<DisplayState>((set, get) => ({
  hydrated: false, screenView: false, defaultView: "laptop", previewReturnView: null, instantViewChange: false, interfaceScale: 1, iconScale: 1,
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    let preferences = parseDisplayPreferences(null);
    try { preferences = parseDisplayPreferences(window.localStorage.getItem(DISPLAY_STORAGE_KEY)); } catch {}
    set({ ...preferences, screenView: preferences.defaultView === "screen", previewReturnView: null, hydrated: true });
  },
  // Ordinary view changes and future tour demonstrations are session-only.
  setScreenView: (screenView) => set({ screenView, previewReturnView: null, instantViewChange: false }),
  setDefaultView: (defaultView) => {
    if (defaultView !== "laptop" && defaultView !== "screen") return;
    const alreadyDefault = get().defaultView === defaultView;
    set({ defaultView, screenView: defaultView === "screen", previewReturnView: null, instantViewChange: false });
    if (alreadyDefault) saveDisplayPreferences(get());
  },
  previewScreenView: (screenView) => set(state => ({ previewReturnView: state.previewReturnView ?? state.screenView, screenView, instantViewChange: false })),
  endViewPreview: (instant = false) => set(state => state.previewReturnView === null
    ? state.instantViewChange === instant ? state : { instantViewChange: instant }
    : { screenView: state.previewReturnView, previewReturnView: null, instantViewChange: instant }),
  setInterfaceScale: (interfaceScale) => { if ((DISPLAY_SIZES as readonly number[]).includes(interfaceScale)) set({ interfaceScale }); },
  setIconScale: (iconScale) => { if ((ICON_SIZES as readonly number[]).includes(iconScale)) set({ iconScale }); },
}));

useDisplayStore.subscribe((state, previous) => {
  if (!state.hydrated || !previous.hydrated || typeof window === "undefined"
    || (state.interfaceScale === previous.interfaceScale && state.iconScale === previous.iconScale && state.defaultView === previous.defaultView)) return;
  // Never serialize the current/preview view, windows, files, or drag state.
  saveDisplayPreferences(state);
});
