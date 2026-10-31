"use client";

import { useEffect, useRef, useState } from "react";
import type { Workspace } from "../../data/workspaces";
import type { MotionStatus } from "./workspaceTransition";
import styles from "./WorkspaceEnvironment.module.css";

const MEDIA_DEADLINE_MS = 10000;

export function WorkspaceMedia({ workspace, layerKey, role, motionAllowed, preferPoster, attempt, allowStillFallback, onReady, onFailed, onMotion }: {
  workspace: Workspace;
  layerKey: number;
  role: "active" | "incoming";
  motionAllowed: boolean;
  preferPoster: boolean;
  attempt: number;
  allowStillFallback: boolean;
  onReady: (key: number) => void;
  onFailed: (key: number, message: string) => void;
  onMotion: (key: number, status: MotionStatus) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const prepared = useRef(false);
  const lastAttempt = useRef(-1);
  const [posterReady, setPosterReady] = useState(workspace.kind === "color");
  const [frameReady, setFrameReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (workspace.kind === "color") return;
    const poster = image.current;
    if (!poster) return;
    let cancelled = false;
    const fail = () => { if (!cancelled) onFailed(layerKey, "That image couldn’t be opened. Try another workspace or retry."); };
    const loaded = () => {
      void poster.decode().then(() => {
        if (!cancelled) { window.clearTimeout(deadline); setPosterReady(true); }
      }).catch(fail);
    };
    poster.addEventListener("load", loaded);
    poster.addEventListener("error", fail);
    const deadline = window.setTimeout(fail, MEDIA_DEADLINE_MS);
    if (poster.complete) {
      if (poster.naturalWidth) loaded();
      else fail();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(deadline);
      poster.removeEventListener("load", loaded);
      poster.removeEventListener("error", fail);
    };
  }, [layerKey, onFailed, workspace.kind]);

  // A poster is sufficient while motion is intentionally off. A live incoming
  // location waits for an actual decoded video frame before its flight starts.
  useEffect(() => {
    if (prepared.current || !posterReady) return;
    if (workspace.video && motionAllowed && !frameReady && !(videoFailed && allowStillFallback)) return;
    prepared.current = true;
    onReady(layerKey);
  }, [allowStillFallback, frameReady, layerKey, motionAllowed, onReady, posterReady, videoFailed, workspace.video]);

  useEffect(() => {
    const element = video.current;
    if (!element || !workspace.video) {
      onMotion(layerKey, "still");
      return;
    }
    if (!motionAllowed || !posterReady) {
      element.pause();
      onMotion(layerKey, motionAllowed ? "still" : "paused");
      return;
    }
    let cancelled = false;
    let videoFrame: number | undefined;
    let animationFrame: number | undefined;
    let scheduled = false;
    let settled = false;
    let playAccepted = false;
    const timeout = window.setTimeout(() => fail(), MEDIA_DEADLINE_MS);
    const fail = () => {
      if (cancelled || settled) return;
      settled = true;
      window.clearTimeout(timeout);
      element.pause();
      setVideoFailed(true);
      setFrameReady(false);
      onMotion(layerKey, "unavailable");
      if (!prepared.current && !allowStillFallback) {
        onFailed(layerKey, "Motion couldn’t start. Retry, or pause motion to explore the still images.");
      }
    };
    const presented = () => {
      if (cancelled || settled || !playAccepted || element.paused) return;
      settled = true;
      window.clearTimeout(timeout);
      setFrameReady(true);
      onMotion(layerKey, "playing");
    };
    const firstFrame = () => {
      if (cancelled || settled || scheduled || !playAccepted || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      scheduled = true;
      if (element.requestVideoFrameCallback) videoFrame = element.requestVideoFrameCallback(presented);
      else animationFrame = window.requestAnimationFrame(presented);
    };
    const failedPlayback = () => {
      // A failure after the first frame is also real; retain the poster.
      settled = false;
      fail();
    };
    element.addEventListener("loadeddata", firstFrame);
    element.addEventListener("error", failedPlayback);
    element.muted = true;
    element.loop = true;
    element.playsInline = true;
    if (!element.canPlayType("video/mp4")) {
      fail();
    } else {
      setVideoFailed(false);
      onMotion(layerKey, "starting");
      if (element.getAttribute("src") !== workspace.video || lastAttempt.current !== attempt) {
        lastAttempt.current = attempt;
        element.src = workspace.video;
        element.load();
      }
      void element.play().then(() => { playAccepted = true; firstFrame(); }).catch(fail);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (videoFrame !== undefined) element.cancelVideoFrameCallback?.(videoFrame);
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      element.removeEventListener("loadeddata", firstFrame);
      element.removeEventListener("error", failedPlayback);
      element.pause();
    };
  }, [allowStillFallback, attempt, layerKey, motionAllowed, onFailed, onMotion, posterReady, workspace.video]);

  useEffect(() => {
    const element = video.current;
    return () => {
      // Capture the node while mounted; React may clear its ref before cleanup.
      if (!element) return;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, []);

  return (
    <div className={styles.mediaLayer} style={workspace.color ? { backgroundColor: workspace.color } : undefined} data-workspace-layer={workspace.id} data-workspace-key={layerKey} data-workspace-role={role}>
      {/* Dedicated optimized local environment assets; no Next image derivative/decode gate. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {workspace.poster && <img ref={image} src={workspace.poster} alt="" width={1920} height={1080} decoding="async" draggable={false} className={styles.media} />}
      {workspace.video && <video ref={video} data-workspace-video={workspace.id} aria-hidden="true" muted playsInline loop preload="none" disablePictureInPicture className={`${styles.media} ${styles.video}`} data-frame-ready={frameReady && !videoFailed && !preferPoster || undefined} />}
    </div>
  );
}
