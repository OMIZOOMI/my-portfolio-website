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

function getHandLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`
    ).then((vision) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      })
    );
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
  onReady?: () => void;
}

export function useHandGestureDetector({
  videoRef,
  enabled,
  onGesture,
  cooldownMs = 2500,
  onReady,
}: UseHandGestureDetectorOptions) {
  const rafRef = useRef<number>(null);
  const lastGestureRef = useRef<Gesture>("none");
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let landmarker: HandLandmarker | null = null;
    // Fresh session each enable: a pose held across toggles shouldn't
    // instantly fire, and a stale pose must not leak into the new session.
    lastGestureRef.current = "none";
    cooldownUntilRef.current = 0;

    getHandLandmarker().then((lm) => {
      if (cancelled) return;
      landmarker = lm;
      onReady?.();
      loop();
    }).catch(() => {
      // Model/WASM failed (offline CDN etc.) — caller surfaces status.
    });

    function loop() {
      const video = videoRef.current;

      if (video && landmarker && video.readyState >= 2) {
        const result = landmarker.detectForVideo(video, performance.now());
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
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, videoRef, onGesture, cooldownMs, onReady]);
}