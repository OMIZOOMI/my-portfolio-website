"use client";

/**
 * npm install @mediapipe/tasks-vision
 *
 * Loads once (module-level cache) and stays warm across opens/closes of
 * the webcam window, so re-clicking "Try Me" doesn't re-pay the WASM +
 * model download cost. Detection runs on the main thread via
 * requestAnimationFrame — see the note in WebcamModule.tsx on why.
 */

import { useEffect, useRef } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { classifyGesture, type Gesture } from "./GestureClassifier";

// Keep this version pinned to whatever you install in package.json —
// a mismatch between the WASM runtime and the npm package is a common
// source of silent failures.
const TASKS_VISION_VERSION = "0.10.14";

let landmarkerPromise: Promise<HandLandmarker> | null = null;

export type LandmarkerDelegate = "GPU" | "CPU";
let activeDelegate: LandmarkerDelegate = "GPU";

function createLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  delegate: LandmarkerDelegate
) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 1,
  });
}

/** Which delegate the cached landmarker actually runs on (for status UI). */
export function getHandLandmarkerDelegate(): LandmarkerDelegate {
  return activeDelegate;
}

function getHandLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`
      );
      try {
        // Windows ANGLE/D3D drivers (NVIDIA/AMD/Intel Iris) can refuse the
        // WebGL context here — fall through to CPU instead of dying.
        const lm = await createLandmarker(vision, "GPU");
        activeDelegate = "GPU";
        return lm;
      } catch (gpuError) {
        console.warn(
          "[gestures] GPU delegate init failed, falling back to CPU:",
          gpuError
        );
        try {
          const lm = await createLandmarker(vision, "CPU");
          activeDelegate = "CPU";
          return lm;
        } catch (cpuError) {
          // Don't cache a poisoned rejection — allow a later retry.
          landmarkerPromise = null;
          throw cpuError;
        }
      }
    })();
  }
  return landmarkerPromise;
}

interface UseHandGestureDetectorOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  enabled: boolean;
  onGesture: (gesture: Exclude<Gesture, "none">) => void;
  /** Minimum ms between triggers, so holding a pose doesn't spam effects. */
  cooldownMs?: number;
  /** Fired once the WASM runtime + model are loaded and the loop starts. */
  onReady?: (delegate: LandmarkerDelegate) => void;
  /** Fired if the model can't load at all, or the per-frame loop keeps failing. */
  onError?: () => void;
}

export function useHandGestureDetector({
  videoRef,
  enabled,
  onGesture,
  cooldownMs = 2500,
  onReady,
  onError,
}: UseHandGestureDetectorOptions) {
  const rafRef = useRef<number>(null);
  const lastGestureRef = useRef<Gesture>("none");
  const cooldownUntilRef = useRef(0);
  // A poisoned GPU context can fail AFTER init succeeds (context loss under
  // ANGLE). Count consecutive per-frame failures and bail out instead of
  // throwing inside rAF forever.
  const frameFailuresRef = useRef(0);
  const MAX_FRAME_FAILURES = 30;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let landmarker: HandLandmarker | null = null;
    // Fresh session each enable: a pose held across toggles shouldn't
    // instantly fire, and a stale pose must not leak into the new session.
    lastGestureRef.current = "none";
    cooldownUntilRef.current = 0;
    frameFailuresRef.current = 0;

    getHandLandmarker().then((lm) => {
      if (cancelled) return;
      landmarker = lm;
      onReady?.(getHandLandmarkerDelegate());
      loop();
    }).catch(() => {
      // Model/WASM failed (offline CDN etc.) — caller surfaces status.
      if (!cancelled) onError?.();
    });

    function loop() {
      const video = videoRef.current;

      if (video && landmarker && video.readyState >= 2) {
        try {
          const result = landmarker.detectForVideo(video, performance.now());
          frameFailuresRef.current = 0;
          const landmarks = result.landmarks?.[0];
          const gesture = landmarks ? classifyGesture(landmarks) : "none";

          const now = performance.now();
          // Rising edge only: fire when ENTERING a recognized pose, then cool down.
          const isNewPose =
            gesture !== "none" && lastGestureRef.current !== gesture;

          if (isNewPose && now > cooldownUntilRef.current) {
            cooldownUntilRef.current = now + cooldownMs;
            onGesture(gesture as Exclude<Gesture, "none">);
          }

          lastGestureRef.current = gesture;
        } catch {
          // Context loss / transient inference failure: tolerate a burst,
          // then stop the loop and report instead of throwing every frame.
          frameFailuresRef.current += 1;
          if (frameFailuresRef.current > MAX_FRAME_FAILURES) {
            onError?.();
            return;
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, videoRef, onGesture, cooldownMs, onReady, onError]);
}