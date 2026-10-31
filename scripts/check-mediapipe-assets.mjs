import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = async file => JSON.parse(await readFile(path.join(root, file), "utf8"));
const [project, lock, installed, manifest] = await Promise.all([
  json("package.json"), json("package-lock.json"),
  json("node_modules/@mediapipe/tasks-vision/package.json"), json("public/mediapipe/manifest.json"),
]);
assert.equal(project.dependencies[manifest.package], manifest.version, "Pin the top-level package exactly before syncing its runtime assets");
assert.equal(lock.packages[""].dependencies[manifest.package], manifest.version);
assert.equal(lock.packages[`node_modules/${manifest.package}`].version, manifest.version);
assert.equal(installed.version, manifest.version, "Installed MediaPipe and copied WASM must agree");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
for (const file of manifest.files) {
  const bytes = await readFile(path.join(root, "public/mediapipe", file.path));
  assert.equal(bytes.length, file.bytes, `${file.path} size`);
  assert.equal(digest(bytes), file.sha256, `${file.path} checksum`);
  if (file.path.includes("/wasm/")) {
    const original = await readFile(path.join(root, "node_modules/@mediapipe/tasks-vision/wasm", path.basename(file.path)));
    assert.equal(digest(bytes), digest(original), `${file.path} must be the installed package's exact artifact`);
  }
}
const hook = await readFile(path.join(root, "src/components/webcam/useHandGestureDetector.ts"), "utf8");
assert.ok(hook.includes(`/mediapipe/tasks-vision-${manifest.version}/wasm`), "Detector runtime path must match the verified package");
assert.ok(hook.includes('"/mediapipe/hand_landmarker.task"'));
console.log(`MediaPipe ${manifest.version}: package, lockfile, installed runtime, ${manifest.files.length} asset sizes/checksums verified.`);
