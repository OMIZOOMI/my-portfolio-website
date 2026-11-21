export type WallpaperMode = "auto" | "light" | "dark";
export type WallpaperVariant = "light" | "dark";

export interface WallpaperTheme {
  id: string;
  name: string;
  lightUrl: string;
  darkUrl: string;
  lightThumbnailUrl: string;
  darkThumbnailUrl: string;
}

const options = [
  ["coast", "Coast"],
  ["lake", "Mountain Lake"],
  ["forest", "Forest"],
  ["dunes", "Dunes"],
  ["alpine", "Alpine"],
  ["drift", "Drift"],
] as const;

export const WALLPAPER_THEMES: WallpaperTheme[] = options.map(([id, name]) => ({
  id,
  name,
  lightUrl: `/wallpapers/${id}-light.webp`,
  darkUrl: `/wallpapers/${id}-dark.webp`,
  lightThumbnailUrl: `/wallpapers/thumbs/${id}-light.webp`,
  darkThumbnailUrl: `/wallpapers/thumbs/${id}-dark.webp`,
}));

export const DEFAULT_WALLPAPER_THEME = "coast";
export const DEFAULT_WALLPAPER_MODE: WallpaperMode = "light";
export const APPEARANCE_STORAGE_KEY = "portfolio-appearance";

export const TOUCH_WALLPAPERS = [
  { id: "coast", name: "Coast", portrait: "/wallpapers/touch/coast-portrait.webp", landscape: "/wallpapers/coast-light.webp", thumbnail: "/wallpapers/touch/coast-thumb.webp" },
  { id: "dunes", name: "Dunes", portrait: "/wallpapers/touch/dunes-portrait.webp", landscape: "/wallpapers/dunes-light.webp", thumbnail: "/wallpapers/touch/dunes-thumb.webp" },
] as const;
export type TouchWallpaper = typeof TOUCH_WALLPAPERS[number]["id"];

export function getTouchWallpaper(id: unknown) {
  return TOUCH_WALLPAPERS.find(wallpaper => wallpaper.id === id) ?? TOUCH_WALLPAPERS[0];
}

const legacyThemes: Record<string, string> = {
  "big sur": "coast",
  "big-sur": "coast",
  monterey: "lake",
  ventura: "alpine",
  sonoma: "forest",
  sequoia: "dunes",
};

export function getWallpaperTheme(value: string): WallpaperTheme {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const id = legacyThemes[normalized] ?? normalized;
  return WALLPAPER_THEMES.find((theme) => theme.id === id || theme.name.toLowerCase() === id) ?? WALLPAPER_THEMES[0];
}

export function resolveWallpaperVariant(mode: WallpaperMode, theme: "light" | "dark"): WallpaperVariant {
  return mode === "auto" ? theme : mode;
}

export function getWallpaperUrl(wallpaper: string, mode: WallpaperMode, theme: "light" | "dark") {
  const pair = getWallpaperTheme(wallpaper);
  return resolveWallpaperVariant(mode, theme) === "dark" ? pair.darkUrl : pair.lightUrl;
}

export interface AppearancePreferences {
  theme: "light" | "dark";
  wallpaper: string;
  wallpaperMode: WallpaperMode;
  touchWallpaper: TouchWallpaper;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  theme: "dark",
  wallpaper: DEFAULT_WALLPAPER_THEME,
  wallpaperMode: DEFAULT_WALLPAPER_MODE,
  touchWallpaper: TOUCH_WALLPAPERS[0].id,
};

/** Read the owned appearance fields, including earlier persisted names. */
export function parseAppearancePreferences(raw: string | null): AppearancePreferences {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    const data = parsed?.state ?? parsed;
    return {
      theme: data?.theme === "light" ? "light" : "dark",
      wallpaper: getWallpaperTheme(data?.wallpaper).id,
      wallpaperMode: ["auto", "light", "dark"].includes(data?.wallpaperMode)
        ? data.wallpaperMode : DEFAULT_WALLPAPER_MODE,
      touchWallpaper: getTouchWallpaper(data?.touchWallpaper).id,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function serializeAppearancePreferences(state: AppearancePreferences): string {
  return JSON.stringify({ version: 1, state: {
    theme: state.theme,
    wallpaper: getWallpaperTheme(state.wallpaper).id,
    wallpaperMode: state.wallpaperMode,
    touchWallpaper: getTouchWallpaper(state.touchWallpaper).id,
  } });
}
