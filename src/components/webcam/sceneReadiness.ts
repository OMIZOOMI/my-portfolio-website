export interface SceneReadiness {
  rendererReady: boolean;
  modelReady: boolean;
  environmentReady: boolean;
  wallpaperReady: boolean;
  wallpaperFailed: boolean;
  firstRenderReady: boolean;
  desktopChromeReady: boolean;
  backdropReady: boolean;
}

/**
 * The scene may enter its presentation only after the renderer has produced a
 * usable frame and the visible still backdrop is ready or has fallen back.
 * A failed 3D asset is handled by the scene error boundary.
 */
export function isCriticalSceneReady(readiness: SceneReadiness): boolean {
  return (
    readiness.rendererReady &&
    readiness.modelReady &&
    readiness.environmentReady &&
    readiness.firstRenderReady &&
    readiness.desktopChromeReady &&
    readiness.backdropReady &&
    (readiness.wallpaperReady || readiness.wallpaperFailed)
  );
}

export function getSceneLoadingStatus(readiness: SceneReadiness): string {
  if (!readiness.rendererReady) return "Starting 3D graphics…";
  if (!readiness.modelReady) return "Loading the laptop model…";
  if (!readiness.environmentReady) return "Loading the workspace lighting…";
  if (!readiness.wallpaperReady && !readiness.wallpaperFailed) return "Preparing the desktop wallpaper…";
  if (!readiness.firstRenderReady) return "Rendering the first frame…";
  if (!readiness.desktopChromeReady) return "Preparing the desktop controls…";
  if (!readiness.backdropReady) return "Preparing the workspace background…";
  if (readiness.wallpaperFailed) return "Opening with the fallback wallpaper.";
  return "Welcome.";
}

/** Actual completed preparation steps, not estimated download percentages. */
export function getScenePreparationProgress(readiness: SceneReadiness): number {
  return [readiness.rendererReady, readiness.modelReady, readiness.environmentReady,
    readiness.wallpaperReady || readiness.wallpaperFailed,
    readiness.firstRenderReady && readiness.backdropReady && readiness.desktopChromeReady].filter(Boolean).length;
}
