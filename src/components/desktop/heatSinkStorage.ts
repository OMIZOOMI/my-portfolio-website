export const HEAT_SINK_STORAGE_KEY = "portfolio-heat-sink-v1";
const LEADERBOARD_LIMIT = 10;

export interface HeatSinkScore {
  readonly score: number;
  readonly initials: string;
  readonly at: number;
}

export interface HeatSinkProfile {
  readonly entries: readonly HeatSinkScore[];
  readonly last: HeatSinkScore | null;
  readonly best: number;
  readonly initials: string;
  readonly muted: boolean;
}

export const EMPTY_HEAT_SINK_PROFILE: HeatSinkProfile = {
  entries: [], last: null, best: 0, initials: "", muted: false,
};

let memory = EMPTY_HEAT_SINK_PROFILE;
let memoryOnly = false;

export function sanitizeHeatSinkInitials(value: unknown) {
  return typeof value === "string" ? value.slice(0, 64).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validScore(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseScore(value: unknown): HeatSinkScore | null {
  if (!isRecord(value) || !validScore(value.score) || !validScore(value.at)) return null;
  return { score: value.score, initials: sanitizeHeatSinkInitials(value.initials), at: value.at };
}

function sortScores(entries: HeatSinkScore[]) {
  return entries.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, LEADERBOARD_LIMIT);
}

export function parseHeatSinkProfile(raw: string | null): HeatSinkProfile {
  if (!raw || raw.length > 16_384) return EMPTY_HEAT_SINK_PROFILE;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return EMPTY_HEAT_SINK_PROFILE;
    const entries = sortScores(Array.isArray(data.entries) ? data.entries.map(parseScore).filter((entry): entry is HeatSinkScore => !!entry && entry.score > 0) : []);
    const last = parseScore(data.last);
    return { entries, last, best: Math.max(entries[0]?.score ?? 0, last?.score ?? 0), initials: sanitizeHeatSinkInitials(data.initials), muted: data.muted === true };
  } catch {
    return EMPTY_HEAT_SINK_PROFILE;
  }
}

export function recordHeatSinkScore(profile: HeatSinkProfile, score: number, initials = profile.initials, at = Date.now()): HeatSinkProfile {
  if (!validScore(score) || !validScore(at)) return profile;
  const last = { score, initials: sanitizeHeatSinkInitials(initials), at };
  const entries = score > 0 ? sortScores([...profile.entries, last]) : profile.entries;
  return { ...profile, entries, last, best: Math.max(profile.best, score) };
}

export function updateHeatSinkSettings(profile: HeatSinkProfile, settings: { initials?: string; muted?: boolean }): HeatSinkProfile {
  const initials = settings.initials === undefined ? profile.initials : sanitizeHeatSinkInitials(settings.initials);
  const muted = settings.muted ?? profile.muted;
  return initials === profile.initials && muted === profile.muted ? profile : { ...profile, initials, muted };
}

export function readHeatSinkProfile(): HeatSinkProfile {
  if (typeof window === "undefined" || memoryOnly) return memory;
  try { memory = parseHeatSinkProfile(window.localStorage.getItem(HEAT_SINK_STORAGE_KEY)); }
  catch { memoryOnly = true; }
  return memory;
}

export function writeHeatSinkProfile(profile: HeatSinkProfile): boolean {
  memory = profile;
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(HEAT_SINK_STORAGE_KEY, JSON.stringify(profile));
    memoryOnly = false;
    return true;
  } catch {
    memoryOnly = true;
    return false;
  }
}
