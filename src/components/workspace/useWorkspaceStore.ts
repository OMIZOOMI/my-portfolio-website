"use client";

import { create } from "zustand";
import {
  DEFAULT_WORKSPACE, WORKSPACE_STORAGE_KEY, getWorkspace,
  parseWorkspacePreference, serializeWorkspacePreference, type WorkspaceId,
} from "../../data/workspaces";

interface WorkspacePreferences {
  environment: WorkspaceId;
  keyboardSounds: boolean;
  setKeyboardSounds: (enabled: boolean) => void;
  hydrated: boolean;
  hydrate: () => void;
  remember: (id: WorkspaceId) => void;
}

// Follow appearance preferences' explicit hydration and narrow storage writes.
export const useWorkspaceStore = create<WorkspacePreferences>((set, get) => ({
  environment: DEFAULT_WORKSPACE,
  keyboardSounds: true,
  setKeyboardSounds: (keyboardSounds) => set({ keyboardSounds }),
  hydrated: false,
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    let environment = DEFAULT_WORKSPACE, keyboardSounds = true;
    try {
      environment = parseWorkspacePreference(window.localStorage.getItem(WORKSPACE_STORAGE_KEY));
      keyboardSounds = window.localStorage.getItem("portfolio-keyboard-sounds") !== "off";
    }
    catch { /* Restricted storage still permits a working in-memory session. */ }
    set({ environment, keyboardSounds, hydrated: true });
  },
  remember: (id) => set({ environment: getWorkspace(id).id }),
}));

useWorkspaceStore.subscribe((state, previous) => {
  if (!state.hydrated || typeof window === "undefined") return;
  if (state.keyboardSounds !== previous.keyboardSounds) {
    try { window.localStorage.setItem("portfolio-keyboard-sounds", state.keyboardSounds ? "on" : "off"); } catch {}
  }
  if (previous.hydrated && previous.environment === state.environment) return;
  try { window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspacePreference(state.environment)); }
  catch { /* Storage availability must not affect the environment. */ }
});
