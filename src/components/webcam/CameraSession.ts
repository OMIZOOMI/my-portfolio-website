export type CameraStatus = "off" | "requesting" | "starting" | "live" | "paused" | "resuming" | "error" | "playback-blocked";
export interface CameraSnapshot {
  status: CameraStatus;
  message: string;
  permission: "unknown" | "granted" | "denied";
  liveTrack: boolean;
  generation: number;
}

export const CAMERA_REQUEST_TIMEOUT_MS = 15_000;
export const CAMERA_FRAME_TIMEOUT_MS = 10_000;
const stopTracks = (stream: MediaStream) => stream.getTracks().forEach(track => track.stop());

export function cameraErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  switch (name) {
    case "NotAllowedError": case "PermissionDeniedError": return "Camera permission was denied or dismissed. Allow camera access in your browser’s site settings, then retry.";
    case "NotFoundError": case "DevicesNotFoundError": return "No camera was found. Connect or enable a camera, then retry.";
    case "NotReadableError": case "TrackStartError": return "The camera is busy or unavailable. Close other camera apps and check your system camera settings, then retry.";
    case "OverconstrainedError": return "This camera could not use the requested settings. Try another camera or reconnect it, then retry.";
    case "SecurityError": return "Camera access is disabled for this site. Use HTTPS and check browser and system camera permissions.";
    case "InvalidStateError": return "This page is not active. Return to this tab, then retry the camera.";
    case "CameraRequestPending": return "A camera permission request is still pending. Answer or dismiss the browser prompt, then retry.";
    case "CameraBusy": return "Another camera session is active. Close it, then retry.";
    default: return "The camera could not start. Check its connection and browser permissions, then retry.";
  }
}

// getUserMedia cannot be aborted. Keep at most one native permission request,
// including across React remounts; a cancelled request can never attach a stream.
export class CameraRequestBroker {
  private owner: symbol | null = null;
  private pending: { owner: symbol; cancelled: boolean } | null = null;
  constructor(private request: () => Promise<MediaStream>) {}

  async acquire(owner: symbol): Promise<MediaStream> {
    if (this.pending) throw new DOMException("Permission request pending", "CameraRequestPending");
    if (this.owner && this.owner !== owner) throw new DOMException("Camera already owned", "CameraBusy");
    this.owner = owner;
    const attempt = { owner, cancelled: false };
    this.pending = attempt;
    try {
      const stream = await this.request();
      if (attempt.cancelled || this.owner !== owner) {
        stopTracks(stream);
        throw new DOMException("Camera request cancelled", "AbortError");
      }
      return stream;
    } finally {
      if (this.pending === attempt) this.pending = null;
    }
  }

  release(owner: symbol) {
    if (this.pending?.owner === owner) this.pending.cancelled = true;
    if (this.owner === owner) this.owner = null;
  }
}

const cameraBroker = new CameraRequestBroker(() => navigator.mediaDevices.getUserMedia({
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: "user" } },
  audio: false,
}));

interface CameraSessionOptions {
  broker?: CameraRequestBroker;
  available?: () => boolean;
  secure?: () => boolean;
  requestTimeoutMs?: number;
  frameTimeoutMs?: number;
  monitorMs?: number;
}

/** One visible window owns its stream. Pause/close releases immediately (0 ms grace). */
export class CameraSession {
  private snapshot: CameraSnapshot = { status: "off", message: "Camera is off", permission: "unknown", liveTrack: false, generation: 0 };
  private listeners = new Set<() => void>();
  private owner = Symbol("camera-session");
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private cleanupListeners: (() => void)[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private epoch = 0;
  private active = false;
  private wanted = true;
  private broker: CameraRequestBroker;
  private lastFrameTime = -1;
  private lastProgressAt = 0;

  constructor(private getVideo: () => HTMLVideoElement | null, private options: CameraSessionOptions = {}) {
    this.broker = options.broker ?? cameraBroker;
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  setVideoSource(getVideo: () => HTMLVideoElement | null) { this.getVideo = getVideo; }

  private hasLiveTrack() {
    return !!this.stream?.getVideoTracks().some(track => track.readyState === "live" && track.enabled && !track.muted);
  }

  private publish(status: CameraStatus, message: string, permission = this.snapshot.permission) {
    this.snapshot = { status, message, permission, liveTrack: this.hasLiveTrack(), generation: this.epoch };
    for (const listener of this.listeners) listener();
  }

  private later(callback: () => void, ms: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, ms);
    this.timers.add(timer);
    return timer;
  }

  private clearTimer(timer: ReturnType<typeof setTimeout>) { clearTimeout(timer); this.timers.delete(timer); }

  private release() {
    this.epoch++;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const cleanup of this.cleanupListeners) cleanup();
    this.cleanupListeners = [];
    if (this.stream) stopTracks(this.stream);
    this.stream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    this.video = null;
    this.broker.release(this.owner);
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this.release();
      this.publish(this.wanted ? "paused" : "off", this.wanted ? "Camera paused while this window or page is hidden." : "Camera is off");
    } else if (this.wanted) {
      void this.start(this.snapshot.status === "paused");
    }
  }

  setEnabled(enabled: boolean) {
    this.wanted = enabled;
    if (!enabled) { this.release(); this.publish("off", "Camera is off"); }
    else if (this.active) void this.start(false);
  }

  retry = () => { if (this.active) { this.wanted = true; void this.start(false); } };

  private fail(message: string, permission = this.snapshot.permission) {
    this.release();
    this.publish("error", message, permission);
  }

  private listen(target: EventTarget, name: string, callback: () => void) {
    target.addEventListener(name, callback);
    this.cleanupListeners.push(() => target.removeEventListener(name, callback));
  }

  private async start(resuming: boolean) {
    this.release();
    if (!this.active || !this.wanted) return;
    if (!(this.options.secure?.() ?? globalThis.isSecureContext)) {
      this.publish("error", "Camera access needs HTTPS or localhost. Open the secure version of this site.");
      return;
    }
    if (!(this.options.available?.() ?? !!navigator.mediaDevices?.getUserMedia)) {
      this.publish("error", "Camera access is not supported in this browser. Try a current supported browser.");
      return;
    }
    const epoch = this.epoch;
    const current = () => epoch === this.epoch && this.active && this.wanted;
    this.publish(resuming ? "resuming" : "requesting", resuming ? "Resuming camera…" : "Waiting for camera permission…");
    const requestTimer = this.later(() => {
      if (current()) this.fail("The camera request is still waiting. Answer or dismiss the browser prompt, then retry.");
    }, this.options.requestTimeoutMs ?? CAMERA_REQUEST_TIMEOUT_MS);
    try {
      const stream = await this.broker.acquire(this.owner);
      if (!current()) { stopTracks(stream); return; }
      this.clearTimer(requestTimer);
      this.stream = stream;
      const tracks = stream.getVideoTracks();
      if (!tracks.length || tracks.every(track => track.readyState !== "live")) {
        this.fail("The camera returned no live video track. Reconnect it, then retry."); return;
      }
      const video = this.getVideo();
      if (!video) { this.fail("The camera preview is not available yet. Retry the camera."); return; }
      this.video = video;
      this.publish("starting", "Camera allowed. Waiting for video…", "granted");
      let firstFramesArrived = false;
      let firstFrameTimer: ReturnType<typeof setTimeout> | null = null;
      const refresh = () => {
        if (!current()) return;
        if (this.hasLiveTrack() && video.readyState >= 2 && video.videoWidth > 0 && !video.paused) {
          firstFramesArrived = true;
          if (firstFrameTimer) this.clearTimer(firstFrameTimer);
          this.lastFrameTime = video.currentTime;
          this.lastProgressAt = Date.now();
          this.publish("live", "Camera is live", "granted");
        }
      };
      for (const name of ["loadeddata", "canplay", "playing"]) this.listen(video, name, refresh);
      this.listen(video, "pause", () => { if (current() && this.snapshot.status === "live") this.publish("playback-blocked", "The camera preview is paused. Select Resume camera to continue."); });
      this.listen(video, "waiting", () => { if (current() && this.snapshot.status === "live") this.publish("starting", "Waiting for camera video…"); });
      this.listen(video, "error", () => { if (current()) this.fail("The camera video could not be played. Retry the camera."); });
      for (const track of tracks) {
        this.listen(track, "ended", () => { if (current()) this.fail("The camera disconnected or permission was removed. Check access, then retry."); });
        this.listen(track, "mute", () => { if (current()) this.publish("starting", "The camera signal is interrupted. Waiting for video…"); });
        this.listen(track, "unmute", refresh);
      }
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      firstFrameTimer = this.later(() => {
        if (current() && !firstFramesArrived && this.snapshot.status === "starting") this.fail("The camera did not produce video frames. Close other camera apps, then retry.");
      }, this.options.frameTimeoutMs ?? CAMERA_FRAME_TIMEOUT_MS);
      const monitor = () => {
        if (!current()) return;
        if (tracks.every(track => track.readyState !== "live")) { this.fail("The camera stopped. Check access, then retry."); return; }
        if (!this.hasLiveTrack()) {
          if (this.snapshot.status === "live") this.publish("starting", "The camera signal is interrupted. Waiting for video…");
        } else if (video.currentTime !== this.lastFrameTime && video.readyState >= 2 && !video.paused) {
          this.lastFrameTime = video.currentTime;
          this.lastProgressAt = Date.now();
          if (this.snapshot.status === "starting") refresh();
        }
        if (this.lastProgressAt && Date.now() - this.lastProgressAt > (this.options.frameTimeoutMs ?? CAMERA_FRAME_TIMEOUT_MS) && this.snapshot.status !== "playback-blocked") {
          this.fail("Camera video has stalled. Retry the camera."); return;
        }
        this.later(monitor, this.options.monitorMs ?? 500);
      };
      this.lastProgressAt = Date.now();
      this.lastFrameTime = video.currentTime;
      monitor();
      try {
        await video.play();
        if (!current()) return;
        refresh();
      } catch {
        if (current()) this.publish("playback-blocked", "Camera allowed, but preview playback was blocked. Select Resume camera to continue.", "granted");
      }
    } catch (error) {
      if (current()) this.fail(cameraErrorMessage(error), error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : this.snapshot.permission);
    }
  }

  // Called directly by a click, preserving the browser's user activation.
  resumePlayback = () => {
    const video = this.video;
    if (!video || !this.active || !this.wanted) return;
    const epoch = this.epoch;
    this.lastProgressAt = Date.now();
    this.publish("starting", "Starting camera preview…");
    void video.play().then(() => {
      if (epoch !== this.epoch) return;
      if (this.hasLiveTrack() && video.readyState >= 2 && video.videoWidth > 0 && !video.paused) {
        this.lastProgressAt = Date.now();
        this.publish("live", "Camera is live", "granted");
      }
    }).catch(() => {
      if (epoch === this.epoch) this.publish("playback-blocked", "Playback is still blocked. Allow camera playback in your browser, then select Resume camera.");
    });
  };
}
