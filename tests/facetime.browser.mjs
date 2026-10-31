// Stage 7, isolated Chrome CDP only. These are synthetic camera/permission
// fixtures on actual macOS Chrome, NOT a live Windows/Safari camera test.
// STARTUP_TEST_URL=http://127.0.0.1:3001 CDP_URL=http://127.0.0.1:9225 node tests/facetime.browser.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9225";
const filter = process.env.FACETIME_TEST_FILTER;
const output = new URL(process.env.FACETIME_OUTPUT_DIR ?? "../docs/facetime-review/", import.meta.url);
const frame = '[data-window-frame="app-facetime"]';
const app = `${frame} [data-facetime-app]`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const version = await (await fetch(`${endpoint}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map(), listeners = new Set();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(Error(message.error.message));
    else request.resolve(message.result);
  } else for (const listener of listeners) listener(message);
});
function command(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function until(check, label, timeout = 22000) {
  const started = Date.now(); let last;
  while (Date.now() - started < timeout) {
    try { last = await check(); if (last) return last; } catch (error) { last = error.message; }
    await sleep(80);
  }
  throw Error(`Timed out: ${label}: ${JSON.stringify(last)}`);
}

// Real MediaStream/VideoTrack and native video playback, with a deliberately
// blank animated canvas as the camera. Error and delayed-request fixtures are
// controlled here, never shipped in the application.
function mediaFixture(options = {}) {
  const state = window.__cameraTest = {
    calls: [], tracks: [], stops: 0, pending: [], events: [],
    behaviors: [...(options.behaviors ?? ["ok"])],
    playbackFailures: options.playbackFailures ?? 0,
  };
  const createStream = () => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
    const context = canvas.getContext("2d");
    let tick = 0;
    const paint = () => { context.fillStyle = `rgb(${30 + tick++ % 10},45,65)`; context.fillRect(0, 0, 320, 240); };
    paint();
    const stream = canvas.captureStream(15);
    const timer = setInterval(paint, 65);
    for (const track of stream.getTracks()) {
      const stop = track.stop.bind(track);
      track.stop = () => { state.stops++; clearInterval(timer); stop(); };
      state.tracks.push(track);
    }
    return stream;
  };
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true,
    value: constraints => {
      state.calls.push({ constraints, at: performance.now() });
      const behavior = state.behaviors.shift() ?? "ok";
      if (behavior === "pending") return new Promise(resolve => state.pending.push(() => resolve(createStream())));
      if (behavior !== "ok") return Promise.reject(new DOMException(`Synthetic ${behavior}`, behavior));
      return Promise.resolve(createStream());
    },
  });
  state.resolve = () => state.pending.splice(0).forEach(resolve => resolve());
  state.stats = () => ({
    calls: state.calls, stops: state.stops, pending: state.pending.length,
    liveTracks: state.tracks.filter(track => track.readyState === "live").length,
    trackStates: state.tracks.map(track => ({ readyState: track.readyState, enabled: track.enabled, kind: track.kind })),
    events: state.events,
  });
  const play = HTMLMediaElement.prototype.play;
  const source = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject");
  if (source?.set && options.playbackFailures) Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    ...source,
    set(value) {
      // Prevent native autoplay from bypassing the deliberately rejected play()
      // fixture; a later real user click still invokes native playback.
      if (value && state.playbackFailures > 0) this.autoplay = false;
      source.set.call(this, value);
    },
  });
  HTMLMediaElement.prototype.play = function () {
    if (this.srcObject && state.playbackFailures > 0) {
      state.playbackFailures--;
      return Promise.reject(new DOMException("Synthetic autoplay restriction", "NotAllowedError"));
    }
    return play.call(this);
  };
  for (const name of ["playing", "pause", "loadedmetadata", "error", "waiting"])
    document.addEventListener(name, event => {
      if (event.target instanceof HTMLVideoElement && event.target.srcObject)
        state.events.push({ name, at: performance.now(), readyState: event.target.readyState });
    }, true);
  if (options.insecure) Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
}

async function pageFor(options = {}) {
  const { browserContextId } = await command("Target.createBrowserContext");
  // Chrome 156 can create an incognito tab in a hidden window unless an
  // explicit window is requested. A hidden tab correctly pauses startup rAF.
  const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId, newWindow: true, background: false });
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => command(method, params, sessionId);
  const errors = [], requests = [];
  const onEvent = event => {
    if (event.sessionId !== sessionId) return;
    if (event.method === "Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text);
    if (event.method === "Network.requestWillBeSent") requests.push(event.params.request.url);
  };
  listeners.add(onEvent);
  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Network.enable")]);
  await send("Page.bringToFront");
  // Focus emulation also keeps this isolated headless window visible while
  // other desktop/browser windows have focus. Native background behavior is
  // a separate physical-device checklist item; visibility fixtures follow.
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('portfolio-appearance',JSON.stringify({version:1,state:{theme:'dark',wallpaper:'coast',wallpaperMode:'auto'}}));(${mediaFixture.toString()})(${JSON.stringify(options)});`,
  });
  if (options.block) await send("Network.setBlockedURLs", { urls: options.block });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  return {
    send, evaluate, errors, requests,
    wait: (expression, label, timeout) => until(() => evaluate(expression), label, timeout),
    async boot() {
      await send("Page.navigate", { url: site });
      await until(() => evaluate(`!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`), "portfolio entry", 45000);
      await sleep(350);
    },
    async screenshot(name) {
      await mkdir(output, { recursive: true });
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(new URL(`${name}.png`, output), Buffer.from(data, "base64"));
    },
    async close() { listeners.delete(onEvent); await command("Target.disposeBrowserContext", { browserContextId }); },
  };
}
async function point(page, selector) {
  await page.evaluate("window.__cameraPoint=null");
  return page.wait(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const host=el.closest('[data-window-frame]');if(host?.style.transform&&host.style.transform!=='none')return false;el.scrollIntoView({block:'nearest',behavior:'instant'});const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(!r.width||!r.height||!(hit===el||el.contains(hit)))return false;const p=window.__cameraPoint,now=performance.now();if(!p||Math.hypot(x-p.x,y-p.y)>.5){window.__cameraPoint={x,y,at:now};return false}return now-p.at>120?{x,y}:false})()`, selector);
}
async function click(page, selector) {
  const p = await point(page, selector);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...p });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...p });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...p });
}
const camera = (page, status) => page.wait(`document.querySelector('${app}')?.dataset.cameraStatus===${JSON.stringify(status)}`, `camera ${status}`);
const gestures = (page, status) => page.wait(`document.querySelector('${app}')?.dataset.gestureStatus===${JSON.stringify(status)}`, `gestures ${status}`, 45000);
const stats = page => page.evaluate("window.__cameraTest.stats()");
async function open(page) { await click(page, '[data-dock-app="facetime"]'); await page.wait(`!!document.querySelector('${app}')`, "FaceTime open"); }
async function named(page, label) {
  await page.evaluate(`(()=>{const root=document.querySelector('${app}'),button=[...root.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.title===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing FaceTime action: '+${JSON.stringify(label)});root.querySelectorAll('[data-camera-action]').forEach(b=>b.removeAttribute('data-camera-action'));button.dataset.cameraAction='selected'})()`);
  await click(page, `${app} [data-camera-action="selected"]`);
}
async function close(page) { await click(page, `${frame} [data-window-control="close"]`); await page.wait(`!document.querySelector('${frame}')`, "FaceTime closed"); }
async function hidden(page, value) {
  // Deliberate visibility fixture: not a native OS background-window test.
  await page.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:${value}});Object.defineProperty(document,'visibilityState',{configurable:true,value:'${value ? "hidden" : "visible"}'});document.dispatchEvent(new Event('visibilitychange'))`);
}
function assertVideoOnly(snapshot) {
  assert.ok(snapshot.calls.length > 0);
  for (const { constraints } of snapshot.calls) {
    assert.equal(constraints.audio, false, "No microphone permission is requested");
    assert.ok(constraints.video, "Camera request has video");
  }
  assert.ok(snapshot.trackStates.every(track => track.kind === "video"));
}

function hostDetail(command, args) {
  try { return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return "Unavailable"; }
}
const report = {
  testedAt: new Date().toISOString(),
  site,
  buildId: await readFile(new URL("../.next/BUILD_ID", import.meta.url), "utf8").then(value => value.trim()).catch(() => "Unavailable"),
  browser: version.Browser, userAgent: version["User-Agent"], os: `${os.platform()} ${os.release()} ${os.arch()}`,
  macOS: os.platform() === "darwin" ? hostDetail("sw_vers", ["-productVersion"]) : undefined,
  device: os.platform() === "darwin" ? hostDetail("sysctl", ["-n", "hw.model", "machdep.cpu.brand_string"]) : undefined,
  environment: "Isolated headless Chromium on the OS above. Canvas MediaStream and synthetic permission/playback failures. No physical camera or native permission-prompt evidence; this run does not establish parity with an untested OS/browser.",
  scenarios: [],
};
try {
  const system = await command("SystemInfo.getInfo");
  report.gpu = {
    devices: system.gpu?.devices,
    renderer: system.gpu?.auxAttributes?.glRenderer,
    vendor: system.gpu?.auxAttributes?.glVendor,
    featureStatus: system.gpu?.featureStatus,
  };
} catch { report.gpu = { unavailable: true }; }
let failures = 0;
async function scenario(name, run, options = {}) {
  if (filter && !name.includes(filter)) return;
  const page = await pageFor(options), started = Date.now(), result = { name, fixture: options };
  try {
    await page.boot(); await run(page, result);
    assert.deepEqual(page.errors, [], "No unhandled runtime exception"); result.status ??= "PASS";
  } catch (error) {
    failures++; result.status = "FAIL"; result.error = error.stack;
    try { result.dom = await page.evaluate(`({text:document.querySelector('${frame}')?.innerText,attributes:document.querySelector('${app}')?.dataset,media:window.__cameraTest.stats()})`); await page.screenshot(`failed-${name}`); } catch { /* Page failure already recorded. */ }
  } finally {
    result.runtimeErrors = [...page.errors];
    result.elapsedMs = Date.now() - started; report.scenarios.push(result);
    console.log(`${result.status} ${name} ${result.elapsedMs}ms${result.error ? `\n${result.error}` : ""}`);
    // Save progress too, so an interrupted infrastructure run retains evidence.
    await mkdir(output, { recursive: true });
    await writeFile(new URL(`${process.env.FACETIME_REPORT_NAME ?? "browser-results"}.json`, output), `${JSON.stringify(report, null, 2)}\n`);
    await page.close();
  }
}

await scenario("native-video-model-no-hand-camera-toggle-and-single-instance", async (page, result) => {
  result.requestsBeforeOpen = page.requests.filter(url => /\/mediapipe\//.test(url));
  assert.deepEqual(result.requestsBeforeOpen, [], "No model/WASM assets delay initial portfolio entry");
  await open(page); await camera(page, "live"); await gestures(page, "ready");
  result.live = await page.evaluate(`(()=>{const r=document.querySelector('${app}'),v=r.querySelector('video'),s=getComputedStyle(v);return{camera:r.dataset.cameraStatus,delegate:r.dataset.gestureDelegate,readyState:v.readyState,paused:v.paused,width:v.videoWidth,height:v.videoHeight,transform:s.transform,scale:s.scale}})()`);
  assert.equal(result.live.paused, false); assert.ok(result.live.width > 0);
  assert.ok(result.live.scale === "-1 1" || /^matrix\(-1,/.test(result.live.transform), "Selfie preview mirrors horizontally once (Tailwind 4 uses individual CSS scale)");
  await sleep(3000);
  result.noHand = await page.evaluate(`document.querySelector('${app}').innerText`);
  assert.doesNotMatch(result.noHand, /Peace sign detected|Thumbs up detected/);
  await click(page, '[data-dock-app="facetime"]'); await click(page, '[data-dock-app="facetime"]');
  assert.equal(await page.evaluate("document.querySelectorAll('[data-facetime-app]').length"), 1);
  assert.equal((await stats(page)).calls.length, 1, "Repeated launch does not start competing cameras");
  await named(page, "Turn camera off"); await camera(page, "off");
  assert.equal((await stats(page)).liveTracks, 0);
  await named(page, "Turn camera on"); await camera(page, "live");
  result.media = await stats(page); assertVideoOnly(result.media); assert.equal(result.media.liveTracks, 1);
  await page.screenshot("live-synthetic-camera");
  await close(page); assert.equal((await stats(page)).liveTracks, 0);
});

for (const [name, error] of [["denied", "NotAllowedError"], ["busy", "NotReadableError"], ["missing", "NotFoundError"]]) {
  await scenario(`${name}-camera-retry`, async (page, result) => {
    await open(page); await camera(page, "error");
    result.failure = await page.evaluate(`document.querySelector('${app}').innerText`);
    assert.doesNotMatch(result.failure, /Camera\s+On\b/);
    await named(page, "Retry camera"); await camera(page, "live");
    result.media = await stats(page); assertVideoOnly(result.media); assert.equal(result.media.calls.length, 2);
    await close(page); assert.equal((await stats(page)).liveTracks, 0);
  }, { behaviors: [error, "ok"] });
}

await scenario("delayed-stream-attaches-without-permission-render-deadlock", async (page, result) => {
  await open(page); await camera(page, "requesting"); await sleep(500);
  assert.equal(await page.evaluate(`!!document.querySelector('${app} video')`), true);
  await page.evaluate("window.__cameraTest.resolve()"); await camera(page, "live");
  result.media = await stats(page); assert.equal(result.media.calls.length, 1); assert.equal(result.media.liveTracks, 1);
  await close(page); assert.equal((await stats(page)).liveTracks, 0);
}, { behaviors: ["pending"] });

await scenario("unanswered-permission-times-out-and-retry-does-not-duplicate-prompts", async (page, result) => {
  await open(page); await camera(page, "requesting"); await camera(page, "error");
  result.timeout = await page.evaluate(`document.querySelector('${app}').innerText`);
  assert.match(result.timeout, /permission|respond|waiting|timed out/i);
  await named(page, "Retry camera"); await sleep(200);
  assert.equal((await stats(page)).calls.length, 1, "The unresolved native request is coalesced");
  await page.evaluate("window.__cameraTest.resolve()");
  await page.wait("window.__cameraTest.stats().stops>0", "timed-out late stream released");
  assert.equal((await stats(page)).liveTracks, 0);
  await named(page, "Retry camera"); await camera(page, "live");
  result.media = await stats(page); assert.equal(result.media.liveTracks, 1);
  assert.equal(result.media.calls.length, 2, "Fresh request starts only after the original prompt has settled");
  await close(page); assert.equal((await stats(page)).liveTracks, 0);
}, { behaviors: ["pending"] });

await scenario("close-before-permission-completes-stops-late-stream", async (page, result) => {
  await open(page); await camera(page, "requesting"); await close(page);
  await page.evaluate("window.__cameraTest.resolve()");
  await page.wait("window.__cameraTest.stats().stops>0", "late stream released");
  result.media = await stats(page); assert.equal(result.media.liveTracks, 0);
  await open(page); await camera(page, "live"); assert.equal((await stats(page)).liveTracks, 1);
  await close(page); assert.equal((await stats(page)).liveTracks, 0);
}, { behaviors: ["pending", "ok"] });

await scenario("playback-rejected-resume-is-a-real-user-action", async (page, result) => {
  await open(page); await camera(page, "playback-blocked");
  result.blocked = await page.evaluate(`document.querySelector('${app}').innerText`);
  await named(page, "Resume camera"); await camera(page, "live");
  result.media = await stats(page); assert.equal(result.media.calls.length, 1, "Playback resume reuses live stream");
  await close(page); assert.equal((await stats(page)).liveTracks, 0);
}, { playbackFailures: 1 });

await scenario("externally-ended-track-is-not-reported-live", async (page, result) => {
  await open(page); await camera(page, "live");
  await page.evaluate("window.__cameraTest.tracks.forEach(track=>{track.stop();track.dispatchEvent(new Event('ended'))})");
  await camera(page, "error");
  result.text = await page.evaluate(`document.querySelector('${app}').innerText`);
  assert.doesNotMatch(result.text, /Camera\s+On\b/);
  await named(page, "Retry camera"); await camera(page, "live");
  result.media = await stats(page); assert.equal(result.media.liveTracks, 1);
  await close(page); assert.equal((await stats(page)).liveTracks, 0);
});

await scenario("minimize-hidden-restore-and-explicit-off-lifecycle", async (page, result) => {
  await open(page); await camera(page, "live"); await gestures(page, "ready");
  await click(page, `${frame} [data-window-control="minimize"]`); await camera(page, "paused");
  assert.equal((await stats(page)).liveTracks, 0);
  await open(page); await camera(page, "live");
  await hidden(page, true); await camera(page, "paused"); assert.equal((await stats(page)).liveTracks, 0);
  await hidden(page, false); await camera(page, "live");
  result.pageHideImmediate = await page.evaluate("(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));return window.__cameraTest.stats()})()");
  assert.equal(result.pageHideImmediate.liveTracks, 0, "pagehide releases media in the native event before suspension");
  await camera(page, "paused");
  await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
  await camera(page, "live");
  await named(page, "Turn camera off"); await camera(page, "off");
  await click(page, `${frame} [data-window-control="minimize"]`); await open(page); await camera(page, "off");
  assert.equal((await stats(page)).liveTracks, 0, "Explicit camera off survives restore");
  result.media = await stats(page); assertVideoOnly(result.media);
  await close(page); assert.equal((await stats(page)).liveTracks, 0);
});

await scenario("real-gpu-initialization-refusal-falls-back-to-cpu", async (page, result) => {
  // Refuse only the detector's first owned GPU canvas. CPU's new image-transfer
  // canvas stays available: CPU inference does not mean all browser WebGL APIs
  // can be removed. This is a deliberate macOS initialization fault, not an
  // actual Windows ANGLE/driver test or a mocked MediaPipe implementation.
  await page.evaluate(`(()=>{window.__refusedGestureContexts=0;window.__refusedGestureCanvas=null;for(const proto of [HTMLCanvasElement.prototype,globalThis.OffscreenCanvas?.prototype].filter(Boolean)){const get=proto.getContext;proto.getContext=function(kind,...args){if(/webgl/i.test(kind)&&(!window.__refusedGestureCanvas||this===window.__refusedGestureCanvas)){window.__refusedGestureCanvas??=this;window.__refusedGestureContexts++;return null}return get.call(this,kind,...args)}}})()`);
  await open(page); await camera(page, "live"); await gestures(page, "ready");
  result.delegate = await page.evaluate(`document.querySelector('${app}').dataset.gestureDelegate`);
  result.refusedContexts = await page.evaluate("window.__refusedGestureContexts");
  assert.ok(result.refusedContexts > 0, "The real GPU initialization attempted a GL context");
  assert.equal(result.delegate, "CPU");
  await sleep(800); assert.equal((await stats(page)).liveTracks, 1);
  if (!await page.evaluate(`!!document.querySelector('${app} [aria-label="Gesture guide"]')`)) await named(page,"Gesture help");
  await named(page,"Preview confetti");
  await page.wait(`!!document.querySelector('${app} [data-confetti-renderer="css"]')`, "CPU-safe confetti effect");
  result.confetti = await page.evaluate(`(()=>{const burst=document.querySelector('${app} [data-confetti-renderer="css"]');return{particles:burst.querySelectorAll('[data-confetti-particle]').length,canvases:burst.querySelectorAll('canvas').length,camera:document.querySelector('${app}').dataset.cameraStatus}})()`);
  assert.equal(result.confetti.particles, 70); assert.equal(result.confetti.canvases, 0); assert.equal(result.confetti.camera, "live");
  await page.screenshot("cpu-fallback-css-confetti");
  await page.wait(`!document.querySelector('${app} [data-confetti-renderer="css"]')`, "confetti self-removes", 5000);
  if (!await page.evaluate(`!!document.querySelector('${app} [aria-label="Gesture guide"]')`)) await named(page,"Gesture help");
  await named(page,"Preview confetti");
  await close(page); assert.equal((await stats(page)).liveTracks, 0);
  assert.equal(await page.evaluate("document.querySelectorAll('[data-confetti-renderer]').length"), 0, "Close removes effects immediately");
});

await scenario("gpu-context-loss-after-inference-rebuilds-one-cpu-detector", async (page, result) => {
  await page.evaluate(`(()=>{window.__gestureGlContexts=[];for(const proto of [HTMLCanvasElement.prototype,globalThis.OffscreenCanvas?.prototype].filter(Boolean)){const get=proto.getContext;proto.getContext=function(kind,...args){const context=get.call(this,kind,...args);if(context&&/webgl/i.test(kind))window.__gestureGlContexts.push(context);return context}}})()`);
  await open(page); await camera(page, "live"); await gestures(page, "ready");
  result.initialDelegate = await page.evaluate(`document.querySelector('${app}').dataset.gestureDelegate`);
  if (result.initialDelegate !== "GPU") {
    result.status = "SKIP"; result.reason = "This browser initialized CPU, so there was no live GPU detector context to lose.";
    await close(page); return;
  }
  result.loss = await page.evaluate(`(()=>{const gl=window.__gestureGlContexts.at(-1);if(!gl)throw Error('No detector GL context captured');const extension=gl.getExtension('WEBGL_lose_context');if(extension){extension.loseContext();return{method:'WEBGL_lose_context',contexts:window.__gestureGlContexts.length}}gl.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));return{method:'synthetic webglcontextlost event',contexts:window.__gestureGlContexts.length}})()`);
  await page.wait(`document.querySelector('${app}')?.dataset.gestureDelegate==='CPU'&&document.querySelector('${app}')?.dataset.gestureStatus==='ready'`, "CPU ready after GPU context loss", 45000);
  result.final = await page.evaluate(`({delegate:document.querySelector('${app}').dataset.gestureDelegate,status:document.querySelector('${app}').dataset.gestureStatus})`);
  assert.equal((await stats(page)).calls.length, 1, "Detector replacement does not create another camera");
  await close(page); assert.equal((await stats(page)).liveTracks, 0);
});

for (const [kind, blocked] of [["model", ["*hand_landmarker.task*"]], ["wasm", ["*vision_wasm*"]]]) {
  await scenario(`${kind}-asset-failure-keeps-camera-usable-and-retries`, async (page, result) => {
    await open(page); await camera(page, "live"); await gestures(page, "failed");
    result.failure = await page.evaluate(`document.querySelector('${app}').innerText`);
    assert.equal((await stats(page)).liveTracks, 1, "Model errors do not become permission errors");
    await page.send("Network.setBlockedURLs", { urls: [] });
    await named(page, "Retry gestures"); await gestures(page, "ready");
    result.delegate = await page.evaluate(`document.querySelector('${app}').dataset.gestureDelegate`);
    result.assetRequests = page.requests.filter(url => /hand_landmarker|vision_wasm/.test(url));
    await close(page); assert.equal((await stats(page)).liveTracks, 0);
  }, { block: blocked });
}

await scenario("insecure-context-fixture-has-actionable-status-and-no-request", async (page, result) => {
  await open(page); await camera(page, "error");
  result.text = await page.evaluate(`document.querySelector('${app}').innerText`);
  assert.match(result.text, /https|secure/i); assert.equal((await stats(page)).calls.length, 0);
}, { insecure: true });

await mkdir(output, { recursive: true });
await writeFile(new URL(`${process.env.FACETIME_REPORT_NAME ?? "browser-results"}.json`, output), `${JSON.stringify(report, null, 2)}\n`);
socket.close(); if (failures) process.exitCode = 1;
