// U13 loopback-only observation of the production build. Never imported by app code.
import { createServer } from "node:http";
import { Readable } from "node:stream";
const upstream = process.env.PORTFOLIO_AUDIT_UPSTREAM ?? "http://127.0.0.1:3012";

function instrument(mode) {
  const nativeRAF = requestAnimationFrame.bind(window), nativeCancel = cancelAnimationFrame.bind(window);
  const pendingRAF = new Set(), pendingVideo = new Set(), trackRefs = [], photoURLs = new Set();
  const globals = new Set(), callbackIDs = new WeakMap(), desktopSeen = new WeakSet(), rendererSeen = new WeakSet();
  let callbackID = 0, videoID = 0, desktopMounts = 0, rendererMounts = 0, requests = 0, audioRequests = 0;
  const videoIDs = new WeakMap(), samples = [], heaps = [], events = [], longTasks = [], inference = [];
  let sampling = false, started = 0, frames = [], previous = 0, loaderSeen = false, readyAt = null;
  const max = (array, value, limit = 512) => { if (array.length < limit) array.push(value); };
  const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null;
  const stats = values => ({ n: values.length, p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: values.length ? Math.max(...values) : null, over16_7: values.filter(x => x > 16.7).length, over33_4: values.filter(x => x > 33.4).length });
  window.requestAnimationFrame = fn => { let id; id = nativeRAF(t => { pendingRAF.delete(id); fn(t); }); pendingRAF.add(id); return id; };
  window.cancelAnimationFrame = id => { pendingRAF.delete(id); return nativeCancel(id); };
  if (HTMLVideoElement.prototype.requestVideoFrameCallback) {
    const p = HTMLVideoElement.prototype, request = p.requestVideoFrameCallback, cancel = p.cancelVideoFrameCallback;
    p.requestVideoFrameCallback = function (fn) {
      if (!videoIDs.has(this)) videoIDs.set(this, ++videoID);
      const prefix = videoIDs.get(this) + ":"; let id;
      id = request.call(this, (...args) => { pendingVideo.delete(prefix + id); fn(...args); }); pendingVideo.add(prefix + id); return id;
    };
    p.cancelVideoFrameCallback = function (id) { pendingVideo.delete(videoIDs.get(this) + ":" + id); return cancel.call(this, id); };
  }
  // Only explicit global registrations without once/signal are counted. This is
  // an add/remove balance, not a heap census. IDs/WeakRefs do not retain nodes.
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  const globalKey = (target, type, fn, options) => {
    if ((target !== window && target !== document) || !fn || (typeof fn !== "function" && typeof fn !== "object")) return null;
    if (!callbackIDs.has(fn)) callbackIDs.set(fn, ++callbackID);
    return `${target === window ? "w" : "d"}:${type}:${callbackIDs.get(fn)}:${typeof options === "boolean" ? options : !!options?.capture}`;
  };
  EventTarget.prototype.addEventListener = function (type, fn, options) {
    const key = globalKey(this, type, fn, options);
    if (key && !options?.once && !options?.signal) globals.add(key);
    return add.call(this, type, fn, options);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    const key = globalKey(this, type, fn, options); if (key) globals.delete(key);
    return remove.call(this, type, fn, options);
  };
  const createURL = URL.createObjectURL.bind(URL), revokeURL = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = createURL(blob); if (blob.type === "image/png") photoURLs.add(url); return url; };
  URL.revokeObjectURL = url => { photoURLs.delete(url); return revokeURL(url); };
  if (navigator.mediaDevices?.getUserMedia) {
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      requests++; if (constraints.audio) audioRequests++;
      if (mode === "camera-denied") throw new DOMException("Permission denied by U13 fixture", "NotAllowedError");
      const stream = await getMedia(constraints); stream.getTracks().forEach(track => trackRefs.push(new WeakRef(track))); return stream;
    };
  }
  if (mode === "no-webgl") {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /^(webgl2?|experimental-webgl)$/.test(kind) ? null : get.call(this, kind, ...args); };
  }
  const observe = (type, callback, extra = {}) => { try { new PerformanceObserver(list => list.getEntries().forEach(callback)).observe({ type, buffered: true, ...extra }); } catch {} };
  observe("longtask", entry => { if (sampling && entry.startTime >= started) max(longTasks, { at: entry.startTime, duration: entry.duration }); });
  observe("event", entry => { if (sampling && entry.startTime >= started && !entry.target?.closest?.("#u13-audit")) max(events, { name: entry.name, at: entry.startTime, duration: entry.duration, delay: entry.processingStart - entry.startTime, processing: entry.processingEnd - entry.processingStart, id: entry.interactionId }); }, { durationThreshold: 16 });
  observe("measure", entry => { if (sampling && entry.startTime >= started && entry.name === "portfolio:hand-inference") max(inference, { at: entry.startTime, duration: entry.duration }); });
  const frame = t => { if (sampling && !document.hidden) { if (previous) max(frames, t - previous, 7200); previous = t; } else previous = 0; nativeRAF(frame); }; nativeRAF(frame);
  add.call(document, "visibilitychange", () => { previous = 0; });
  function resources() {
    document.querySelectorAll("#desktop-root").forEach(node => { if (!desktopSeen.has(node)) { desktopSeen.add(node); desktopMounts++; } });
    document.querySelectorAll("canvas[data-engine]").forEach(node => { if (!rendererSeen.has(node)) { rendererSeen.add(node); rendererMounts++; } });
    const audios = [...document.querySelectorAll("audio")], camera = document.querySelector("[data-facetime-app]");
    return { desktops: document.querySelectorAll("#desktop-root").length, renderers: document.querySelectorAll("canvas[data-engine]").length, desktopMounts, rendererMounts,
      audioElements: audios.length, playingAudio: audios.filter(a => !a.paused && !a.ended).length, audioTimes: audios.map(a => a.currentTime),
      cameraRequests: requests, audioRequests, activeTracks: trackRefs.filter(ref => ref.deref()?.readyState === "live").length, photoURLs: photoURLs.size,
      pendingRAF: pendingRAF.size, pendingVideo: pendingVideo.size, globalListenerBalance: globals.size,
      camera: camera?.getAttribute("data-camera-status"), gestures: camera?.getAttribute("data-gesture-status"),
      route: document.querySelector("[data-portfolio-route]")?.getAttribute("data-portfolio-route"), heapBytes: performance.memory?.usedJSHeapSize ?? null };
  }
  add.call(document, "DOMContentLoaded", () => {
    const output = document.createElement("output"); output.id = "u13-observations"; output.hidden = true; document.body.append(output);
    const controls = document.createElement("details"); controls.id = "u13-audit";
    Object.assign(controls.style, { position: "fixed", bottom: "0", left: "0", zIndex: "2147483647", background: "#eee", color: "#222", font: "11px system-ui", padding: "2px 5px", borderRadius: "5px" });
    controls.innerHTML = '<summary>U13 audit controls</summary><button type="button">Start measurement</button><button type="button">Stop measurement</button>';
    const [start, stop] = controls.querySelectorAll("button");
    start.onclick = () => { started = performance.now(); frames = []; events.length = longTasks.length = inference.length = 0; previous = 0; sampling = true; controls.open = false; };
    stop.onclick = () => { sampling = false; const elapsed = performance.now() - started;
      max(samples, { started, durationMs: elapsed, frames: stats(frames), longTasks: [...longTasks], events: [...events], localEventDuration: stats(events.map(e => e.duration)), inference: stats(inference.map(e => e.duration)), inferenceHz: inference.length * 1000 / elapsed, resources: resources() }, 25); controls.open = false; report(); };
    document.body.append(controls);
    function report() {
      loaderSeen ||= !!document.querySelector("[data-startup-overlay]");
      if (!readyAt && document.querySelector("#desktop-root") && !document.querySelector("[data-startup-overlay]")
        && document.getElementById("portfolio-desktop-status")?.textContent.includes("ready to explore")) readyAt = performance.now();
      const r = resources();
      if (heaps.length < 1200) heaps.push({ at: performance.now(), bytes: r.heapBytes });
      const entries = performance.getEntriesByType("resource");
      output.textContent = JSON.stringify({ mode, at: performance.now(), loaderSeen, readyAt,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, visualScale: visualViewport?.scale }, userAgent: navigator.userAgent,
        guide: document.querySelector("[data-introduction-panel]")?.getAttribute("data-introduction-step"), resources: r, samples, heaps,
        requests: entries.map(e => ({ url: e.name, type: e.initiatorType, start: e.startTime, duration: e.duration, transfer: e.transferSize, decoded: e.decodedBodySize, status: e.responseStatus })) });
    }
    setInterval(report, 1000); report();
  }, { once: true });
}

for (const [port, mode] of [[3014, "production-observation"], [3015, "no-webgl"], [3016, "fresh-skip"], [3017, "camera-denied"]]) {
  createServer(async (request, response) => {
    try {
      const headers = { ...request.headers, "accept-encoding": "identity" }; delete headers.host; delete headers.connection;
      const result = await fetch(new URL(request.url ?? "/", upstream), { headers, redirect: "manual" });
      const outgoing = Object.fromEntries(result.headers); delete outgoing["transfer-encoding"]; delete outgoing.connection;
      if ((outgoing["content-type"] ?? "").includes("text/html")) {
        const html = (await result.text()).replace("<head>", `<head><script>(${instrument.toString()})(${JSON.stringify(mode)})</script>`);
        delete outgoing["content-encoding"]; outgoing["content-length"] = Buffer.byteLength(html); outgoing["cache-control"] = "no-store";
        response.writeHead(result.status, outgoing); response.end(html);
      } else {
        response.writeHead(result.status, outgoing);
        if (result.body) Readable.fromWeb(result.body).pipe(response); else response.end();
      }
    } catch (error) { if (!response.headersSent) response.writeHead(502); response.end(String(error)); }
  }).listen(port, "127.0.0.1", () => console.log(`${mode}: http://127.0.0.1:${port}`));
}
