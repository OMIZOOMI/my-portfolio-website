"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { CameraSession } from "./CameraSession";

export function useCameraSession(videoRef: RefObject<HTMLVideoElement | null>, windowAvailable: boolean) {
  const [session] = useState(() => new CameraSession(() => null));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    session.setVideoSource(() => videoRef.current);
    let pageSuspended = false;
    const reconcile = () => session.setActive(windowAvailable && !document.hidden && !pageSuspended);
    const hide = () => session.setActive(false);
    const suspend = () => { pageSuspended = true; hide(); };
    const restore = () => { pageSuspended = false; reconcile(); };
    // Release inside the native event, before a background page can freeze.
    // pageshow also reconciles even if React never committed an inactive render.
    const visibility = () => document.hidden ? hide() : reconcile();
    document.addEventListener("visibilitychange", visibility);
    globalThis.addEventListener("pagehide", suspend);
    globalThis.addEventListener("pageshow", restore);
    // Deferral avoids duplicate native permission prompts in StrictMode's
    // setup/cleanup rehearsal. Cleanup itself always releases immediately.
    const start = setTimeout(reconcile, 0);
    if (!windowAvailable) hide();
    return () => {
      clearTimeout(start);
      document.removeEventListener("visibilitychange", visibility);
      globalThis.removeEventListener("pagehide", suspend);
      globalThis.removeEventListener("pageshow", restore);
      hide();
    };
  }, [windowAvailable, session, videoRef]);
  return { ...state, session };
}
