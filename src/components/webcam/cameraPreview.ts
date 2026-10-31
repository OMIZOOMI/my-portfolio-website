import { createVideoFrameScheduler } from "./videoFrameScheduler";

export function cameraCoverCrop(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const sw = width / scale, sh = height / scale;
  return { sx: (sourceWidth - sw) / 2, sy: (sourceHeight - sh) / 2, sw, sh };
}

/** Paint camera pixels into an ordinary 2D layer. Native video compositing can
 * disappear under the laptop's CSS perspective projection in WebKit. The same
 * mounted video remains the capture/inference source; this owns no media tracks. */
export function startCameraPreview(video: HTMLVideoElement, canvas: HTMLCanvasElement, ready: () => void, failed: () => void) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) { failed(); return () => {}; }
  let disposed = false, reported = false;
  // A live track is not proof that the browser is delivering drawable frames.
  const deadline = globalThis.setTimeout(() => {
    if (!disposed && !reported) { scheduler.stop(); failed(); }
  }, 8000);
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    const scale = Math.min(globalThis.devicePixelRatio || 1, 1.5, 960 / width, 540 / height);
    const nextWidth = Math.max(1, Math.round(width * scale)), nextHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
  };
  const scheduler = createVideoFrameScheduler(() => video, async () => {
    if (disposed || !video.videoWidth || !video.videoHeight) return;
    try {
      const crop = cameraCoverCrop(video.videoWidth, video.videoHeight, canvas.width, canvas.height);
      // Mirror exactly once. Inference still receives the original video.
      context.setTransform(-1, 0, 0, 1, canvas.width, 0);
      context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
      if (!reported) { reported = true; globalThis.clearTimeout(deadline); ready(); }
    } catch {
      scheduler.stop();
      globalThis.clearTimeout(deadline);
      if (!disposed) failed();
    }
  }, { maxFps: 30 });
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  scheduler.start();
  return () => { disposed = true; globalThis.clearTimeout(deadline); scheduler.stop(); observer.disconnect(); canvas.width = 0; canvas.height = 0; };
}
