"use client";

import { create } from "zustand";

/** Ephemeral route visibility only. Never changes windows, preferences or content. */
export const usePortfolioActivity = create<{ desktopActive: boolean; setDesktopActive: (active: boolean) => void }>(set => ({
  desktopActive: true,
  setDesktopActive: desktopActive => set(state => state.desktopActive === desktopActive ? state : { desktopActive }),
}));
