"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ListMusic,
  Music2,
  Pause,
  Play,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Search,
  ChevronRight,
} from "lucide-react";
import { MUSIC_TRACKS, mountMusicPlayer, useMusicStore, type MusicTrack } from "./useMusicStore";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import styles from "./MusicApp.module.css";
import { MUSIC_PLAYLISTS, musicTracksForView, type MusicView } from "../../data/music";

type PlaylistId = MusicView;

const PLAYLISTS: { id: PlaylistId; label: string }[] = [
  { id: "listen", label: "Listen Now" },
  { id: "browse", label: "Browse" },
  ...MUSIC_PLAYLISTS,
];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function TrackRow({
  track,
  index,
  isActive,
  isPlaying,
  onSelect,
}: {
  track: MusicTrack;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" data-music-track={track.id} aria-current={isActive ? "true" : undefined} onClick={onSelect} className={`${styles.trackRow} grid w-full grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.7fr)_4rem] items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition ${isActive ? "bg-[var(--system-accent)]/10 text-gray-900 dark:text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}>
      <span className="text-center text-gray-400">{isActive && isPlaying ? <span className="inline-flex items-end gap-0.5" aria-label="Playing"><i className="h-3 w-0.5 animate-pulse bg-[var(--system-accent)]" /><i className="h-2 w-0.5 animate-pulse bg-[var(--system-accent)] [animation-delay:120ms]" /><i className="h-4 w-0.5 animate-pulse bg-[var(--system-accent)] [animation-delay:240ms]" /></span> : index + 1}</span>
      <span className="truncate font-semibold">{track.title}</span>
      <span className="truncate text-gray-400">{track.artist}</span>
      <span className="text-right text-gray-400">{formatTime(track.durationSeconds)}</span>
    </button>
  );
}

export function MusicApp({ window: win }: { window: { id: string; title: string } }) {
  const reduceMotion = useSystemStore((state) => state.reduceMotion);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activePlaylist, setActivePlaylist] = useState<PlaylistId>("listen");
  const [creditsVisible, setCreditsVisible] = useState(false);
  const [query, setQuery] = useState("");

  const currentTrackIndex = useMusicStore((state) => state.currentTrackIndex);
  const isPlaying = useMusicStore((state) => state.isPlaying);
  const playbackRequested = useMusicStore((state) => state.playbackRequested);
  const isShuffle = useMusicStore((state) => state.isShuffle);
  const isRepeat = useMusicStore((state) => state.isRepeat);
  const currentTime = useMusicStore((state) => state.currentTime);
  const duration = useMusicStore((state) => state.duration);
  const volume = useMusicStore((state) => state.volume);
  const sidebarVisible = useMusicStore((state) => state.sidebarVisible);
  const status = useMusicStore((state) => state.status);
  const audioError = useMusicStore((state) => state.error);
  const durationLoaded = useMusicStore((state) => state.durationLoaded);
  const seek = useMusicStore((state) => state.seek);
  const retry = useMusicStore((state) => state.retry);
  const setVolume = useMusicStore((state) => state.setVolume);
  const playQueue = useMusicStore((state) => state.playQueue);
  const nextTrack = useMusicStore((state) => state.nextTrack);
  const previousTrack = useMusicStore((state) => state.previousTrack);
  const toggleShuffle = useMusicStore((state) => state.toggleShuffle);
  const toggleRepeat = useMusicStore((state) => state.toggleRepeat);

  const currentTrack = MUSIC_TRACKS[currentTrackIndex] ?? MUSIC_TRACKS[0];
  const showPause = isPlaying || playbackRequested;

  useEffect(() => {
    if (audioRef.current) return mountMusicPlayer(audioRef.current);
  }, []);

  useEffect(() => useWindowStore.subscribe((state, previous) => {
    // Menu commands remove a window before AnimatePresence finishes its exit.
    if (previous.windows[win.id] && !state.windows[win.id]) useMusicStore.getState().stop();
  }), [win.id]);

  const visibleTracks = useMemo(() => musicTracksForView(activePlaylist, activePlaylist === "browse" ? query : ""), [activePlaylist, query]);
  const selectFromView = (track: MusicTrack) => {
    const collection = activePlaylist === "browse" ? MUSIC_TRACKS : visibleTracks;
    playQueue(collection.map(item => MUSIC_TRACKS.indexOf(item)), MUSIC_TRACKS.indexOf(track));
  };

  const playlistTitle = PLAYLISTS.find((playlist) => playlist.id === activePlaylist)?.label ?? "Listen Now";
  const playlistDescription = activePlaylist === "listen" ? "Four favorites, picked for the moment."
    : activePlaylist === "browse" ? "Nine complete instrumentals. Find your next favorite."
    : MUSIC_PLAYLISTS.find(playlist => playlist.id === activePlaylist)?.description;
  // Before playback, the catalog contains the measured file length. Once media
  // metadata arrives, the browser is the source of truth for playback and seeking.
  const displayDuration = durationLoaded ? duration : currentTrack.durationSeconds;
  const progress = displayDuration > 0 ? Math.min(100, (currentTime / displayDuration) * 100) : 0;
  const statusLabel = {
    idle: "Ready", loading: "Loading…", ready: "Ready", playing: "Playing",
    paused: "Paused", buffering: "Buffering…", blocked: "Press Play", error: "Unavailable",
  }[status];

  const handleProgressChange = (value: number) => {
    if (durationLoaded && Number.isFinite(duration)) seek((value / 100) * duration);
  };

  return (
    <div className={`${styles.app} flex h-full w-full overflow-hidden bg-[#f7f7f8] text-gray-900 dark:bg-[#17171b] dark:text-white font-sans transition-colors duration-700`} aria-label={win.title} data-music-current={currentTrack.id} data-music-view={activePlaylist} data-reduced-motion={reduceMotion || undefined}>
      <audio ref={audioRef} className="hidden" preload="none" aria-label="Portfolio Music audio player" />

      {sidebarVisible && (
        <aside className={`${styles.sidebar} flex w-48 shrink-0 flex-col border-r border-gray-200 bg-[#ededf0] p-3 dark:border-white/10 dark:bg-black/20`}>
          <div className="mb-5 flex items-center gap-2 px-2 text-sm font-bold"><Music2 size={17} className="text-[var(--system-accent)]" /> Music</div>
          <div className="space-y-1">
            {PLAYLISTS.slice(0, 2).map((playlist) => (
              <button type="button" key={playlist.id} aria-current={activePlaylist === playlist.id ? "page" : undefined} onClick={() => setActivePlaylist(playlist.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${activePlaylist === playlist.id ? "bg-[var(--system-accent)]/15 text-[var(--system-accent)]" : "text-gray-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/10"}`}>
                {playlist.label}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-6 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Playlists</p>
          <div className="space-y-1">
            {PLAYLISTS.slice(2).map((playlist) => (
              <button type="button" key={playlist.id} aria-current={activePlaylist === playlist.id ? "page" : undefined} onClick={() => setActivePlaylist(playlist.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${activePlaylist === playlist.id ? "bg-[var(--system-accent)]/15 font-semibold text-[var(--system-accent)]" : "text-gray-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/10"}`}>
                {playlist.label}
              </button>
            ))}
          </div>
          <div className="mt-auto rounded-xl border border-gray-200 bg-white/70 p-3 text-[11px] text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
            <ListMusic size={15} className="mb-2 text-[var(--system-accent)]" />
            Full-length instrumental listening.
            <button type="button" data-music-credits onClick={() => setCreditsVisible((visible) => !visible)} aria-expanded={creditsVisible} aria-controls={`music-credits-${win.id}`} className="mt-2 block text-left font-semibold text-[var(--system-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              Credits &amp; licenses
            </button>
          </div>
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className={`${styles.header} flex min-h-20 shrink-0 items-center gap-4 border-b border-gray-200 bg-white/70 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]`}>
          <div className={`${styles.artwork} flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-lg`} style={{ background: `linear-gradient(135deg, ${currentTrack.accent}, #15151a)` }}>
            <Music2 size={26} className="text-white/90" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{playlistTitle}</p>
            <h1 className="truncate text-lg font-bold">{currentTrack.title}</h1>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{currentTrack.artist} · {currentTrack.album}</p>
          </div>
          <button type="button" onClick={() => useMusicStore.getState().toggleSidebar()} aria-label="Toggle Music sidebar" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"><ListMusic size={17} /></button>
        </div>

        <div className={`${styles.library} min-h-0 flex-1 overflow-y-auto px-5 py-5`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">{activePlaylist === "listen" ? "Top picks for you" : playlistTitle}</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{playlistDescription}</p>
            </div>
            <span data-music-status={status} role="status" className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-500 dark:bg-white/10 dark:text-gray-300">{statusLabel}</span>
          </div>

          {activePlaylist === "browse" && <label className={styles.search}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search music" placeholder="Search titles, artists, moods…" value={query} onChange={event => setQuery(event.target.value)} /><span>{visibleTracks.length} / 9</span></label>}

          {activePlaylist === "listen" ? <>
            <div className={styles.featureGrid}>
              {visibleTracks.map((track, index) => <button type="button" key={track.id} data-music-track={track.id} aria-current={track.id === currentTrack.id ? "true" : undefined} className={styles.featureCard} onClick={() => selectFromView(track)}>
                <span className={styles.featureArt} style={{ background: `linear-gradient(145deg, ${track.accent}, #363740)` }}><span className={styles.record} /><Music2 size={25} /><span className={styles.pickNumber}>0{index + 1}</span><span className={styles.artPlay}><Play size={14} fill="currentColor" /></span></span>
                <strong>{track.title}</strong><span>{track.artist}</span><small>{formatTime(track.durationSeconds)} · {track.genre}</small>
              </button>)}
            </div>
            <h3 className={styles.moodHeading}>Find your rhythm</h3>
            <div className={styles.moodGrid}>{MUSIC_PLAYLISTS.map(playlist => <button type="button" key={playlist.id} onClick={() => setActivePlaylist(playlist.id)} style={{ borderLeftColor: playlist.accent }}><span><strong>{playlist.label}</strong><small>3 instrumentals</small></span><ChevronRight size={14} /></button>)}</div>
          </> : <>
          <p className={styles.collectionCount}>{visibleTracks.length} {visibleTracks.length === 1 ? "track" : "tracks"} · Instrumental only</p>
          <div className={`${styles.trackRow} mb-2 grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.7fr)_4rem] gap-3 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400`}>
            <span>#</span><span>Title</span><span>Artist</span><span className="text-right">Time</span>
          </div>
          <div className="space-y-1">
            {visibleTracks.map((track, index) => {
              return <TrackRow key={track.id} track={track} index={index} isActive={track.id === currentTrack.id} isPlaying={isPlaying} onSelect={() => selectFromView(track)} />;
            })}
            {!visibleTracks.length && <div className={styles.emptySearch}><Search size={22} /><p>No tracks match “{query}”.</p><button type="button" onClick={() => setQuery("")}>Clear search</button></div>}
          </div>
          </>}
          {audioError && <div role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">{audioError} <button type="button" onClick={retry} aria-label="Retry playback" className="ml-2 font-semibold underline underline-offset-2">Try again</button></div>}
          {creditsVisible && (
            <div id={`music-credits-${win.id}`} className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white/70 p-3 text-[11px] leading-relaxed text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
              <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-gray-900 dark:text-white">Credits &amp; licenses</h3><button type="button" onClick={() => setCreditsVisible(false)} aria-label="Close music credits" className="font-semibold text-[var(--system-accent)]">Done</button></div>
              {MUSIC_TRACKS.map((track) => <p key={track.id}>{track.credit} <a href={track.sourceUrl} target="_blank" rel="noreferrer" className="text-[var(--system-accent)] underline underline-offset-2">Source</a>{" · "}<a href={track.licenseUrl} target="_blank" rel="noreferrer" className="text-[var(--system-accent)] underline underline-offset-2">{track.license}</a></p>)}
              <a href="/music/manifest.json" target="_blank" rel="noreferrer" className="inline-block text-[var(--system-accent)] underline underline-offset-2">Full source and license manifest</a>
            </div>
          )}
        </div>

        <div className={`${styles.player} shrink-0 border-t border-gray-200 bg-white/90 px-5 py-3 dark:border-white/10 dark:bg-black/30`}>
          <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-400">
            <span data-music-elapsed className="w-10 text-right" aria-label="Elapsed time">{formatTime(currentTime)}</span>
            <input type="range" min="0" max="100" step="0.1" value={progress} disabled={!durationLoaded} onChange={(event) => handleProgressChange(Number(event.target.value))} aria-label="Track progress" className="h-1.5 min-w-0 flex-1 accent-[var(--system-accent)]" />
            <span data-music-remaining className="w-10" aria-label="Time remaining" title={`${formatTime(displayDuration)} total`}>-{formatTime(Math.max(0, displayDuration - currentTime))}</span>
          </div>
          <div className={`${styles.playbackBar} flex items-center justify-between gap-3`}>
            <div className={`${styles.nowPlaying} min-w-0 flex-1 items-center gap-2`}>
              <div className="h-8 w-8 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, ${currentTrack.accent}, #15151a)` }} />
              <div className="min-w-0"><p className="truncate text-xs font-semibold">{currentTrack.title}</p><p className="truncate text-[10px] text-gray-400">{currentTrack.artist}</p></div>
            </div>
            <div className={`${styles.transport} flex items-center gap-3`}>
              <button type="button" onClick={toggleShuffle} aria-label="Toggle shuffle" aria-pressed={isShuffle} className={`rounded-md p-1.5 ${isShuffle ? "text-[var(--system-accent)]" : "text-gray-400"} hover:bg-gray-100 dark:hover:bg-white/10`}><Shuffle size={15} /></button>
              <button type="button" onClick={previousTrack} aria-label="Previous track" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><SkipBack size={18} fill="currentColor" /></button>
              <button type="button" onClick={() => useMusicStore.getState().togglePlay()} aria-label={showPause ? "Pause" : "Play"} className={`${styles.playButton} flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition hover:scale-105 dark:bg-white dark:text-black`}>
                {showPause ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
              </button>
              <button type="button" onClick={nextTrack} aria-label="Next track" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><SkipForward size={18} fill="currentColor" /></button>
              <button type="button" onClick={toggleRepeat} aria-label="Toggle repeat" aria-pressed={isRepeat} className={`rounded-md p-1.5 ${isRepeat ? "text-[var(--system-accent)]" : "text-gray-400"} hover:bg-gray-100 dark:hover:bg-white/10`}><Repeat2 size={15} /></button>
            </div>
            <div className={`${styles.volume} flex flex-1 items-center justify-end gap-2`}>
              {volume === 0 ? <VolumeX size={15} className="text-gray-400" /> : <Volume2 size={15} className="text-gray-400" />}
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" className="w-24 accent-[var(--system-accent)]" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
