export const MAX_GESTURE_FPS = 10;
const VIDEO_CALLBACK_DEADLINE_MS = 350;

/** One callback/one inference at a time. Never process the same video frame twice. */
export function createVideoFrameScheduler(
  getVideo: () => HTMLVideoElement | null,
  processFrame: (now: number) => Promise<void>,
  options: { maxFps?: number; isVisible?: () => boolean } = {},
) {
  const interval = 1000 / Math.max(1, Math.min(30, options.maxFps ?? MAX_GESTURE_FPS));
  let stopped = true, processing = false, animationFallback = false, ticket = 0;
  let pending: { video: HTMLVideoElement; id: number; ticket: number } | null = null;
  let raf: number | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let lastMediaTime = -1;
  let lastInferenceAt = -Infinity;
  let lastNativeTime = -1, lastNativeProgressAt = -1;

  function clearWatchdog() {
    if (watchdog !== null) globalThis.clearTimeout(watchdog);
    watchdog = null;
  }
  function cancelVideoCallback() {
    clearWatchdog();
    const owned = pending;
    pending = null;
    if (owned) { try { owned.video.cancelVideoFrameCallback(owned.id); } catch {} }
  }
  function switchToAnimationFrames() {
    cancelVideoCallback();
    animationFallback = true;
    schedule();
  }

  function schedule() {
    if (stopped || processing || pending || raf !== null) return;
    const video = getVideo();
    if (!animationFallback && video && typeof video.requestVideoFrameCallback === "function" && typeof video.cancelVideoFrameCallback === "function") {
      const ownedTicket = ++ticket;
      try {
        const id = video.requestVideoFrameCallback((now, metadata) => {
          // Cancellation does not guarantee an already queued native callback
          // disappears. It must not compete with the fallback or a new session.
          if (pending?.ticket !== ownedTicket || stopped) return;
          pending = null;
          clearWatchdog();
          if (metadata.mediaTime !== lastNativeTime) {
            lastNativeTime = metadata.mediaTime; lastNativeProgressAt = now;
          } else if (now - lastNativeProgressAt >= VIDEO_CALLBACK_DEADLINE_MS && video.currentTime !== lastMediaTime) {
            animationFallback = true;
          }
          void frame(now, animationFallback ? video.currentTime : metadata.mediaTime);
        });
        pending = { video, id, ticket: ownedTicket };
        // WebKit can expose the API but stop compositor callbacks for a covered
        // video. Keep one fallback loop, still gated by advancing media time.
        watchdog = globalThis.setTimeout(() => {
          if (!stopped && pending?.ticket === ownedTicket) switchToAnimationFrames();
        }, VIDEO_CALLBACK_DEADLINE_MS);
      } catch { switchToAnimationFrames(); }
    } else {
      const ownedTicket = ++ticket;
      raf = requestAnimationFrame(now => {
        if (ownedTicket !== ticket || stopped) return;
        raf = null;
        void frame(now, getVideo()?.currentTime ?? -1);
      });
    }
  }

  async function frame(now: number, mediaTime: number) {
    if (stopped) return;
    const video = getVideo();
    if ((options.isVisible?.() ?? document.visibilityState !== "hidden") && video &&
        !video.paused && !video.ended && video.readyState >= 2 && video.videoWidth > 0 &&
        mediaTime !== lastMediaTime && now - lastInferenceAt >= interval - 1) {
      lastMediaTime = mediaTime;
      lastInferenceAt = now;
      processing = true;
      // Await fallback/recovery too, so a second loop cannot race a replacement.
      try { await processFrame(now); }
      finally { processing = false; schedule(); }
    } else schedule();
  }

  return {
    start() {
      if (stopped) {
        stopped = false; animationFallback = false;
        lastMediaTime = lastNativeTime = lastNativeProgressAt = -1;
        lastInferenceAt = -Infinity;
        schedule();
      }
    },
    stop() {
      stopped = true;
      ticket++;
      cancelVideoCallback();
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    },
  };
}
