export const INTRODUCTION_STORAGE_KEY = "portfolio-introduction";
export type IntroductionStatus = "completed" | "skipped";

/** No release/version gate: an update must not re-enrol returning visitors. */
export function parseIntroductionStatus(raw: string | null): IntroductionStatus | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (value && typeof value === "object" && "status" in value
      && (value.status === "completed" || value.status === "skipped")) return value.status;
  } catch { /* A malformed preference is not a completed introduction. */ }
  return null;
}
