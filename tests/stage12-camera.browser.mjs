// Stage 12 production integration profile, isolated Chrome CDP.
// Real model + photo-fed native canvas video + actual Music playback.
// This does NOT exercise a physical webcam, native permission prompt, Windows, or Safari.
// STAGE12_PHASE=baseline CDP_URL=http://127.0.0.1:9230 node tests/stage12-camera.browser.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3012";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9229";
const filter = process.env.STAGE12_CAMERA_FILTER;
const phase = process.env.STAGE12_PHASE ?? "baseline";
if (!/^[a-zA-Z0-9_-]+$/.test(phase)) throw Error("Invalid phase output label");
const output = new URL(process.env.STAGE12_CAMERA_OUTPUT ?? "../docs/stage12-review/camera/", import.meta.url);
const fixtureImages = await Promise.all(["thumb_up", "victory"].map(async name => `data:image/jpeg;base64,${(await readFile(path.join(process.env.FACETIME_FIXTURE_DIR ?? "/private/tmp/portfolio-stage12-fixtures",`${name}.jpg`))).toString("base64")}`));
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

// Test-only counters. Pending callback counts exclude a callback while it runs.
// Weak references avoid keeping disposed detector canvases alive for the probe.
function resourceFixture() {
  const videoCallbacks = new Map(), canvases = [];
  const register = HTMLVideoElement.prototype.requestVideoFrameCallback;
  const cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
  if (register && cancel) {
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      let pending = videoCallbacks.get(this);
      if (!pending) { pending = new Set(); videoCallbacks.set(this, pending); }
      const id = register.call(this, (now, metadata) => { pending.delete(id); callback(now, metadata); });
      pending.add(id);
      return id;
    };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = function(id) {
      videoCallbacks.get(this)?.delete(id);
      return cancel.call(this, id);
    };
  }
  for (const prototype of [HTMLCanvasElement.prototype, globalThis.OffscreenCanvas?.prototype].filter(Boolean)) {
    const get = prototype.getContext;
    prototype.getContext = function(kind, ...args) {
      const context = get.call(this, kind, ...args);
      if (context && /webgl/i.test(kind) && !canvases.some(ref => ref.deref() === this)) canvases.push(new WeakRef(this));
      return context;
    };
  }
  window.__cameraResources = () => {
    let pendingVideoCallbacks = 0;
    for (const [video, pending] of videoCallbacks) {
      pendingVideoCallbacks += pending.size;
      if (!video.isConnected && !pending.size) videoCallbacks.delete(video);
    }
    return {
      pendingVideoCallbacks,
      cameraApps: document.querySelectorAll('[data-facetime-app]').length,
      effectRoots: document.querySelectorAll('[data-confetti-renderer],[data-floating-likes]').length,
      effectParticles: document.querySelectorAll('[data-confetti-particle],[data-like-particle]').length,
      nonzeroWebGLCanvases: canvases.map(ref => ref.deref()).filter(canvas => canvas && canvas.width > 0 && canvas.height > 0).length,
      audio: [...document.querySelectorAll('audio')].map(audio => ({ paused: audio.paused, currentTime: audio.currentTime, readyState: audio.readyState, source: audio.currentSrc || audio.src, ended: audio.ended })),
    };
  };
}

// Real MediaStream/VideoTrack and native video playback, with a deliberately
// blank animated canvas as the camera. Error and delayed-request fixtures are
// controlled here, never shipped in the application.
function mediaFixture(options = {}) {
  const state = window.__cameraTest = {
    calls: [], tracks: [], stops: 0, pending: [], events: [], paintIntervals: 0,
    behaviors: [...(options.behaviors ?? ["ok"])],
    playbackFailures: options.playbackFailures ?? 0,
  };
  const images = (options.images ?? []).map(src => { const image = new Image(); image.src = src; return image; });
  const readyImages = Promise.all(images.map(image => image.decode()));
  state.pose = "thumb";
  const createStream = () => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext("2d");
    let tick = 0;
    const paint = () => { context.fillStyle = "#233038"; context.fillRect(0, 0, 640, 480); const image=state.pose === "thumb" ? images[0] : state.pose === "peace" ? images[1] : null; if(image) { const scale=Math.min(600/image.width,460/image.height),w=image.width*scale,h=image.height*scale; context.drawImage(image,(640-w)/2,(480-h)/2,w,h); } context.fillStyle=`rgb(${tick++ % 255},0,0)`; context.fillRect(0,0,2,2); };
    paint();
    const stream = canvas.captureStream(30);
    const timer = setInterval(paint, 33); state.paintIntervals++; let ended = false;
    for (const track of stream.getTracks()) {
      const stop = track.stop.bind(track);
      track.stop = () => { if (track.readyState !== "ended") state.stops++; if (!ended) { ended = true; clearInterval(timer); state.paintIntervals--; } stop(); };
      state.tracks.push(track);
    }
    return stream;
  };
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true,
    value: async constraints => {
      await readyImages;
      state.calls.push({ constraints, at: performance.now() });
      const behavior = state.behaviors.shift() ?? "ok";
      if (behavior === "pending") return new Promise(resolve => state.pending.push(() => resolve(createStream())));
      if (behavior !== "ok") return Promise.reject(new DOMException(`Synthetic ${behavior}`, behavior));
      return Promise.resolve(createStream());
    },
  });
  state.resolve = () => state.pending.splice(0).forEach(resolve => resolve());
  state.stats = () => ({
    calls: state.calls, stops: state.stops, pending: state.pending.length, paintIntervals: state.paintIntervals,
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
  await send("Network.setCacheDisabled", { cacheDisabled: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(${resourceFixture.toString()})()` });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('portfolio-appearance',JSON.stringify({version:1,state:{theme:'dark',wallpaper:'coast',wallpaperMode:'auto'}}));(${mediaFixture.toString()})(${JSON.stringify({ ...options, images: fixtureImages })});`,
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

async function close(page) { await click(page, `${frame} [data-window-control="close"]`); await page.wait(`!document.querySelector('${frame}')`, "FaceTime closed"); }


function hostDetail(command, args) {
  try { return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return "Unavailable"; }
}
const report = {
  testedAt: new Date().toISOString(), phase,
  site, viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  cacheNetwork: "New isolated context for each scenario; normal HTTP cache, unthrottled localhost; camera/model warmed before measured profile windows.",
  measurementScope: "Local rAF callback cadence and event-to-next-rAF latency; not field INP, GPU presentation, or whole-machine CPU.",
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
    await writeFile(new URL(`${phase}-results.json`, output), `${JSON.stringify(report, null, 2)}\n`);
    await page.close();
  }
}


function summarize(values) {
 const sorted=[...values].sort((a,b)=>a-b),at=q=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]??0;
 return {count:sorted.length,mean:sorted.reduce((a,b)=>a+b,0)/(sorted.length||1),p50:at(.5),p95:at(.95),max:sorted.at(-1)??0};
}
async function traceStart(page) {
 await page.send('Performance.enable');
 await command('Tracing.start',{categories:'devtools.timeline,blink.user_timing,v8.execute',transferMode:'ReturnAsStream'});
}
async function traceEnd(name) {
 let stream;
 const complete=message=>{if(message.method==='Tracing.tracingComplete')stream=message.params.stream;};listeners.add(complete);
 await command('Tracing.end');await until(()=>stream,'trace completion');listeners.delete(complete);
 let data='';while(true){const chunk=await command('IO.read',{handle:stream,size:1048576});data+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}
 await command('IO.close',{handle:stream});
 const {gzipSync}=await import('node:zlib');await writeFile(new URL(`${name}.trace.json.gz`,output),gzipSync(data));
 const trace=JSON.parse(data);
 return {events:trace.traceEvents.length,analysis:'Use the target PerformanceObserver longtask entries in measurements; trace FunctionCall nesting is not an independent long-task count.'};
}
async function dragWindow(page,selector,dx,dy,steps=30) {
 const before=await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return{x:r.x+r.width*.65,y:r.y+r.height/2}})()`);
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...before});
 await page.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...before});
 for(let i=1;i<=steps;i++){await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x:before.x+dx*i/steps,y:before.y+dy*i/steps});await sleep(16);}
 await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:before.x+dx,y:before.y+dy});
}

async function named(page, label) {
  await page.evaluate(`(()=>{const root=document.querySelector('${app}'),button=[...root.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.title===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing camera action: '+${JSON.stringify(label)});root.querySelectorAll('[data-camera-action]').forEach(b=>b.removeAttribute('data-camera-action'));button.dataset.cameraAction='selected'})()`);
  await click(page, `${app} [data-camera-action="selected"]`);
}
async function hidden(page, value) {
  // Visibility fixture. This does not claim native tab background scheduling.
  await page.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:${value}});Object.defineProperty(document,'visibilityState',{configurable:true,value:'${value ? "hidden" : "visible"}'});document.dispatchEvent(new Event('visibilitychange'))`);
}
async function audioState(page) {
  return page.evaluate(`(()=>{const a=document.querySelector('[data-window-frame="app-music"] audio');return a?{paused:a.paused,currentTime:a.currentTime,readyState:a.readyState,ended:a.ended,src:a.currentSrc||a.src,status:document.querySelector('[data-music-status]')?.dataset.musicStatus}:null})()`);
}
async function startMusic(page) {
  await click(page, '[data-dock-app="music"]');
  await page.wait(`!!document.querySelector('[data-window-frame="app-music"]')`, 'Music open');
  await click(page, '[data-window-frame="app-music"] button[aria-label="Play"]');
  await page.wait(`document.querySelector('[data-music-status]')?.dataset.musicStatus==='playing'`, 'actual Music playing');
  const before = await audioState(page);
  await page.wait(`(()=>{const a=document.querySelector('[data-window-frame="app-music"] audio');return a&&!a.paused&&a.currentTime>${before.currentTime + .05}})()`, 'native audio clock advances', 5000);
  const after = await audioState(page);
  assert.ok(after.currentTime > before.currentTime && !after.paused, 'Native audio time advances');
  await dragWindow(page, '[data-window-frame="app-music"]>div:first-child', -130, 160, 15);
  return after;
}
async function startMeasurement(page) {
  await page.evaluate(`(()=>{
    const p=window.__profile={inference:[],frames:[],longTasks:[],recognitions:[],dragLatency:[],segments:[],started:performance.now()};
    p.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.name==='portfolio:hand-inference')p.inference.push({at:e.startTime,duration:e.duration});});p.observer.observe({entryTypes:['measure']});
    p.longObserver=new PerformanceObserver(list=>{for(const e of list.getEntries())p.longTasks.push({at:e.startTime,duration:e.duration});});p.longObserver.observe({entryTypes:['longtask']});
    let last=performance.now();const tick=now=>{p.frames.push({at:now,duration:now-last});last=now;p.raf=requestAnimationFrame(tick);};p.raf=requestAnimationFrame(tick);
    p.pointer=event=>{if(event.buttons!==1)return;const at=performance.now();requestAnimationFrame(()=>p.dragLatency.push({at,duration:performance.now()-at}));};document.addEventListener('pointermove',p.pointer);
    p.mutation=new MutationObserver(()=>{const text=document.querySelector('${app} [data-recognition-feedback]')?.innerText??'',label=text.includes('Peace sign detected')?'peace':text.includes('Thumbs up detected')?'thumbsup':null;if(label&&p.recognitions.at(-1)?.label!==label)p.recognitions.push({label,at:performance.now()});});p.mutation.observe(document.querySelector('${app}'),{childList:true,subtree:true,characterData:true});
  })()`);
}
async function stopMeasurement(page) {
  return page.evaluate(`(()=>{const p=window.__profile;cancelAnimationFrame(p.raf);p.observer.disconnect();p.longObserver.disconnect();p.mutation.disconnect();document.removeEventListener('pointermove',p.pointer);return{inference:p.inference,frames:p.frames,longTasks:p.longTasks,recognitions:p.recognitions,dragLatency:p.dragLatency,segments:p.segments}})()`);
}
function summarizeSegment(measured, segment) {
  const inferences=measured.inference.filter(e=>e.at>=segment.start&&e.at<segment.end);
  const frames=measured.frames.filter(e=>e.at>=segment.start&&e.at<segment.end);
  const tasks=measured.longTasks.filter(e=>e.at>=segment.start&&e.at<segment.end);
  const duration=(segment.end-segment.start)/1000;
  return {
    name:segment.name,seconds:duration,inferenceRate:inferences.length/duration,
    nativeInferenceMs:summarize(inferences.map(e=>e.duration)), frameIntervalMs:summarize(frames.map(e=>e.duration)),
    framesOver16_7ms:frames.filter(e=>e.duration>16.7).length,
    framesOver33_4ms:frames.filter(e=>e.duration>33.4).length,
    framesOver50ms:frames.filter(e=>e.duration>50).length,
    longTasks:tasks.length,longTaskMs:summarize(tasks.map(e=>e.duration)),
    pointerToNextRafMs:summarize(measured.dragLatency.filter(e=>e.at>=segment.start&&e.at<segment.end).map(e=>e.duration)),
  };
}

await scenario('combined-scene-camera-recognition-effects-music-and-window-drag',async(page,result)=>{
  await open(page); await camera(page,'live'); await gestures(page,'ready');
  await page.evaluate(`window.__cameraTest.pose='none'`);
  result.audioAtStart=await startMusic(page);
  await click(page,'[data-dock-app="facetime"]');
  await click(page,'[data-dock-app="notes"]');
  await page.wait(`!!document.querySelector('[data-window-frame="app-notes"]')`,'Notes open');
  await dragWindow(page,'[data-window-frame="app-notes"]>div:first-child',225,145,18);
  await page.screenshot(`${phase}-combined-before-measurement`);
  await startMeasurement(page);
  const metrics=async()=>Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  await traceStart(page); const before=await metrics(); const profileStart=await page.evaluate('performance.now()');
  const segment=async(name,action)=>{
    const start=await page.evaluate('performance.now()');const resourcesBefore=await page.evaluate('window.__cameraResources()');
    await action();const end=await page.evaluate('performance.now()');const resourcesAfter=await page.evaluate('window.__cameraResources()');
    await page.evaluate(`window.__profile.segments.push(${JSON.stringify({name,start,end,resourcesBefore,resourcesAfter})})`);
  };
  await segment('scene-camera-music-no-hand',async()=>{await page.evaluate(`window.__cameraTest.pose='none'`);await sleep(7000);});
  await segment('recognition-effects-and-music',async()=>{
    await page.evaluate(`window.__cameraTest.pose='thumb'`);await sleep(3500);
    await page.evaluate(`window.__cameraTest.pose='peace'`);await sleep(3500);
  });
  result.notesBefore=await page.evaluate(`document.querySelector('[data-window-frame="app-notes"]').getBoundingClientRect().toJSON()`);
  await segment('recognition-effects-music-and-drag',async()=>{
    for(const [pose,dx,dy] of [['thumb',-150,-110],['peace',150,110],['thumb',-150,-110],['peace',150,110]]) {
      await page.evaluate(`window.__cameraTest.pose=${JSON.stringify(pose)}`);
      await dragWindow(page,'[data-window-frame="app-notes"]>div:first-child',dx,dy,45);
      await sleep(2000);
    }
  });
  const profileEnd=await page.evaluate('performance.now()');const after=await metrics();
  result.trace=await traceEnd(`${phase}-combined`);
  result.measurements=await stopMeasurement(page);
  result.summary=result.measurements.segments.map(segment=>summarizeSegment(result.measurements,segment));
  result.delegate=await page.evaluate(`document.querySelector('${app}').dataset.gestureDelegate`);
  result.mainThreadTaskSeconds=after.TaskDuration-before.TaskDuration;
  result.profileSeconds=(profileEnd-profileStart)/1000;
  result.mainThreadBusyProxy=result.mainThreadTaskSeconds/result.profileSeconds;
  result.heapBefore=before.JSHeapUsedSize;result.heapAfter=after.JSHeapUsedSize;
  result.resources=await page.evaluate('window.__cameraResources()');result.media=await stats(page);
  result.audioAtEnd=await audioState(page);
  result.notesAfter=await page.evaluate(`document.querySelector('[data-window-frame="app-notes"]').getBoundingClientRect().toJSON()`);
  assert.ok(result.measurements.recognitions.some(e=>e.label==='thumbsup'),'Real inference recognizes thumb-up photograph fixture');
  assert.ok(result.measurements.recognitions.some(e=>e.label==='peace'),'Real inference recognizes victory photograph fixture');
  assert.ok(result.measurements.dragLatency.length>100,'Another window actually dragged during inference');
  assert.ok(result.audioAtEnd.currentTime>result.audioAtStart.currentTime+20&&!result.audioAtEnd.paused,'Music continued playing during measured work');
  assert.equal(result.media.liveTracks,1);assert.equal(result.resources.pendingVideoCallbacks,1,'Only one inference video callback is scheduled');
  assert.ok(result.resources.effectParticles<=76,'Particle population remains bounded');
  await page.screenshot(`${phase}-combined-after-measurement`);
  await click(page,'[data-window-frame="app-notes"] [data-window-control="close"]');
  await open(page);await close(page);await sleep(350);
  assert.equal((await stats(page)).liveTracks,0);
  assert.equal((await page.evaluate('window.__cameraResources()')).pendingVideoCallbacks,0);
  await click(page,'[data-dock-app="music"]');await click(page,'[data-window-frame="app-music"] [data-window-control="close"]');
  await page.wait(`!document.querySelector('[data-window-frame="app-music"]')`,'Music close animation completed');
  result.afterClose=await page.evaluate('window.__cameraResources()');
  assert.equal(result.afterClose.audio.length,0);assert.equal(result.afterClose.effectRoots,0);
});

await scenario('camera-denial-retry-hidden-restore-and-repeated-cleanup',async(page,result)=>{
  await open(page);await camera(page,'error');
  result.deniedText=await page.evaluate(`document.querySelector('${app}').innerText`);
  assert.match(result.deniedText,/denied|dismissed/);
  result.deniedMedia=await stats(page);
  assert.equal(result.deniedMedia.liveTracks,0);
  await named(page,'Retry camera');await camera(page,'live');await gestures(page,'ready');
  result.retriedMedia=await stats(page);
  assert.equal(result.retriedMedia.calls.length,2);
  await page.evaluate(`window.__stage12InferenceCount=0;window.__stage12InferenceObserver=new PerformanceObserver(list=>{window.__stage12InferenceCount+=list.getEntries().filter(e=>e.name==='portfolio:hand-inference').length});window.__stage12InferenceObserver.observe({entryTypes:['measure']});`);
  await hidden(page,true);await camera(page,'paused');
  const hiddenBefore=await page.evaluate('window.__stage12InferenceCount');await sleep(1400);
  result.hidden={inferencesDuringPause:await page.evaluate('window.__stage12InferenceCount')-hiddenBefore,resources:await page.evaluate('window.__cameraResources()'),media:await stats(page)};
  assert.equal(result.hidden.inferencesDuringPause,0);assert.equal(result.hidden.media.liveTracks,0);assert.equal(result.hidden.resources.pendingVideoCallbacks,0);
  await hidden(page,false);await camera(page,'live');await gestures(page,'ready');
  await click(page,`${frame} [data-window-control="minimize"]`);await camera(page,'paused');
  await sleep(200);result.minimized=await page.evaluate('window.__cameraResources()');assert.equal(result.minimized.pendingVideoCallbacks,0);assert.equal((await stats(page)).liveTracks,0);
  await open(page);await camera(page,'live');await gestures(page,'ready');
  result.pageHideImmediate=await page.evaluate(`(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));return window.__cameraTest.stats()})()`);
  assert.equal(result.pageHideImmediate.liveTracks,0);
  await page.evaluate(`window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`);await camera(page,'live');await gestures(page,'ready');
  await close(page);await sleep(350);
  await page.send('Performance.enable');
  const sample=async cycle=>{
    await page.evaluate(`window.__cameraTest.tracks=window.__cameraTest.tracks.filter(t=>t.readyState==='live');window.__cameraTest.events=[];window.__cameraTest.calls=[];window.__cameraResources()`);
    await page.send('HeapProfiler.collectGarbage');await sleep(150);
    const dom=await page.send('Memory.getDOMCounters');
    const metrics=Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
    return{cycle,...dom,heapUsed:metrics.JSHeapUsedSize,resources:await page.evaluate('window.__cameraResources()'),media:await stats(page)};
  };
  result.resources=[await sample(0)];
  for(let cycle=1;cycle<=8;cycle++){
    await open(page);await camera(page,'live');await gestures(page,'ready');
    await close(page);await sleep(300);
    if(cycle%2===0)result.resources.push(await sample(cycle));
  }
  const stoppedBefore=await page.evaluate('window.__stage12InferenceCount');await sleep(1400);
  result.inferencesAfterClose=await page.evaluate('window.__stage12InferenceCount')-stoppedBefore;
  await page.evaluate('window.__stage12InferenceObserver.disconnect()');
  assert.equal(result.inferencesAfterClose,0);
  for(const sample of result.resources){assert.equal(sample.media.liveTracks,0);assert.equal(sample.media.paintIntervals,0);assert.equal(sample.resources.cameraApps,0);assert.equal(sample.resources.effectRoots,0);assert.equal(sample.resources.pendingVideoCallbacks,0);assert.equal(sample.resources.nonzeroWebGLCanvases,1,'Only the laptop renderer canvas remains nonzero');}
},{behaviors:['NotAllowedError','ok']});

await mkdir(output,{recursive:true});
report.completedAt=new Date().toISOString();
await writeFile(new URL(`${phase}-results.json`,output),JSON.stringify(report,null,2)+'\n');
socket.close();if(failures)process.exitCode=1;
