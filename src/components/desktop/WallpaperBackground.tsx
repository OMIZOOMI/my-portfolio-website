"use client";

import { useEffect, useState } from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { getWallpaperUrl } from "../../data/wallpapers";
import { loadWallpaper } from "./wallpaperLoader";
import styles from "./WallpaperBackground.module.css";

interface DisplayedWallpaper {
  current: string | null;
  previous: string | null;
  requested: string | null;
  attempt: number;
  error: string | null;
}

export function WallpaperBackground() {
  const wallpaper = useSystemStore((s) => s.wallpaper);
  const wallpaperMode = useSystemStore((s) => s.wallpaperMode);
  const theme = useSystemStore((s) => s.theme);
  const hydrated = useSystemStore((s) => s.appearanceHydrated);
  const reduceMotion = useSystemStore((s) => s.reduceMotion);
  const requested = getWallpaperUrl(wallpaper, wallpaperMode, theme);
  const [attempt, setAttempt] = useState(0);
  const [displayed, setDisplayed] = useState<DisplayedWallpaper>({
    current: null, previous: null, requested: null, attempt: -1, error: null,
  });

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void loadWallpaper(requested).then((url) => {
      if (cancelled) return;
      setDisplayed((last) => ({
        current: url,
        previous: last.current === url ? last.previous : last.current,
        requested, attempt, error: null,
      }));
    }).catch((error: Error) => {
      if (!cancelled) setDisplayed((last) => ({ ...last, requested, attempt, error: error.message }));
    });
    // A late response from a previous selection must never change the image.
    return () => { cancelled = true; };
  }, [requested, hydrated, attempt]);

  const pending = hydrated && (displayed.requested !== requested || displayed.attempt !== attempt);
  const error = !pending ? displayed.error : null;

  return (
    <>
      <div className={styles.background} aria-hidden="true" data-wallpaper-current={displayed.current ?? ""} data-wallpaper-status={pending ? "loading" : error ? "error" : "ready"}>
        {displayed.previous && <div className={styles.layer} style={{ backgroundImage: `url("${displayed.previous}")` }} />}
        {displayed.current && (
          <div
            key={displayed.current}
            className={`${styles.layer} ${displayed.previous && !reduceMotion ? styles.reveal : ""}`}
            style={{ backgroundImage: `url("${displayed.current}")` }}
            onAnimationEnd={() => setDisplayed((last) => last.current === displayed.current ? { ...last, previous: null } : last)}
          />
        )}
      </div>
      {error && (
        <div className={styles.notice} role="status">
          <span>{displayed.current ? "Your previous wallpaper is still here." : "Using a simple background for now."}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>Retry wallpaper</button>
        </div>
      )}
    </>
  );
}
