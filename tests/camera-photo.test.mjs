import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  let now = 1000, serial = 0, draws = 0, contexts = 0, urlSerial = 0, throwURL = false, throwEncode = false;
  const frames = new Map(), timers = new Map(), observers = [], encodes = [], urls = new Set(), revoked = [];
  const track = { readyState: "live", enabled: true, muted: false };
  const video = { srcObject: { getVideoTracks: () => [track] }, readyState: 4, videoWidth: 1280, videoHeight: 720, paused: false, ended: false, currentTime: 0,
    requestVideoFrameCallback: callback => { frames.set(++serial, callback); return serial; }, cancelVideoFrameCallback: id => frames.delete(id) };
  const transforms = [];
  const canvas = { width: 300, height: 150, clientWidth: 600, clientHeight: 300,
    getContext() { contexts++; return { setTransform: (...args) => transforms.push(args), drawImage: () => draws++ }; },
    toBlob(callback, type) { if (throwEncode) throw Error("Security fixture"); encodes.push({ callback, type, frame: draws }); } };
  const clock = { now: () => now, setTimeout: (callback, ms) => { timers.set(++serial, { callback, ms }); return serial; }, clearTimeout: id => timers.delete(id) };
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const source = readFileSync(new URL(`../src/components/webcam/${name}.ts`, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const loaded = { exports: {} };
    runInNewContext(`(function(module,exports,require){${output}\n})(module,module.exports,require)`, { module: loaded,
      require: specifier => load(specifier.slice(2)), Date: class extends Date { static now() { return now; } },
      document: { visibilityState: "visible" }, devicePixelRatio: 1, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
      requestAnimationFrame: () => 0, cancelAnimationFrame() {},
      ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} },
    }); cache.set(name, loaded.exports); return loaded.exports;
  }
  const preview = load("cameraPreview"), { CameraPhotoCapture, PHOTO_TIMEOUT_MS } = load("cameraPhoto");
  const stop = preview.startCameraPreview(video, canvas, () => {}, () => {});
  const session = new CameraPhotoCapture({ ...clock,
    createURL: () => { if (throwURL) throw Error("URL fixture"); const url = `blob:photo-${++urlSerial}`; urls.add(url); return url; },
    revokeURL: url => { urls.delete(url); revoked.push(url); },
  });
  return { video, canvas, track, session, encodes, urls, revoked, transforms, preview, PHOTO_TIMEOUT_MS,
    contexts: () => contexts, draws: () => draws,
    async paint() { now += 100; video.currentTime += .1; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now, { mediaTime: video.currentTime })); await flush(); },
    resize() { observers[0].callback(); },
    advance(ms) { now += ms; },
    timeout(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.callback(); } },
    encode(index = encodes.length - 1, blob = { type: "image/png", size: 1000 }) { encodes[index].callback(blob); },
    breakURL() { throwURL = true; }, breakEncode() { throwEncode = true; },
    stop() { session.reset(); stop(); },
  };
}

test("capture requires a painted, fresh frame from the same live camera source", async () => {
  const h = harness();
  assert.equal(h.session.capture(h.video, h.canvas), false); assert.equal(h.encodes.length, 0);
  await h.paint(); assert.ok(h.preview.getCameraPreviewFrame(h.video, h.canvas));
  for (const mutate of [() => { h.video.paused = true; }, () => { h.track.muted = true; }, () => { h.track.readyState = "ended"; }, () => { h.video.readyState = 1; }]) {
    mutate(); assert.equal(h.session.capture(h.video, h.canvas), false);
    Object.assign(h.video, { paused: false, readyState: 4 }); Object.assign(h.track, { muted: false, readyState: "live" });
  }
  h.advance(1501); assert.equal(h.session.capture(h.video, h.canvas), false);
  await h.paint(); h.canvas.clientWidth = 400; h.resize(); assert.equal(h.session.capture(h.video, h.canvas), false, "resizing clears the painted bitmap");
  await h.paint(); h.video.srcObject = { getVideoTracks: () => [h.track] }; assert.equal(h.session.capture(h.video, h.canvas), false);
  h.stop();
});
test("photo encodes the existing mirrored bitmap while live preview continues, without a drawing context or stream", async () => {
  const h = harness(); await h.paint(); const drawn = h.draws();
  assert.deepEqual([...h.transforms[0]], [-1, 0, 0, 1, 600, 0]);
  assert.equal(h.session.capture(h.video, h.canvas), true); assert.equal(h.session.capture(h.video, h.canvas), false);
  assert.equal(h.encodes.length, 1); assert.equal(h.encodes[0].type, "image/png"); assert.equal(h.encodes[0].frame, drawn);
  await h.paint(); assert.ok(h.draws() > drawn); assert.equal(h.contexts(), 1);
  h.encode(); const photo = h.session.getSnapshot().photo;
  assert.deepEqual([photo.width, photo.height], [600, 300]); assert.equal(h.urls.size, 1);
  h.encode(); assert.equal(h.urls.size, 1, "a duplicate completion cannot leak another URL");
  h.session.reset(); assert.equal(h.urls.size, 0); assert.deepEqual(h.revoked, [photo.url]);
  await h.paint(); assert.ok(h.draws() > drawn); h.stop();
});
test("cancelled captures and stale completions cannot create URLs or overwrite a new photo", async () => {
  const h = harness(); await h.paint(); h.session.capture(h.video, h.canvas); h.session.reset(); h.encode();
  assert.equal(h.urls.size, 0); assert.equal(h.session.getSnapshot().status, "idle");
  h.session.capture(h.video, h.canvas); h.encode(0); assert.equal(h.session.getSnapshot().status, "capturing");
  h.encode(1); const current = h.session.getSnapshot().photo;
  h.session.previewFailed("blob:retired"); assert.equal(h.session.getSnapshot().photo, current);
  h.session.requestDownload(current.url); assert.equal(h.session.getSnapshot().downloadRequested, true);
  assert.match(h.session.getSnapshot().message, /requested/); assert.doesNotMatch(h.session.getSnapshot().message, /saved successfully/i);
  h.session.previewFailed(current.url); assert.equal(h.urls.size, 0); assert.equal(h.session.getSnapshot().status, "error"); h.stop();
});
test("permission/source changes during encoding discard the photo and keep the live path retryable", async () => {
  for (const replace of [h => { h.track.readyState = "ended"; }, h => { h.video.srcObject = { getVideoTracks: () => [h.track] }; }]) {
    const h = harness(); await h.paint(); h.session.capture(h.video, h.canvas); replace(h); h.encode();
    assert.equal(h.urls.size, 0); assert.equal(h.session.getSnapshot().status, "error"); h.stop();
  }
});
test("encoding errors, excessive output and unsupported URL APIs do not leave a permanent busy state", async () => {
  for (const mode of ["null", "large", "throw", "url", "timeout"]) {
    const h = harness(); await h.paint(); if (mode === "throw") h.breakEncode(); if (mode === "url") h.breakURL();
    h.session.capture(h.video, h.canvas);
    if (mode === "timeout") { h.timeout(h.PHOTO_TIMEOUT_MS); h.encode(); }
    else if (mode !== "throw") h.encode(0, mode === "null" ? null : { type: "image/png", size: mode === "large" ? 5 * 1024 * 1024 : 1000 });
    assert.equal(h.session.getSnapshot().status, "error", mode); assert.equal(h.urls.size, 0); h.stop();
  }
});
