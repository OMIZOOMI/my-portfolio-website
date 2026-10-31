// Production preview + isolated Chrome CDP, without browser test dependencies.
// FINDER_PHASE=before STARTUP_TEST_URL=http://127.0.0.1:3001 CDP_URL=http://127.0.0.1:9223 node tests/finder.browser.mjs
// FINDER_TEST_FILTER=app-reduced-motion or destinations runs only the focused follow-up checks.
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9223";
const phase = process.env.FINDER_PHASE ?? "after";
const filter = process.env.FINDER_TEST_FILTER;
const output = new URL("../docs/finder-review/", import.meta.url);
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
async function until(check, label, timeout = 20000) {
  let last; const start = Date.now();
  while (Date.now() - start < timeout) {
    try { last = await check(); if (last) return last; } catch (error) { last = error.message; }
    await sleep(60);
  }
  throw Error(`Timed out: ${label}: ${JSON.stringify(last)}`);
}
// Only observe commits; no app source or state is modified by this hook.
const profileInit = `(() => {
 const counts=new Map(),identities=new WeakMap(),lastFibers=new Map(); let commits=0; const renderers=new Map();
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers,
  inject(renderer){const id=renderers.size+1;renderers.set(id,renderer);return id;},
  onCommitFiberRoot(id,root){commits++; const walk=f=>{if(!f)return;let identity=identities.get(f)||f.alternate&&identities.get(f.alternate);if(!identity)identity={};identities.set(f,identity);if(f.alternate)identities.set(f.alternate,identity);
   if(lastFibers.get(identity)!==f&&(f.flags&1)&&typeof f.type==='function')counts.set(f.type,(counts.get(f.type)||0)+1);lastFibers.set(identity,f);walk(f.child);walk(f.sibling);};walk(root.current);},
  onCommitFiberUnmount(){},onPostCommitFiberRoot(){},checkDCE(){}};
 window.__finderProfile={read(){const el=document.querySelector('[data-finder-content]');
  const key=el&&Object.keys(el).find(k=>k.startsWith('__reactFiber$'));let f=key&&el[key],finder;
  while(f){if(typeof f.type==='function'&&f.memoizedProps?.window){finder=f.type;break;}f=f.return;}
  const icon=document.querySelector('[data-finder-content] button[aria-label^="Open "]');
  const ikey=icon&&Object.keys(icon).find(k=>k.startsWith('__reactFiber$'));let i=ikey&&icon[ikey],iconType;
  while(i){if(typeof i.type==='function'&&i.memoizedProps?.label)iconType=i.type;i=i.return;}
  return {commits,finder:finder?counts.get(finder)||0:null,icon:iconType?counts.get(iconType)||0:null};}};
})();`;
async function pageFor(options = {}) {
  const { browserContextId } = await command("Target.createBrowserContext");
  const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => command(method, params, sessionId);
  const errors = [];
  const onEvent = event => { if (event.sessionId === sessionId && event.method === "Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.text); };
  listeners.add(onEvent);
  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Network.enable")]);
  await send("Emulation.setDeviceMetricsOverride", { width:1440,height:1000,deviceScaleFactor:1,mobile:false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: profileInit + (options.init ?? "") });
  if (options.reducedMotion) await send("Emulation.setEmulatedMedia", {features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  return { send,evaluate,errors,
    wait:(expression,label,timeout)=>until(()=>evaluate(expression),label,timeout),
    async boot(){await send("Page.navigate",{url:site});await until(()=>evaluate(`!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`),"3D entry",45000);},
    async screenshot(name,selector){await mkdir(output,{recursive:true});let clip;
      if(selector)clip=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.max(0,r.x-6),y:Math.max(0,r.y-6),width:r.width+12,height:r.height+12,scale:1}})()`);
      const {data}=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,...(clip?{clip}:{})});
      await writeFile(new URL(`${name}.png`,output),Buffer.from(data,"base64"));},
    async close(){listeners.delete(onEvent);await command("Target.disposeBrowserContext",{browserContextId});},
  };
}
async function point(page, selector) {
  await page.evaluate("window.__finderPoint=null");
  return page.wait(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;
   el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
   const hit=document.elementFromPoint(x,y);if(!r.width||!r.height||x<0||x>innerWidth||y<0||y>innerHeight||!(el===hit||el.contains(hit)))return false;
   const previous=window.__finderPoint,now=performance.now();if(!previous||Math.hypot(x-previous.x,y-previous.y)>.5){window.__finderPoint={x,y,at:now};return false;}
   return now-previous.at>150?{x,y}:false;})()`,selector);
}
async function move(page, selector) { const position=await point(page,selector);await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",...position});return position; }
async function click(page, selector, clickCount=1) {
  const position=await move(page,selector);
  await page.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount,...position});
  await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount,...position});
}
async function key(page, key, code=key, windowsVirtualKeyCode) {
  await page.send("Input.dispatchKeyEvent",{type:"keyDown",key,code,windowsVirtualKeyCode});
  await page.send("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode});
}
async function measuredNavigate(page,id) {
  await page.evaluate(`(()=>{const button=document.querySelector('${nav(id)}'),root=document.querySelector('${frame}');window.__finderNavigation={start:null,end:null};
   const observer=new MutationObserver(()=>{if(root.querySelector('[data-finder-content="${id}"]')&&window.__finderNavigation.start!==null){window.__finderNavigation.end=performance.now();observer.disconnect();}});
   observer.observe(root,{subtree:true,attributes:true,attributeFilter:['data-finder-content'],childList:true});
   button.addEventListener('click',()=>{window.__finderNavigation.start=performance.now();},{once:true,capture:true});})()`);
  await click(page,nav(id));await current(page,id);
  return (await page.wait(`window.__finderNavigation.end!==null?{ms:window.__finderNavigation.end-window.__finderNavigation.start}:false`,"navigation browser commit time")).ms;
}
async function dragPositionProfile(page) {
  const source=await point(page,`${frame} [data-file-item="projects"] button`);
  const target=await page.evaluate(`(()=>{const r=document.querySelector('${frame} [data-finder-content]').getBoundingClientRect();return {x:r.right-28,y:r.bottom-45}})()`);
  await page.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...source});
  await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",buttons:1,...target});
  await page.wait(`document.body.classList.contains('is-finder-dragging')`,"file drag active");await sleep(120);
  const before=await page.evaluate("window.__finderProfile.read()");
  for(let i=0;i<12;i++){
    await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",buttons:1,x:target.x-(i%3)*2,y:target.y-(i%4)*2});
    await sleep(20);
  }
  const after=await page.evaluate("window.__finderProfile.read()");
  await key(page,"Escape","Escape",27);
  await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...target});
  await page.wait(`!document.body.classList.contains('is-finder-dragging')`,"drag safely cancelled");
  return {updates:12,before,after};
}
async function hoverTiming(page,selector) {
  await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:5,y:5});await sleep(1150);
  await page.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});window.__finderHover=null;
   el.addEventListener('pointerenter',()=>{const start=performance.now(),samples=[],pseudo=getComputedStyle(el,'::before');window.__finderHover={samples,done:false,pseudoDuration:pseudo.transitionDuration,pseudoProperty:pseudo.transitionProperty};
    const sample=()=>{const t=performance.now()-start,style=getComputedStyle(el),pseudo=getComputedStyle(el,'::before');
     samples.push({t,background:style.backgroundColor,opacity:pseudo.opacity,animations:el.getAnimations({subtree:true}).map(a=>({property:a.transitionProperty,duration:a.effect.getTiming().duration,progress:a.effect.getComputedTiming().progress}))});
     if(t<1250)requestAnimationFrame(sample);else window.__finderHover.done=true;};sample();},{once:true});})()`);
  await move(page,selector);await page.wait("window.__finderHover?.done","hover sampled",4000);
  const observed=await page.evaluate("window.__finderHover"),trace=observed.samples;
  const animation=trace.flatMap(sample=>sample.animations).find(a=>a.property==='background-color'||a.property==='opacity') ?? trace.flatMap(sample=>sample.animations)[0];
  const first=trace[0],last=trace.at(-1);
  const visualChanged=sample=>sample.background!==first.background||sample.opacity!==first.opacity;
  const firstChange=trace.find(visualChanged);
  const settle=trace.find(sample=>sample.background===last.background&&sample.opacity===last.opacity&&visualChanged(sample));
  return {durationMs:animation?.duration ?? (observed.pseudoProperty==='opacity'?parseFloat(observed.pseudoDuration)*1000:0),firstChangeMs:firstChange?.t ?? null,settledMs:settle?.t ?? null,trace};
}
async function verifyAfter(page,result) {
  assert.deepEqual(await page.evaluate(`Array.from(document.querySelectorAll('${frame} [data-finder-location]'),el=>el.dataset.finderLocation)`),["desktop","documents","projects","bin"]);
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('${frame} [data-finder-grid]')).display`),"grid","Folder content must remain an icon grid");
  assert.equal(await page.evaluate(`document.querySelectorAll('${frame} button[aria-label="Close"]').length`),1,"Only native WindowFrame traffic lights");
  result.destinationNav=await verifyDestinations(page);
  result.checks.push("Projects opens real portfolio files in the icon grid; Bin shows its working empty state");
  const hover=await hoverTiming(page,nav('documents'));result.hoverTiming=hover;
  assert.ok(hover.durationMs>=80&&hover.durationMs<=120,`Hover duration ${hover.durationMs}ms`);
  assert.ok(hover.firstChangeMs!==null&&hover.firstChangeMs<65,"Hover feedback must begin within the next frames");
  assert.ok(hover.settledMs!==null&&hover.settledMs<175,"Hover feedback must settle promptly");
  await click(page,nav('documents'));await current(page,'documents');
  result.selectedTransition=await page.evaluate(`getComputedStyle(document.querySelector('${nav('documents')}')).transitionDuration`);
  assert.ok(result.selectedTransition.split(',').every(s=>parseFloat(s)===0),"Selection must not fade for hover duration");
  await click(page,`${frame} button[aria-label="Back"]`);await current(page,'desktop');
  await click(page,`${frame} button[aria-label="Forward"]`);await current(page,'documents');
  result.checks.push("Working back/forward and immediate navigation selection");
  // Focus must be reached via Tab, not a synthetic focus or click.
  for(let i=0;i<18;i++){
    await key(page,"Tab","Tab",9);
    if(await page.evaluate(`document.activeElement?.getAttribute('aria-label')==='Open Game'`))break;
  }
  assert.ok(await page.evaluate(`document.activeElement?.getAttribute('aria-label')==='Open Game'&&document.activeElement.matches(':focus-visible')`),"Keyboard folder focus must be visible");
  await page.screenshot("after-keyboard-focus",frame);
  await key(page," ","Space",32);
  assert.ok(await page.evaluate(`document.activeElement?.getAttribute('aria-pressed')==='true'`),"Space selects an icon");
  await current(page,'documents');
  await key(page,"Enter","Enter",13);await current(page,'game');
  await page.evaluate(`(()=>{const p=document.querySelector('${frame} [data-finder-path]');const b=[...p.querySelectorAll('button')].find(b=>b.textContent.trim()==='Documents');if(!b)throw Error('Missing Documents ancestor');b.dataset.finderTestPath='documents'})()`);
  await click(page,`${frame} [data-finder-test-path="documents"]`);await current(page,'documents');
  result.checks.push("Physical Tab focus, Space selection, Enter open, and ancestor path navigation");
  await click(page,nav('desktop'));await current(page,'desktop');
  result.resizes=[];
  for(const width of[480,360,640]){
    await page.evaluate(`document.querySelector('${frame}').style.width='${width+2}px'`);await sleep(180);
    const sizes=await page.evaluate(`(()=>{const root=document.querySelector('${frame} [data-finder-root]'),bar=root.querySelector('[role="toolbar"]');return {browserWidth:innerWidth,width:root.clientWidth,scrollWidth:root.scrollWidth,toolbarWidth:bar?.clientWidth,toolbarScrollWidth:bar?.scrollWidth,containerType:getComputedStyle(root).containerType,navLabels:Array.from(root.querySelectorAll('[data-finder-location]'),e=>e.textContent.trim())}})()`);
    assert.equal(sizes.browserWidth,1440,"Only Finder host width changes");assert.equal(sizes.width,width);
    assert.ok(sizes.scrollWidth<=sizes.width+1,"Finder must not horizontally overflow");
    if(sizes.toolbarWidth)assert.ok(sizes.toolbarScrollWidth<=sizes.toolbarWidth+1,"Toolbar must not clip");
    result.resizes.push(sizes);if(width!==640)await page.screenshot(`after-${width}px`,frame);
  }
  result.checks.push("Window-width responsive 480px/360px toolbar and grid without horizontal clipping");
  await dragRoundTrip(page);result.checks.push("Physical file drag to Documents and back to Desktop");
  await click(page,`${frame} button[aria-label="Hide sidebar"]`);
  assert.equal(await page.evaluate(`document.querySelectorAll('${frame} [data-finder-location]').length`),0,"Hide sidebar works");
  await click(page,`${frame} button[aria-label="Show sidebar"]`);
  assert.equal(await page.evaluate(`document.querySelectorAll('${frame} [data-finder-location]').length`),4,"Show sidebar works");
  result.checks.push("Sidebar toggle retains a working restore control");
}
async function dragRoundTrip(page) {
  async function dragTo(selector){
    const source=await point(page,`${frame} [data-file-item="projects"] button`),target=await point(page,selector);
    await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",...source});
    await page.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...source});
    for(let i=1;i<=12;i++){
      await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",buttons:1,x:source.x+(target.x-source.x)*i/12,y:source.y+(target.y-source.y)*i/12});await sleep(18);
    }
    await page.wait(`document.body.classList.contains('is-finder-dragging')`,"physical drag active");await page.screenshot("after-drag-target",frame);
    await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...target});
    await page.wait(`!document.body.classList.contains('is-finder-dragging')`,"drop completed");
  }
  await dragTo(nav('documents'));await page.wait(`!document.querySelector('${frame} [data-file-item="projects"]')`,"Projects removed from desktop");
  await click(page,nav('documents'));await current(page,'documents');
  await page.wait(`!!document.querySelector('${frame} [data-file-item="projects"]')`,"Projects moved to Documents");
  await dragTo(nav('desktop'));await page.wait(`!document.querySelector('${frame} [data-file-item="projects"]')`,"Projects removed from Documents");
  await click(page,nav('desktop'));await current(page,'desktop');
  await page.wait(`!!document.querySelector('${frame} [data-file-item="projects"]')`,"Projects restored to Desktop");
}
async function verifyAppReducedMotion(page) {
  assert.equal(await page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),false,"App preference is tested separately from system preference");
  async function toggle(expected){
    await click(page,'[data-dock-app="settings"]');
    await page.wait(`!!document.querySelector('[data-window-frame="app-settings"]')`,"Settings open");
    await page.evaluate(`(()=>{const b=Array.from(document.querySelectorAll('[data-window-frame="app-settings"] button')).find(b=>b.textContent.trim()==='Accessibility');if(!b)throw Error('Accessibility tab missing');b.dataset.finderTestAccessibility=''})()`);
    await click(page,'[data-finder-test-accessibility]');
    const control='[data-window-frame="app-settings"] [role="switch"][aria-label="Reduce motion"]';
    await page.wait(`!!document.querySelector('${control}')`,"Reduce motion switch");
    await click(page,control);await page.wait(`document.querySelector('${control}').getAttribute('aria-checked')==='${expected}'`,"App Reduce motion preference changed");
    await click(page,'[data-window-frame="app-settings"] button[aria-label="Close"]');
    await page.wait(`!document.querySelector('[data-window-frame="app-settings"]')`,"Settings closed");
  }
  await toggle(true);
  assert.ok(await page.evaluate(`document.querySelector('${frame} [data-finder-root]').hasAttribute('data-reduced-motion')`));
  const enabled=await page.evaluate(`getComputedStyle(document.querySelector('${nav('documents')}'),'::before').transitionDuration`);
  assert.equal(enabled,'0s',"App Reduce motion disables Finder hover transition");
  await page.screenshot("after-app-reduced-motion-finder",frame);
  await toggle(false);
  assert.ok(await page.evaluate(`!document.querySelector('${frame} [data-finder-root]').hasAttribute('data-reduced-motion')`));
  const disabled=await page.evaluate(`getComputedStyle(document.querySelector('${nav('documents')}'),'::before').transitionDuration`);
  assert.equal(disabled,'0.1s',"Turning app Reduce motion off restores normal 100ms feedback");
  return {systemReducedMotion:false,enabledTransition:enabled,disabledTransition:disabled};
}
async function verifyDestinations(page) {
  await click(page,nav('projects'));await current(page,'projects');
  const projects=await page.evaluate(`(()=>{const grid=document.querySelector('${frame} [data-finder-grid]');return {layout:getComputedStyle(grid).display,items:Array.from(grid.querySelectorAll('[data-file-item] button'),el=>({label:el.getAttribute('aria-label'),width:el.offsetWidth})),status:document.querySelector('${frame} [data-finder-status]').textContent.trim()}})()`);
  assert.equal(projects.layout,'grid');assert.ok(projects.items.length>0,"Projects nav must open real portfolio files");
  assert.ok(projects.items.every(item=>item.label.startsWith('Open ')&&item.width>0));
  assert.equal(projects.status,`${projects.items.length} ${projects.items.length===1?'item':'items'}`);
  await page.screenshot("after-projects-finder",frame);
  await click(page,nav('bin'));await current(page,'bin');
  const bin=await page.evaluate(`(()=>{const f=document.querySelector('${frame}'),empty=Array.from(f.querySelectorAll('button')).find(el=>el.textContent.trim()==='Empty Bin');return {message:f.querySelector('[data-finder-content]').textContent.trim(),emptyDisabled:empty?.disabled,status:f.querySelector('[data-finder-status]').textContent.trim()}})()`);
  assert.ok(bin.message.includes('The Bin is empty'));assert.equal(bin.emptyDisabled,true);assert.equal(bin.status,'0 items');
  await click(page,nav('desktop'));await current(page,'desktop');
  return {projects,bin};
}
const frame='[data-window-frame="finder-desktop"]';
const nav=id=>`${frame} button[data-drop-folder-id="${id}"]`;
async function openFinder(page){await click(page,'[data-dock-app="finder"]');await page.wait(`!!document.querySelector('${frame} [data-finder-content="desktop"]')`,"Finder desktop");await sleep(600);}
async function current(page,id){await page.wait(`!!document.querySelector('${frame} [data-finder-content="${id}"]')`,`${id} content`);}
const result={phase,browser:version.Browser,viewport:{width:1440,height:1000},checks:[]};
const pages=[];
try {
  const page=await pageFor();pages.push(page);await page.boot();await openFinder(page);
  if(filter==='app-reduced-motion'||filter==='destinations'){
    if(filter==='app-reduced-motion'){
      result.appReducedMotion=await verifyAppReducedMotion(page);
      result.checks.push("Physical Settings app Reduce motion on/off, separate from system preference");
    }
    result.destinationNav=await verifyDestinations(page);
    assert.deepEqual(page.errors,[]);
    result.checks.push("Projects opens real portfolio files in the icon grid; Bin shows its working empty state");
    await writeFile(new URL(`after-${filter}-metrics.json`,output),JSON.stringify(result,null,2)+"\n");
    console.log(JSON.stringify(result,null,2));
  }else{
  result.geometry=await page.evaluate(`(()=>{const f=document.querySelector('${frame}'),c=f.lastElementChild,r=f.getBoundingClientRect();return {content:{width:c.offsetWidth,height:c.offsetHeight},projected:{x:r.x,y:r.y,width:r.width,height:r.height}}})()`);
  await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:5,y:5});await sleep(1100);
  await page.screenshot(`${phase}-projected`);await page.screenshot(`${phase}-finder`,frame);
  result.sidebar=await page.evaluate(`Array.from(document.querySelectorAll('${frame} button[data-drop-folder-id]'),el=>({label:el.textContent.trim(),transitionDuration:getComputedStyle(el).transitionDuration,transitionProperty:getComputedStyle(el).transitionProperty}))`);
  result.profileBeforeHover=await page.evaluate("window.__finderProfile.read()");
  for(let i=0;i<6;i++){await move(page,nav(i%2?'documents':'bin'));await sleep(140);}
  result.profileAfterHover=await page.evaluate("window.__finderProfile.read()");
  await move(page,nav('documents'));await sleep(phase==='before'?1100:160);await page.screenshot(`${phase}-hover`,frame);
  const samples=[],commitSamples=[];
  for(let i=0;i<6;i++){
    const id=i%2?'desktop':'documents',start=Date.now();commitSamples.push(await measuredNavigate(page,id));samples.push(Date.now()-start);
  }
  result.navigationWallTimesMs=samples;result.navigationCommitMs=commitSamples;result.profileAfterNavigation=await page.evaluate("window.__finderProfile.read()");
  result.dragPositionProfile=await dragPositionProfile(page);
  assert.equal(result.profileAfterHover.finder,result.profileBeforeHover.finder,"CSS hover must not render Finder");
  assert.equal(result.dragPositionProfile.after.finder,result.dragPositionProfile.before.finder,"Drag coordinates must not render Finder");
  assert.equal(result.dragPositionProfile.after.icon,result.dragPositionProfile.before.icon,"Drag coordinates must not render every icon");
  if(phase==='after'){
    await verifyAfter(page,result);
    for(const [name,theme,reducedMotion]of[["light","light",false],["reduced-motion","dark",true]]){
      const themed=await pageFor({reducedMotion,init:`localStorage.setItem('portfolio-appearance',JSON.stringify({version:1,state:{theme:${JSON.stringify(theme)},wallpaper:'coast',wallpaperMode:'auto'}}));`});
      pages.push(themed);await themed.boot();await openFinder(themed);
      assert.equal(await themed.evaluate("document.documentElement.classList.contains('dark')"),theme==='dark');
      await themed.screenshot(`after-${name}-finder`,frame);
      if(reducedMotion){
        const durations=await themed.evaluate(`Array.from(document.querySelectorAll('${frame} [data-finder-location]'),e=>getComputedStyle(e).transitionDuration)`);
        assert.ok(durations.every(d=>d.split(',').every(t=>parseFloat(t)<=.01)),"Reduced motion removes hover transitions");
        const hover=await hoverTiming(themed,nav('documents'));result.reducedMotionHover=hover;
        assert.ok(hover.durationMs<=10,"Reduced motion hover is immediate");
      }
      assert.deepEqual(themed.errors,[]);await themed.close();pages.splice(pages.indexOf(themed),1);
    }
    result.checks.push("Light/dark appearance and reduced-motion preferences");
    result.appReducedMotion=await verifyAppReducedMotion(page);
    result.checks.push("Physical Settings app Reduce motion on/off, separate from system preference");
  } else result.hoverTiming=await hoverTiming(page,nav('documents'));
  assert.deepEqual(page.errors,[],"Browser must not throw");
  result.checks.push("Repeated physical sidebar hover/navigation");
  await writeFile(new URL(`${phase}-metrics.json`,output),JSON.stringify(result,null,2)+"\n");
  await Promise.all([`${phase}-failure.png`,`${phase}-failure-metrics.json`].map(name=>rm(new URL(name,output),{force:true})));
  console.log(JSON.stringify(result,(key,value)=>key==='trace'?undefined:value,2));
  }
} catch(error){console.error(error);process.exitCode=1;await writeFile(new URL(`${phase}-failure-metrics.json`,output),JSON.stringify(result,null,2)+"\n").catch(()=>{});for(const page of pages)await page.screenshot(`${phase}-failure`).catch(()=>{});}
finally{for(const page of pages)await page.close().catch(()=>{});socket.close();}
