export type MusicPlaybackStatus = "idle" | "loading" | "ready" | "playing" | "paused" | "buffering" | "blocked" | "error";

export interface MusicPlaybackUpdate {
  isPlaying?: boolean;
  playbackRequested?: boolean;
  currentTime?: number;
  duration?: number;
  durationLoaded?: boolean;
  status?: MusicPlaybackStatus;
  error?: string | null;
}

export interface MusicController {
  togglePlay: () => void;
  loadTrack: (index: number, autoplay: boolean) => void;
  restart: (autoplay?: boolean) => void;
  setVolume: (volume: number) => void;
  seek: (seconds: number) => void;
  retry: () => void;
  wantsPlayback: () => boolean;
  dispose: () => void;
}

interface PlaybackClock {
  setTimeout: (callback: () => void, milliseconds: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}

interface PlaybackOptions {
  audio: HTMLAudioElement;
  tracks: readonly { src: string }[];
  initialIndex?: number;
  initialTime?: number;
  initialVolume?: number;
  onState: (update: MusicPlaybackUpdate) => void;
  onEnded: () => void;
  clock?: PlaybackClock;
  waitTimeoutMs?: number;
}

/** Native streaming playback: one media element, one selected source, no decoded library. */
export function createMusicPlaybackController({
  audio, tracks, initialIndex = 0, initialTime = 0, initialVolume = 0.68,
  onState, onEnded, clock = {
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  }, waitTimeoutMs = 12000,
}: PlaybackOptions): MusicController {
  let disposed = false;
  let index = initialIndex;
  let source: string | null = null;
  let revision = 0;
  let playAttempt = 0;
  let wantsPlay = false;
  let hasMetadata = false;
  let mediaDuration = 0;
  let resumeTime = Number.isFinite(initialTime) ? Math.max(0, initialTime) : 0;
  let pendingSeek: number | null = null;
  let status: MusicPlaybackStatus = "idle";
  let timeout: unknown;
  let endedRevision = -1;

  audio.preload = "none";
  audio.volume = Math.min(1, Math.max(0, initialVolume));

  function publish(update: MusicPlaybackUpdate) {
    if (disposed) return;
    if (update.status) status = update.status;
    onState(update);
  }

  function clearWait() {
    if (timeout !== undefined) clock.clearTimeout(timeout);
    timeout = undefined;
  }

  function normalizedUrl(url: string) {
    try { return new URL(url, audio.ownerDocument?.baseURI ?? "http://localhost/").href; }
    catch { return url; }
  }

  function isCurrentSource() {
    if (disposed || !source || normalizedUrl(audio.src) !== normalizedUrl(source)) return false;
    return !audio.currentSrc || normalizedUrl(audio.currentSrc) === normalizedUrl(source);
  }

  function playbackPosition() {
    // Before metadata (or after releasing a failed source), the native element
    // still reports zero. Preserve an unapplied seek / saved resume position.
    if (pendingSeek !== null) return pendingSeek;
    if (source && hasMetadata && Number.isFinite(audio.currentTime)) return audio.currentTime;
    return resumeTime;
  }

  function fail(message: string, blocked = false) {
    wantsPlay = false;
    playAttempt += 1;
    clearWait();
    // Set status before pause, so its synchronous event cannot hide the error.
    status = blocked ? "blocked" : "error";
    audio.pause();
    publish({ isPlaying: false, playbackRequested: false, status, error: message });
  }

  function waitForMedia() {
    // Repeated stalled/waiting events must not keep extending a hung request.
    if (timeout !== undefined) return;
    const waitingRevision = revision;
    timeout = clock.setTimeout(() => {
      if (disposed || waitingRevision !== revision) return;
      fail("The track is taking too long to load. Check your connection and try again.");
      // Abort a stalled request, retaining the chosen track and playback position.
      resumeTime = playbackPosition();
      source = null;
      audio.removeAttribute("src");
      audio.load();
    }, waitTimeoutMs);
  }

  function updateMetadata() {
    if (!isCurrentSource() || audio.readyState < 1) return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    hasMetadata = true;
    mediaDuration = audio.duration;
    publish({ duration: mediaDuration, durationLoaded: true });
    if (pendingSeek !== null) {
      const nextTime = Math.min(mediaDuration, Math.max(0, pendingSeek));
      pendingSeek = null;
      try {
        audio.currentTime = nextTime;
        publish({ currentTime: nextTime });
      } catch {
        fail("This browser could not seek in the track. Try playing it again.");
        return;
      }
    }
    if (!wantsPlay && status !== "error" && status !== "blocked") {
      clearWait();
      publish({ status: audio.currentTime > 0 ? "paused" : "ready", error: null });
    }
  }

  function requestPlay() {
    if (disposed) return;
    if (!source) {
      load(index, true, resumeTime);
      return;
    }
    wantsPlay = true;
    const requestedRevision = revision;
    const attempt = ++playAttempt;
    publish({ status: "loading", isPlaying: false, playbackRequested: true, error: null });
    waitForMedia();
    // Keep play() in the original user event stack. Awaiting metadata first can
    // discard Safari's transient user activation and turn Play into an autoplay.
    let result: Promise<void>;
    try { result = audio.play(); }
    catch (error) { handlePlayFailure(error, requestedRevision, attempt); return; }
    Promise.resolve(result).then(() => {
      if (disposed || requestedRevision !== revision || attempt !== playAttempt) return;
      if (!wantsPlay) { audio.pause(); return; }
      if (!audio.paused && audio.readyState >= 2) playing();
    }).catch((error: unknown) => handlePlayFailure(error, requestedRevision, attempt));
  }

  function handlePlayFailure(error: unknown, requestedRevision: number, attempt: number) {
    if (disposed || requestedRevision !== revision || attempt !== playAttempt || !wantsPlay) return;
    const name = error && typeof error === "object" && "name" in error ? error.name : "";
    if (name === "NotAllowedError") fail("Your browser paused playback. Press Play to start the music.", true);
    else if (name === "NotSupportedError") fail("This browser could not play the audio file. Try another track or browser.");
    else fail("The track could not start. Check your connection and try again.");
  }

  function pause() {
    resumeTime = playbackPosition();
    wantsPlay = false;
    playAttempt += 1;
    clearWait();
    audio.pause();
    publish({ isPlaying: false, playbackRequested: false, currentTime: resumeTime, status: source ? "paused" : "idle", error: null });
  }

  function load(nextIndex: number, autoplay: boolean, startTime = 0) {
    if (disposed || !tracks[nextIndex]) return;
    revision += 1;
    playAttempt += 1;
    wantsPlay = false;
    clearWait();
    audio.pause();
    index = nextIndex;
    source = tracks[index].src;
    hasMetadata = false;
    mediaDuration = 0;
    resumeTime = Math.max(0, startTime);
    pendingSeek = resumeTime > 0 ? resumeTime : null;
    publish({ isPlaying: false, playbackRequested: false, currentTime: resumeTime, duration: 0, durationLoaded: false, status: "loading", error: null });
    if (audio.canPlayType && !audio.canPlayType("audio/mpeg")) {
      fail("This browser does not support MP3 audio. Try another browser.");
      source = null;
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    audio.preload = "metadata";
    audio.src = source;
    audio.load();
    waitForMedia();
    if (autoplay) requestPlay();
  }

  function playing() {
    if (!isCurrentSource()) return;
    if (!wantsPlay) { audio.pause(); return; }
    if (audio.paused || audio.readyState < 2) return;
    updateMetadata();
    if (status === "error") return;
    clearWait();
    publish({ isPlaying: true, status: "playing", error: null });
  }

  function buffering() {
    if (!isCurrentSource() || !wantsPlay) return;
    publish({ isPlaying: false, status: "buffering" });
    waitForMedia();
  }

  const handlers: Record<string, EventListener> = {
    loadedmetadata: updateMetadata,
    durationchange: updateMetadata,
    canplay: updateMetadata,
    playing,
    play: () => { if (!wantsPlay && !disposed) audio.pause(); },
    pause: () => {
      if (!isCurrentSource() || wantsPlay || status === "error" || status === "blocked") return;
      publish({ isPlaying: false, status: "paused" });
    },
    waiting: buffering,
    // A stopped network request is not itself interrupted playback: the media
    // may still have ample buffered data. `waiting` signals actual starvation.
    stalled: () => { if (audio.readyState < 3) buffering(); },
    timeupdate: () => {
      if (!isCurrentSource() || !hasMetadata || !Number.isFinite(audio.currentTime)) return;
      resumeTime = Math.max(0, Math.min(mediaDuration, audio.currentTime));
      publish({ currentTime: resumeTime });
    },
    ended: () => {
      if (!isCurrentSource() || !wantsPlay || !hasMetadata || !audio.ended || audio.currentTime < mediaDuration - 0.05 || endedRevision === revision) return;
      endedRevision = revision;
      wantsPlay = false;
      clearWait();
      publish({ isPlaying: false, playbackRequested: false, currentTime: mediaDuration, status: "paused" });
      onEnded();
    },
    error: () => {
      // Loading a replacement clears MediaError. Ignore an old queued error task.
      if (!isCurrentSource() || !audio.error) return;
      const code = audio.error?.code;
      if (code === 3) fail("The audio file could not be decoded. Try another track or retry playback.");
      else if (code === 4) fail("This audio file is unavailable or unsupported. Try another track or retry playback.");
      else fail("The audio could not be loaded. Check your connection and try again.");
    },
  };
  for (const [event, handler] of Object.entries(handlers)) audio.addEventListener(event, handler);

  return {
    togglePlay: () => { if (wantsPlay) pause(); else requestPlay(); },
    loadTrack: (nextIndex, autoplay) => load(nextIndex, autoplay),
    restart: (autoplay = true) => load(index, autoplay),
    setVolume: (volume) => { if (!disposed && Number.isFinite(volume)) audio.volume = Math.min(1, Math.max(0, volume)); },
    seek: (seconds) => {
      if (disposed || !Number.isFinite(seconds)) return;
      const nextTime = Math.max(0, seconds);
      if (!source) { load(index, false, nextTime); return; }
      if (!hasMetadata) { pendingSeek = nextTime; return; }
      try {
        audio.currentTime = Math.min(mediaDuration, nextTime);
        resumeTime = audio.currentTime;
        publish({ currentTime: resumeTime });
      } catch { fail("This browser could not seek in the track. Try playing it again."); }
    },
    retry: () => load(index, true, playbackPosition()),
    wantsPlayback: () => !disposed && wantsPlay,
    dispose: () => {
      if (disposed) return;
      // Capture the last partial second before releasing the selected resource.
      publish({ isPlaying: false, playbackRequested: false, currentTime: playbackPosition(), status: "idle", error: null });
      disposed = true;
      revision += 1;
      playAttempt += 1;
      wantsPlay = false;
      clearWait();
      for (const [event, handler] of Object.entries(handlers)) audio.removeEventListener(event, handler);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      source = null;
    },
  };
}
