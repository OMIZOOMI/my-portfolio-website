// Read-only production portal/hit-testing diagnosis using isolated Chrome CDP.
// CDP_URL=http://127.0.0.1:9226 STARTUP_TEST_URL=http://127.0.0.1:3001 node tests/stage9-shield.browser.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9226";
const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const output = new URL(process.env.STAGE9_SHIELD_OUTPUT_DIR ?? "../docs/stage9-shield-review/", import.meta.url);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const version = await (await fetch(`${endpoint}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(Error(message.error.message));
  else request.resolve(message.result);
});
function command(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function until(check, label, timeout = 20000) {
  let last;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { last = await check(); if (last) return last; } catch (error) { last = error.message; }
    await sleep(80);
  }
  throw Error(`Timed out: ${label}: ${JSON.stringify(last)}`);
}
const { browserContextId } = await command("Target.createBrowserContext");
const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId, newWindow: true });
const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
const send = (method, params) => command(method, params, sessionId);
await Promise.all([send("Page.enable"), send("Runtime.enable")]);
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
localStorage.setItem('portfolio-appearance', JSON.stringify({version:1,state:{theme:'dark',wallpaper:'coast',wallpaperMode:'auto'}}));
window.__shieldEvents=[];
for(const type of ['pointerdown','pointerup','click']) document.addEventListener(type,event=>{
  const target=event.target instanceof Element?event.target:null;
  window.__shieldEvents.push({type,tag:target?.tagName,frame:target?.closest('[data-window-frame]')?.getAttribute('data-window-frame'),control:target?.closest('[data-window-control]')?.getAttribute('data-window-control'),label:target?.closest('[aria-label]')?.getAttribute('aria-label'),trusted:event.isTrusted,x:event.clientX,y:event.clientY});
},true);
` });
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function clickPoint(point) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
}
async function point(selector) {
  let prior;
  return until(async () => {
    const state = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,width:r.width,height:r.height,hittable:e===hit||e.contains(hit)}})()`);
    if (!state?.hittable || !state.width || !state.height) return false;
    const stable = prior && Math.hypot(prior.x - state.x, prior.y - state.y) < 0.2;
    prior = state;
    return stable ? { x: state.x, y: state.y } : false;
  }, selector);
}
async function click(selector) { const position = await point(selector); await clickPoint(position); return position; }
async function hitStack(position) {
  return evaluate(`document.elementsFromPoint(${position.x},${position.y}).map(e=>({tag:e.tagName,id:e.id,frame:e.closest('[data-window-frame]')?.getAttribute('data-window-frame'),label:e.getAttribute('aria-label'),class:e.className?.toString().slice(0,120),z:getComputedStyle(e).zIndex,pointerEvents:getComputedStyle(e).pointerEvents,position:getComputedStyle(e).position,transform:getComputedStyle(e).transform})).slice(0,16)`);
}
const report = { browser: version.Browser, site, viewport: { width: 1440, height: 1000 }, input: "Chrome CDP trusted synthetic mouse; no physical mouse/trackpad hardware run", checks: [] };
try {
  await send("Page.navigate", { url: site });
  await until(() => evaluate(`!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`), "3D entry", 45000);
  await sleep(1800);
  report.portalAncestry = await evaluate(`(()=>{let e=document.querySelector('#desktop-root');const list=[];while(e){const s=getComputedStyle(e);list.push({tag:e.tagName,id:e.id,class:e.className?.toString().slice(0,120),z:s.zIndex,pointerEvents:s.pointerEvents,position:s.position,transform:s.transform,transformStyle:s.transformStyle});e=e.parentElement}return list})()`);
  report.projectedCoordinateSamples = await evaluate(`(()=>{
    const root=document.querySelector('#desktop-root'),bounds=root.getBoundingClientRect(),width=root.offsetWidth,height=root.offsetHeight;
    const coordinates=[[0,0],[width,0],[width,height],[0,height],[width*.25,height*.25],[width*.5,height*.5],[width*.75,height*.75]];
    const samples=coordinates.map(([x,y])=>{
      const probe=document.createElement('span');
      Object.assign(probe.style,{position:'absolute',left:x+'px',top:y+'px',width:'0',height:'0',pointerEvents:'none',margin:'0',padding:'0',border:'0'});
      root.append(probe);const r=probe.getBoundingClientRect();probe.remove();
      const bboxLocal={x:(r.left-bounds.left)*width/bounds.width,y:(r.top-bounds.top)*height/bounds.height};
      return{local:{x,y},client:{x:r.left,y:r.top},bboxLocal,bboxError:Math.hypot(bboxLocal.x-x,bboxLocal.y-y)};
    });
    return{width,height,bounds:{left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height},samples,maxBboxError:Math.max(...samples.map(p=>p.bboxError))};
  })()`);
  report.shieldCandidates = await evaluate(`Array.from(document.querySelectorAll('[class*="shield"],[id*="shield"],[data-vm-shield],[aria-label*="activate" i],[aria-label*="unlock" i]')).map(e=>e.outerHTML.slice(0,400))`);
  assert.equal(report.shieldCandidates.length, 0, "No VM shield is rendered in the current portal");

  // First physical-screen click after interacting with the 3D keyboard region.
  const canvasPoint = await evaluate(`(()=>{const d=document.querySelector('#desktop-root').getBoundingClientRect();for(const y of [Math.min(innerHeight-24,d.bottom+70),innerHeight-40]){const x=innerWidth/2,h=document.elementFromPoint(x,y);if(h?.tagName==='CANVAS')return{x,y}}return null})()`);
  assert.ok(canvasPoint, "Found a canvas point below the desktop on the laptop body");
  await clickPoint(canvasPoint);
  const dockPosition = await point('[data-dock-app="notes"]');
  report.firstDockHitStack = await hitStack(dockPosition);
  await clickPoint(dockPosition);
  await until(() => evaluate(`!!document.querySelector('[data-window-frame="app-notes"] [aria-label="Note editor"]')`), "Single click opens Notes after canvas interaction");
  report.checks.push({ name: "single-click-dock-after-laptop-interaction", status: "PASS", canvasPoint, dockPosition });

  await sleep(500);
  const newNoteSelector = '[data-window-frame="app-notes"] [title="Create a new note"]';
  const newNoteCount = await evaluate(`document.querySelectorAll('[data-window-frame="app-notes"] [aria-current="true"]').length`);
  const noteRowsBefore = await evaluate(`document.querySelectorAll('[data-window-frame="app-notes"] [role="button"]').length`);
  const newNotePosition = await point(newNoteSelector);
  report.firstControlHitStack = await hitStack(newNotePosition);
  await clickPoint(newNotePosition);
  await until(() => evaluate(`document.querySelectorAll('[data-window-frame="app-notes"] [role="button"]').length===${noteRowsBefore + 1}`), "Single click activates New note");
  report.checks.push({ name: "single-click-app-control-after-focus", status: "PASS", noteRowsBefore, newNoteCount });

  // A second overlapping app gets the intended action only; no underlying hit.
  await click('[data-dock-app="settings"]');
  await until(() => evaluate(`!!document.querySelector('[data-window-frame="app-settings"]')`), "Settings opened");
  await sleep(450);
  const maximizeSelector = '[data-window-frame="app-settings"] [data-window-control="maximize"]';
  const maximizePosition = await point(maximizeSelector);
  report.overlapControlHitStack = await hitStack(maximizePosition);
  const notesRectBefore = await evaluate(`(()=>{const e=document.querySelector('[data-window-frame="app-notes"]');return{left:e.style.left,top:e.style.top,restore:e.querySelector('[data-window-control="maximize"]').ariaLabel}})()`);
  await evaluate("window.__shieldEvents=[]");
  await clickPoint(maximizePosition);
  await until(() => evaluate(`document.querySelector('${maximizeSelector}').ariaLabel==='Restore'`), "Single click maximizes intended Settings");
  const notesRectAfter = await evaluate(`(()=>{const e=document.querySelector('[data-window-frame="app-notes"]');return{left:e.style.left,top:e.style.top,restore:e.querySelector('[data-window-control="maximize"]').ariaLabel}})()`);
  assert.deepEqual(notesRectAfter, notesRectBefore, "Underlying Notes window remains unchanged");
  const overlapEvents = await evaluate("window.__shieldEvents");
  assert.equal(overlapEvents.filter(e => e.type === "click").length, 1, "Exactly one click dispatch");
  assert.equal(overlapEvents.find(e => e.type === "click").frame, "app-settings", "Click targets Settings, not Notes or the scene");
  report.checks.push({ name: "overlap-control-no-click-through", status: "PASS", notesRectBefore, notesRectAfter, events: overlapEvents });

  // Returning to the scene does not cause a control to consume an activation click.
  await click('[data-window-frame="app-settings"] [data-window-control="close"]');
  await until(() => evaluate(`!document.querySelector('[data-window-frame="app-settings"]')`), "Settings closed");
  await clickPoint(canvasPoint);
  const minimizePosition = await point('[data-window-frame="app-notes"] [data-window-control="minimize"]');
  report.returnedControlHitStack = await hitStack(minimizePosition);
  await clickPoint(minimizePosition);
  await until(() => evaluate(`document.querySelector('[data-window-frame="app-notes"]').inert`), "One click minimizes Notes after canvas interaction");
  report.checks.push({ name: "single-click-existing-control-after-laptop-interaction", status: "PASS", minimizePosition });
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.error = error.stack;
  report.events = await evaluate("window.__shieldEvents").catch(() => []);
  process.exitCode = 1;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(new URL("portal-hit-testing.json", output), JSON.stringify(report, null, 2) + "\n");
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(new URL("portal-hit-testing.png", output), Buffer.from(data, "base64"));
  await command("Target.disposeBrowserContext", { browserContextId });
  socket.close();
}
console.log(JSON.stringify({ status: report.status, browser: report.browser, checks: report.checks, error: report.error }, null, 2));
