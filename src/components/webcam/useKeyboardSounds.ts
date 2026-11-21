"use client";

import { useEffect } from "react";
import { KEY_CODE_TO_INDEX } from "./keyboardLayout";
import { createKeyboardClickAudio } from "./keyboardClickAudio";

export function useKeyboardSounds(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const clicks = createKeyboardClickAudio(() => {
      const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return Audio ? new Audio({ latencyHint: "interactive" }) : null;
    });
    const pressed = new Set<string>();
    const clear = () => { pressed.clear(); clicks.silence(); };
    const key = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.repeat || document.hidden || !KEY_CODE_TO_INDEX.has(event.code)) return;
      if (!event.altKey && !event.ctrlKey && !event.metaKey && /^(Arrow(Up|Down|Left|Right)|[wasd])$/i.test(event.key)
        && event.target instanceof Element && event.target.closest('[data-heat-phase="running"] [data-heat-controls]')
        && !(event.target instanceof HTMLInputElement)) {
        pressed.delete(event.code);
        return;
      }
      // A fresh non-repeat keydown remains valid even if Safari missed its last keyup.
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
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibility);
      clear(); clicks.dispose();
    };
  }, [enabled]);
}
