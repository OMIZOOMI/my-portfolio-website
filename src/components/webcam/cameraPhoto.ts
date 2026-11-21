import { getCameraPreviewFrame, hasLiveCameraSource } from "./cameraPreview";

export const PHOTO_TIMEOUT_MS = 5000;
const MAX_PHOTO_PIXELS = 960 * 540;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export interface CameraPhoto {
  url: string;
  width: number;
  height: number;
  filename: string;
}
export interface CameraPhotoSnapshot {
  status: "idle" | "capturing" | "ready" | "error";
  photo: CameraPhoto | null;
  message: string | null;
  downloadRequested: boolean;
}
const EMPTY: CameraPhotoSnapshot = { status: "idle", photo: null, message: null, downloadRequested: false };
interface PhotoResources {
  createURL: (blob: Blob) => string;
  revokeURL: (url: string) => void;
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
  now: () => number;
}
const browserResources: PhotoResources = {
  createURL: blob => URL.createObjectURL(blob), revokeURL: url => URL.revokeObjectURL(url),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: timer => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>), now: () => Date.now(),
};

/** One bounded, memory-only photo. No stream, drawing context, loop or storage. */
export class CameraPhotoCapture {
  private snapshot = EMPTY;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private timer: unknown;
  private pending: { epoch: number; video: HTMLVideoElement; source: HTMLVideoElement["srcObject"] } | null = null;
  constructor(private resources: PhotoResources = browserResources) {}
  getSnapshot = () => this.snapshot;
  subscribe = (notify: () => void) => { this.listeners.add(notify); return () => { this.listeners.delete(notify); }; };
  private publish(snapshot: CameraPhotoSnapshot) {
    if (this.snapshot === snapshot) return;
    this.snapshot = snapshot;
    this.listeners.forEach(notify => notify());
  }
  private stopTimer() {
    if (this.timer !== undefined) this.resources.clearTimeout(this.timer);
    this.timer = undefined;
  }
  reset = () => {
    this.epoch++; this.stopTimer(); this.pending = null;
    if (this.snapshot.photo) {
      try { this.resources.revokeURL(this.snapshot.photo.url); } catch { /* Dropping our reference still clears the review. */ }
    }
    this.publish(EMPTY);
  };
  cancelPending = () => { if (this.snapshot.status === "capturing") this.reset(); };
  private fail(message: string) {
    this.reset(); this.publish({ ...EMPTY, status: "error", message });
  }
  capture = (video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null): boolean => {
    if (this.snapshot.status === "capturing" || this.snapshot.photo) return false;
    this.reset();
    const frame = video && canvas ? getCameraPreviewFrame(video, canvas, this.resources.now()) : null;
    if (!video || !canvas || !frame || frame.width * frame.height > MAX_PHOTO_PIXELS) {
      this.fail("A live camera frame isn’t ready. Wait a moment and try again."); return false;
    }
    const epoch = ++this.epoch;
    this.pending = { epoch, video, source: video.srcObject };
    this.publish({ ...EMPTY, status: "capturing", message: "Preparing your photo…" });
    this.timer = this.resources.setTimeout(() => {
      if (epoch === this.epoch) this.fail("Preparing the photo took too long. Try again.");
    }, PHOTO_TIMEOUT_MS);
    try {
      // toBlob snapshots this existing bitmap at invocation. Live painting and
      // inference continue; CSS gesture effects are deliberately not included.
      canvas.toBlob(blob => {
        const pending = this.pending;
        if (!pending || epoch !== this.epoch || pending.epoch !== epoch) return;
        this.stopTimer();
        if (pending.video.srcObject !== pending.source || !hasLiveCameraSource(pending.video)) {
          this.fail("The camera changed before the photo was ready. Try again when the preview is live."); return;
        }
        this.pending = null;
        if (!blob || blob.type !== "image/png" || blob.size > MAX_PHOTO_BYTES) {
          this.fail("The photo could not be prepared. Try again."); return;
        }
        try {
          const url = this.resources.createURL(blob);
          this.publish({ status: "ready", photo: { url, ...frame, filename: `om-camera-photo-${this.resources.now()}.png` },
            message: "Photo ready. Camera frame only; gesture effects aren’t included.", downloadRequested: false });
        } catch { this.fail("This browser could not prepare a photo preview. Try again."); }
      }, "image/png");
    } catch { this.fail("This browser could not capture the camera frame. Try again."); }
    return true;
  };
  previewFailed = (url: string) => {
    if (this.snapshot.photo?.url === url) this.fail("The photo preview could not be displayed. Retake the photo.");
  };
  requestDownload = (url: string) => {
    if (this.snapshot.photo?.url !== url) return;
    this.publish({ ...this.snapshot, downloadRequested: true,
      message: "Download requested. If your browser blocks it, open the photo and use its save option." });
  };
}
