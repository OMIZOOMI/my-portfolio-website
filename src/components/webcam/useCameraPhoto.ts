"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { CameraPhotoCapture } from "./cameraPhoto";

export function useCameraPhoto({ videoRef, canvasRef, enabled, generation, closing }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
  generation: number;
  closing?: boolean;
}) {
  const [session] = useState(() => new CameraPhotoCapture());
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useLayoutEffect(() => {
    if (!enabled) session.cancelPending();
    return session.cancelPending;
  }, [enabled, generation, session]);
  useLayoutEffect(() => { if (closing) session.reset(); }, [closing, session]);
  useEffect(() => {
    // Keep one completed photo for Save/Open photo when a new tab hides this
    // page. Pending encodes are cancelled immediately; pagehide/close clears all.
    const visibility = () => { if (document.hidden) session.cancelPending(); };
    document.addEventListener("visibilitychange", visibility);
    globalThis.addEventListener("pagehide", session.reset);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      globalThis.removeEventListener("pagehide", session.reset);
      session.reset();
    };
  }, [session]);
  return { ...state, session, takePhoto: () => {
    if (!enabled) return false;
    return session.capture(videoRef.current, canvasRef.current);
  } };
}
