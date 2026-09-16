"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Video, VideoOff, Mic, MicOff, PhoneOff, User } from "lucide-react";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useHandGestureDetector, type LandmarkerDelegate } from "../webcam/useHandGestureDetector";
import type { Gesture } from "../webcam/GestureClassifier";
import { ConfettiBurst } from "../webcam/ConfettiBurst";
import { FloatingLikes } from "./FaceTimeEffects";
import { useSmoothScroll } from "./useSmoothScroll";

type GestureStatus = "loading" | "ready" | "failed";

export function FaceTimeApp({ window: win }: { window: { id: string; title: string } }) {
  // NOTE: the <video> below renders UNCONDITIONALLY so this ref is populated
  // before getUserMedia resolves (gating it on permission deadlocks the
  // srcObject assignment with a green light but no picture).
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  // Unsupported-environment message is initial state (not set inside the
  // effect) so no synchronous setState-in-effect is needed.
  const [error, setError] = useState<string | null>(() =>
    typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia
      ? "Camera is not available in this browser."
      : null
  );
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [confettiKey, setConfettiKey] = useState(0);
  const [likeKey, setLikeKey] = useState(0);
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);
  const [gestureStatus, setGestureStatus] = useState<GestureStatus>("loading");
  const [gestureDelegate, setGestureDelegate] = useState<LandmarkerDelegate | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const closeWindow = useWindowStore((s) => s.closeWindow);

  useSmoothScroll(sidebarRef);

  useEffect(() => {
    let cancelled = false;
    // Capture the node for cleanup: videoRef.current may change by unmount.
    const video = videoRef.current;
    if (!navigator.mediaDevices?.getUserMedia) return;

    const attachStream = (stream: MediaStream) => {
      streamRef.current = stream;
      if (video && !cancelled) {
        video.srcObject = stream;
        // Explicit play: muted+playsInline usually autoplay, but some
        // engines need the call once srcObject is set post-mount.
        video.play().catch(() => {
          // Autoplay policy block — user gesture (click) will start it.
        });
        setHasPermission(true);
      }
    };

    navigator.mediaDevices
      // Audio included so the mic toggle has a real track to mute.
      // `ideal` (not `exact`) so strict Windows drivers don't reject the
      // request over a resolution they can't match exactly.
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true,
      })
      .then((stream) => {
        if (cancelled) {
          // StrictMode remount / unmount beat the promise: release the tracks.
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        attachStream(stream);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Webcam blocked:", err);
        setError(
          err?.name === "NotAllowedError"
            ? "Camera access was denied. Allow it in the browser to start video."
            : "Could not start the camera."
        );
      });

    return () => {
      cancelled = true;
      // Stop OUR tracks (videoRef.srcObject may already be detached).
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
      if (labelTimerRef.current) globalThis.clearTimeout(labelTimerRef.current);
    };
  }, []);

  const flashLabel = useCallback((text: string) => {
    setDetectedLabel(text);
    if (labelTimerRef.current) globalThis.clearTimeout(labelTimerRef.current);
    labelTimerRef.current = globalThis.setTimeout(() => setDetectedLabel(null), 1800);
  }, []);

  const handleGesture = useCallback(
    (gesture: Exclude<Gesture, "none">) => {
      if (gesture === "peace") {
        setConfettiKey((k) => k + 1);
        flashLabel("✌️ Peace sign detected");
      } else {
        setLikeKey((k) => k + 1);
        flashLabel("👍 Thumbs up detected");
      }
    },
    [flashLabel]
  );

  const handleModelReady = useCallback((delegate: LandmarkerDelegate) => {
    setGestureDelegate(delegate);
    setGestureStatus("ready");
  }, []);

  const handleModelError = useCallback(() => setGestureStatus("failed"), []);

  // Detection needs live frames: gate on permission AND an enabled camera.
  const detecting =
    hasPermission && isVideoEnabled && !error && gestureStatus === "ready";
  useHandGestureDetector({
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    enabled: hasPermission && isVideoEnabled && !error,
    onGesture: handleGesture,
    onReady: handleModelReady,
    onError: handleModelError,
  });

  const toggleVideo = () => {
    const next = !isVideoEnabled;
    setIsVideoEnabled(next);
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
  };

  const toggleMic = () => {
    const next = !isMicEnabled;
    setIsMicEnabled(next);
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
  };

  const avDisabled = !hasPermission || !!error;
  const showCameraOff = hasPermission && !isVideoEnabled;

  return (
    <div className="facetime-root flex w-full h-full bg-black text-white font-sans select-none overflow-hidden">
      <style>{`
        .facetime-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .facetime-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .facetime-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      {/* Sidebar — glassmorphism instructions panel */}
      <aside ref={sidebarRef} className="facetime-scroll w-52 shrink-0 h-full flex flex-col bg-white/10 backdrop-blur-xl border-r border-white/10 p-4 gap-4 overflow-y-auto">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              detecting ? "bg-green-400 animate-pulse" : "bg-white/30"
            }`}
            aria-hidden="true"
          />
          <h2 className="text-sm font-bold tracking-wide">FaceTime</h2>
        </div>

        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
            Interactive Gestures
          </h3>
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <span className="text-lg mr-2" aria-hidden="true">✌️</span>
              <span className="font-semibold">Peace Sign</span>
              <p className="text-white/60 text-xs mt-0.5">Triggers a confetti explosion</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <span className="text-lg mr-2" aria-hidden="true">👍</span>
              <span className="font-semibold">Thumbs Up</span>
              <p className="text-white/60 text-xs mt-0.5">Triggers floating likes</p>
            </div>
          </div>
          <p className="text-[11px] text-white/40 mt-2 leading-snug">
            Hold a pose steady to the camera to trigger it.
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-1.5 text-xs text-white/60">
          <div className="flex items-center justify-between">
            <span>Gesture detection</span>
            <span
              className={
                gestureStatus === "ready"
                  ? "text-green-300"
                  : gestureStatus === "failed"
                    ? "text-red-300"
                    : "text-white/40"
              }
            >
              {gestureStatus === "ready"
                ? `Live${gestureDelegate ? ` (${gestureDelegate})` : ""}`
                : gestureStatus === "failed"
                  ? "Unavailable"
                  : "Loading…"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Camera</span>
            <span className={isVideoEnabled ? "text-green-300" : "text-red-300"}>
              {isVideoEnabled ? "On" : "Off"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Microphone</span>
            <span className={isMicEnabled ? "text-green-300" : "text-red-300"}>
              {isMicEnabled ? "On" : "Muted"}
            </span>
          </div>
        </div>
      </aside>

      {/* Stage */}
      <div className="flex-1 h-full relative overflow-hidden group bg-black">
        {/* Video feed — ALWAYS mounted so the ref exists before the stream
            resolves. Mirrored selfie view, fills the stage. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover -scale-x-100 cursor-pointer"
          onClick={() => setConfettiKey((k) => k + 1)}
        />

        {/* Camera-off placeholder: blurred backdrop + avatar */}
        {showCameraOff && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#2a2a2e] via-[#1a1a1e] to-black">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center">
              <User size={36} className="text-white/70" />
            </div>
            <p className="text-sm text-white/60 font-medium">Camera is off</p>
          </div>
        )}

        {/* Permission / error veil */}
        {!hasPermission && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-white/50 text-sm px-6 text-center">
            {error ?? "Requesting Camera & Microphone Access..."}
          </div>
        )}

        {/* Detection badge */}
        {detectedLabel && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-sm font-medium whitespace-nowrap">
            {detectedLabel}
          </div>
        )}

        {/* Effect overlays (self-unmounting) */}
        {confettiKey > 0 && <ConfettiBurst key={`confetti-${confettiKey}`} />}
        {likeKey > 0 && <FloatingLikes key={`likes-${likeKey}`} burstKey={likeKey} />}

        {/* Floating controls (show on hover) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={toggleMic}
            disabled={avDisabled}
            aria-pressed={!isMicEnabled}
            title={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-40 ${
              isMicEnabled ? "bg-gray-600/50 hover:bg-gray-500/50" : "bg-red-500 hover:bg-red-600"
            }`}
          >
            {isMicEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <button
            onClick={toggleVideo}
            disabled={avDisabled}
            aria-pressed={!isVideoEnabled}
            title={isVideoEnabled ? "Turn camera off" : "Turn camera on"}
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-40 ${
              isVideoEnabled ? "bg-gray-600/50 hover:bg-gray-500/50" : "bg-red-500 hover:bg-red-600"
            }`}
          >
            {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          </button>
          <button
            onClick={() => closeWindow(win.id)}
            title="End call"
            className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
