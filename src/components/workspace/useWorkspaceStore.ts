"use client";

import { create } from "zustand";
import {
  DEFAULT_WORKSPACE, WORKSPACE_STORAGE_KEY, getWorkspace,
  parseWorkspacePreference, serializeWorkspacePreference, type WorkspaceId,
} from "../../data/workspaces";
import { KEYBOARD_SOUNDS_STORAGE_KEY } from "../../data/portfolioPreferences";

interface WorkspacePreferences {
  environment: WorkspaceId;
  keyboardSounds: boolean;
  resetRevision: number;
  resetPreferences: () => void;
  setKeyboardSounds: (enabled: boolean) => void;
  hydrated: boolean;
  hydrate: () => void;
  remember: (id: WorkspaceId) => void;
}

// Follow appearance preferences' explicit hydration and narrow storage writes.
export const useWorkspaceStore = create<WorkspacePreferences>((set, get) => ({
  environment: DEFAULT_WORKSPACE,
  keyboardSounds: true,
  resetRevision: 0,
  resetPreferences: () => set(state => ({ environment: DEFAULT_WORKSPACE, keyboardSounds: true, resetRevision: state.resetRevision + 1 })),
  setKeyboardSounds: (keyboardSounds) => set({ keyboardSounds }),
  hydrated: false,
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    let environment = DEFAULT_WORKSPACE, keyboardSounds = true;
    try {
      environment = parseWorkspacePreference(window.localStorage.getItem(WORKSPACE_STORAGE_KEY));
      keyboardSounds = window.localStorage.getItem(KEYBOARD_SOUNDS_STORAGE_KEY) !== "off";
    }
    catch { /* Restricted storage still permits a working in-memory session. */ }
    set({ environment, keyboardSounds, hydrated: true });
  },
  remember: (id) => set({ environment: getWorkspace(id).id }),
}));

useWorkspaceStore.subscribe((state, previous) => {
  if (!state.hydrated || typeof window === "undefined") return;
  if (state.keyboardSounds !== previous.keyboardSounds) {
    try { window.localStorage.setItem(KEYBOARD_SOUNDS_STORAGE_KEY, state.keyboardSounds ? "on" : "off"); } catch {}
  }
  if (previous.hydrated && previous.environment === state.environment) return;
  try { window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspacePreference(state.environment)); }
  catch { /* Storage availability must not affect the environment. */ }
});
