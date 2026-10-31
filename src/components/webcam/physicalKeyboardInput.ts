import { KEY_CODE_TO_INDEX } from "./keyboardLayout";

export const KEY_TAP_HOLD_MS = 80;

export function createPhysicalInputState() {
  return { pressedKeyCodes: new Set<string>(), pressedUntil: new Map<string, number>() };
}

export type PhysicalInputState = ReturnType<typeof createPhysicalInputState>;

/** Observe physical positions only. Never synthesize, cancel or retain text. */
export function bindPhysicalKeyboard(view: Window, state: PhysicalInputState, changed: () => void = () => {}) {
  const clear = () => { state.pressedKeyCodes.clear(); state.pressedUntil.clear(); changed(); };
  const down = (event: KeyboardEvent) => {
    if (!KEY_CODE_TO_INDEX.has(event.code)) return;
    if (!state.pressedKeyCodes.has(event.code)) state.pressedUntil.set(event.code, view.performance.now() + KEY_TAP_HOLD_MS);
    state.pressedKeyCodes.add(event.code);
    changed();
  };
  const up = (event: KeyboardEvent) => {
    state.pressedKeyCodes.delete(event.code);
    // macOS may omit the other key's keyup while Command is held.
    if (event.code === "MetaLeft" || event.code === "MetaRight") {
      for (const code of state.pressedKeyCodes) {
        if (!/^(Shift|Control|Alt|Meta)/.test(code)) {
          state.pressedKeyCodes.delete(code);
          state.pressedUntil.delete(code);
        }
      }
    }
    changed();
  };
  const visibility = () => { if (view.document.hidden) clear(); };
  view.addEventListener("keydown", down, true);
  view.addEventListener("keyup", up, true);
  view.addEventListener("blur", clear);
  view.document.addEventListener("visibilitychange", visibility);
  return () => {
    view.removeEventListener("keydown", down, true);
    view.removeEventListener("keyup", up, true);
    view.removeEventListener("blur", clear);
    view.document.removeEventListener("visibilitychange", visibility);
    clear();
  };
}
