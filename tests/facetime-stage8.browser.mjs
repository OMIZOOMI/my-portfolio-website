// Stage 8 combined 3D/camera/recognition/effect/drag profile, isolated Chrome CDP.
// A photo-fed canvas camera runs the real model, NOT a physical webcam test.
// FACETIME_PROFILE_PHASE=after node tests/facetime-stage8.browser.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9225";
const filter = process.env.FACETIME_TEST_FILTER;
const phase = process.env.FACETIME_PROFILE_PHASE ?? "after";
const output = new URL("../docs/facetime-stage8/", import.meta.url);
const fixtureImages = await Promise.all(["thumb_up", "victory"].map(async name => `data:image/jpeg;base64,${(await readFile(path.join(process.env.FACETIME_FIXTURE_DIR ?? "/private/tmp/portfolio-stage8-fixtures",`${name}.jpg`))).toString("base64")}`));
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
    const timer = setInterval(paint, 33);
    for (const track of stream.getTracks()) {
      const stop = track.stop.bind(track);
      track.stop = () => { state.stops++; clearInterval(timer); stop(); };
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
 const trace=JSON.parse(data);const tasks=trace.traceEvents.filter(e=>e.name==='RunTask'&&e.dur);
 return {events:trace.traceEvents.length,longTasks:tasks.filter(e=>e.dur>50000).length};
}
async function dragWindow(page,selector,dx,dy,steps=30) {
 const before=await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return{x:r.x+r.width*.65,y:r.y+r.height/2}})()`);
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...before});
 await page.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...before});
 for(let i=1;i<=steps;i++){await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x:before.x+dx*i/steps,y:before.y+dy*i/steps});await sleep(16);}
 await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:before.x+dx,y:before.y+dy});
}
await scenario('combined-scene-camera-recognition-effects-and-window-drag',async(page,result)=>{
 await open(page);await camera(page,'live');await gestures(page,'ready');
 await page.screenshot(`${phase}-normal`);
 await page.evaluate(`window.__cameraTest.pose='none'`);await sleep(1000);
 await click(page,'[data-dock-app="notes"]');await page.wait(`!!document.querySelector('[data-window-frame="app-notes"]')`,'Notes open');await sleep(350);
 await dragWindow(page,'[data-window-frame="app-notes"]>div:first-child',190,140,15);
 await page.evaluate(`(()=>{
 const p=window.__profile={inference:[],frames:[],longTasks:[],recognitions:[],dragLatency:[],segments:[],started:performance.now()};
 p.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.name==='portfolio:hand-inference')p.inference.push({at:e.startTime,duration:e.duration});});p.observer.observe({entryTypes:['measure']});
 p.longObserver=new PerformanceObserver(list=>{for(const e of list.getEntries())p.longTasks.push({at:e.startTime,duration:e.duration});});p.longObserver.observe({entryTypes:['longtask']});
 let last=performance.now();const tick=now=>{p.frames.push({at:now,duration:now-last});last=now;p.raf=requestAnimationFrame(tick);};p.raf=requestAnimationFrame(tick);
 p.pointer=event=>{if(event.buttons!==1)return;const at=performance.now();requestAnimationFrame(()=>p.dragLatency.push(performance.now()-at));};document.addEventListener('pointermove',p.pointer);
 p.mutation=new MutationObserver(()=>{const text=document.querySelector('${app}')?.innerText??'',label=text.includes('Peace sign detected')?'peace':text.includes('Thumbs up detected')?'thumbsup':null;if(label&&p.recognitions.at(-1)?.label!==label)p.recognitions.push({label,at:performance.now()});});p.mutation.observe(document.querySelector('${app}'),{childList:true,subtree:true,characterData:true});
 })()`);
 const metrics=async()=>Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 await traceStart(page);const before=await metrics();
 const segment=async(name,action)=>{const start=await page.evaluate('performance.now()');await action();const end=await page.evaluate('performance.now()');await page.evaluate(`window.__profile.segments.push(${JSON.stringify({name,start,end})})`);};
 await segment('scene-camera-no-hand',async()=>{await page.evaluate(`window.__cameraTest.pose='none'`);await sleep(5000);});
 await segment('recognition-and-effects',async()=>{await page.evaluate(`window.__cameraTest.pose='thumb'`);await sleep(3000);await page.evaluate(`window.__cameraTest.pose='peace'`);await sleep(3000);});
 result.notesBefore=await page.evaluate(`document.querySelector('[data-window-frame="app-notes"]').getBoundingClientRect().toJSON()`);
 await segment('recognition-effects-and-drag',async()=>{
  await page.evaluate(`window.__cameraTest.pose='thumb'`);
  await dragWindow(page,'[data-window-frame="app-notes"]>div:first-child',-120,-90,45);await sleep(1300);
  await page.evaluate(`window.__cameraTest.pose='peace'`);
  await dragWindow(page,'[data-window-frame="app-notes"]>div:first-child',135,100,45);await sleep(1300);
 });
 result.notesAfter=await page.evaluate(`document.querySelector('[data-window-frame="app-notes"]').getBoundingClientRect().toJSON()`);
 const after=await metrics();result.trace=await traceEnd(`${phase}-combined`);
 const measured=await page.evaluate(`(()=>{const p=window.__profile;cancelAnimationFrame(p.raf);p.observer.disconnect();p.longObserver.disconnect();p.mutation.disconnect();document.removeEventListener('pointermove',p.pointer);return{inference:p.inference,frames:p.frames,longTasks:p.longTasks,recognitions:p.recognitions,dragLatency:p.dragLatency,segments:p.segments}})()`);
 result.delegate=await page.evaluate(`document.querySelector('${app}').dataset.gestureDelegate`);
 result.measurements=measured;
 result.summary=measured.segments.map(s=>{const infer=measured.inference.filter(e=>e.at>=s.start&&e.at<s.end),frames=measured.frames.filter(e=>e.at>=s.start&&e.at<s.end);return{name:s.name,seconds:(s.end-s.start)/1000,inferenceRate:infer.length/((s.end-s.start)/1000),inferenceMs:summarize(infer.map(e=>e.duration)),frameMs:summarize(frames.map(e=>e.duration)),framesOver33ms:frames.filter(e=>e.duration>33.4).length,framesOver50ms:frames.filter(e=>e.duration>50).length};});
 result.dragLatencyMs=summarize(measured.dragLatency);
 result.mainThreadTaskSeconds=after.TaskDuration-before.TaskDuration;
 result.heapBefore=before.JSHeapUsedSize;result.heapAfter=after.JSHeapUsedSize;
 assert.ok(measured.recognitions.some(e=>e.label==='thumbsup'),'Real inference recognizes the thumb-up image fixture');
 assert.ok(measured.recognitions.some(e=>e.label==='peace'),'Real inference recognizes the victory image fixture');
 assert.ok(measured.dragLatency.length>30,'Another window was actually dragged during inference');
 await click(page,'[data-window-frame="app-notes"] [data-window-control="close"]');await sleep(300);
 await page.screenshot(`${phase}-preview`);
 await close(page);assert.equal((await stats(page)).liveTracks,0);
});
await writeFile(new URL(`${phase}-results.json`,output),JSON.stringify(report,null,2)+'\n');socket.close();if(failures)process.exitCode=1;
