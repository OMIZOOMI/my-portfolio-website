"use client";

import { create } from "zustand";
import { MUSIC_TRACKS } from "../../data/music";
import {
  createMusicPlaybackController,
  type MusicController,
  type MusicPlaybackUpdate,
  type MusicPlaybackStatus,
} from "./musicPlayback";

export { MUSIC_TRACKS } from "../../data/music";
export type { MusicTrack } from "../../data/music";

interface MusicStoreState {
  currentTrackIndex: number;
  isPlaying: boolean;
  playbackRequested: boolean;
  isShuffle: boolean;
  isRepeat: boolean;
  sidebarVisible: boolean;
  currentTime: number;
  /** The browser's media metadata, never a fabricated playback duration. */
  duration: number;
  durationLoaded: boolean;
  trackDurations: Record<string, number>;
  status: MusicPlaybackStatus;
  error: string | null;
  volume: number;
  controller: MusicController | null;
  history: number[];
  queue: number[];
  playQueue: (indices: number[], startIndex: number) => void;
  registerController: (controller: MusicController) => () => void;
  setVolume: (volume: number) => void;
  togglePlay: () => void;
  selectTrack: (index: number, autoplay?: boolean) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  handleEnded: () => void;
  seek: (seconds: number) => void;
  retry: () => void;
  stop: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleSidebar: () => void;
}

function normalizeTrackIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return ((Math.trunc(index) % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
}

/** Exclude the current track, including when Math.random happens to return zero. */
function nextIndex(index: number, shuffle: boolean, queue: number[]): number {
  const pool = queue.length ? queue : MUSIC_TRACKS.map((_, i) => i);
  const position = Math.max(0, pool.indexOf(index));
  const offset = shuffle && pool.length > 1 ? 1 + Math.min(pool.length - 2, Math.floor(Math.random() * (pool.length - 1))) : 1;
  return pool[(position + offset) % pool.length];
}

export const useMusicStore = create<MusicStoreState>((set, get) => ({
  currentTrackIndex: 0,
  isPlaying: false,
  playbackRequested: false,
  isShuffle: false,
  isRepeat: false,
  sidebarVisible: true,
  currentTime: 0,
  duration: 0,
  durationLoaded: false,
  trackDurations: {},
  status: "idle",
  error: null,
  volume: 0.68,
  controller: null,
  history: [],
  queue: MUSIC_TRACKS.map((_, index) => index),
  playQueue: (indices, startIndex) => {
    const queue = [...new Set(indices.filter(index => Number.isInteger(index) && index >= 0 && index < MUSIC_TRACKS.length))];
    if (!queue.length || !queue.includes(startIndex)) return;
    const old = get().queue;
    const changed = queue.length !== old.length || queue.some((index, i) => index !== old[i]);
    set({ queue });
    get().selectTrack(startIndex, true);
    if (changed) set({ history: [] });
  },

  registerController: (controller) => {
    // Strict Mode remounts and a second Music window must never leave two players.
    get().controller?.dispose();
    set({ controller, isPlaying: false, playbackRequested: false, status: "idle", error: null });
    return () => {
      if (get().controller !== controller) return;
      controller.dispose();
      set({ controller: null, isPlaying: false, playbackRequested: false, status: "idle", error: null });
    };
  },

  setVolume: (volume) => {
    if (!Number.isFinite(volume)) return;
    const nextVolume = Math.max(0, Math.min(1, volume));
    set({ volume: nextVolume });
    get().controller?.setVolume(nextVolume);
  },

  togglePlay: () => get().controller?.togglePlay(),

  selectTrack: (index, autoplay = false) => {
    const state = get();
    const indexToLoad = normalizeTrackIndex(index);
    set({
      currentTrackIndex: indexToLoad,
      currentTime: 0,
      duration: 0,
      durationLoaded: false,
      isPlaying: false,
      playbackRequested: false,
      status: state.controller ? "loading" : "idle",
      error: null,
      queue: state.queue.includes(indexToLoad) ? state.queue : MUSIC_TRACKS.map((_, i) => i),
      history: indexToLoad === state.currentTrackIndex ? state.history : [...state.history, state.currentTrackIndex].slice(-50),
    });
    state.controller?.loadTrack(indexToLoad, autoplay);
  },

  nextTrack: () => {
    const state = get();
    // A paused playlist stays paused. A pending Play/Buffering request is intent.
    const autoplay = state.controller?.wantsPlayback() ?? false;
    state.selectTrack(nextIndex(state.currentTrackIndex, state.isShuffle, state.queue), autoplay);
  },

  previousTrack: () => {
    const state = get();
    const autoplay = state.controller?.wantsPlayback() ?? false;
    const validHistory = state.history.filter(index => state.queue.includes(index));
    const prior = validHistory.at(-1);
    const indexToLoad = prior ?? state.queue[(state.queue.indexOf(state.currentTrackIndex) - 1 + state.queue.length) % state.queue.length];
    state.selectTrack(indexToLoad, autoplay);
    // Previous walks the actual shuffle/selection history rather than adding a loop.
    set({ history: validHistory.slice(0, -1) });
  },

  handleEnded: () => {
    const state = get();
    if (!state.controller) return;
    if (state.isRepeat) state.controller.restart(true);
    else state.selectTrack(nextIndex(state.currentTrackIndex, state.isShuffle, state.queue), true);
  },

  seek: (seconds) => get().controller?.seek(seconds),
  retry: () => get().controller?.retry(),
  stop: () => {
    get().controller?.dispose();
    set({ controller: null, isPlaying: false, playbackRequested: false, status: "idle", error: null });
  },
  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
  toggleRepeat: () => set((state) => ({ isRepeat: !state.isRepeat })),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
}));

/**
 * Called by MusicApp's mount effect. Merely opening Music does not assign a src
 * or request audio. Minimize leaves the component mounted; close runs cleanup.
 */
export function mountMusicPlayer(audio: HTMLAudioElement): () => void {
  const initial = useMusicStore.getState();
  const controller: MusicController = createMusicPlaybackController({
    audio,
    tracks: MUSIC_TRACKS,
    initialIndex: initial.currentTrackIndex,
    initialTime: initial.currentTime,
    initialVolume: initial.volume,
    onState: (update: MusicPlaybackUpdate) => {
      if (useMusicStore.getState().controller !== controller) return;
      useMusicStore.setState((state) => {
        const patch: Partial<MusicStoreState> = { ...update };
        if (update.durationLoaded && update.duration && update.duration > 0) {
          const track = MUSIC_TRACKS[state.currentTrackIndex];
          patch.trackDurations = { ...state.trackDurations, [track.id]: update.duration };
        }
        return patch;
      });
    },
    onEnded: () => useMusicStore.getState().handleEnded(),
  });
  return useMusicStore.getState().registerController(controller);
}
