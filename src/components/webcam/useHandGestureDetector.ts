"use client";

import { useEffect, useRef } from "react";
import { HandLandmarker, FilesetResolver, type HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { classifyGesture, type Gesture } from "./GestureClassifier";
import { createGestureTriggerGate } from "./gestureTriggerGate";
import { createVideoFrameScheduler } from "./videoFrameScheduler";
import {
  createExclusiveDetectorRuntime,
  type DetectorLease,
  type DetectorStatus,
  type LandmarkerDelegate,
} from "./handDetectorRuntime";

export type { DetectorStatus, LandmarkerDelegate } from "./handDetectorRuntime";

// Copied from this project's exact top-level npm package, not Drei's nested copy.
// The build checks package/lockfile/runtime hashes together before shipping.
const WASM_ROOT = "/mediapipe/tasks-vision-1.0.1/wasm";
const MODEL_PATH = "/mediapipe/hand_landmarker.task";
const DOWNLOAD_TIMEOUT_MS = 20_000;
const INITIALIZATION_TIMEOUT_MS = 20_000;
const MODEL_CACHE_MS = 5 * 60_000;
const MAX_FRAME_FAILURES = 3;

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
let runtimeAssetsReady = false;
let modelBytes: Uint8Array | null = null;
let modelExpiry: ReturnType<typeof setTimeout> | null = null;

class GestureAssetError extends Error {}

interface ManagedHandDetector {
  detectForVideo(video: HTMLVideoElement, timestamp: number): HandLandmarkerResult;
  close(): void;
}

async function readAsset(path: string, signal: AbortSignal, maximumBytes: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(path, { signal: controller.signal, cache: "force-cache" });
    if (!response.ok) throw new Error(`Gesture asset could not load (${response.status}).`);
    const announcedSize = Number(response.headers.get("content-length"));
    if (announcedSize > maximumBytes) throw new Error("Gesture asset exceeds its size limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maximumBytes) throw new Error("Gesture asset is empty or invalid.");
    return bytes;
  } catch (error) {
    if (timedOut) throw new Error("Gesture assets took too long to download. Check your connection and retry.");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

async function prepareAssets(signal: AbortSignal) {
  // FilesetResolver chooses SIMD or no-SIMD. Its own API only resolves filenames;
  // checking those two files first makes blocked/download failures bounded and
  // abortable before MediaPipe's native script loader takes ownership.
  filesetPromise ??= FilesetResolver.forVisionTasks(WASM_ROOT).catch((error) => {
    filesetPromise = null;
    throw error;
  });
  const vision = await filesetPromise;
  if (!runtimeAssetsReady) {
    await Promise.all([
      readAsset(vision.wasmLoaderPath, signal, 2 * 1024 * 1024),
      readAsset(vision.wasmBinaryPath, signal, 64 * 1024 * 1024),
    ]);
    runtimeAssetsReady = true;
  }
  if (!modelBytes) modelBytes = await readAsset(MODEL_PATH, signal, 10 * 1024 * 1024);
  if (modelExpiry) globalThis.clearTimeout(modelExpiry);
  modelExpiry = globalThis.setTimeout(() => { modelBytes = null; modelExpiry = null; }, MODEL_CACHE_MS);
  if (signal.aborted) throw new DOMException("Gesture detection was stopped.", "AbortError");
  return { vision, model: modelBytes };
}

let activeDelegate: LandmarkerDelegate = "GPU";
const runtime = createExclusiveDetectorRuntime<ManagedHandDetector>(async (delegate, signal) => {
  let assets: Awaited<ReturnType<typeof prepareAssets>>;
  try { assets = await prepareAssets(signal); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new GestureAssetError(error instanceof Error ? error.message : "Gesture assets could not load. Please retry.");
  }
  const { vision, model } = assets;
  const canvas = delegate === "GPU" ? document.createElement("canvas") : undefined;
  let contextLost = false;
  const lost = (event: Event) => { event.preventDefault(); contextLost = true; };
  canvas?.addEventListener("webglcontextlost", lost);
  const clearCanvas = () => {
    canvas?.removeEventListener("webglcontextlost", lost);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  };
  let detector: HandLandmarker;
  const existingScripts = new Set(Array.from(document.scripts ?? []));
  try {
    detector = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: model, delegate },
      canvas,
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch (error) { clearCanvas(); throw error; }
  finally {
    // MediaPipe appends a fresh loader tag on each create, retaining its two
    // callbacks after it has run. Only remove our completed, exact loader tag.
    for (const script of Array.from(document.scripts ?? [])) {
      const ownedLoader = script.getAttribute("src") === vision.wasmLoaderPath || script.src === new URL(vision.wasmLoaderPath, document.baseURI).href;
      if (!existingScripts.has(script) && ownedLoader) {
        script.onload = null;
        script.onerror = null;
        script.remove();
      }
    }
  }
  activeDelegate = delegate;
  return {
    detectForVideo(video, timestamp) {
      if (contextLost) throw new Error("The GPU context was lost. Switching gesture detection to CPU.");
      const started = performance.now();
      try { return detector.detectForVideo(video, timestamp); }
      finally {
        // Visible in browser traces without accumulating entries or React state.
        if (typeof performance.measure === "function" && typeof performance.clearMeasures === "function") {
          performance.measure("portfolio:hand-inference", { start: started, end: performance.now() });
          performance.clearMeasures("portfolio:hand-inference");
        }
      }
    },
    close() {
      try { detector.close(); } finally { clearCanvas(); }
    },
  };
}, { canFallback: (error) => !(error instanceof GestureAssetError) });

/** Actual active delegate, retained for the older demo consumer. */
export function getHandLandmarkerDelegate(): LandmarkerDelegate {
  return activeDelegate;
}

interface UseHandGestureDetectorOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  onGesture: (gesture: Exclude<Gesture, "none">) => void;
  cooldownMs?: number;
  /** A changed key retries a failed initialization without remounting video. */
  retryKey?: number | string;
  /** Ready means an inference has succeeded, not merely that the model exists. */
  onReady?: (delegate: LandmarkerDelegate) => void;
  onStatus?: (status: DetectorStatus) => void;
  onError?: (error: Error) => void;
}

export function useHandGestureDetector({
  videoRef, enabled, onGesture, cooldownMs = 2500, retryKey = 0, onReady, onStatus, onError,
}: UseHandGestureDetectorOptions) {
  const callbacks = useRef({ onGesture, onReady, onStatus, onError });
  useEffect(() => { callbacks.current = { onGesture, onReady, onStatus, onError }; }, [onGesture, onReady, onStatus, onError]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const gate = createGestureTriggerGate(cooldownMs);
    let lease: DetectorLease<ManagedHandDetector> | null = null;
    let failures = 0;
    let ready = false;
    let failed = false;
    let status: DetectorStatus = "loading";
    let initializationTimeout: ReturnType<typeof setTimeout> | null = null;

    const publish = (status: DetectorStatus) => {
      if (!controller.signal.aborted) {
        callbacks.current.onStatus?.(status);
        if (status === "fallback") armInitializationTimeout();
      }
    };
    const fail = (cause: unknown) => {
      if (controller.signal.aborted || failed) return;
      failed = true;
      scheduler.stop();
      lease?.release();
      lease = null;
      gate.reset();
      publish("failed");
      callbacks.current.onError?.(cause instanceof Error ? cause : new Error("Gesture detection could not start. Please retry."));
      if (initializationTimeout) globalThis.clearTimeout(initializationTimeout);
      // Also relinquishes a lease that is still initializing. The runtime keeps
      // its native creation serialized and closes any result arriving later.
      controller.abort();
    };
    function armInitializationTimeout() {
      if (initializationTimeout) globalThis.clearTimeout(initializationTimeout);
      initializationTimeout = globalThis.setTimeout(() => fail(new Error(
        status === "busy"
          ? "Another gesture session is still finishing. Close other camera windows and retry; reload if it remains busy."
          : "Gesture detection took too long to start. Check your connection and retry; reload if it remains busy.",
      )), INITIALIZATION_TIMEOUT_MS);
    }
    const scheduler = createVideoFrameScheduler(() => videoRef.current, loop);
    async function loop() {
      if (controller.signal.aborted || failed) return;
      const video = videoRef.current;
      // CSS mirrors only the preview. Inference receives raw video pixels once;
      // the classifier's distances and upward-y check do not depend on handedness.
      if (document.visibilityState !== "hidden" && video && lease?.detector &&
          !video.paused && !video.ended && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const result = lease.detector.detectForVideo(video, performance.now());
          if (controller.signal.aborted) return;
          failures = 0;
          if (!ready) {
            ready = true;
            if (initializationTimeout) globalThis.clearTimeout(initializationTimeout);
            publish("ready");
            callbacks.current.onReady?.(lease.delegate);
          }
          const landmarks = result.landmarks?.[0];
          const gesture = gate.update(landmarks ? classifyGesture(landmarks) : "none", performance.now());
          if (gesture) callbacks.current.onGesture(gesture);
        } catch (error) {
          failures += 1;
          if (failures >= MAX_FRAME_FAILURES) {
            gate.reset();
            ready = false;
            if (lease?.delegate === "GPU") {
              try {
                await lease.fallbackToCpu();
                if (controller.signal.aborted) return;
                failures = 0;
              } catch (cpuError) { fail(cpuError); return; }
            } else { fail(error); return; }
          }
        }
      }
    }

    armInitializationTimeout();
    runtime.acquire(controller.signal, (nextStatus) => { status = nextStatus; publish(nextStatus); }).then((owned) => {
      if (controller.signal.aborted) { owned.release(); return; }
      lease = owned;
      scheduler.start();
    }).catch(fail);

    return () => {
      controller.abort();
      if (initializationTimeout) globalThis.clearTimeout(initializationTimeout);
      scheduler.stop();
      lease?.release();
      gate.reset();
    };
  }, [enabled, videoRef, cooldownMs, retryKey]);
}
