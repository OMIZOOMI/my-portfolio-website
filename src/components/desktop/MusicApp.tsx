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
} from "lucide-react";
import { MUSIC_TRACKS, useMusicStore, type MusicTrack } from "./useMusicStore";

const FALLBACK_AUDIO_URL = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3";

type PlaylistId = "listen" | "browse" | "radio" | "coding" | "focus" | "late";

const PLAYLISTS: { id: PlaylistId; label: string }[] = [
  { id: "listen", label: "Listen Now" },
  { id: "browse", label: "Browse" },
  { id: "radio", label: "Radio" },
  { id: "coding", label: "Coding Lo-Fi" },
  { id: "focus", label: "Deep Focus" },
  { id: "late", label: "Late Night Builds" },
];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channelData = buffer.getChannelData(0);
  const bytesPerSample = 2;
  const dataLength = channelData.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < channelData.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, channelData[index]));
    view.setInt16(44 + index * bytesPerSample, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

async function createSynthesizedTrackUrl(track: MusicTrack, trackIndex: number): Promise<string> {
  const OfflineContext = globalThis.OfflineAudioContext;
  if (!OfflineContext) return FALLBACK_AUDIO_URL;

  const sampleRate = 22050;
  const context = new OfflineContext(1, sampleRate * track.durationSeconds, sampleRate);
  const master = context.createGain();
  master.gain.value = 0.16;
  master.connect(context.destination);

  const rootNotes = [146.83, 164.81, 196, 220];
  const root = rootNotes[trackIndex % rootNotes.length];
  const chord = [root, root * 1.25, root * 1.5];

  for (let start = 0; start < track.durationSeconds; start += 2) {
    chord.forEach((frequency, chordIndex) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = chordIndex === 0 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.045 / (chordIndex + 1), start + 0.08);
      gain.gain.linearRampToValueAtTime(0.0001, Math.min(start + 1.8, track.durationSeconds));
      oscillator.connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(Math.min(start + 1.9, track.durationSeconds));
    });

    const kick = context.createOscillator();
    const kickGain = context.createGain();
    kick.type = "sine";
    kick.frequency.setValueAtTime(110, start);
    kick.frequency.exponentialRampToValueAtTime(48, Math.min(start + 0.18, track.durationSeconds));
    kickGain.gain.setValueAtTime(0.0001, start);
    kickGain.gain.linearRampToValueAtTime(0.22, start + 0.01);
    kickGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(start + 0.22, track.durationSeconds));
    kick.connect(kickGain).connect(master);
    kick.start(start);
    kick.stop(Math.min(start + 0.24, track.durationSeconds));

    const noiseBuffer = context.createBuffer(1, Math.floor(sampleRate * 0.08), sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let sampleIndex = 0; sampleIndex < noiseData.length; sampleIndex += 1) {
      noiseData[sampleIndex] = Math.sin((sampleIndex + 1) * (trackIndex + 17)) * (1 - sampleIndex / noiseData.length);
    }
    const noise = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const noiseGain = context.createGain();
    highPass.type = "highpass";
    highPass.frequency.value = 5000;
    noiseGain.gain.setValueAtTime(0.0001, start + 0.5);
    noiseGain.gain.linearRampToValueAtTime(0.045, start + 0.51);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(start + 0.58, track.durationSeconds));
    noise.buffer = noiseBuffer;
    noise.connect(highPass).connect(noiseGain).connect(master);
    noise.start(start + 0.5);
  }

  const rendered = await context.startRendering();
  return URL.createObjectURL(audioBufferToWav(rendered));
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
    <button type="button" onClick={onSelect} className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.7fr)_4rem] items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition ${isActive ? "bg-[var(--system-accent)]/10 text-gray-900 dark:text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}>
      <span className="text-center text-gray-400">{isActive && isPlaying ? <span className="inline-flex items-end gap-0.5" aria-label="Playing"><i className="h-3 w-0.5 animate-pulse bg-[var(--system-accent)]" /><i className="h-2 w-0.5 animate-pulse bg-[var(--system-accent)] [animation-delay:120ms]" /><i className="h-4 w-0.5 animate-pulse bg-[var(--system-accent)] [animation-delay:240ms]" /></span> : index + 1}</span>
      <span className="truncate font-semibold">{track.title}</span>
      <span className="truncate text-gray-400">{track.artist}</span>
      <span className="text-right text-gray-400">{formatTime(track.durationSeconds)}</span>
    </button>
  );
}

export function MusicApp({ window: win }: { window: { id: string; title: string } }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingAutoplayRef = useRef(false);
  const [activePlaylist, setActivePlaylist] = useState<PlaylistId>("listen");
  const [audioSources, setAudioSources] = useState<Record<string, string>>({});
  const [audioError, setAudioError] = useState<string | null>(null);

  const currentTrackIndex = useMusicStore((state) => state.currentTrackIndex);
  const isPlaying = useMusicStore((state) => state.isPlaying);
  const isShuffle = useMusicStore((state) => state.isShuffle);
  const isRepeat = useMusicStore((state) => state.isRepeat);
  const currentTime = useMusicStore((state) => state.currentTime);
  const duration = useMusicStore((state) => state.duration);
  const volume = useMusicStore((state) => state.volume);
  const sidebarVisible = useMusicStore((state) => state.sidebarVisible);
  const registerController = useMusicStore((state) => state.registerController);
  const setPlaying = useMusicStore((state) => state.setPlaying);
  const setCurrentTime = useMusicStore((state) => state.setCurrentTime);
  const setDuration = useMusicStore((state) => state.setDuration);
  const setVolume = useMusicStore((state) => state.setVolume);
  const selectTrack = useMusicStore((state) => state.selectTrack);
  const nextTrack = useMusicStore((state) => state.nextTrack);
  const previousTrack = useMusicStore((state) => state.previousTrack);
  const toggleShuffle = useMusicStore((state) => state.toggleShuffle);
  const toggleRepeat = useMusicStore((state) => state.toggleRepeat);

  const currentTrack = MUSIC_TRACKS[currentTrackIndex] ?? MUSIC_TRACKS[0];
  const currentSource = audioSources[currentTrack.id];

  useEffect(() => {
    let disposed = false;
    const generatedUrls: string[] = [];

    Promise.all(
      MUSIC_TRACKS.map(async (track, index) => {
        const url = await createSynthesizedTrackUrl(track, index);
        if (url.startsWith("blob:")) generatedUrls.push(url);
        return [track.id, url] as const;
      })
    ).then((entries) => {
      if (!disposed) setAudioSources(Object.fromEntries(entries));
      else generatedUrls.forEach((url) => URL.revokeObjectURL(url));
    });

    return () => {
      disposed = true;
      generatedUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSource) return;
    audio.src = currentSource;
    audio.load();
    setCurrentTime(0);
    setDuration(currentTrack.durationSeconds);
    const shouldPlay = pendingAutoplayRef.current;
    pendingAutoplayRef.current = false;
    if (shouldPlay) void audio.play().catch(() => setPlaying(false));
  }, [currentSource, currentTrack.id, currentTrack.durationSeconds, setCurrentTime, setDuration, setPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSource) return;
    if (isPlaying && audio.paused) void audio.play().catch(() => setPlaying(false));
    if (!isPlaying && !audio.paused) audio.pause();
  }, [currentSource, isPlaying, setPlaying]);

  useEffect(() => {
    return registerController({
      togglePlay: () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) void audio.play().catch(() => setPlaying(false));
        else audio.pause();
      },
      loadTrack: (index, autoplay) => {
        pendingAutoplayRef.current = autoplay;
        if (index === useMusicStore.getState().currentTrackIndex && autoplay) {
          const audio = audioRef.current;
          if (audio) void audio.play().catch(() => setPlaying(false));
        }
      },
      restart: () => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = 0;
        setCurrentTime(0);
      },
      setVolume: (nextVolume) => {
        if (audioRef.current) audioRef.current.volume = nextVolume;
      },
    });
  }, [registerController, setCurrentTime, setPlaying]);

  const visibleTracks = useMemo(() => {
    if (activePlaylist === "focus") return MUSIC_TRACKS.filter((track) => track.album === "Deep Focus");
    if (activePlaylist === "coding") return MUSIC_TRACKS.filter((track) => track.album === "Coding Lo-Fi");
    if (activePlaylist === "late") return MUSIC_TRACKS.filter((track) => track.album === "Late Night Builds");
    return MUSIC_TRACKS;
  }, [activePlaylist]);

  const playlistTitle = PLAYLISTS.find((playlist) => playlist.id === activePlaylist)?.label ?? "Listen Now";
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleProgressChange = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration)) return;
    const nextTime = (value / 100) * duration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f7f7f8] text-gray-900 dark:bg-[#17171b] dark:text-white font-sans transition-colors duration-700" aria-label={win.title}>
      <audio
        ref={audioRef}
        className="hidden"
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || currentTrack.durationSeconds)}
        onEnded={() => { if (isRepeat) { const audio = audioRef.current; if (audio) { audio.currentTime = 0; void audio.play(); } } else nextTrack(); }}
        onError={() => setAudioError("Audio stream unavailable. Try selecting another track.")}
        aria-label="Portfolio Music audio player"
      />

      {sidebarVisible && (
        <aside className="flex w-48 shrink-0 flex-col border-r border-gray-200 bg-[#ededf0] p-3 dark:border-white/10 dark:bg-black/20">
          <div className="mb-5 flex items-center gap-2 px-2 text-sm font-bold"><Music2 size={17} className="text-[var(--system-accent)]" /> Music</div>
          <div className="space-y-1">
            {PLAYLISTS.slice(0, 3).map((playlist) => (
              <button type="button" key={playlist.id} onClick={() => setActivePlaylist(playlist.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${activePlaylist === playlist.id ? "bg-[var(--system-accent)]/15 text-[var(--system-accent)]" : "text-gray-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/10"}`}>
                {playlist.label}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-6 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Playlists</p>
          <div className="space-y-1">
            {PLAYLISTS.slice(3).map((playlist) => (
              <button type="button" key={playlist.id} onClick={() => setActivePlaylist(playlist.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${activePlaylist === playlist.id ? "bg-[var(--system-accent)]/15 font-semibold text-[var(--system-accent)]" : "text-gray-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/10"}`}>
                {playlist.label}
              </button>
            ))}
          </div>
          <div className="mt-auto rounded-xl border border-gray-200 bg-white/70 p-3 text-[11px] text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
            <ListMusic size={15} className="mb-2 text-[var(--system-accent)]" />
            Synthesized lo-fi audio runs locally through the HTML5 player.
          </div>
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-20 shrink-0 items-center gap-4 border-b border-gray-200 bg-white/70 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-lg" style={{ background: `linear-gradient(135deg, ${currentTrack.accent}, #15151a)` }}>
            <Music2 size={26} className="text-white/90" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{playlistTitle}</p>
            <h1 className="truncate text-lg font-bold">{currentTrack.title}</h1>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{currentTrack.artist} · {currentTrack.album}</p>
          </div>
          <button type="button" onClick={() => useMusicStore.getState().toggleSidebar()} aria-label="Toggle Music sidebar" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"><ListMusic size={17} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">{playlistTitle}</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{visibleTracks.length} tracks · Om&apos;s Portfolio Mix</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-500 dark:bg-white/10 dark:text-gray-300">{audioSources[currentTrack.id] ? "Ready" : "Synthesizing…"}</span>
          </div>

          <div className="mb-2 grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.7fr)_4rem] gap-3 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
            <span>#</span><span>Title</span><span>Artist</span><span className="text-right">Time</span>
          </div>
          <div className="space-y-1">
            {visibleTracks.map((track) => {
              const index = MUSIC_TRACKS.findIndex((item) => item.id === track.id);
              return <TrackRow key={track.id} track={track} index={index} isActive={track.id === currentTrack.id} isPlaying={isPlaying} onSelect={() => selectTrack(index, true)} />;
            })}
          </div>
          {audioError && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">{audioError}</p>}
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white/90 px-5 py-3 dark:border-white/10 dark:bg-black/30">
          <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-400">
            <span className="w-10 text-right">{formatTime(currentTime)}</span>
            <input type="range" min="0" max="100" step="0.1" value={progress} onChange={(event) => handleProgressChange(Number(event.target.value))} aria-label="Track progress" className="h-1.5 flex-1 accent-[var(--system-accent)]" />
            <span className="w-10">{formatTime(duration)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
              <div className="h-8 w-8 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, ${currentTrack.accent}, #15151a)` }} />
              <div className="min-w-0"><p className="truncate text-xs font-semibold">{currentTrack.title}</p><p className="truncate text-[10px] text-gray-400">{currentTrack.artist}</p></div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={toggleShuffle} aria-label="Toggle shuffle" aria-pressed={isShuffle} className={`rounded-md p-1.5 ${isShuffle ? "text-[var(--system-accent)]" : "text-gray-400"} hover:bg-gray-100 dark:hover:bg-white/10`}><Shuffle size={15} /></button>
              <button type="button" onClick={previousTrack} aria-label="Previous track" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><SkipBack size={18} fill="currentColor" /></button>
              <button type="button" onClick={() => useMusicStore.getState().togglePlay()} aria-label={isPlaying ? "Pause" : "Play"} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition hover:scale-105 dark:bg-white dark:text-black">
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
              </button>
              <button type="button" onClick={nextTrack} aria-label="Next track" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><SkipForward size={18} fill="currentColor" /></button>
              <button type="button" onClick={toggleRepeat} aria-label="Toggle repeat" aria-pressed={isRepeat} className={`rounded-md p-1.5 ${isRepeat ? "text-[var(--system-accent)]" : "text-gray-400"} hover:bg-gray-100 dark:hover:bg-white/10`}><Repeat2 size={15} /></button>
            </div>
            <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
              {volume === 0 ? <VolumeX size={15} className="text-gray-400" /> : <Volume2 size={15} className="text-gray-400" />}
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" className="w-24 accent-[var(--system-accent)]" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
