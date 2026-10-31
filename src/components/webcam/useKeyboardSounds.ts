"use client";

import { useEffect } from "react";
import { KEY_CODE_TO_INDEX } from "./keyboardLayout";
import { createKeyboardClickAudio } from "./keyboardClickAudio";

export function useKeyboardSounds(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const clicks = createKeyboardClickAudio(() => typeof AudioContext === "undefined" ? null : new AudioContext({ latencyHint: "interactive" }));
    const pressed = new Set<string>();
    const clear = () => pressed.clear();
    const key = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.repeat || document.hidden || !KEY_CODE_TO_INDEX.has(event.code) || pressed.has(event.code)) return;
      pressed.add(event.code);
      clicks.play(event.code);
    };
    const up = (event: KeyboardEvent) => {
      if (!event.isTrusted) return;
      const wasPressed = pressed.delete(event.code);
      // macOS can omit shortcut-letter keyups while Command is held.
      if (event.code === "MetaLeft" || event.code === "MetaRight") {
        for (const code of pressed) if (!/^(Shift|Control|Alt|Meta)/.test(code)) pressed.delete(code);
      }
      if (wasPressed && !document.hidden) clicks.release(event.code);
    };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      clear(); clicks.dispose();
    };
  }, [enabled]);
}
