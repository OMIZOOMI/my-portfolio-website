// Stage 13 production environments; trusted CDP input on actual macOS Chrome.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3012";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9229";
const output = new URL(process.env.WORKSPACE_OUTPUT_DIR ?? "../docs/stage13-review/", import.meta.url);
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
async function pageFor(options = {}) {
  const { browserContextId } = await command("Target.createBrowserContext");
  const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId, newWindow: true, background: false });
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => command(method, params, sessionId);
  const errors = [], requests = [];
  const onEvent = event => {
    if(event.sessionId!==sessionId)return;
    if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails.exception?.description??event.params.exceptionDetails.text);
    if(event.method==='Network.responseReceived')requests.push({url:event.params.response.url,status:event.params.response.status,cache:!!(event.params.response.fromDiskCache||event.params.response.fromPrefetchCache),mime:event.params.response.mimeType});
  };
  listeners.add(onEvent);
  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Network.enable")]);
  await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: options.dpr??1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
if(!localStorage.getItem('portfolio-appearance'))localStorage.setItem('portfolio-appearance',JSON.stringify({version:1,state:{theme:'dark',wallpaper:'coast',wallpaperMode:'auto'}}));
window.__stage12Events=[];
for(const type of ['pointerdown','pointermove','pointerup','click','dblclick','contextmenu','keydown','keyup'])document.addEventListener(type,event=>{
 const target=event.target instanceof Element?event.target:null;
 const item=target?.closest('[data-file-icon]');
 window.__stage12Events.push({type,key:event.key,repeat:event.repeat,detail:event.detail,trusted:event.isTrusted,x:event.clientX,y:event.clientY,item:item?.dataset.fileIcon,frame:target?.closest('[data-window-frame]')?.dataset.windowFrame,get prevented(){return event.defaultPrevented}});
},true);
` });
  await send("Performance.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(${instrument.toString()})();` });
  if(options.workspace)await send('Page.addScriptToEvaluateOnNewDocument',{source:'if(!localStorage.getItem("portfolio-workspace"))localStorage.setItem("portfolio-workspace",'+JSON.stringify(JSON.stringify({version:1,state:{environment:options.workspace}}))+');'});
  if(options.init)await send('Page.addScriptToEvaluateOnNewDocument',{source:options.init});
  if(options.block)await send('Network.setBlockedURLs',{urls:options.block});
  if(options.slow)await send('Network.emulateNetworkConditions',{offline:false,latency:60,downloadThroughput:1250000,uploadThroughput:125000,connectionType:'cellular4g'});
  if(options.cold)await send('Network.clearBrowserCache');
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  return { send, evaluate, errors, requests,
    wait: (expression, label, timeout) => until(() => evaluate(expression), label, timeout),
    async boot() {
      await send("Page.navigate", { url: site });
      await until(() => evaluate(`!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`), "3D entry", 45000);
      await sleep(400);
    },
    async screenshot(name) {
      await mkdir(output, { recursive: true });
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(new URL(`${phase}-${name}.png`, output), Buffer.from(data, "base64"));
    },
    async close() { listeners.delete(onEvent); await command("Target.disposeBrowserContext", { browserContextId }); },
  };
}
async function point(page, selector) {
  let prior;
  return until(async () => {
    const state = await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return{x,y,width:r.width,height:r.height,hittable:e===hit||e.contains(hit)}})()`);
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
async function launch(page, kind, id = kind === "finder" ? "finder-desktop" : `app-${kind}`) {
  await click(page, `[data-dock-app="${kind}"]`);
  await page.wait(`!!document.querySelector('${frame(id)}')&&!document.querySelector('${frame(id)}').inert`, `${kind} opened`);
  await sleep(320);
}


function instrument(){
 const S=window.__perf={raf:[],longTasks:[],events:[],inference:[],pointer:[],requests:0,callbacks:0,pendingRaf:new Set(),pendingVideo:new Set(),glClears:0,glDraws:0,start:performance.now(),startupReady:null,loaderSeen:false};
 const nativeRAF=requestAnimationFrame.bind(window),nativeCancel=cancelAnimationFrame.bind(window);
 window.requestAnimationFrame=fn=>{let id;id=nativeRAF(t=>{S.pendingRaf.delete(id);S.callbacks++;fn(t)});S.pendingRaf.add(id);S.requests++;return id};window.cancelAnimationFrame=id=>{S.pendingRaf.delete(id);return nativeCancel(id)};
 if(HTMLVideoElement.prototype.requestVideoFrameCallback){const p=HTMLVideoElement.prototype,r=p.requestVideoFrameCallback,c=p.cancelVideoFrameCallback;let v=0;const ids=new WeakMap();p.requestVideoFrameCallback=function(fn){if(!ids.has(this))ids.set(this,++v);const prefix=ids.get(this)+':';let id;id=r.call(this,(...args)=>{S.pendingVideo.delete(prefix+id);fn(...args)});S.pendingVideo.add(prefix+id);return id};p.cancelVideoFrameCallback=function(id){S.pendingVideo.delete(ids.get(this)+':'+id);return c.call(this,id)}}
 for(const type of [WebGLRenderingContext,WebGL2RenderingContext])for(const method of ['clear','drawElements','drawArrays']){const original=type.prototype[method];type.prototype[method]=function(...args){if(this.canvas.isConnected){if(method==='clear')S.glClears++;else S.glDraws++;}return original.apply(this,args)}}
 const observe=(type,fn,extra={})=>{try{new PerformanceObserver(list=>list.getEntries().forEach(fn)).observe({type,buffered:true,...extra})}catch{}};
 observe('longtask',e=>S.longTasks.push({at:e.startTime,duration:e.duration}));observe('event',e=>S.events.push({name:e.name,at:e.startTime,duration:e.duration,inputDelay:e.processingStart-e.startTime,processing:e.processingEnd-e.processingStart,interactionId:e.interactionId}),{durationThreshold:16});observe('measure',e=>{if(e.name==='portfolio:hand-inference')S.inference.push({at:e.startTime,duration:e.duration})});
 let previous;const probe=t=>{if(previous)S.raf.push({at:t,duration:t-previous});previous=t;if(document.querySelector('[data-startup-overlay]'))S.loaderSeen=true;const icon=document.querySelector('[data-dock-app="notes"]');if(S.loaderSeen&&!S.startupReady&&!document.querySelector('[data-startup-overlay]')&&icon){const r=icon.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(hit?.closest('[data-dock-app="notes"]')===icon)S.startupReady=t;}nativeRAF(probe)};nativeRAF(probe);
 document.addEventListener('pointermove',event=>{if(event.buttons!==1)return;const at=performance.now();nativeRAF(()=>S.pointer.push({at,duration:performance.now()-at}))},true);
 S.snapshot=()=>({at:performance.now(),raf:[...S.raf],longTasks:[...S.longTasks],events:[...S.events],inference:[...S.inference],pointer:[...S.pointer],requests:S.requests,callbacks:S.callbacks,pendingRaf:S.pendingRaf.size,pendingVideo:S.pendingVideo.size,glClears:S.glClears,glDraws:S.glDraws,startupReady:S.startupReady,loaderSeen:S.loaderSeen});
}
const phase=process.env.WORKSPACE_PHASE??'after';
const filter=process.env.WORKSPACE_FILTER;
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const distribution=values=>({n:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:values.length?Math.max(...values):null,over16_7:values.filter(x=>x>16.7).length,over33_4:values.filter(x=>x>33.4).length});
const getMetrics=async page=>Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
async function sample(page,label,run){const start=await page.evaluate('window.__perf.snapshot()'),metrics=await getMetrics(page);const at=Date.now();await run();const end=await page.evaluate('window.__perf.snapshot()'),final=await getMetrics(page);const entries=key=>end[key].filter(x=>x.at>=start.at);return{label,durationMs:end.at-start.at,wallMs:Date.now()-at,frames:distribution(entries('raf').map(e=>e.duration)),longTasks:entries('longTasks'),eventTiming:distribution(entries('events').map(e=>e.duration)),inputDelay:distribution(entries('events').map(e=>e.inputDelay)),pointerToNextRAF:distribution(entries('pointer').map(e=>e.duration)),inference:distribution(entries('inference').map(e=>e.duration)),mainThreadBusyPercent:100*(final.TaskDuration-metrics.TaskDuration)/((end.at-start.at)/1000),attachedCanvasClearsPerSecond:1000*(end.glClears-start.glClears)/(end.at-start.at),drawCallsPerSecond:1000*(end.glDraws-start.glDraws)/(end.at-start.at),pendingRaf:end.pendingRaf,pendingVideoCallbacks:end.pendingVideo,jsHeap:final.JSHeapUsedSize,dom:await page.send('Memory.getDOMCounters')};}
async function drag(page,id,x,y){const header=`[data-window-frame="${id}"] > div:first-child`,start=await point(page,header);await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...start});await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});for(let i=1;i<=35;i++){await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x:start.x+x*i/35,y:start.y+y*i/35});await sleep(16)}await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+x,y:start.y+y,button:'left',clickCount:1});}

const began=Date.now();
const report={phase,explicitColdCache:process.env.WORKSPACE_COLD==='1',startedAt:new Date().toISOString(),buildId:(await readFile(new URL('../.next/BUILD_ID',import.meta.url),'utf8')).trim(),browser:version.Browser,host:{model:'MacBookAir10,1',chip:'Apple M1',ramGiB:8,os:'macOS 27.2',darwin:os.release(),arch:os.arch()},viewport:{width:1440,height:1000,dpr:1},conditions:'Production localhost; isolated headless Chrome with ANGLE Metal. CDP wheel/touch/keyboard and controlled visibility/playback fixtures are not physical hardware coverage. rAF/Event Timing are local probes, not field INP or presented FPS.',scenarios:[]};
let failures=0;
async function scenario(name,run,options={}){
 if(filter&&!name.includes(filter))return;
 const page=await pageFor({...options,cold:options.cold||process.env.WORKSPACE_COLD==='1'}),result={name},at=Date.now();
 try{await page.boot();await run(page,result);assert.deepEqual(page.errors,[]);result.status='PASS';}
 catch(error){failures++;result.status='FAIL';result.error=error.stack;try{result.screen=await page.evaluate(`({workspace:document.querySelector('[data-workspace-environment]')?.outerHTML.slice(0,1000),controls:document.querySelector('[data-workspace-controls]')?.innerText})`);await page.screenshot('failed-'+name);}catch{}}
 finally{result.elapsedMs=Date.now()-at;report.scenarios.push(result);console.log(`${result.status} ${name}${result.error?'\n'+result.error:''}`);await mkdir(output,{recursive:true});await writeFile(new URL(`${phase}${filter?'-'+filter:''}-workspace-results.json`,output),JSON.stringify(report,null,2)+'\n');try{await page.close()}catch(error){result.cleanupError=error.message;failures++;}}
}
const env='[data-workspace-environment]';
async function settled(page,id){await page.wait(`document.querySelector('${env}')?.dataset.workspaceCurrent===${JSON.stringify(id)}&&document.querySelector('${env}')?.dataset.workspacePhase==='idle'`,id+' settled',18000);}
async function picker(page){if(!await page.evaluate(`!!document.querySelector('[data-workspace-picker]')`))await click(page,'[data-workspace-trigger]');await page.wait(`parseFloat(getComputedStyle(document.querySelector('[data-workspace-picker]')).opacity)>.99`,'picker visible');}
async function go(page,id){await picker(page);await click(page,`[data-workspace-option="${id}"]`);await settled(page,id);}
async function live(page,id){await page.wait(`(()=>{const v=document.querySelector('[data-workspace-video="${id}"]');return v&&!v.paused&&v.readyState>=2&&v.hasAttribute('data-frame-ready')})()`,id+' playing',15000);}
async function closePicker(page){if(await page.evaluate(`!!document.querySelector('[data-workspace-picker]')`))await key(page,'Escape','Escape',27);}
async function resources(page){return page.evaluate(`({layers:document.querySelectorAll('[data-workspace-layer]').length,videos:[...document.querySelectorAll('[data-workspace-video]')].map(v=>({id:v.dataset.workspaceVideo,paused:v.paused,src:v.getAttribute('src'),time:v.currentTime,ready:v.readyState})),canvases:document.querySelectorAll('canvas').length,pendingRaf:window.__perf.pendingRaf.size,pendingVideo:window.__perf.pendingVideo.size})`);}

await scenario('corner-launcher-idle-hover-click-keyboard-and-touch',async(page,r)=>{
 await settled(page,'chalk');
 await page.wait(`document.querySelector('[data-workspace-trigger]').getBoundingClientRect().width===48`,'launcher collapses after idle',5000);
 const rect=await page.evaluate(`(()=>{const r=document.querySelector('[data-workspace-trigger]').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:innerHeight-r.bottom}})()`);
 assert.ok(rect.x>=0&&rect.x<=20&&rect.bottom<=20);assert.equal(rect.w,48);assert.equal(rect.h,48);r.collapsed=rect;await page.screenshot('corner-collapsed');
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+24,y:rect.y+24});
 await page.wait(`document.querySelector('[data-workspace-trigger]').getBoundingClientRect().width>163`,'hover reveals label');
 assert.equal(await page.evaluate(`!!document.querySelector('[data-workspace-picker]')`),false);
 await sleep(3200);assert.equal(await page.evaluate(`document.querySelector('[data-workspace-trigger]').getBoundingClientRect().width`),164);await page.screenshot('corner-hover');
 await picker(page);await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1400,y:20});await sleep(3200);
 assert.equal(await page.evaluate(`!!document.querySelector('[data-workspace-picker]')`),true,'idle never dismisses open picker');await page.screenshot('corner-picker');
 await key(page,'Escape','Escape',27);assert.equal(await page.evaluate(`document.activeElement.hasAttribute('data-workspace-trigger')`),true);
 await sleep(3200);assert.equal(await page.evaluate(`document.querySelector('[data-workspace-trigger]').getBoundingClientRect().width`),164,'keyboard focus stays discoverable');
 await key(page,'Enter','Enter',13);await page.wait(`!!document.querySelector('[data-workspace-picker]')`,'keyboard Enter opens full picker');
 await mouse(page,{x:1400,y:20});await page.wait(`!document.querySelector('[data-workspace-picker]')`,'outside click closes');
 await page.wait(`document.querySelector('[data-workspace-trigger]').getBoundingClientRect().width===48`,'collapse after dismissal',5000);
 await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await page.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});const p=await point(page,'[data-workspace-trigger]');
 await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...p,radiusX:4,radiusY:4,force:1}]});await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.wait(`!!document.querySelector('[data-workspace-picker]')`,'one tap opens full picker without hover');await page.screenshot('corner-touch-390');r.touchOpened=true;
},{workspace:'chalk'});

await scenario('horizontal-swipe-geometry-and-anchored-laptop',async(page,r)=>{
 await settled(page,'chalk');
 let lastRect;await until(async()=>{const rect=await page.evaluate(`document.querySelector('#desktop-root').getBoundingClientRect().toJSON()`);const stable=lastRect&&Math.abs(lastRect.x-rect.x)+Math.abs(lastRect.y-rect.y)<.01;lastRect=rect;await sleep(150);return stable},'existing camera entrance settles',8000);
 await picker(page);
 await page.evaluate(`window.__swipeCanvas=document.querySelector('canvas');window.__swipeDesktop=document.querySelector('#desktop-root');window.__swipeRect=window.__swipeDesktop.getBoundingClientRect().toJSON();`);
 await click(page,'[data-workspace-option="sage"]');await page.wait(`document.querySelector('${env}').dataset.workspacePhase==='travelling'`,'swipe begins');
 r.geometry=await page.evaluate(`(()=>{
 const old=document.querySelector('[data-workspace-role="active"]'),next=document.querySelector('[data-workspace-role="incoming"]');
 const a=old.getAnimations()[0],b=next.getAnimations()[0];a.pause();b.pause();const frames=[];
 for(const time of [0,400,700]){a.currentTime=time;b.currentTime=time;const x=new DOMMatrix(getComputedStyle(old).transform),y=new DOMMatrix(getComputedStyle(next).transform);frames.push({time,width:old.clientWidth,old:{x:x.m41,y:x.m42,sx:x.m11,sy:x.m22},next:{x:y.m41,y:y.m42,sx:y.m11,sy:y.m22}});}
 a.currentTime=400;b.currentTime=400;for(const s of document.querySelector('[data-workspace-warp]').getAnimations()){s.pause();s.currentTime=400;}
 const desktop=document.querySelector('#desktop-root');return{frames,canvasUnchanged:window.__swipeCanvas===document.querySelector('canvas'),desktopUnchanged:window.__swipeDesktop===desktop,desktopDelta:Math.abs(desktop.getBoundingClientRect().x-window.__swipeRect.x)+Math.abs(desktop.getBoundingClientRect().y-window.__swipeRect.y),horizontalStreaks:[...document.querySelectorAll('[data-workspace-warp] path')].every(p=>p.getAttribute('d').includes(' H '))};})()`);
 for(const f of r.geometry.frames){assert.equal(f.old.sx,1);assert.equal(f.old.sy,1);assert.equal(f.next.sx,1);assert.equal(f.old.y,0);assert.equal(f.next.y,0);assert.ok(Math.abs(f.old.x+f.width-f.next.x)<1,'edges stay joined');}
 assert.ok(r.geometry.frames[1].old.x<0&&r.geometry.frames[1].next.x>0);assert.ok(r.geometry.frames[2].old.x<r.geometry.frames[1].old.x&&r.geometry.frames[2].next.x<r.geometry.frames[1].next.x);
 assert.ok(r.geometry.canvasUnchanged&&r.geometry.desktopUnchanged&&r.geometry.horizontalStreaks);assert.ok(r.geometry.desktopDelta<.5);
 await page.screenshot('swipe-midpoint');await settled(page,'sage');assert.equal(await page.evaluate(`document.querySelectorAll('[data-workspace-layer]').length`),1);
},{workspace:'chalk'});

await scenario('entry-assets-and-laptop-continuity',async(page,r)=>{
 await settled(page,'beach');await live(page,'beach');
 r.entry=await page.evaluate(`({startupReady:window.__perf.startupReady,resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('/workspaces/')).map(e=>({url:e.name,start:e.startTime,duration:e.duration,encoded:e.encodedBodySize}))})`);
 assert.ok(r.entry.resources.every(e=>/beach-hd\.(webp|mp4)/.test(e.url)),'entry loads only selected environment, no collection or thumbnails');
 await page.evaluate(`window.__workspaceCanvas=document.querySelector('canvas');window.__workspaceDesktop=document.querySelector('#desktop-root');void 0`);
 r.renderer=await page.evaluate(`(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2')??c.getContext('webgl');return{alpha:g.getContextAttributes().alpha,background:g.getParameter(g.COLOR_CLEAR_VALUE)}})()`);assert.equal(r.renderer.alpha,true);
 await closePicker(page);await page.screenshot('beach');
 await launch(page,'notes');await click(page,'[title="Create a new note"]');await click(page,'[aria-label="Note editor"]');await page.send('Input.insertText',{text:'A note that travels with me.'});
 r.wallpaper=await page.evaluate(`document.querySelector('[data-wallpaper-current]')?.getAttribute('data-wallpaper-current')`);
 await go(page,'forest');await live(page,'forest');await closePicker(page);await page.screenshot('forest');
 await go(page,'studio');await closePicker(page);await page.screenshot('studio');
 await drag(page,'app-notes',70,50);
 assert.equal(await page.evaluate(`document.querySelectorAll('[data-workspace-video]').length`),0);
 assert.equal(await page.evaluate(`document.querySelector('canvas')===window.__workspaceCanvas&&document.querySelector('#desktop-root')===window.__workspaceDesktop`),true);
 assert.equal(await page.evaluate(`document.querySelector('[aria-label="Note editor"]').innerText`),'A note that travels with me.');
 assert.equal(await page.evaluate(`document.querySelector('[data-wallpaper-current]')?.getAttribute('data-wallpaper-current')`),r.wallpaper);
 await picker(page);await page.screenshot('studio-picker');await closePicker(page);
 r.preference=await page.evaluate(`JSON.parse(localStorage.getItem('portfolio-workspace'))`);assert.deepEqual(r.preference,{version:1,state:{environment:'studio'}});
 const origin=await page.evaluate('performance.timeOrigin');await page.send('Page.reload');await page.wait(`performance.timeOrigin!==${origin}&&window.__perf?.startupReady`,'reload',45000);await settled(page,'studio');
 r.reloadResources=await page.evaluate(`performance.getEntriesByType('resource').filter(e=>e.name.includes('/workspaces/')).map(e=>e.name)`);assert.ok(r.reloadResources.every(e=>e.includes('/studio.png')));
}, {cold:true});

await scenario('all-backgrounds-colors-and-pngs-without-unselected-downloads',async(page,r)=>{
 await settled(page,'beach');await picker(page);
 assert.equal(await page.evaluate(`document.querySelectorAll('[data-workspace-option]').length`),11);
 r.thumbnails=await page.evaluate(`[...document.querySelectorAll('[data-workspace-picker] img')].map(e=>({src:e.getAttribute('src'),valid:e.complete&&e.naturalWidth>0}))`);
 await page.wait(`[...document.querySelectorAll('[data-workspace-picker] img')].every(e=>e.complete&&e.naturalWidth>0)`,'all five dedicated thumbnails');
 const before=page.requests.length;
 for(const id of ['paper','slate','ink','graphite','chalk','stone','sage','mist']){
  await go(page,id);
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-workspace-video]').length`),0);
  if(['slate','chalk'].includes(id)){await closePicker(page);await page.screenshot(id);}
 }
 r.requests=page.requests.slice(before).filter(e=>e.url.includes('/workspaces/'));
 assert.ok(r.requests.every(e=>/\/(paper|slate)\.png$/.test(e.url)),'colors make no asset requests');
 await go(page,'paper');await closePicker(page);await page.screenshot('paper');await picker(page);await page.screenshot('background-picker');
 await key(page,'End','End',35);await settled(page,'mist');assert.equal(await page.evaluate(`document.activeElement.dataset.workspaceOption`),'mist');
 await key(page,'Home','Home',36);await settled(page,'beach');
 await go(page,'chalk');const origin=await page.evaluate('performance.timeOrigin');await page.send('Page.reload');await page.wait(`performance.timeOrigin!==${origin}&&window.__perf?.startupReady`,'color reload',45000);await settled(page,'chalk');
 r.colorReloadRequests=await page.evaluate(`performance.getEntriesByType('resource').filter(e=>e.name.includes('/workspaces/')).map(e=>e.name)`);assert.deepEqual(r.colorReloadRequests,[]);
});

await scenario('rapid-selection-late-requests-and-bounded-travel',async(page,r)=>{
 await settled(page,'beach');await picker(page);
 await page.evaluate(`window.__peakLayers=0;window.__workspaceWatch=new MutationObserver(()=>window.__peakLayers=Math.max(window.__peakLayers,document.querySelectorAll('[data-workspace-layer]').length));window.__workspaceWatch.observe(document.querySelector('${env}'),{childList:true,subtree:true});`);
 await page.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:700000,uploadThroughput:250000,connectionType:'cellular4g'});
 await click(page,'[data-workspace-option="forest"]');await click(page,'[data-workspace-option="studio"]');await settled(page,'studio');await sleep(800);assert.equal(await page.evaluate(`document.querySelector('${env}').dataset.workspaceCurrent`),'studio');
 await page.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1,connectionType:'none'});
 await go(page,'beach');await click(page,'[data-workspace-option="forest"]');await page.wait(`document.querySelector('${env}').dataset.workspacePhase==='travelling'`,'flight begins');
 await click(page,'[data-workspace-option="beach"]');await click(page,'[data-workspace-option="studio"]');await settled(page,'studio');
 r.peak=await page.evaluate('window.__peakLayers');r.final=await resources(page);assert.ok(r.peak<=2);assert.equal(r.final.layers,1);assert.equal(r.final.videos.length,0);await page.evaluate('window.__workspaceWatch.disconnect()');
});

await scenario('failed-image-and-video-recovery',async(page,r)=>{
 await settled(page,'beach');await picker(page);
 await page.send('Network.setBlockedURLs',{urls:['*/workspaces/forest-hd.webp*']});await click(page,'[data-workspace-option="forest"]');await page.wait(`!!document.querySelector('[data-workspace-retry]')`,'failed poster recovery');await settled(page,'beach');
 r.failedImage=await page.evaluate(`document.querySelector('[data-workspace-status]').innerText`);
 await page.send('Network.setBlockedURLs',{urls:[]});await click(page,'[data-workspace-retry]');await settled(page,'forest');
 await go(page,'studio');await page.send('Network.setCacheDisabled',{cacheDisabled:true});await page.send('Network.clearBrowserCache');await page.send('Network.setBlockedURLs',{urls:['*/workspaces/beach-hd.mp4*']});await click(page,'[data-workspace-option="beach"]');await page.wait(`!!document.querySelector('[data-workspace-retry]')`,'failed video recovery');await settled(page,'studio');
 r.failedVideo=await page.evaluate(`document.querySelector('[data-workspace-status]').innerText`);
 await click(page,'[data-workspace-pause]');await click(page,'[data-workspace-option="beach"]');await settled(page,'beach');assert.equal(await page.evaluate(`document.querySelector('[data-workspace-video]').paused`),true);
 await page.send('Network.setBlockedURLs',{urls:[]});await click(page,'[data-workspace-pause]');await live(page,'beach');
});

await scenario('autoplay-rejection-still-fallback-and-retry',async(page,r)=>{
 r.fixture=await page.evaluate(`({denied:window.__denyWorkspacePlayback,attempts:window.__workspacePlayAttempts,paused:document.querySelector('[data-workspace-video]')?.paused})`);
 await settled(page,'beach');await picker(page);await page.wait(`document.querySelector('[data-workspace-status]').innerText.includes('unavailable')`,'honest rejected playback status');r.fallback=await resources(page);
 assert.ok(r.fallback.videos.every(v=>v.paused));await page.evaluate('window.__denyWorkspacePlayback=false');await click(page,'[data-workspace-retry]');await live(page,'beach');
},{init:`window.__denyWorkspacePlayback=true;window.__workspacePlayAttempts=0;{const native=HTMLVideoElement.prototype.play;HTMLVideoElement.prototype.play=function(){if(this.hasAttribute('data-workspace-video')){window.__workspacePlayAttempts++;if(window.__denyWorkspacePlayback)return Promise.reject(new DOMException('Fixture: autoplay denied','NotAllowedError'))}return native.call(this)}}`});

await scenario('motion-pause-visibility-reduced-motion-and-loop-ending',async(page,r)=>{
 await settled(page,'beach');await live(page,'beach');await picker(page);await click(page,'[data-workspace-pause]');const paused=await page.evaluate(`document.querySelector('[data-workspace-video]').currentTime`);await sleep(250);assert.ok(Math.abs(await page.evaluate(`document.querySelector('[data-workspace-video]').currentTime`)-paused)<.02);
 await go(page,'forest');assert.equal(await page.evaluate(`document.querySelector('[data-workspace-video]').getAttribute('src')`),null);
 await click(page,'[data-workspace-pause]');await live(page,'forest');await page.evaluate(`Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pagehide'))`);await sleep(200);assert.equal(await page.evaluate(`document.querySelector('[data-workspace-video]').paused`),true);
 await page.evaluate(`Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'))`);await live(page,'forest');
 r.loop=await page.evaluate(`(()=>{const v=document.querySelector('[data-workspace-video]');v.currentTime=v.duration-.15;return{duration:v.duration}})()`);await sleep(650);r.loop.after=await page.evaluate(`document.querySelector('[data-workspace-video]').currentTime`);assert.ok(r.loop.after<1&&r.loop.after>0,'actual media reaches its end and loops');
 await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(150);assert.equal(await page.evaluate(`document.querySelector('[data-workspace-video]').paused`),true);await go(page,'beach');assert.equal(await page.evaluate(`document.querySelectorAll('[data-workspace-warp]').length`),0);assert.equal(await page.evaluate(`document.querySelector('[data-workspace-pause]').disabled`),true);
 r.reduced=await resources(page);
});

await scenario('keyboard-touch-and-narrow-selector',async(page,r)=>{
 await settled(page,'beach');await picker(page);assert.equal(await page.evaluate(`document.activeElement.dataset.workspaceOption`),'beach');await key(page,'ArrowDown','ArrowDown',40);await settled(page,'forest');await key(page,'Escape','Escape',27);assert.equal(await page.evaluate(`document.activeElement.hasAttribute('data-workspace-trigger')`),true);
 r.sizes=[];for(const [width,height]of [[1440,600],[800,600],[390,844],[320,568]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await picker(page);await sleep(200);
  const layout=await page.evaluate(`(()=>{const t=document.querySelector('[data-workspace-trigger]').getBoundingClientRect(),p=document.querySelector('[data-workspace-picker]').getBoundingClientRect();return{viewport:[innerWidth,innerHeight],trigger:{x:t.x,y:t.y,w:t.width,h:t.height},panel:{x:p.x,y:p.y,w:p.width,h:p.height},fits:p.left>=0&&p.right<=innerWidth+1&&p.top>=0&&p.bottom<=innerHeight+1}})()`);r.sizes.push(layout);assert.ok(layout.fits);assert.ok(layout.trigger.w>=44&&layout.trigger.h>=44);if(width===390)await page.screenshot('narrow-390');await closePicker(page);
 }
 await page.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});const p=await point(page,'[data-workspace-trigger]');await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...p,radiusX:4,radiusY:4,force:1}]});await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.wait(`!!document.querySelector('[data-workspace-picker]')`,'touch opens selector');
});

await scenario('video-idle-and-travel-frame-observations',async(page,r)=>{
 await settled(page,'beach');await live(page,'beach');await sleep(2000);r.beach=await sample(page,'Beach video + 3D idle',()=>sleep(8000));
 await go(page,'forest');await closePicker(page);r.forest=await sample(page,'Forest video + 3D idle',()=>sleep(8000));
 if(process.env.WORKSPACE_PROFILE==='1'){await page.send('Profiler.enable');await page.send('Profiler.start');}
 r.travel=await sample(page,'six prepared location changes',async()=>{for(const id of ['studio','beach','forest','beach','studio','forest'])await go(page,id)});r.resources=await resources(page);
 if(process.env.WORKSPACE_PROFILE==='1'){const {profile}=await page.send('Profiler.stop');await writeFile(new URL(`${phase}-travel.cpuprofile`,output),JSON.stringify(profile));await page.send('Profiler.disable');}
});

await scenario('eight-switch-cycles-and-retired-media-cleanup',async(page,r)=>{
 await settled(page,'beach');r.samples=[];await picker(page);
 await page.evaluate(`window.__retiredWorkspaceVideos=[];window.__workspaceResources=new MutationObserver(records=>{for(const r of records)for(const n of r.removedNodes){if(n.nodeType===1){const v=n.matches?.('[data-workspace-video]')?n:n.querySelector?.('[data-workspace-video]');if(v)window.__retiredWorkspaceVideos.push(new WeakRef(v));}}});window.__workspaceResources.observe(document.querySelector('${env}'),{childList:true,subtree:true})`);
 for(let cycle=1;cycle<=8;cycle++){
  for(const id of ['forest','beach','studio'])await go(page,id);await sleep(100);
  if(cycle===1||cycle%2===0){await page.evaluate(`window.__stage12Events=[];for(const key of ['raf','longTasks','events','inference','pointer'])window.__perf[key]=[]`);await page.send('HeapProfiler.collectGarbage');const metrics=await getMetrics(page);const dom=await page.send('Memory.getDOMCounters');const resource=await resources(page);const retired=await page.evaluate(`window.__retiredWorkspaceVideos.map(r=>r.deref()).filter(Boolean).map(v=>({paused:v.paused,src:v.getAttribute('src')}))`);assert.ok(retired.every(v=>v.paused&&!v.src));assert.equal(resource.videos.length,0);assert.equal(resource.layers,1);assert.equal(resource.canvases,1);r.samples.push({cycle,heapBytes:metrics.JSHeapUsedSize,...dom,...resource,retired});}
 }
 await page.evaluate('window.__workspaceResources.disconnect()');
});

if(process.env.WORKSPACE_RECORD_DEMO==='1')await scenario('recording-travel-transition',async(page,r)=>{
 await settled(page,'beach');await go(page,'forest');await go(page,'beach');await closePicker(page);
 const frames=[];const received=message=>{if(message.method!=='Page.screencastFrame')return;void page.send('Page.screencastFrameAck',{sessionId:message.params.sessionId}).catch(()=>{});if(frames.length<300)frames.push({data:message.params.data,time:message.params.metadata.timestamp});};
 listeners.add(received);await page.send('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:1152,maxHeight:800,everyNthFrame:2});
 try{
  await sleep(450);await picker(page);await click(page,'[data-workspace-option="forest"]');await closePicker(page);await settled(page,'forest');await sleep(600);
  await picker(page);await click(page,'[data-workspace-option="studio"]');await closePicker(page);await settled(page,'studio');await sleep(650);
 }finally{await page.send('Page.stopScreencast');listeners.delete(received);}
 const dir='/private/tmp/portfolio-stage13-sources/demo-frames';await mkdir(dir,{recursive:true});let concat='';
 for(let i=0;i<frames.length;i++){const file=`${dir}/frame-${String(i).padStart(4,'0')}.jpg`;await writeFile(file,Buffer.from(frames[i].data,'base64'));concat+=`file '${file}'\n`;if(i+1<frames.length)concat+=`duration ${Math.max(.01,frames[i+1].time-frames[i].time)}\n`;}
 await writeFile(`${dir}/frames.txt`,concat);r.recording={frames:frames.length,seconds:frames.at(-1).time-frames[0].time,source:'Actual CDP page screencast; two UI-triggered transitions. No physical-camera recording.',temporaryFrames:dir};assert.ok(frames.length>20);
});

report.elapsedMs=Date.now()-began;report.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});await writeFile(new URL(`${phase}${filter?'-'+filter:''}-workspace-results.json`,output),JSON.stringify(report,null,2)+'\n');socket.close();if(failures)process.exitCode=1;

