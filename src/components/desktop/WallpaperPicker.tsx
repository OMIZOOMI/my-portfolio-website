"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImageOff, Moon, Sun } from "lucide-react";
import { WALLPAPER_THEMES, resolveWallpaperVariant, type WallpaperTheme } from "../../data/wallpapers";
import { useSystemStore } from "../window-manager/useSystemStore";

function WallpaperOption({ pair, variant, selected, accent, onSelect }: {
  pair: WallpaperTheme;
  variant: "light" | "dark";
  selected: boolean;
  accent: string;
  onSelect: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const thumbnail = variant === "dark" ? pair.darkThumbnailUrl : pair.lightThumbnailUrl;
  const source = attempt ? `${thumbnail}?retry=${attempt}` : thumbnail;
  const attachImage = useCallback((image: HTMLImageElement | null) => {
    imageRef.current = image;
    // A cached preview can already be complete when Settings reopens.
    if (image?.complete && image.naturalWidth > 0) setStatus("ready");
  }, []);

  useEffect(() => {
    if (status !== "loading") return;
    // A stalled request must offer recovery instead of an endless placeholder.
    const timeout = window.setTimeout(() => {
      const image = imageRef.current;
      setStatus(image?.complete && image.naturalWidth > 0 ? "ready" : "error");
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [attempt, status]);

  return (
    <div className="min-w-0">
      <button type="button" onClick={onSelect} data-wallpaper-option={pair.id} aria-pressed={selected} aria-label={`${pair.name}, ${variant} wallpaper`} className="group block w-full rounded-xl text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--system-accent)]">
        <span className="relative block overflow-hidden rounded-xl border-2 bg-[#d9dde0] dark:bg-[#34373b]" style={{ aspectRatio: "8 / 5", borderColor: selected ? accent : "transparent" }}>
          {status === "loading" && <span aria-hidden="true" className="absolute inset-0 motion-safe:animate-pulse bg-black/5 dark:bg-white/5" />}
          {/* Pre-sized local previews load only when Settings mounts. Native load avoids an extra decode gate inside the transformed desktop. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- These dedicated 320px WebP thumbnails are already optimized. */}
          <img
            key={source}
            ref={attachImage}
            width={320}
            height={200}
            src={source}
            loading="eager"
            decoding="async"
            alt=""
            data-wallpaper-thumbnail={pair.id}
            data-thumbnail-status={status}
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
            className={`relative block h-full w-full object-cover ${status === "error" ? "opacity-0" : "opacity-100"}`}
          />
          {status === "error" && <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[10px] text-gray-500 dark:text-gray-300"><ImageOff size={18} /><span>Preview unavailable</span></span>}
          {selected && <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white shadow" style={{ background: accent }}><Check size={12} strokeWidth={3} /></span>}
        </span>
        <span className="mt-2 flex items-center justify-between gap-1 px-0.5 text-xs text-gray-700 dark:text-gray-300">
          <span className="truncate">{pair.name}</span>
          {variant === "dark" ? <Moon size={11} className="shrink-0 text-gray-400" /> : <Sun size={11} className="shrink-0 text-gray-400" />}
        </span>
      </button>
      <div className="h-5 px-0.5">
        {status === "error" && <button type="button" data-wallpaper-thumbnail-retry={pair.id} className="text-[10px] text-[var(--system-accent)] hover:underline" onClick={() => { setStatus("loading"); setAttempt((n) => n + 1); }}>Retry preview</button>}
      </div>
    </div>
  );
}

export function WallpaperPicker({ accent }: { accent: string }) {
  const wallpaper = useSystemStore((s) => s.wallpaper);
  const setWallpaper = useSystemStore((s) => s.setWallpaper);
  const mode = useSystemStore((s) => s.wallpaperMode);
  const theme = useSystemStore((s) => s.theme);
  const variant = resolveWallpaperVariant(mode, theme);
  return (
    <div className="mb-5" data-wallpaper-picker data-wallpaper-variant={variant}>
      <p className="mb-4 text-xs leading-5 text-gray-500 dark:text-gray-400">Six landscapes. The same view, from daylight to blue hour.</p>
      <div className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(112px, 100%), 1fr))" }}>
        {WALLPAPER_THEMES.map((pair) => <WallpaperOption key={`${pair.id}-${variant}`} pair={pair} variant={variant} selected={wallpaper === pair.id} accent={accent} onSelect={() => setWallpaper(pair.id)} />)}
      </div>
    </div>
  );
}
