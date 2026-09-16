"use client";

/**
 * <WebcamModule/>
 * npm install framer-motion lucide-react
 *
 * Runs MediaPipe's HandLandmarker on the main thread rather than in a Web
 * Worker. Proper worker offloading means capturing frames via
 * OffscreenCanvas/ImageBitmap and posting them across the boundary — real
 * plumbing for what's a portfolio demo. GPU-delegated WASM inference is
 * already fast enough on the main thread for this; worth revisiting only
 * if you see dropped frames elsewhere on the page while this is open.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Hand } from "lucide-react";
import { useHandGestureDetector } from "./useHandGestureDetector";
import type { Gesture } from "./GestureClassifier";
import { ConfettiBurst } from "./ConfettiBurst";
import styles from "./WebcamModule.module.css";

type PermissionState = "idle" | "requesting" | "granted" | "denied" | "unsupported";

interface WebcamModuleProps {
  open: boolean;
  onClose: () => void;
}

export function WebcamModule({ open, onClose }: WebcamModuleProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permission, setPermission] = useState<PermissionState>("idle");
  const [confettiKey, setConfettiKey] = useState(0);
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("unsupported");
      return;
    }
    setPermission("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPermission("granted");
    } catch {
      setPermission("denied");
    }
  }, []);

  useEffect(() => {
    if (open) startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setPermission("idle");
    };
  }, [open, startCamera]);

  const handleGesture = useCallback((gesture: Exclude<Gesture, "none">) => {
    if (gesture !== "peace") return; // this demo only reacts to peace
    setDetectedLabel("Peace sign ✌️ detected");
    setConfettiKey((k) => k + 1);
    window.setTimeout(() => setDetectedLabel(null), 1800);
  }, []);

  useHandGestureDetector({
    videoRef: videoRef as any,
    enabled: open && permission === "granted",
    onGesture: handleGesture,
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.window}
          initial={{ transform: "scale(0.95) translateY(12px)", opacity: 0 }}
          animate={{ transform: "scale(1) translateY(0px)", opacity: 1 }}
          exit={{ transform: "scale(0.95) translateY(12px)", opacity: 0 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0 }}
        >
          <div className={styles.titleBar}>
            <button className={styles.closeDot} onClick={onClose} aria-label="Close">
              <X size={9} strokeWidth={3} />
            </button>
            <span className={styles.title}>Gesture Demo — the tech behind my Sign Language Translator</span>
          </div>

          <div className={styles.frame}>
            <video
              ref={videoRef}
              className={styles.video}
              muted
              playsInline
              style={{ display: permission === "granted" ? "block" : "none" }}
            />

            {permission !== "granted" && (
              <div className={styles.placeholder}>
                {permission === "idle" && <p>Starting camera…</p>}
                {permission === "requesting" && <p>Requesting camera access…</p>}
                {permission === "denied" && (
                  <p>Camera access was denied. Enable it in your browser's site settings to try this demo.</p>
                )}
                {permission === "unsupported" && <p>Your browser doesn't support camera access.</p>}
              </div>
            )}

            {permission === "granted" && (
              <>
                <div className={styles.hint}>
                  <Hand size={14} strokeWidth={2} />
                  <span>Hold up a peace sign ✌️</span>
                </div>

                <AnimatePresence>
                  {detectedLabel && (
                    <motion.div
                      className={styles.detectedBadge}
                      initial={{ transform: "scale(0.95) translateY(-6px)", opacity: 0 }}
                      animate={{ transform: "scale(1) translateY(0px)", opacity: 1 }}
                      exit={{ transform: "scale(0.95) translateY(-6px)", opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    >
                      {detectedLabel}
                    </motion.div>
                  )}
                </AnimatePresence>

                {confettiKey > 0 && <ConfettiBurst key={confettiKey} />}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
