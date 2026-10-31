import assert from "node:assert/strict";
import test from "node:test";
// Node's native strip-types runner requires the explicit TypeScript extension.
// @ts-expect-error -- the application compiler does not enable TS extension imports.
import { getSceneLoadingStatus, getScenePreparationProgress, isCriticalSceneReady, type SceneReadiness } from "./sceneReadiness.ts";

const ready: SceneReadiness = {
  rendererReady: true,
  modelReady: true,
  environmentReady: true,
  wallpaperReady: true,
  wallpaperFailed: false,
  firstRenderReady: true,
};

test("does not reveal before the first usable render", () => {
  assert.equal(isCriticalSceneReady({ ...ready, firstRenderReady: false }), false);
  assert.equal(isCriticalSceneReady(ready), true);
});

test("allows a failed wallpaper to use the desktop fallback", () => {
  assert.equal(
    isCriticalSceneReady({ ...ready, wallpaperReady: false, wallpaperFailed: true }),
    true
  );
  assert.match(
    getSceneLoadingStatus({ ...ready, wallpaperReady: false, wallpaperFailed: true }, false),
    /fallback/
  );
});

test("reports the first missing critical stage without percentages", () => {
  assert.equal(getSceneLoadingStatus({ ...ready, modelReady: false }, false), "Getting everything ready…");
  assert.equal(getSceneLoadingStatus(ready, true), "Preparing your desktop…");
});

test("progress bar counts completed readiness steps including a wallpaper fallback", () => {
  assert.equal(getScenePreparationProgress(ready), 5);
  assert.equal(getScenePreparationProgress({ ...ready, modelReady: false, firstRenderReady: false }), 3);
  assert.equal(getScenePreparationProgress({ ...ready, wallpaperReady: false, wallpaperFailed: true }), 5);
  assert.equal(getScenePreparationProgress({ ...ready, wallpaperReady: false, wallpaperFailed: false }), 4);
});
