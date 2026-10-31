"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Video, VideoOff, Sparkles, Hand, RotateCcw, Wind, X } from "lucide-react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useHandGestureDetector, type DetectorStatus, type LandmarkerDelegate } from "../webcam/useHandGestureDetector";
import { useCameraSession } from "../webcam/useCameraSession";
import type { Gesture } from "../webcam/GestureClassifier";
import { ConfettiBurst } from "../webcam/ConfettiBurst";
import { FloatingLikes } from "./FaceTimeEffects";
import styles from "./FaceTimeApp.module.css";
import { startCameraPreview } from "../webcam/cameraPreview";

let pageSuspended = false;
function subscribePageActivity(notify: () => void) {
  pageSuspended = false;
  const hide = () => { pageSuspended = true; notify(); };
  const show = () => { pageSuspended = false; notify(); };
  document.addEventListener("visibilitychange", notify);
  globalThis.addEventListener("pagehide", hide);
  globalThis.addEventListener("pageshow", show);
  return () => {
    document.removeEventListener("visibilitychange", notify);
    globalThis.removeEventListener("pagehide", hide);
    globalThis.removeEventListener("pageshow", show);
  };
}
const readPageActivity = () => !document.hidden && !pageSuspended;
const serverPageActivity = () => false;
const readMotionPreference = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
function subscribeMotionPreference(notify: () => void) {
  const media = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

type GestureState = { generation: number; status: DetectorStatus | "idle"; delegate: LandmarkerDelegate | null; error: string | null };
type Reaction = { generation: number; confetti: number; likes: number; label: string | null };

type CameraWindowProps = { window: { id: string; title: string; minimized?: boolean; closing?: boolean } };

class CameraAppRecovery extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className={styles.app}><div className={styles.cover} role="alert"><Camera size={28} /><h2>The camera app could not open</h2><p>Your camera has been released. Reopen the app to try again.</p><button className={styles.primaryButton} onClick={() => this.setState({ failed: false })}>Reopen camera</button></div></div>;
  }
}

export function FaceTimeApp(props: CameraWindowProps) {
  return <CameraAppRecovery><FaceTimeContent {...props} /></CameraAppRecovery>;
}

function FaceTimeContent({ window: win }: CameraWindowProps) {
  // Always mounted: permission and playback must never gate the video ref.
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageActive = useSyncExternalStore(subscribePageActivity, readPageActivity, serverPageActivity);
  const windowAvailable = !win.minimized && !win.closing;
  const active = pageActive && windowAvailable;
  const camera = useCameraSession(videoRef, windowAvailable);
  const [retryKey, setRetryKey] = useState(0);
  const [gestureState, setGestureState] = useState<GestureState>({ generation: -1, status: "idle", delegate: null, error: null });
  const [reaction, setReaction] = useState<Reaction>({ generation: -1, confetti: 0, likes: 0, label: null });
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useSystemStore(s => s.reduceMotion);
  const systemMotion = useSyncExternalStore(subscribeMotionPreference, readMotionPreference, serverPageActivity);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [gentleMotion, setGentleMotion] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const reducedEffects = reduceMotion || systemMotion || gentleMotion;

  const cameraLive = active && camera.status === "live" && camera.liveTrack;
  const [preview, setPreview] = useState<{ generation: number; status: "ready" | "error" }>({ generation: -1, status: "ready" });
  const previewStatus = cameraLive && preview.generation === camera.generation ? preview.status : "waiting";
  useEffect(() => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!cameraLive || !video || !canvas) return;
    const generation = camera.generation;
    return startCameraPreview(video, canvas,
      () => setPreview({ generation, status: "ready" }),
      () => setPreview({ generation, status: "error" }));
  }, [cameraLive, camera.generation]);
  const gestureStatus = !cameraLive || !effectsEnabled ? "paused" : gestureState.generation !== camera.generation ? "loading" : gestureState.status;
  const gestureDelegate = gestureState.generation === camera.generation ? gestureState.delegate : null;
  const showReaction = cameraLive && effectsEnabled && reaction.generation === camera.generation;
  const confettiKey = showReaction ? reaction.confetti : 0;
  const likeKey = showReaction ? reaction.likes : 0;
  const detectedLabel = showReaction ? reaction.label : null;

  useEffect(() => () => {
    if (labelTimerRef.current) globalThis.clearTimeout(labelTimerRef.current);
  }, [active, camera.generation]);

  const reactToGesture = useCallback((gesture: Exclude<Gesture, "none">, detected = true) => {
    if (!cameraLive || !effectsEnabled) return;
    const generation = camera.generation;
    if (labelTimerRef.current) globalThis.clearTimeout(labelTimerRef.current);
    setReaction(previous => ({
      generation,
      confetti: (previous.generation === generation ? previous.confetti : 0) + (gesture === "peace" ? 1 : 0),
      likes: (previous.generation === generation ? previous.likes : 0) + (gesture === "thumbsup" ? 1 : 0),
      label: !detected ? null : gesture === "peace" ? "✌️ Peace sign detected" : "👍 Thumbs up detected",
    }));
    labelTimerRef.current = globalThis.setTimeout(() => {
      setReaction(previous => previous.generation === generation ? { ...previous, label: null } : previous);
    }, 1800);
  }, [cameraLive, camera.generation, effectsEnabled]);

  const handleStatus = useCallback((status: DetectorStatus) => {
    setGestureState(previous => ({ generation: camera.generation, status, delegate: status === "ready" ? previous.delegate : null, error: null }));
  }, [camera.generation]);
  const handleReady = useCallback((delegate: LandmarkerDelegate) => {
    setGestureState({ generation: camera.generation, status: "ready", delegate, error: null });
  }, [camera.generation]);
  const handleError = useCallback((error: Error) => {
    setGestureState({ generation: camera.generation, status: "failed", delegate: null, error: error.message });
  }, [camera.generation]);

  useHandGestureDetector({ videoRef, enabled: cameraLive && effectsEnabled, retryKey: `${camera.generation}:${retryKey}`, onGesture: reactToGesture, onReady: handleReady, onError: handleError, onStatus: handleStatus });

  const toggleVideo = () => {
    if (camera.status === "error") camera.session.retry();
    else if (camera.status === "playback-blocked") camera.session.resumePlayback();
    else camera.session.setEnabled(camera.status === "off");
  };
  const toggleEffects = () => {
    if (labelTimerRef.current) globalThis.clearTimeout(labelTimerRef.current);
    setReaction(previous => ({ ...previous, confetti: 0, likes: 0, label: null }));
    if (!effectsEnabled) setGestureState({ generation: camera.generation, status: "loading", delegate: null, error: null });
    setEffectsEnabled(value => !value);
  };
  const cameraAction = camera.status === "error" ? "Retry camera" : camera.status === "playback-blocked" ? "Resume camera" : camera.status === "off" ? "Turn camera on" : "Turn camera off";
  const cameraLabel = camera.status === "live" ? previewStatus === "ready" ? "Camera live" : previewStatus === "error" ? "Preview unavailable" : "Starting preview" : camera.status === "off" ? "Camera off" : camera.status === "error" ? "Camera unavailable" : camera.status === "paused" ? "Camera paused" : camera.status === "playback-blocked" ? "Preview paused" : "Starting camera";
  const gestureLabel = gestureStatus === "ready" ? "Gestures ready" : gestureStatus === "failed" ? "Gestures unavailable" : gestureStatus === "paused" ? "Gestures paused" : gestureStatus === "fallback" ? "Recovering gestures" : gestureStatus === "busy" ? "Waiting for gestures" : "Loading gestures";
  const showCameraCover = !cameraLive || previewStatus !== "ready";

  return (
    <div className={styles.app} data-facetime-app data-camera-status={camera.status} data-camera-preview-status={previewStatus} data-gesture-status={gestureStatus} data-gesture-delegate={gestureDelegate ?? ""} data-reduced-motion={reducedEffects || undefined}
      onKeyDown={event => { if (event.key === "Escape" && helpOpen) { setHelpOpen(false); helpButton.current?.focus(); } }}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <Camera size={19} strokeWidth={1.6} aria-hidden="true" />
          <div><h1>Camera</h1><p>Gesture demo</p></div>
        </div>
        <div className={styles.statuses} aria-label="Camera and gesture status">
          <span className={`${styles.status} ${camera.status === "error" ? styles.error : ""}`}>{cameraLabel}</span>
          <span className={`${styles.status} ${gestureStatus === "failed" ? styles.error : ""}`}>{gestureLabel}</span>
        </div>
      </header>

      <div className={styles.preview} data-camera-preview>
        <video ref={videoRef} autoPlay playsInline muted className={styles.sourceVideo} aria-hidden="true" />
        <canvas ref={canvasRef} className={styles.video} role="img" aria-label="Mirrored camera preview" />
        {showCameraCover && <div className={styles.cover}>
          <span className={styles.coverIcon}>{camera.status === "off" ? <VideoOff size={25} /> : <Camera size={25} />}</span>
          <h2>{camera.status === "off" ? "Camera is off" : cameraLabel}</h2>
          <p role="status" aria-live="polite">{camera.status === "off" ? "Turn on your camera to try a peace sign or a thumbs up." : cameraLive ? previewStatus === "error" ? "The live view could not be drawn. Retry the camera." : "Camera allowed. Preparing the live preview…" : camera.message}</p>
          {active && (camera.status === "error" || previewStatus === "error") && <button className={styles.primaryButton} onClick={camera.session.retry}><RotateCcw size={16} />Retry camera</button>}
          {active && camera.status === "playback-blocked" && <button className={styles.primaryButton} onClick={camera.session.resumePlayback}><Video size={16} />Resume camera</button>}
        </div>}
        {cameraLive && (gestureStatus === "failed" || gestureStatus === "busy") && <div className={styles.recovery}>
          <span>{gestureState.error ?? "The gesture detector is in use. Close the other gesture window or retry."}</span>
          <button onClick={() => setRetryKey(key => key + 1)}><RotateCcw size={14} />Retry gestures</button>
        </div>}
        <div className={styles.feedback} role="status" aria-live="polite" aria-atomic="true" data-recognition-feedback>
          {detectedLabel && <span><Sparkles size={14} aria-hidden="true" />{detectedLabel}{reducedEffects && <small>Reduced motion</small>}</span>}
        </div>
        {confettiKey > 0 && !reducedEffects && <ConfettiBurst key={`confetti-${confettiKey}`} />}
        {likeKey > 0 && !reducedEffects && <FloatingLikes key={`likes-${likeKey}`} burstKey={likeKey} />}
        {helpOpen && <aside className={styles.help} id={`gesture-guide-${win.id}`} aria-label="Gesture guide">
          <div className={styles.helpHeading}><h2>Supported gestures</h2><button aria-label="Close gesture help" onClick={() => { setHelpOpen(false); helpButton.current?.focus(); }}><X size={16} /></button></div>
          <div className={styles.gestureRow}><span aria-hidden="true">✌️</span><div><h3>Peace sign</h3><p>Two fingers up. A little confetti.</p></div></div>
          <div className={styles.gestureRow}><span aria-hidden="true">👍</span><div><h3>Thumbs up</h3><p>Thumb upward. A few floating likes.</p></div></div>
          <p className={styles.helpHint}>Release your pose between gestures. Reactions have a 2.5-second cooldown.</p>
          <div className={styles.effectPreviews} role="group" aria-label="Manual effect previews">
            <button onClick={() => reactToGesture("peace", false)} disabled={!cameraLive || !effectsEnabled}>Preview confetti</button>
            <button onClick={() => reactToGesture("thumbsup", false)} disabled={!cameraLive || !effectsEnabled}>Preview likes</button>
          </div>
        </aside>}
      </div>

      <footer className={styles.footer}>
        <div className={styles.controls} data-camera-controls role="group" aria-label="Camera controls">
          <button className={styles.control} aria-label={cameraAction} aria-pressed={camera.liveTrack} disabled={!active} onClick={toggleVideo}>
            {camera.liveTrack ? <Video size={18} /> : camera.status === "error" ? <RotateCcw size={18} /> : <VideoOff size={18} />}<span>{camera.status === "error" ? "Retry camera" : camera.status === "playback-blocked" ? "Resume camera" : camera.liveTrack ? "Camera on" : "Camera off"}</span>
          </button>
          <button className={styles.control} aria-label={effectsEnabled ? "Turn effects off" : "Turn effects on"} aria-pressed={effectsEnabled} onClick={toggleEffects}><Sparkles size={18} /><span>Effects {effectsEnabled ? "on" : "off"}</span></button>
          <button className={styles.control} aria-label="Reduced motion" aria-pressed={reducedEffects} disabled={reduceMotion || systemMotion} title={reduceMotion || systemMotion ? "Reduced motion follows your system settings" : "Keep feedback without animated particles"} onClick={() => { setReaction(previous => ({ ...previous, confetti: 0, likes: 0 })); setGentleMotion(value => !value); }}><Wind size={18} /><span>{reducedEffects ? "Motion reduced" : "Reduce motion"}</span></button>
          <button ref={helpButton} className={styles.control} aria-label="Gesture help" aria-expanded={helpOpen} aria-controls={`gesture-guide-${win.id}`} onClick={() => setHelpOpen(value => !value)}><Hand size={18} /><span>Gesture help</span></button>
        </div>
        <p className={styles.privacy}>Video stays on this device.</p>
      </footer>
    </div>
  );
}
