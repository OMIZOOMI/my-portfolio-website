export interface SceneReadiness {
  rendererReady: boolean;
  modelReady: boolean;
  environmentReady: boolean;
  wallpaperReady: boolean;
  wallpaperFailed: boolean;
  firstRenderReady: boolean;
}

/**
 * The scene may enter its presentation only after the renderer has produced a
 * usable frame. A failed wallpaper is allowed through this gate because the
 * desktop has a solid fallback background; a failed 3D asset is handled by
 * the scene error boundary instead of being treated as ready.
 */
export function isCriticalSceneReady(readiness: SceneReadiness): boolean {
  return (
    readiness.rendererReady &&
    readiness.modelReady &&
    readiness.environmentReady &&
    readiness.firstRenderReady &&
    (readiness.wallpaperReady || readiness.wallpaperFailed)
  );
}

export function getSceneLoadingStatus(
  readiness: SceneReadiness,
  wallpaperLoading: boolean
): string {
  if (!readiness.rendererReady) return "Preparing your workspace…";
  if (!readiness.modelReady) return "Getting everything ready…";
  if (!readiness.environmentReady) return "Adding the finishing touches…";
  if (wallpaperLoading) return "Preparing your desktop…";
  if (!readiness.firstRenderReady) return "Opening your workspace…";
  if (readiness.wallpaperFailed) return "Wallpaper unavailable — using a simple fallback.";
  return "Welcome.";
}

/** Actual completed preparation steps, not estimated download percentages. */
export function getScenePreparationProgress(readiness: SceneReadiness): number {
  return [readiness.rendererReady, readiness.modelReady, readiness.environmentReady,
    readiness.wallpaperReady || readiness.wallpaperFailed, readiness.firstRenderReady].filter(Boolean).length;
}
