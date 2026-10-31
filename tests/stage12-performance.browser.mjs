// Shared isolated CDP harness for Stage 12 browser-state checks.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3012";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9229";
const output = new URL(process.env.STAGE12_OUTPUT_DIR ?? "../docs/stage12-review/", import.meta.url);
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
localStorage.setItem('portfolio-appearance',JSON.stringify({version:1,state:{theme:'dark',wallpaper:'coast',wallpaperMode:'auto'}}));
window.__stage12Events=[];
for(const type of ['pointerdown','pointermove','pointerup','click','dblclick','contextmenu','keydown','keyup'])document.addEventListener(type,event=>{
 const target=event.target instanceof Element?event.target:null;
 const item=target?.closest('[data-file-icon]');
 window.__stage12Events.push({type,key:event.key,repeat:event.repeat,detail:event.detail,trusted:event.isTrusted,x:event.clientX,y:event.clientY,item:item?.dataset.fileIcon,frame:target?.closest('[data-window-frame]')?.dataset.windowFrame,get prevented(){return event.defaultPrevented}});
},true);
` });
  await send("Performance.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(${instrument.toString()})();` });
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
const control = (id, action) => `${frame(id)} [data-window-control="${action}"]`;
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
const phase=process.env.STAGE12_PHASE??'baseline';
const filter=process.env.STAGE12_FILTER;
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const distribution=values=>({n:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:values.length?Math.max(...values):null,over16_7:values.filter(x=>x>16.7).length,over33_4:values.filter(x=>x>33.4).length});
const getMetrics=async page=>Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
async function sample(page,label,run){const start=await page.evaluate('window.__perf.snapshot()'),metrics=await getMetrics(page);const at=Date.now();await run();const end=await page.evaluate('window.__perf.snapshot()'),final=await getMetrics(page);const entries=key=>end[key].filter(x=>x.at>=start.at);return{label,durationMs:end.at-start.at,wallMs:Date.now()-at,frames:distribution(entries('raf').map(e=>e.duration)),longTasks:entries('longTasks'),eventTiming:distribution(entries('events').map(e=>e.duration)),inputDelay:distribution(entries('events').map(e=>e.inputDelay)),pointerToNextRAF:distribution(entries('pointer').map(e=>e.duration)),inference:distribution(entries('inference').map(e=>e.duration)),mainThreadBusyPercent:100*(final.TaskDuration-metrics.TaskDuration)/((end.at-start.at)/1000),attachedCanvasClearsPerSecond:1000*(end.glClears-start.glClears)/(end.at-start.at),drawCallsPerSecond:1000*(end.glDraws-start.glDraws)/(end.at-start.at),pendingRaf:end.pendingRaf,pendingVideoCallbacks:end.pendingVideo,jsHeap:final.JSHeapUsedSize,dom:await page.send('Memory.getDOMCounters')};}
async function screenshotPage(page,name){await page.screenshot(name)}
async function drag(page,id,x,y){const header=`[data-window-frame="${id}"] > div:first-child`,start=await point(page,header);await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...start});await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});for(let i=1;i<=35;i++){await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x:start.x+x*i/35,y:start.y+y*i/35});await sleep(16)}await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+x,y:start.y+y,button:'left',clickCount:1});}
async function fixtureSize(page,id,width,height){await page.evaluate(`(()=>{let e=document.querySelector('#stage12-layout');if(!e){e=document.createElement('style');e.id='stage12-layout';document.head.append(e)}e.textContent='[data-window-frame="${id}"]{width:${width}px!important;height:${height}px!important;left:100px!important;top:70px!important}';})()`);await sleep(200)}
async function clearFixture(page){await page.evaluate("document.querySelector('#stage12-layout')?.remove()");}
const started=Date.now(),report={phase,startedAt:new Date().toISOString(),buildId:(await readFile(new URL('../.next/BUILD_ID',import.meta.url),'utf8')).trim(),browser:version.Browser,host:{model:'MacBookAir10,1',chip:'Apple M1',ramGiB:8,os:'macOS 27.2',osBuild:'26B123',darwin:os.release(),arch:os.arch()},viewport:{width:1440,height:1000,dpr:1},input:'Isolated headless Chrome on actual M1; CDP mouse/key/wheel/touch. Photo-camera fixtures reported separately. rAF cadence and event timing are local lab probes, not field INP or presented-frame proof.',scenarios:[],systemInfo:await command('SystemInfo.getInfo').then(r=>({gpu:r.gpu.devices,aux:r.gpu.auxAttributes,featureStatus:r.gpu.featureStatus})).catch(()=>null)};
let failures=0;
async function scenario(name,run,options={}){if(filter&&!name.includes(filter))return;const page=await pageFor(options),result={name},start=Date.now();try{await page.boot();await run(page,result);assert.deepEqual(page.errors,[]);result.status='PASS'}catch(error){failures++;result.status='FAIL';result.error=error.stack;try{await page.screenshot('failed-'+name)}catch{/* Preserve original failure. */}}finally{result.durationMs=Date.now()-start;report.scenarios.push(result);console.log(`${result.status} ${name}${result.error?'\n'+result.error:''}`);await page.close()}}
for(let i=0;i<3;i++)await scenario('startup-cold-returning-'+i,async(page,result)=>{
 const startup=async()=>page.evaluate(`({ready:window.__perf.startupReady,loaderSeen:window.__perf.loaderSeen,resource:performance.getEntriesByType('resource').map(e=>({url:e.name,start:e.startTime,end:e.responseEnd,duration:e.duration,transfer:e.transferSize,encoded:e.encodedBodySize,decoded:e.decodedBodySize,initiator:e.initiatorType})),navigation:performance.getEntriesByType('navigation').map(e=>({domContentLoaded:e.domContentLoadedEventEnd,load:e.loadEventEnd,encoded:e.encodedBodySize,transfer:e.transferSize}))})`);
 result.cold=await startup();await click(page,'[data-dock-app="notes"]');await page.wait(`!!document.querySelector('[data-window-frame="app-notes"]')`,'first usable click');const origin=await page.evaluate('performance.timeOrigin');await page.send('Page.reload');await page.wait(`performance.timeOrigin!==${origin}&&window.__perf?.startupReady`,'returning usable desktop',45000);result.returning=await startup();if(i===0)await screenshotPage(page,'returning-desktop');
},{cold:true});
await scenario('startup-10Mbps-60ms-rtt',async(page,result)=>{result.startup=await page.evaluate('window.__perf.snapshot()');result.network={latencyMs:60,downloadBytesPerSecond:1250000,uploadBytesPerSecond:125000};},{cold:true,slow:true});
await scenario('idle-and-multi-app-window-interaction',async(page,result)=>{
 await sleep(3500);result.idle=await sample(page,'idle desktop',()=>sleep(8000));
 for(const kind of ['finder','notes','music','settings'])await launch(page,kind);
 result.windows=await sample(page,'four apps + drag/maximize/minimize',async()=>{for(let i=0;i<3;i++){await drag(page,'app-settings',100,70);await drag(page,'app-settings',-100,-70)}await click(page,control('app-settings','maximize'));await sleep(250);await click(page,control('app-settings','maximize'));await click(page,control('app-settings','minimize'));await launch(page,'settings');});
 await screenshotPage(page,'four-apps');result.renderingPolicy='Continuous scene rendering retained unless a separate verified variant proves safe.';
});
await scenario('retina-DPR2-idle-and-drag',async(page,result)=>{
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});await sleep(1200);
 result.idle=await sample(page,'DPR2 idle desktop',()=>sleep(5000));
 await launch(page,'notes');result.drag=await sample(page,'DPR2 Notes dragging',async()=>{for(let i=0;i<3;i++){await drag(page,'app-notes',90,60);await drag(page,'app-notes',-90,-60)}});
 result.renderer=await page.evaluate(`(()=>{const c=document.querySelector('canvas');return{cssWidth:c.clientWidth,cssHeight:c.clientHeight,bufferWidth:c.width,bufferHeight:c.height,dpr:devicePixelRatio}})()`);
 assert.equal(result.renderer.bufferWidth,2880,'DPR2 must mount an actual double-resolution renderer');
},{dpr:2});
await scenario('finder-wallpaper-and-theme',async(page,result)=>{
 await launch(page,'finder');result.finder=await sample(page,'Finder rapid hover/navigation',async()=>{for(let i=0;i<9;i++){const sel=`[data-finder-location="${['projects','documents','desktop'][i%3]}"]`;await click(page,sel)}});
 await launch(page,'settings');await click(page,control('app-settings','maximize'));result.wallpaper=await sample(page,'wallpaper/theme switching',async()=>{for(const id of ['lake','forest','coast','dunes','alpine','drift'])await click(page,`[data-wallpaper-option="${id}"]`);await click(page,'[data-appearance-theme="light"]');await click(page,'[data-appearance-theme="dark"]');await sleep(500)});result.thumbnails=await page.evaluate(`Array.from(document.querySelectorAll('[data-wallpaper-thumbnail]')).map(e=>({id:e.dataset.wallpaperThumbnail,ready:e.complete&&e.naturalWidth>0,source:e.currentSrc}))`);await screenshotPage(page,'wallpaper-settings');
});
await scenario('wheel-and-narrow-app-layouts',async(page,result)=>{
 await launch(page,'settings');await fixtureSize(page,'app-settings',420,478);
 const settings='[data-window-frame="app-settings"]';
 result.settings=await page.evaluate(`(()=>{const frame=document.querySelector('${settings}'),content=frame.querySelector('[style*="translateZ"]:last-child'),r=frame.getBoundingClientRect();return{frameWidth:frame.offsetWidth,scrollWidth:content.scrollWidth,clientWidth:content.clientWidth,accentOutside:[...frame.querySelectorAll('[aria-label$=" accent"]')].filter(e=>e.getBoundingClientRect().right>r.right+1).length,modeOutside:[...frame.querySelectorAll('[data-wallpaper-mode]')].filter(e=>e.getBoundingClientRect().right>r.right+1).length}})()`);
 result.wheel=await page.evaluate(`(()=>{const el=document.querySelector('${settings} [data-wallpaper-picker]').closest('[style*="translateZ"]');const out=[];for(const [label,options] of [['ordinary',{deltaY:80}],['pinch',{deltaY:30,ctrlKey:true}],['horizontal',{deltaX:50}],['shift',{deltaY:30,shiftKey:true}]]){const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,...options});el.dispatchEvent(e);out.push({label,prevented:e.defaultPrevented,scrollTop:el.scrollTop})}return out})()`);
 if(phase==='after'){
  assert.equal(result.settings.modeOutside,0);assert.equal(result.settings.accentOutside,0);assert.ok(result.settings.scrollWidth<=result.settings.clientWidth+1);
  assert.ok(result.wheel.every(e=>!e.prevented),'ordinary/modified/horizontal wheel must retain native behavior');
 }
 const wheelSurface=`${settings} [data-wallpaper-picker]`;
 const wheelPoint=await page.evaluate(`(()=>{const e=document.querySelector('${wheelSurface}').closest('[style*="translateZ"]');e.scrollTop=0;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await page.send('Input.dispatchMouseEvent',{type:'mouseWheel',...wheelPoint,deltaX:0,deltaY:120});await sleep(250);
 result.nativeSettingsScroll=await page.evaluate(`document.querySelector('${wheelSurface}').closest('[style*="translateZ"]').scrollTop`);assert.ok(result.nativeSettingsScroll>0,'trusted native wheel scrolls Settings');
 await screenshotPage(page,'settings-420');await clearFixture(page);
 await launch(page,'music');await fixtureSize(page,'app-music',420,478);result.music=await page.evaluate(`(()=>{const f=document.querySelector('[data-window-frame="app-music"]'),r=f.getBoundingClientRect();return{frameWidth:f.offsetWidth,controls:[...f.querySelectorAll('[aria-label="Play"],[aria-label="Previous track"],[aria-label="Next track"],[aria-label="Volume"]')].map(e=>{const b=e.getBoundingClientRect();return{label:e.ariaLabel,visible:!!b.width&&!!b.height,withinFrame:b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top&&b.bottom<=r.bottom+1}})}})()`);if(phase==='after')assert.ok(result.music.controls.every(e=>e.visible&&e.withinFrame));await screenshotPage(page,'music-420');await clearFixture(page);
 await launch(page,'notes');await fixtureSize(page,'app-notes',420,478);
 result.notesWheel=await page.evaluate(`(()=>{const e=document.querySelector('[data-note-page]').parentElement;const out=[];for(const [label,options]of [['ordinary',{deltaY:80}],['pinch',{deltaY:30,ctrlKey:true}],['horizontal',{deltaX:50}],['shift',{deltaY:30,shiftKey:true}]]){const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,...options});e.dispatchEvent(event);out.push({label,prevented:event.defaultPrevented})}e.scrollTop=0;const r=e.getBoundingClientRect();return{events:out,point:{x:r.x+r.width/2,y:r.y+r.height/2},overscroll:getComputedStyle(e).overscrollBehaviorY}})()`);
 await page.send('Input.dispatchMouseEvent',{type:'mouseWheel',...result.notesWheel.point,deltaX:0,deltaY:160});await sleep(250);result.nativeNotesScroll=await page.evaluate(`document.querySelector('[data-note-page]').parentElement.scrollTop`);assert.ok(result.nativeNotesScroll>0);if(phase==='after')assert.ok(result.notesWheel.events.every(e=>!e.prevented));await screenshotPage(page,'notes-420');await clearFixture(page);
});
await scenario('page-viewport-dpr-scale-touch-keyboard-and-reduced-motion',async(page,result)=>{
 await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:false});await sleep(600);result.narrow=await page.evaluate(`(()=>{const e=document.querySelector('[data-dock-app="notes"]'),r=e.getBoundingClientRect();return{viewport:{width:innerWidth,height:innerHeight},dock:{x:r.x,y:r.y,width:r.width,height:r.height},within:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight}})()`);await screenshotPage(page,'viewport-390');
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});await page.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.25});await sleep(300);await screenshotPage(page,'visual-page-scale-125');await page.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
 await page.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});const p=await point(page,'[data-dock-app="notes"]');await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...p,radiusX:2,radiusY:2,force:1}]});await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.wait(`!!document.querySelector('[data-window-frame="app-notes"]')`,'touch Notes');result.touchOpenedNotes=true;
 await click(page,control('app-notes','close'));await page.wait(`!document.querySelector('[data-window-frame="app-notes"]')`,'Notes closed');
 await page.evaluate(`document.querySelector('[data-file-icon="about-me"]').focus()`);await key(page,'Enter','Enter',13);await page.wait(`!!document.querySelector('[data-window-frame="about-me"]')`,'keyboard About Me');result.keyboardOpenedAbout=true;
 await launch(page,'settings');result.osReducedMotion=await page.evaluate(`({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,duration:getComputedStyle(document.querySelector('[data-settings-app]')).transitionDuration})`);if(phase==='after')assert.equal(result.osReducedMotion.duration,'0s');
 await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await click(page,'[data-settings-section="accessibility"]');await click(page,'[aria-label="Reduce motion"]');await page.wait(`document.querySelector('[aria-label="Reduce motion"]').getAttribute('aria-checked')==='true'`,'app reduced motion');
 await launch(page,'music');await launch(page,'notes');result.appReducedMotion=await page.evaluate(`[document.querySelector('[data-settings-app]'),document.querySelector('[data-music-current]'),document.querySelector('[data-notes-app]')].map(e=>({enabled:e.hasAttribute('data-reduced-motion'),duration:getComputedStyle(e).transitionDuration}))`);if(phase==='after')assert.ok(result.appReducedMotion.every(e=>e.enabled&&e.duration==='0s'));
 result.zoomCoverage='CDP visual page-scale and DPR emulation, not native toolbar/browser zoom';
});
await scenario('normal-app-open-close-resource-cycles',async(page,result)=>{
 result.samples=[];
 for(let cycle=1;cycle<=8;cycle++){
  for(const kind of ['finder','notes','music','settings'])await launch(page,kind);
  for(const id of ['app-settings','app-music','app-notes','finder-desktop'])await click(page,control(id,'close'));
  await page.wait(`document.querySelectorAll('[data-window-frame]').length===0`,'all four windows closed');await sleep(150);
  if(cycle===1||cycle%2===0){
   // Drop the measurement harness's own event/frame histories before collecting.
   await page.evaluate(`(()=>{window.__stage12Events=[];for(const key of ['raf','longTasks','events','inference','pointer'])window.__perf[key]=[]})()`);
   await page.send('HeapProfiler.collectGarbage');
   const metric=await getMetrics(page),dom=await page.send('Memory.getDOMCounters');
   const resources=await page.evaluate(`({windows:document.querySelectorAll('[data-window-frame]').length,audio:document.querySelectorAll('audio').length,video:document.querySelectorAll('video').length,canvases:document.querySelectorAll('canvas').length,pendingRaf:window.__perf.pendingRaf.size,pendingVideo:window.__perf.pendingVideo.size})`);
   assert.equal(resources.windows,0);assert.equal(resources.audio,0);assert.equal(resources.video,0);assert.equal(resources.canvases,1);assert.equal(resources.pendingVideo,0);
   result.samples.push({cycle,heapBytes:metric.JSHeapUsedSize,...dom,...resources});
  }
 }
 result.note='GC-assisted short-run trend with test histories cleared. Cache/allocator growth is not by itself a leak; stable counts do not prove unbounded-runtime safety.';
});
report.elapsedMs=Date.now()-started;report.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});await writeFile(new URL(`${phase}${filter?'-'+filter:''}-results.json`,output),JSON.stringify(report,null,2)+'\n');socket.close();if(failures)process.exitCode=1;
