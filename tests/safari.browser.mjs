// Shared isolated CDP harness for Stage 10 browser-state checks.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9227";
const output = new URL("../docs/stage10-review/", import.meta.url);
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
window.__stage10Events=[];
for(const type of ['pointerdown','pointermove','pointerup','click','dblclick','contextmenu','keydown','keyup'])document.addEventListener(type,event=>{
 const target=event.target instanceof Element?event.target:null;
 const item=target?.closest('[data-file-icon]');
 window.__stage10Events.push({type,key:event.key,repeat:event.repeat,detail:event.detail,trusted:event.isTrusted,x:event.clientX,y:event.clientY,item:item?.dataset.fileIcon,frame:target?.closest('[data-window-frame]')?.dataset.windowFrame,get prevented(){return event.defaultPrevented}});
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
async function type(page, text) {
  await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:4, commands:["selectAll"] });
  await page.send("Input.dispatchKeyEvent", { type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:4 });
  await page.send("Input.insertText", { text });
}

const before = process.env.SAFARI_BEFORE === "1";
const report = {browser: version.Browser, host: {platform:os.platform(),release:os.release(),arch:os.arch()}, site, before,
 localBuildId: await readFile(new URL("../.next/BUILD_ID",import.meta.url),"utf8").then(s=>s.trim()),
 input:"Trusted synthetic CDP mouse/key/wheel input on macOS Chrome, plus labelled programmatic rapid-click stress. Not a native Safari app or physical trackpad test.",scenarios:[]};
const A="portfolio://project/edge-ai-hardware-state-detection", B="portfolio://project/cloud-native-asset-management-api", C="portfolio://project/3d-macos-web-portfolio";
const root='[data-window-frame="app-safari"]',visible=`${root} main:not([hidden])`,addressBar=`${root} input[aria-label="Safari address bar"]`;
const activate=id=>`[data-safari-activate="${id}"]`;
const closeTab=id=>`[data-safari-close="${id}"]`;
async function address(page,value){await click(page,addressBar);await type(page,value);await key(page,"Enter","Enter",13);await sleep(100);}
async function snapshot(page){return page.evaluate(`(()=>{const r=document.querySelector('${root}');return {mode:r.querySelector('[data-safari-mode]')?.dataset.safariMode,address:r.querySelector('input').value,
 tabs:[...r.querySelectorAll('[data-safari-tab]')].map(e=>{const b=e.querySelector('[role="tab"]'),p=r.querySelector('[data-safari-page="'+e.dataset.safariTab+'"]');return {id:e.dataset.safariTab,title:b.textContent,active:b.ariaSelected==='true',url:p?.dataset.safariUrl,entry:p?.dataset.safariEntry,scroll:p?.scrollTop,hidden:p?.hidden,reload:p?.dataset.safariReload}}),
 back:r.querySelector('[aria-label="Back"]').disabled,forward:r.querySelector('[aria-label="Forward"]').disabled,feedback:r.querySelector('[role="status"]')?.textContent??null,text:r.querySelector('main:not([hidden])')?.textContent}})()`);}
async function checkAddress(page,url){await page.wait(`document.querySelector('${addressBar}').value===${JSON.stringify(url)}&&document.querySelector('${visible}').dataset.safariUrl===${JSON.stringify(url)}`,'active address and content '+url);}
let failures=0;
async function scenario(name,run){
 const page=await pageFor(),result={name},start=Date.now();
 try{await page.boot();await launch(page,'safari');if(!before){await click(page,control('app-safari','maximize'));await sleep(300);}await run(page,result);assert.deepEqual(page.errors,[]);result.status='PASS';}
 catch(error){failures++;result.status='FAIL';result.error=error.stack;try{result.state=await snapshot(page);await page.screenshot('failed-'+name);}catch{/* Keep original error. */}}
 finally{result.elapsedMs=Date.now()-start;report.scenarios.push(result);console.log(`${result.status} ${name}${result.error?'\n'+result.error:''}`);await page.close();}
}
if(before){
 await scenario('reproduce-old-tab-switching',async(page,result)=>{
  const snapshotOld=()=>page.evaluate(`(()=>{const r=document.querySelector('${root}');return{address:r.querySelector('input').value,tabs:[...r.querySelectorAll('button')].filter(e=>e.querySelector('[aria-label^="Close "]')).map(e=>({title:e.querySelector('span').textContent,active:e.classList.contains('font-semibold')}))}})()`);
  await address(page,A);await click(page,'button[aria-label="New Safari tab"]');await address(page,B);result.beforeSwitch=await snapshotOld();
  await click(page,`${root} button:has([aria-label^="Close "])`);result.afterSwitch=await snapshotOld();
  assert.equal(result.afterSwitch.address,A);assert.equal(result.afterSwitch.tabs[1].active,true);assert.equal(result.afterSwitch.tabs[0].active,false);
  result.reproduced="Clicking tab A left B active and navigated B to A's address.";await page.screenshot('before-tab-switch-bug');
 });
}else{
 await scenario('independent-tab-urls-history-and-rapid-switching',async(page,result)=>{
  const a=(await snapshot(page)).tabs[0].id;
  await address(page,A);await address(page,C);await click(page,'button[aria-label="New Safari tab"]');const b=(await snapshot(page)).tabs.find(t=>t.active).id;
  await address(page,B);await address(page,A);
  for(let i=0;i<6;i++){await click(page,activate(a));await checkAddress(page,C);await click(page,activate(b));await checkAddress(page,A);}
  result.afterSwitching=await snapshot(page);
  await click(page,activate(a));await click(page,'button[aria-label="Back"]');await checkAddress(page,A);
  await click(page,activate(b));await click(page,'button[aria-label="Back"]');await checkAddress(page,B);
  result.afterIndependentBack=await snapshot(page);
  await click(page,activate(a));await click(page,'button[aria-label="Forward"]');await checkAddress(page,C);
  await click(page,activate(b));await click(page,'button[aria-label="Forward"]');await checkAddress(page,A);
  await page.evaluate(`for(let i=0;i<100;i++){document.querySelector('${activate(a)}').click();document.querySelector('${activate(b)}').click()}`);
  await checkAddress(page,A);const state=await snapshot(page);assert.equal(state.tabs.find(t=>t.id===a).url,C);assert.equal(state.tabs.find(t=>t.id===b).url,A);
  result.rapidProgrammaticSwitches=200;await page.screenshot('independent-tabs');
 });
 await scenario('scroll-disclosures-history-reload-and-private-roundtrip',async(page,result)=>{
  const a=(await snapshot(page)).tabs[0].id;
  await click(page,`${visible} details:first-of-type summary`);
  const p=await point(page,visible);await page.send('Input.dispatchMouseEvent',{type:'mouseWheel',...p,deltaX:0,deltaY:220});
  await page.wait(`document.querySelector('${visible}').scrollTop>100`,'scroll changed');await sleep(160);const initial=(await snapshot(page)).tabs[0].scroll;result.savedScroll=initial;
  await click(page,'button[aria-label="New Safari tab"]');await address(page,A);await click(page,activate(a));
  const verify=async()=>{const s=await snapshot(page);assert.ok(Math.abs(s.tabs.find(t=>t.id===a).scroll-initial)<2,JSON.stringify(s));assert.equal(await page.evaluate(`document.querySelector('${visible} details').open`),true);};
  await verify();await address(page,B);await click(page,'button[aria-label="Back"]');await checkAddress(page,'portfolio://start');await verify();
  await click(page,'button[aria-label="Reload page"]');await verify();
  await click(page,'button[aria-label="Private demo tabs"]');assert.equal((await snapshot(page)).mode,'private');await click(page,'button[aria-label="Private demo tabs"]');await verify();
  result.restored=await snapshot(page);await page.screenshot('restored-page-state');
 });
 await scenario('predictable-close-final-tab-and-keyboard-activation',async(page,result)=>{
  const a=(await snapshot(page)).tabs[0].id;await address(page,A);await click(page,'button[aria-label="New Safari tab"]');const b=(await snapshot(page)).tabs.find(t=>t.active).id;await address(page,B);
  await click(page,'button[aria-label="New Safari tab"]');const c=(await snapshot(page)).tabs.find(t=>t.active).id;await address(page,C);
  await click(page,closeTab(c));assert.equal((await snapshot(page)).tabs.find(t=>t.active).id,b);
  await click(page,activate(a));await key(page,'ArrowRight','ArrowRight',39);assert.equal((await snapshot(page)).tabs.find(t=>t.active).id,b);
  await key(page,'Home','Home',36);assert.equal((await snapshot(page)).tabs.find(t=>t.active).id,a);
  await click(page,closeTab(b));assert.equal((await snapshot(page)).tabs.find(t=>t.active).id,a);
  await click(page,closeTab(a));const final=await snapshot(page);assert.equal(final.tabs.length,1);assert.notEqual(final.tabs[0].id,a);await checkAddress(page,'portfolio://start');
  await address(page,C);result.finalUsable=await snapshot(page);
 });
 await scenario('private-isolation-minimize-close-and-session-reload',async(page,result)=>{
  await address(page,A);await click(page,'button[aria-label="New Safari tab"]');await address(page,B);const normal=await snapshot(page);
  await click(page,addressBar);await type(page,'draft.example/path');
  await click(page,'button[aria-label="Private demo tabs"]');const privateStart=await snapshot(page);assert.equal(privateStart.tabs.length,1);await checkAddress(page,'portfolio://start');assert.equal(privateStart.mode,'private');
  await address(page,C);await click(page,'button[aria-label="New Safari tab"]');await address(page,'private.example/only-in-private');const privateIds=(await snapshot(page)).tabs.map(t=>t.id);
  await click(page,control('app-safari','minimize'));await launch(page,'safari');assert.equal((await snapshot(page)).mode,'private');assert.deepEqual((await snapshot(page)).tabs.map(t=>t.id),privateIds);
  await click(page,'button[aria-label="Private demo tabs"]');const restored=await snapshot(page);assert.deepEqual(restored.tabs.map(t=>[t.id,t.url]),normal.tabs.map(t=>[t.id,t.url]));assert.equal(restored.address,'draft.example/path');
  for(const id of privateIds)assert.equal(await page.evaluate(`!!document.querySelector('[data-safari-tab="${id}"]')`),false);
  await click(page,'button[aria-label="Private demo tabs"]');await checkAddress(page,'portfolio://start');assert.equal((await snapshot(page)).tabs.length,1);await address(page,C);
  await click(page,control('app-safari','close'));await page.wait(`!document.querySelector('${root}')`,'Safari closed');await launch(page,'safari');assert.equal((await snapshot(page)).mode,'normal');assert.equal((await snapshot(page)).address,'draft.example/path');
  const storage=await page.evaluate('({local:{...localStorage},session:{...sessionStorage}})');assert.ok(!JSON.stringify(storage).includes('private.example'));assert.ok(!Object.keys(storage.local).some(k=>/safari/i.test(k)));result.storageKeys=Object.keys(storage.local);
  const origin=await page.evaluate('performance.timeOrigin');await page.send('Page.reload');await page.wait(`performance.timeOrigin!==${origin}&&!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`,'reload startup',45000);await sleep(1200);await launch(page,'safari');
  const fresh=await snapshot(page);assert.equal(fresh.mode,'normal');assert.equal(fresh.tabs.length,1);await checkAddress(page,'portfolio://start');result.afterRealPageReload=fresh;
 });
 await scenario('narrow-window-active-tab-remains-reachable',async(page,result)=>{
  await click(page,control('app-safari','maximize'));await sleep(300);
  await address(page,A);await click(page,'button[aria-label="New Safari tab"]');await address(page,B);await click(page,'button[aria-label="New Safari tab"]');await address(page,C);
  let current=(await snapshot(page)).tabs.find(t=>t.active);await point(page,activate(current.id));await point(page,closeTab(current.id));await point(page,'button[aria-label="New Safari tab"]');
  await click(page,closeTab(current.id));current=(await snapshot(page)).tabs.find(t=>t.active);await point(page,activate(current.id));
  await click(page,activate(current.id));await key(page,'Home','Home',36);await page.wait(`document.querySelector('${root} [role="tab"]').ariaSelected==='true'`,'keyboard first tab');await point(page,`${root} [role="tab"]`);
  result.state=await snapshot(page);await page.screenshot('narrow-tabs');
 });
 await scenario('invalid-address-and-truthful-external-handoffs',async(page,result)=>{
  await address(page,A);const original=await snapshot(page);for(const invalid of ['javascript:alert(1)','portfolio://project/not-found','not a website']){
   await address(page,invalid);const s=await snapshot(page);assert.equal(s.tabs[0].url,A);assert.equal(s.back,original.back);assert.match(s.feedback,/not|valid|supported/i);
  }
  await address(page,'example.com/study');await checkAddress(page,'https://example.com/study');assert.match((await snapshot(page)).text,/has not been loaded/);
  // Controlled browser-open fixtures verify rejected/nullable handoff feedback.
  // They do not claim that an external website was visited.
  await page.evaluate('window.__actualOpen=window.open;window.__handoffs=[];window.open=(...args)=>{window.__handoffs.push(args);return null}');
  await click(page,`${visible} button`);const requested=await snapshot(page);assert.match(requested.feedback,/Requested|pop-ups/);assert.doesNotMatch(requested.feedback,/successfully|website loaded/i);
  assert.deepEqual(await page.evaluate('window.__handoffs[0]'),['https://example.com/study','_blank','noopener,noreferrer']);
  await page.evaluate('window.open=()=>{throw new Error("blocked fixture")}');await click(page,`${visible} button`);assert.match((await snapshot(page)).feedback,/Could not request/);await page.evaluate('window.open=window.__actualOpen');
  await click(page,'button[aria-label="Back"]');await checkAddress(page,A);result.feedback=requested.feedback;await page.screenshot('external-link-feedback');
 });
}
await mkdir(output,{recursive:true});await writeFile(new URL(before?'before-browser-results.json':'browser-results.json',output),JSON.stringify(report,null,2)+'\n');socket.close();if(failures)process.exitCode=1;
