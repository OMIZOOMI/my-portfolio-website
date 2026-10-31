// Stage 9 production-browser interaction checks. No physical trackpad/mouse run.
// STARTUP_TEST_URL=http://127.0.0.1:3001 CDP_URL=http://127.0.0.1:9226 node tests/stage9-interactions.browser.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9226";
const filter = process.env.STAGE9_TEST_FILTER;
const output = new URL(process.env.STAGE9_OUTPUT_DIR ?? "../docs/stage9-review/", import.meta.url);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const version = await (await fetch(`${endpoint}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map(), listeners = new Set();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(Error(message.error.message)); else request.resolve(message.result);
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
async function until(check, label, timeout = 25000) {
  let last; const start = Date.now();
  while (Date.now() - start < timeout) {
    try { last = await check(); if (last) return last; } catch (error) { last = error.message; }
    await sleep(60);
  }
  throw Error(`Timed out: ${label}: ${JSON.stringify(last)}`);
}
async function pageFor() {
  const { browserContextId } = await command("Target.createBrowserContext");
  const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId, newWindow: true, background: false });
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => command(method, params, sessionId);
  const errors = [];
  const onEvent = event => { if (event.sessionId === sessionId && event.method === "Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text); };
  listeners.add(onEvent);
  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Network.enable")]);
  await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
localStorage.setItem('portfolio-appearance',JSON.stringify({version:1,state:{theme:'dark',wallpaper:'coast',wallpaperMode:'auto'}}));
window.__stage9Events=[];
for(const type of ['pointerdown','pointermove','pointerup','click','dblclick','contextmenu','keydown','keyup'])document.addEventListener(type,event=>{
 const target=event.target instanceof Element?event.target:null;
 const item=target?.closest('[data-file-icon]');
 window.__stage9Events.push({type,key:event.key,repeat:event.repeat,detail:event.detail,trusted:event.isTrusted,x:event.clientX,y:event.clientY,item:item?.dataset.fileIcon,frame:target?.closest('[data-window-frame]')?.dataset.windowFrame,get prevented(){return event.defaultPrevented}});
},true);
` });
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  return { send, evaluate, errors,
    wait: (expression, label, timeout) => until(() => evaluate(expression), label, timeout),
    async boot() {
      await send("Page.navigate", { url: site });
      await until(() => evaluate(`!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`), "3D entry", 45000);
      await sleep(1200);
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
  let prior;
  return until(async () => {
    const state = await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return{x,y,width:r.width,height:r.height,hittable:e===hit||e.contains(hit)}})()`);
    if (!state?.hittable || !state.width || !state.height) return false;
    const stable = prior && Math.hypot(prior.x - state.x, prior.y - state.y) < .25;
    prior = state;
    return stable ? { x: state.x, y: state.y } : false;
  }, selector);
}
async function mouse(page, position, button = "left", clickCount = 1) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...position });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button, clickCount, ...position });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button, clickCount, ...position });
}
async function click(page, selector, count = 1) {
  const p = await point(page, selector);
  // A real double click contains TWO press/release pairs, not one fabricated
  // clickCount=2 pair. This exercises the icon's accepted-click/drag guard.
  await mouse(page, p);
  if (count === 2) { await sleep(70); await mouse(page, p, "left", 2); }
}
async function key(page, value, code = value, virtualKey, modifiers = 0, repeats = 0) {
  const payload = { key: value, code, windowsVirtualKeyCode: virtualKey, modifiers, ...(value === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}) };
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...payload });
  for (let i = 0; i < repeats; i++) { await sleep(30); await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...payload, autoRepeat: true }); }
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...payload });
}
const frame = id => `[data-window-frame="${id}"]`;
const control = (id, action) => `${frame(id)} [data-window-control="${action}"]`;
async function launch(page, kind, id = `app-${kind}`) {
  await click(page, `[data-dock-app="${kind}"]`);
  await page.wait(`!!document.querySelector('${frame(id)}')&&!document.querySelector('${frame(id)}').inert`, `${kind} opened`);
  await sleep(320);
}
async function rect(page, id) {
  return page.evaluate(`(()=>{const e=document.querySelector('${frame(id)}'),s=getComputedStyle(e);return{x:parseFloat(e.style.left),y:parseFloat(e.style.top),width:parseFloat(s.width),height:parseFloat(s.height)}})()`);
}
async function desktopArea(page) {
  return page.evaluate(`(()=>{const d=document.querySelector('#desktop-root'),m=d.querySelector('nav[aria-label="macOS Menu Bar"]'),dock=d.querySelector('[data-dock]');const top=m.offsetTop+m.offsetHeight,bottom=dock.offsetTop;return{x:0,y:top,width:d.clientWidth,height:bottom-top,desktopWidth:d.clientWidth,desktopHeight:d.clientHeight,dockTop:bottom}})()`);
}
function closeEnough(actual, expected, label, tolerance = .6) {
  for (const k of ["x", "y", "width", "height"]) assert.ok(Math.abs(actual[k] - expected[k]) <= tolerance, `${label} ${k}: ${actual[k]} vs ${expected[k]}`);
}
async function stack(page) {
  return page.evaluate(`({windows:[...document.querySelectorAll('[data-window-frame]')].map(e=>({id:e.dataset.windowFrame,z:Number(e.style.zIndex),active:e.getAttribute('data-window-active')==='true',minimized:e.inert})),menu:document.querySelector('nav[aria-label="macOS Menu Bar"]>div:first-child>div:nth-child(2)')?.firstChild?.textContent})`);
}
async function assertFront(page, id, name) {
  await page.wait(`document.querySelector('${frame(id)}')?.getAttribute('data-window-active')==='true'`, `${name} active`);
  const result = await stack(page), current = result.windows.find(w => w.id === id);
  assert.equal(current.minimized, false);
  assert.equal(current.z, Math.max(...result.windows.filter(w => !w.minimized).map(w => w.z)), `${id} is on top`);
  assert.equal(result.menu, name, "Menu bar follows the restored active app");
  return result;
}
// Test-only zero-size DOM probe: the browser applies the real laptop projection.
// No copied bounding-box offsets or alternative production coordinate strategy.
async function localClient(page, x, y) {
  return page.evaluate(`(()=>{const d=document.querySelector('#desktop-root'),p=document.createElement('span');Object.assign(p.style,{position:'absolute',left:${x}+'px',top:${y}+'px',width:'0',height:'0',border:'0',padding:'0',margin:'0',pointerEvents:'none'});d.append(p);const r=p.getBoundingClientRect();p.remove();return{x:r.left,y:r.top}})()`);
}
async function dragTo(page, selector, end) {
  const start = await point(page, selector);
  await dragBetween(page, start, end);
}
async function dragBetween(page, start, end) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...start });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...start });
  for (let i = 1; i <= 14; i++) {
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1, x: start.x + (end.x - start.x) * i / 14, y: start.y + (end.y - start.y) * i / 14 });
    await sleep(12);
  }
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...end });
  await sleep(350);
}
async function dragLocalBetween(page, startLocal, endLocal) {
  const start = await localClient(page, startLocal.x, startLocal.y);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...start });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...start });
  let end = start;
  for (let i = 1; i <= 14; i++) {
    // Camera damping can still move the desktop during a cold entry. Resolve
    // each requested local point at dispatch time, rather than reusing a
    // projected endpoint from before the drag started.
    end = await localClient(page, startLocal.x + (endLocal.x - startLocal.x) * i / 14, startLocal.y + (endLocal.y - startLocal.y) * i / 14);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1, ...end });
    if (i < 14) await sleep(12);
  }
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...end });
  await sleep(350);
}
async function type(page, text) {
  await key(page, "a", "KeyA", 65, 4);
  await page.send("Input.insertText", { text });
}
async function commit(page, text) {
  await type(page, text); await key(page, "Enter", "Enter", 13);
  await page.wait(`!document.querySelector('[data-file-rename-input]')`, "rename committed");
}
const report = {
  browser: version.Browser, host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model }, site,
  localBuildId: await readFile(new URL("../.next/BUILD_ID", import.meta.url), "utf8").then(value => value.trim()).catch(() => null),
  input: "Trusted synthetic CDP mouse/key input on macOS Chrome; not a physical mouse/trackpad hardware test",
  zoomCoverage: "CSS viewport resizing, emulated DPR, and CDP visual-viewport page-scale emulation; no claim of native browser toolbar zoom",
  remainingPhysicalChecks: ["Mac two-finger trackpad secondary click and drag", "Windows mouse/trackpad drag and secondary click", "Native browser toolbar zoom at 80%, 100%, 125%", "Safari hardware/browser interaction"],
  scenarios: [],
};
let failures = 0;
async function scenario(name, run) {
  if (filter && !name.includes(filter)) return;
  const page = await pageFor(), result = { name }, started = Date.now();
  try { await page.boot(); await run(page, result); assert.deepEqual(page.errors, [], "No runtime exceptions"); result.status = "PASS"; }
  catch (error) {
    failures++; result.status = "FAIL"; result.error = error.stack;
    try { result.state = await stack(page); result.events = await page.evaluate("window.__stage9Events.slice(-25)"); await page.screenshot(`failed-${name}`); } catch { /* Preserve original failure. */ }
  } finally { result.elapsedMs = Date.now() - started; report.scenarios.push(result); console.log(`${result.status} ${name} ${result.elapsedMs}ms${result.error ? `\n${result.error}` : ""}`); await page.close(); }
}

await scenario("virtual-maximize-restore-viewport-dpr-and-page-scale", async (page, result) => {
  await launch(page, "notes");
  const original = await rect(page, "app-notes"), samples = [];
  for (const config of [
    { width: 1280, height: 800, dpr: 1, pageScale: 1 },
    { width: 1440, height: 1000, dpr: 2, pageScale: 1 },
    { width: 1920, height: 1080, dpr: 1, pageScale: 1.25 },
  ]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width: config.width, height: config.height, deviceScaleFactor: config.dpr, mobile: false });
    await page.send("Emulation.setPageScaleFactor", { pageScaleFactor: config.pageScale });
    await sleep(1000);
    const before = await rect(page, "app-notes"), area = await desktopArea(page);
    closeEnough(before, original, "Viewport resize preserves virtual restored rectangle");
    await click(page, control("app-notes", "maximize"));
    await page.wait(`document.querySelector('${control("app-notes", "maximize")}').ariaLabel==='Restore'`, "maximized");
    await sleep(300);
    const maximized = await rect(page, "app-notes");
    closeEnough(maximized, area, "Maximized outer frame matches virtual work area");
    assert.ok(maximized.y >= area.y && maximized.y + maximized.height <= area.dockTop + .6, "Menu and dock remain usable");
    await page.screenshot(`maximized-${config.width}-${config.height}-dpr${config.dpr}-scale${config.pageScale}`);
    await click(page, control("app-notes", "maximize")); await sleep(300);
    const restored = await rect(page, "app-notes"); closeEnough(restored, before, "Exact pre-maximize rectangle restored");
    samples.push({ config, browser: await page.evaluate("({innerWidth,innerHeight,dpr:devicePixelRatio,visualScale:visualViewport.scale,visualWidth:visualViewport.width})"), area, before, maximized, restored });
  }
  result.samples = samples;
});

await scenario("overlap-minimize-thumbnail-restore-active-and-bounded-stack", async (page, result) => {
  await launch(page, "notes"); await launch(page, "finder", "finder-desktop"); await launch(page, "settings");
  await launch(page, "notes");
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await click(page, control("app-notes", "minimize"));
    await page.wait(`document.querySelector('${frame("app-notes")}').inert`, "Notes minimized");
    await launch(page, "settings");
    await click(page, '[data-dock-minimized-window="app-notes"]');
    await sleep(300);
    const current = await assertFront(page, "app-notes", "Notes");
    const zs = current.windows.map(w => w.z);
    assert.equal(new Set(zs).size, zs.length, "Every window has a distinct stack slot");
    assert.ok(Math.max(...zs) <= 10 + current.windows.length, "Stack slots do not accumulate over restore cycles");
    samples.push({ cycle: i + 1, ...current });
  }
  result.samples = samples;
  await page.screenshot("overlap-restored-notes-active");
});

await scenario("maximized-frame-follows-real-dock-size-preference", async (page, result) => {
  await launch(page, "notes");
  const original = await rect(page, "app-notes");
  await click(page, control("app-notes", "maximize")); await sleep(300);
  await launch(page, "settings");
  await page.evaluate(`(()=>{const b=[...document.querySelectorAll('${frame("app-settings")} button')].find(e=>e.textContent.trim()==='Dock');if(!b)throw Error('Missing Dock preferences');b.dataset.stage9DockTab='true'})()`);
  await click(page, '[data-stage9-dock-tab="true"]');
  const slider = `${frame("app-settings")} input[aria-label="Dock size"]`;
  await click(page, slider);
  const samples = [];
  for (const [name, value, keyName, vk] of [["small", .75, "Home", 36], ["large", 1.5, "End", 35]]) {
    await key(page, keyName, keyName, vk);
    await page.wait(`Number(document.querySelector('${slider}').value)===${value}`, `Native keyboard range sets ${name} dock`);
    await until(async () => {
      const area = await desktopArea(page), maximized = await rect(page, "app-notes");
      result.lastDockMeasurement = { name, area, maximized, sliderValue: await page.evaluate(`document.querySelector('${slider}').value`) };
      return Math.abs(maximized.height - area.height) < .6;
    }, "Maximized background window follows measured dock layout");
    const area = await desktopArea(page), maximized = await rect(page, "app-notes");
    closeEnough(maximized, area, "Maximized Notes tracks actual dock reservation");
    samples.push({ name, preference: value, area, maximized });
  }
  assert.ok(samples[1].area.dockTop < samples[0].area.dockTop, "Larger dock reserves more virtual desktop height");
  assert.ok(samples[1].maximized.height < samples[0].maximized.height, "Maximized frame shrinks above the actual larger dock");
  await page.screenshot("maximized-real-large-dock-reservation");
  await key(page, "Home", "Home", 36);
  for (let i = 0; i < 5; i++) await key(page, "ArrowRight", "ArrowRight", 39);
  await page.wait(`Number(document.querySelector('${slider}').value)===1`, "Dock preference restored through native keys");
  await click(page, control("app-settings", "close")); await page.wait(`!document.querySelector('${frame("app-settings")}')`, "Settings closes");
  await click(page, control("app-notes", "maximize")); await sleep(300);
  closeEnough(await rect(page, "app-notes"), original, "Dock changes do not corrupt saved pre-maximize rectangle");
  result.samples = samples; result.restored = await rect(page, "app-notes");
});

await scenario("title-drag-all-virtual-edges-and-restore-after-drag", async (page, result) => {
  await launch(page, "notes");
  let priorProjection, stableProjectionSamples = 0;
  await until(async () => {
    const projection = await page.evaluate(`(()=>{const r=document.querySelector('#desktop-root').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);
    const stable = priorProjection && Object.keys(projection).every(k => Math.abs(projection[k] - priorProjection[k]) < .015);
    priorProjection = projection;
    stableProjectionSamples = stable ? stableProjectionSamples + 1 : 0;
    return stableProjectionSamples >= 3;
  }, "Camera projection settles before exact-delta measurement");
  const area = await desktopArea(page), samples = [];
  const title = `${frame("app-notes")}>div:first-child>span`;
  const interiorBefore = await rect(page, "app-notes");
  const localStart = { x: interiorBefore.x + 400, y: interiorBefore.y + 18 };
  const clientStart = await localClient(page, localStart.x, localStart.y);
  assert.equal(await page.evaluate(`(()=>{const hit=document.elementFromPoint(${clientStart.x},${clientStart.y}),f=document.querySelector('${frame("app-notes")}');return f.firstElementChild.contains(hit)&&!hit.closest('[data-window-controls]')})()`), true, "Known projected interior point hits the title bar");
  const localEnd = { x: localStart.x + 117, y: localStart.y + 79 };
  await dragLocalBetween(page, localStart, localEnd);
  const interiorAfter = await rect(page, "app-notes");
  result.interior = { before: interiorBefore, localStart, localEnd, clientStart, after: interiorAfter };
  closeEnough(interiorAfter, { ...interiorBefore, x: interiorBefore.x + 117, y: interiorBefore.y + 79 }, "Interior drag preserves the exact local delta through perspective");
  for (const edge of ["left", "right", "top", "bottom"]) {
    const current = await rect(page, "app-notes");
    const local = edge === "left" ? { x: 8, y: current.y + 18 }
      : edge === "right" ? { x: area.width - 8, y: current.y + 18 }
        : edge === "top" ? { x: current.x + current.width / 2, y: 3 }
          : { x: current.x + current.width / 2, y: area.desktopHeight - 3 };
    await dragTo(page, title, await localClient(page, local.x, local.y));
    const moved = await rect(page, "app-notes");
    assert.ok(moved.x >= area.x - .6 && moved.y >= area.y - .6 && moved.x + moved.width <= area.width + .6 && moved.y + moved.height <= area.desktopHeight + .6, `${edge} drag stays inside actual desktop screen bounds`);
    if (edge === "left") assert.ok(Math.abs(moved.x - area.x) < 1);
    if (edge === "right") assert.ok(Math.abs(moved.x + moved.width - area.width) < 1);
    if (edge === "top") assert.ok(Math.abs(moved.y - area.y) < 1);
    if (edge === "bottom") assert.ok(Math.abs(moved.y + moved.height - area.desktopHeight) < 1);
    samples.push({ edge, desiredLocalPointer: local, moved });
  }
  const before = await rect(page, "app-notes");
  assert.ok(before.y + before.height > area.dockTop, "Normal window extends behind the dock");
  const dockHits=[];
  for(let i=1;i<10;i++) {
    const p=await localClient(page,before.x+before.width*i/10,(area.dockTop+area.desktopHeight-16)/2);
    dockHits.push(await page.evaluate(`(()=>{const e=document.elementFromPoint(${p.x},${p.y});return {dock:!!e?.closest('[data-dock-surface]'),window:e?.closest('[data-window-frame]')?.dataset.windowFrame??null}})()`));
  }
  assert.ok(dockHits.some(hit=>hit.dock&&!hit.window),'Visible dock stays above the window');
  assert.ok(dockHits.some(hit=>hit.window==='app-notes'&&!hit.dock),'Empty strip beside the dock does not intercept window input');
  result.dockHitTesting=dockHits;
  await click(page, control("app-notes", "maximize")); await sleep(300);
  await click(page, control("app-notes", "maximize")); await sleep(300);
  closeEnough(await rect(page, "app-notes"), before, "Dragged rectangle survives maximize/restore");
  result.area = area; result.samples = samples;
  await page.screenshot("drag-bounded-bottom-edge");
});

await scenario("desktop-icon-selection-double-click-keyboard-repeat-and-drag", async (page, result) => {
  const icon = '#desktop-root>[data-file-item="projects"] [data-file-icon="projects"]';
  await click(page, icon);
  assert.equal(await page.evaluate(`document.querySelector('${icon}').dataset.selected`), "true");
  assert.equal(await page.evaluate(`!!document.querySelector('${frame("finder-projects")}')`), false, "Single click selects without opening");
  await key(page, "Tab", "Tab", 9); await key(page, "Tab", "Tab", 9, 8);
  const focus = await page.evaluate(`(()=>{const e=document.querySelector('${icon}'),s=getComputedStyle(e);return{focused:document.activeElement===e,selected:e.dataset.selected,outlineWidth:s.outlineWidth,outlineStyle:s.outlineStyle}})()`);
  assert.equal(focus.focused, true); assert.equal(focus.selected, "true");
  assert.ok(parseFloat(focus.outlineWidth) >= 2 && focus.outlineStyle !== "none", "Keyboard focus remains visibly distinct from selection");
  const keyboard = [];
  for (const [value, code, vk] of [["Enter", "Enter", 13], [" ", "Space", 32]]) {
    await click(page, icon); await page.evaluate("window.__stage9Events=[]");
    await key(page, value, code, vk, 0, 5);
    await page.wait(`!!document.querySelector('${frame("finder-projects")}')`, "Keyboard opens selected Projects");
    await sleep(320);
    assert.equal(await page.evaluate(`document.querySelectorAll('${frame("finder-projects")}').length`), 1);
    const events = await page.evaluate("window.__stage9Events");
    assert.equal(events.filter(e => e.item === "projects" && e.type === "click").length, 0, "Native synthetic button clicks are suppressed after handled keys");
    keyboard.push({ key: value, repeatedKeydowns: events.filter(e => e.type === "keydown" && e.repeat).length });
    await click(page, control("finder-projects", "close"));
    await page.wait(`!document.querySelector('${frame("finder-projects")}')`, "Finder closes");
  }
  await click(page, icon, 2);
  await page.wait(`!!document.querySelector('${frame("finder-projects")}')`, "Actual two-click sequence opens Projects");
  await sleep(320); await click(page, control("finder-projects", "close"));
  await page.wait(`!document.querySelector('${frame("finder-projects")}')`, "Finder closes again");
  const before = await page.evaluate(`(()=>{const e=document.querySelector('#desktop-root>[data-file-item="projects"]');return{left:e.style.left,top:e.style.top}})()`);
  const start = await point(page, icon), tinyEnd = { x: start.x + 3, y: start.y };
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...start });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...start });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1, ...tinyEnd });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...tinyEnd });
  await sleep(100);
  assert.deepEqual(await page.evaluate(`(()=>{const e=document.querySelector('#desktop-root>[data-file-item="projects"]');return{left:e.style.left,top:e.style.top}})()`), before, "A 3 CSS-pixel movement stays below the existing 6-pixel drag threshold");
  assert.equal(await page.evaluate(`!!document.querySelector('${frame("finder-projects")}')`), false, "Small pointer movement only selects");
  await dragTo(page, icon, await localClient(page, 180, 230));
  assert.equal(await page.evaluate(`!!document.querySelector('${frame("finder-projects")}')`), false, "File drag does not open a Finder");
  const after = await page.evaluate(`(()=>{const e=document.querySelector('#desktop-root>[data-file-item="projects"]');return{left:e.style.left,top:e.style.top}})()`);
  assert.notDeepEqual(after, before, "Folder really moved after crossing the shared drag threshold");
  await click(page, icon);
  assert.equal(await page.evaluate(`!!document.querySelector('${frame("finder-projects")}')`), false, "First click after drag only selects");
  result.keyboard = keyboard; result.focus = focus; result.drag = { before, after };
  await page.screenshot("desktop-selected-projects-after-drag");
});

await scenario("finder-create-f2-context-menu-and-rename-stable-identity", async (page, result) => {
  await launch(page, "finder", "finder-desktop");
  const finder = frame("finder-desktop");
  await click(page, `${finder} button[aria-label="New Folder"]`);
  const created = await page.wait(`(()=>{const e=document.querySelector('[data-file-rename-input]');return e&&{id:e.dataset.fileRenameInput,selected:e.selectionStart===0&&e.selectionEnd===e.value.length}})()`, "New folder enters inline rename");
  assert.equal(created.selected, true); await commit(page, "Interaction Folder");
  const icon = `${finder} [data-file-item="${created.id}"] [data-file-icon]`;
  await click(page, icon); await key(page, "F2", "F2", 113);
  assert.equal(await page.evaluate(`document.querySelector('[data-file-rename-input]').dataset.fileRenameInput`), created.id);
  await commit(page, "Keyboard Renamed");
  assert.equal(await page.evaluate(`document.querySelector('${icon}').ariaLabel`), "Open Keyboard Renamed");
  await click(page, icon); await key(page, "F10", "F10", 121, 8);
  await page.wait(`!!document.querySelector('[data-file-context-menu]')`, "Shift+F10 opens custom context menu");
  await click(page, '[data-file-context-menu] [data-file-action="rename"]');
  await type(page, "Do not keep this"); await key(page, "Escape", "Escape", 27);
  assert.equal(await page.evaluate(`document.querySelector('${icon}').ariaLabel`), "Open Keyboard Renamed", "Escape cancels rename without opening");
  await mouse(page, await point(page, icon), "right");
  await page.wait(`!!document.querySelector('[data-file-context-menu]')`, "Normal secondary mouse event opens custom menu");
  const secondary = await page.evaluate("window.__stage9Events.filter(e=>e.type==='contextmenu').at(-1)");
  assert.equal(secondary.prevented, true);
  await click(page, '[data-file-context-menu] [data-file-action="rename"]'); await commit(page, "Context Renamed");
  await click(page, icon, 2);
  await page.wait(`!!document.querySelector('${finder} [data-finder-content="${created.id}"]')`, "Renamed folder opens its actual ID");
  assert.equal(await page.evaluate(`document.querySelector('${finder} h1').textContent`), "Context Renamed");
  await click(page, `${finder} button[aria-label="New Folder"]`);
  const nested = await page.wait(`(()=>{const e=document.querySelector('[data-file-rename-input]');return e?.dataset.fileRenameInput})()`, "Nested creation still works");
  assert.notEqual(nested, created.id); await commit(page, "Nested");
  result.identity = created.id; result.nestedIdentity = nested; result.secondaryClick = secondary;
  await page.screenshot("finder-rename-nested-identity");
});

await mkdir(output, { recursive: true });
await writeFile(new URL(filter ? `browser-results-${filter}.json` : "browser-results.json", output), JSON.stringify(report, null, 2) + "\n");
socket.close();
if (failures) process.exitCode = 1;
