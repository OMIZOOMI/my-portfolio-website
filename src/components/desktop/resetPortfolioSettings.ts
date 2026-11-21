"use client";

import { DEFAULT_APPEARANCE } from "../../data/wallpapers";
import { parseDisplayPreferences } from "../../data/displayPreferences";
import { removeOwnedPreferenceKeys } from "../../data/portfolioPreferences";
import { useDisplayStore } from "../window-manager/useDisplayStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useWorkspaceStore } from "../workspace/useWorkspaceStore";

/** Reset preferences in place. No reload, full-store replacement or content/history mutation. */
export function resetPortfolioSettings() {
  useSystemStore.setState({ ...DEFAULT_APPEARANCE, accent: "blue", reduceMotion: false, dockMagnification: true, dockSize: 1 });
  // The next-visit default resets; the current view and any temporary tour preview stay put.
  useDisplayStore.setState(parseDisplayPreferences(null));
  useWorkspaceStore.getState().resetPreferences();
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* Apply in-memory defaults even with blocked storage. */ }
  // Subscribers may have written defaults above. Remove exactly these four keys afterwards.
  return { failedKeys: removeOwnedPreferenceKeys(storage) };
}
