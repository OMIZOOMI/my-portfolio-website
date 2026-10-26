"use client";

import { create } from "zustand";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  accent: string;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: "coding-lo-fi",
    title: "Coding Lo-Fi",
    artist: "Portfolio Radio",
    album: "Late Night Builds",
    durationSeconds: 12,
    accent: "#bf5af2",
  },
  {
    id: "deep-focus",
    title: "Deep Focus",
    artist: "Portfolio Radio",
    album: "Deep Focus",
    durationSeconds: 14,
    accent: "#0a84ff",
  },
  {
    id: "midnight-merge",
    title: "Midnight Merge",
    artist: "Portfolio Radio",
    album: "Late Night Builds",
    durationSeconds: 16,
    accent: "#30d158",
  },
  {
    id: "ship-it-slow",
    title: "Ship It Slow",
    artist: "Portfolio Radio",
    album: "Coding Lo-Fi",
    durationSeconds: 13,
    accent: "#ff9f0a",
  },
];

interface MusicController {
  togglePlay: () => void;
  loadTrack: (index: number, autoplay: boolean) => void;
  restart: () => void;
  setVolume: (volume: number) => void;
}

interface MusicStoreState {
  currentTrackIndex: number;
  isPlaying: boolean;
  isShuffle: boolean;
  isRepeat: boolean;
  sidebarVisible: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  controller: MusicController | null;
  registerController: (controller: MusicController) => () => void;
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  togglePlay: () => void;
  selectTrack: (index: number, autoplay?: boolean) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleSidebar: () => void;
}

function normalizeTrackIndex(index: number): number {
  return ((index % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
}

export const useMusicStore = create<MusicStoreState>((set, get) => ({
  currentTrackIndex: 0,
  isPlaying: false,
  isShuffle: false,
  isRepeat: false,
  sidebarVisible: true,
  currentTime: 0,
  duration: MUSIC_TRACKS[0].durationSeconds,
  volume: 0.68,
  controller: null,

  registerController: (controller) => {
    set({ controller });
    return () => {
      set((state) => (state.controller === controller ? { controller: null } : state));
    };
  },

  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => {
    const nextVolume = Math.max(0, Math.min(1, volume));
    set({ volume: nextVolume });
    get().controller?.setVolume(nextVolume);
  },

  togglePlay: () => {
    const controller = get().controller;
    if (controller) controller.togglePlay();
    else set((state) => ({ isPlaying: !state.isPlaying }));
  },

  selectTrack: (index, autoplay = false) => {
    const nextIndex = normalizeTrackIndex(index);
    set({ currentTrackIndex: nextIndex, currentTime: 0, duration: MUSIC_TRACKS[nextIndex].durationSeconds });
    get().controller?.loadTrack(nextIndex, autoplay);
  },

  nextTrack: () => {
    const state = get();
    const nextIndex = state.isShuffle
      ? normalizeTrackIndex(Math.floor(Math.random() * MUSIC_TRACKS.length))
      : normalizeTrackIndex(state.currentTrackIndex + 1);
    set({ currentTrackIndex: nextIndex, currentTime: 0, duration: MUSIC_TRACKS[nextIndex].durationSeconds });
    state.controller?.loadTrack(nextIndex, true);
  },

  previousTrack: () => {
    const state = get();
    const previousIndex = normalizeTrackIndex(state.currentTrackIndex - 1);
    set({ currentTrackIndex: previousIndex, currentTime: 0, duration: MUSIC_TRACKS[previousIndex].durationSeconds });
    state.controller?.loadTrack(previousIndex, true);
  },

  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
  toggleRepeat: () => set((state) => ({ isRepeat: !state.isRepeat })),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
}));
