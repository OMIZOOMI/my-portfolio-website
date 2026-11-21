"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Video, VideoOff, Sparkles, Hand, RotateCcw, Wind, X, Download, LockKeyhole } from "lucide-react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useHandGestureDetector, type DetectorStatus, type LandmarkerDelegate } from "../webcam/useHandGestureDetector";
import { useCameraSession } from "../webcam/useCameraSession";
import type { Gesture } from "../webcam/GestureClassifier";
import { ConfettiBurst } from "../webcam/ConfettiBurst";
import { FloatingLikes } from "./FaceTimeEffects";
import styles from "./FaceTimeApp.module.css";
import { startCameraPreview } from "../webcam/cameraPreview";
import { usePortfolioActivity } from "../portfolio/usePortfolioActivity";
import { useCameraPhoto } from "../webcam/useCameraPhoto";
import { CameraControlTooltip } from "./CameraControlTooltip";

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
    return <div className={styles.app}><div className={styles.preview}><div className={styles.cover} role="alert"><span className={styles.coverIcon}><Camera size={25} aria-hidden="true" /></span><h2>The camera app could not open</h2><p>Your camera has been released. Reopen the app to try again.</p><button type="button" className={styles.primaryButton} onClick={() => this.setState({ failed: false })}>Reopen camera</button></div></div></div>;
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
  const desktopActive = usePortfolioActivity(state => state.desktopActive);
  const windowAvailable = desktopActive && !win.minimized && !win.closing;
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
  const photoEnabled = cameraLive && previewStatus === "ready";
  const photo = useCameraPhoto({ videoRef, canvasRef, enabled: photoEnabled, generation: camera.generation, closing: win.closing });
  const captureButton = useRef<HTMLButtonElement>(null);
  const saveButton = useRef<HTMLAnchorElement>(null);
  const previousPhotoStatus = useRef(photo.status);
  useEffect(() => {
    const previous = previousPhotoStatus.current;
    previousPhotoStatus.current = photo.status;
    if (!photoEnabled) return;
    if (photo.status === "ready" && previous !== "ready") saveButton.current?.focus({ preventScroll: true });
    else if ((photo.status === "idle" && previous === "ready") || (photo.status === "error" && previous === "capturing")) captureButton.current?.focus({ preventScroll: true });
  }, [photo.status, photoEnabled]);
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

  const cameraNeedsRetry = camera.status === "error" || (cameraLive && previewStatus === "error");
  const toggleVideo = () => {
    if (cameraNeedsRetry) camera.session.retry();
    else if (camera.status === "playback-blocked") camera.session.resumePlayback();
    else camera.session.setEnabled(camera.status === "off");
  };
  const toggleEffects = () => {
    if (labelTimerRef.current) globalThis.clearTimeout(labelTimerRef.current);
    setReaction(previous => ({ ...previous, confetti: 0, likes: 0, label: null }));
    if (!effectsEnabled) setGestureState({ generation: camera.generation, status: "loading", delegate: null, error: null });
    setEffectsEnabled(value => !value);
  };
  const cameraAction = cameraNeedsRetry ? "Retry camera" : camera.status === "playback-blocked" ? "Resume camera" : camera.status === "off" ? "Turn camera on" : "Turn camera off";
  const cameraControlLabel = cameraNeedsRetry ? "Retry camera" : camera.status === "playback-blocked" ? "Resume camera" : camera.status === "off" ? "Start camera" : "Camera";
  const cameraTip = cameraNeedsRetry ? "Try the camera again." : camera.status === "playback-blocked" ? "Resume the live preview." : camera.status === "off" ? "Start your camera." : "Stop the camera and release access.";
  const cameraLabel = camera.status === "live" ? previewStatus === "ready" ? "Camera live" : previewStatus === "error" ? "Preview unavailable" : "Starting preview" : camera.status === "off" ? "Camera off" : camera.status === "error" ? "Camera unavailable" : camera.status === "paused" ? "Camera paused" : camera.status === "playback-blocked" ? "Preview paused" : "Starting camera";
  const gestureLabel = gestureStatus === "ready" ? "Gesture model ready" : gestureStatus === "failed" ? "Gesture model unavailable" : gestureStatus === "paused" ? "Inference paused" : gestureStatus === "fallback" ? "Recovering gesture model" : gestureStatus === "busy" ? "Waiting for gesture model" : "Loading gesture model";
  const showCameraCover = !cameraLive || previewStatus !== "ready";
  const tooltipId = (control: string) => `camera-tip-${win.id}-${control}`;

  return (
    <div className={styles.app} data-facetime-app data-camera-status={camera.status} data-camera-preview-status={previewStatus} data-gesture-status={gestureStatus} data-gesture-delegate={gestureDelegate ?? ""} data-reduced-motion={reducedEffects || undefined}
      onKeyDown={event => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (photo.photo) { event.preventDefault(); event.stopPropagation(); photo.session.reset(); }
        else if (helpOpen) { event.preventDefault(); event.stopPropagation(); setHelpOpen(false); helpButton.current?.focus(); }
      }}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.identityIcon} aria-hidden="true"><Camera size={17} /></span>
          <h1>Gesture camera</h1>
        </div>
        <div className={styles.statuses} aria-label="Camera and gesture status">
          <span className={styles.status} data-tone={cameraNeedsRetry ? "error" : photoEnabled ? "live" : undefined}><span aria-hidden="true" />{cameraLabel}</span>
          <span className={styles.status} data-tone={gestureStatus === "failed" ? "error" : gestureStatus === "ready" ? "ready" : undefined}><span aria-hidden="true" />{gestureLabel}</span>
        </div>
      </header>

      <div className={styles.preview} data-camera-preview>
        <video ref={videoRef} autoPlay playsInline muted className={styles.sourceVideo} aria-hidden="true" />
        <canvas ref={canvasRef} className={styles.video} role="img" aria-label="Mirrored camera preview" aria-hidden={showCameraCover || !!photo.photo || undefined} />
        {showCameraCover && <div className={styles.cover}>
          <span className={styles.coverIcon} aria-hidden="true">{camera.status === "off" ? <VideoOff size={25} /> : <Camera size={25} />}</span>
          <h2>{camera.status === "off" ? "Camera is off" : cameraLabel}</h2>
          <p role="status" aria-live="polite">{camera.status === "off" ? "Start the camera to take a photo or try a gesture." : cameraLive ? previewStatus === "error" ? "The live view could not be drawn. Retry the camera." : "Camera allowed. Preparing the live preview…" : camera.message}</p>
        </div>}
        {cameraLive && (gestureStatus === "failed" || gestureStatus === "busy") && <div className={styles.recovery}>
          <span>{gestureState.error ?? "The gesture detector is in use. Close the other gesture window or retry."}</span>
          <button type="button" onClick={() => setRetryKey(key => key + 1)}><RotateCcw size={14} aria-hidden="true" />Retry gestures</button>
        </div>}
        <div className={styles.feedback} aria-live="off" data-recognition-feedback>
          {detectedLabel && <span><Sparkles size={14} aria-hidden="true" />{detectedLabel}{reducedEffects && <small>Reduced motion</small>}</span>}
        </div>
        {confettiKey > 0 && !reducedEffects && <ConfettiBurst key={`confetti-${confettiKey}`} />}
        {likeKey > 0 && !reducedEffects && <FloatingLikes key={`likes-${likeKey}`} burstKey={likeKey} />}
        {helpOpen && <aside className={styles.help} id={`gesture-guide-${win.id}`} aria-label="Gesture guide">
          <div className={styles.helpHeading}><h2>Try a gesture</h2><button type="button" aria-label="Close gesture help" onClick={() => { setHelpOpen(false); helpButton.current?.focus(); }}><X size={16} aria-hidden="true" /></button></div>
          <div className={styles.gestureRow}><span aria-hidden="true">✌️</span><div><h3>Peace sign</h3><p>Hold two fingers up for confetti.</p></div></div>
          <div className={styles.gestureRow}><span aria-hidden="true">👍</span><div><h3>Thumbs up</h3><p>Give a thumbs up for floating likes.</p></div></div>
          <p className={styles.helpHint}>Relax your hand between poses. Reactions are spaced 2.5 seconds apart.</p>
          <div className={styles.effectPreviews} role="group" aria-label="Manual effect previews">
            <button type="button" onClick={() => reactToGesture("peace", false)} disabled={!cameraLive || !effectsEnabled}>Preview confetti</button>
            <button type="button" onClick={() => reactToGesture("thumbsup", false)} disabled={!cameraLive || !effectsEnabled}>Preview likes</button>
          </div>
        </aside>}
        {photo.photo && <section className={styles.photoReview} aria-label="Local photo preview">
          <p className={styles.photoLabel}>Photo preview · Camera frame only</p>
          {/* A local blob URL needs no Next image service or network request. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.photo.url} width={photo.photo.width} height={photo.photo.height}
            alt="Your photo, cropped and mirrored to match the camera preview" className={styles.photoImage}
            onError={() => photo.session.previewFailed(photo.photo!.url)} />
        </section>}
      </div>

      <footer className={styles.footer}>
        {photo.photo ? <div className={styles.photoActions} role="group" aria-label="Photo actions">
          <a ref={saveButton} href={photo.photo.url} download={photo.photo.filename} target="_blank" rel="noopener noreferrer"
            onClick={() => photo.session.requestDownload(photo.photo!.url)}><Download size={17} aria-hidden="true" />Save photo</a>
          <button type="button" onClick={photo.session.reset}><RotateCcw size={17} aria-hidden="true" />Retake</button>
          <button type="button" onClick={photo.session.reset}>Cancel</button>
        </div> : <div className={styles.controls} data-camera-controls role="group" aria-label="Camera controls">
          <CameraControlTooltip id={tooltipId("camera")} text={cameraTip}>
            <button type="button" className={styles.control} aria-label={cameraAction} aria-describedby={tooltipId("camera")} aria-pressed={cameraNeedsRetry || camera.status === "playback-blocked" ? undefined : camera.liveTrack} data-action-needed={cameraNeedsRetry || camera.status === "off" || camera.status === "playback-blocked" || undefined} disabled={!active} onClick={toggleVideo}>
              <span className={styles.controlIcon} aria-hidden="true">{cameraNeedsRetry ? <RotateCcw size={19} /> : camera.status === "off" || camera.liveTrack || camera.status === "playback-blocked" ? <Video size={19} /> : <VideoOff size={19} />}</span>
              <span>{cameraControlLabel}</span>
            </button>
          </CameraControlTooltip>
          <CameraControlTooltip id={tooltipId("effects")} text={effectsEnabled ? "Turn gesture reactions off." : "Turn gesture reactions on."}>
            <button type="button" className={styles.control} aria-label={effectsEnabled ? "Turn effects off" : "Turn effects on"} aria-describedby={tooltipId("effects")} aria-pressed={effectsEnabled} onClick={toggleEffects}>
              <span className={styles.controlIcon}><Sparkles size={19} aria-hidden="true" /></span><span>Effects</span>
            </button>
          </CameraControlTooltip>
          <CameraControlTooltip id={tooltipId("photo")} text={photoEnabled ? "Capture this mirrored view. Effects aren’t included." : "Wait for a live camera frame before taking a photo."}>
            <button ref={captureButton} type="button" className={`${styles.control} ${styles.shutter}`} aria-describedby={tooltipId("photo")}
              disabled={!photoEnabled || photo.status === "capturing"} aria-busy={photo.status === "capturing"}
              onClick={() => { if (photo.takePhoto()) setHelpOpen(false); }}><span className={styles.controlIcon}><Camera size={22} aria-hidden="true" /></span><span>{photo.status === "capturing" ? "Preparing…" : "Take photo"}</span></button>
          </CameraControlTooltip>
          <CameraControlTooltip id={tooltipId("motion")} text={reduceMotion || systemMotion ? "Reduced motion follows your system settings." : "Keep feedback without animated particles."}>
            <button type="button" className={styles.control} aria-label="Reduced motion" aria-describedby={tooltipId("motion")} aria-pressed={reducedEffects} disabled={reduceMotion || systemMotion} onClick={() => { setReaction(previous => ({ ...previous, confetti: 0, likes: 0 })); setGentleMotion(value => !value); }}>
              <span className={styles.controlIcon}><Wind size={19} aria-hidden="true" /></span><span>Reduced motion</span>
            </button>
          </CameraControlTooltip>
          <CameraControlTooltip id={tooltipId("help")} text={helpOpen ? "Close the gesture guide." : "See the gestures you can try."} suppressed={helpOpen}>
            <button ref={helpButton} type="button" className={styles.control} aria-label="Gesture help" aria-describedby={tooltipId("help")} aria-expanded={helpOpen} aria-controls={`gesture-guide-${win.id}`} onClick={() => setHelpOpen(value => !value)}>
              <span className={styles.controlIcon}><Hand size={19} aria-hidden="true" /></span><span>Gesture help</span>
            </button>
          </CameraControlTooltip>
        </div>}
        <p className={styles.photoStatus} role="status" aria-atomic="true">{photo.message}</p>
        {photo.photo && photo.downloadRequested && <a href={photo.photo.url} target="_blank" rel="noopener noreferrer" className={styles.photoFallback}>Open photo in a new tab</a>}
        <p className={styles.privacy}><LockKeyhole size={11} aria-hidden="true" />{photo.photo ? "Camera frame only. Saved only when you choose Save photo." : "Video stays on this device. Photos don’t include gesture effects."}</p>
      </footer>
    </div>
  );
}
