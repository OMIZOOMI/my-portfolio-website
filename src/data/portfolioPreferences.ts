import { APPEARANCE_STORAGE_KEY } from "./wallpapers";
import { DISPLAY_STORAGE_KEY } from "./displayPreferences";
import { WORKSPACE_STORAGE_KEY } from "./workspaces";

export const KEYBOARD_SOUNDS_STORAGE_KEY = "portfolio-keyboard-sounds";
/** Exact allowlist: never clear an origin, match a prefix, or touch intro/content keys. */
export const OWNED_PREFERENCE_KEYS = [APPEARANCE_STORAGE_KEY, DISPLAY_STORAGE_KEY, WORKSPACE_STORAGE_KEY, KEYBOARD_SOUNDS_STORAGE_KEY] as const;

export function removeOwnedPreferenceKeys(storage?: Pick<Storage, "removeItem">) {
  const failed: string[] = [];
  for (const key of OWNED_PREFERENCE_KEYS) {
    try { if (!storage) throw Error("Storage unavailable"); storage.removeItem(key); }
    catch { failed.push(key); }
  }
  return failed;
}
