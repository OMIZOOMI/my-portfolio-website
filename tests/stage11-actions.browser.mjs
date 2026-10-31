// Shared isolated CDP harness for Stage 11 browser-state checks.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9228";
const output = new URL("../docs/stage11-review/", import.meta.url);
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
async function pageFor(legacy = false) {
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
window.__stage11Events=[];
for(const type of ['pointerdown','pointermove','pointerup','click','dblclick','contextmenu','keydown','keyup'])document.addEventListener(type,event=>{
 const target=event.target instanceof Element?event.target:null;
 const item=target?.closest('[data-file-icon]');
 window.__stage11Events.push({type,key:event.key,repeat:event.repeat,detail:event.detail,trusted:event.isTrusted,x:event.clientX,y:event.clientY,item:item?.dataset.fileIcon,frame:target?.closest('[data-window-frame]')?.dataset.windowFrame,get prevented(){return event.defaultPrevented}});
},true);
` });
  if (legacy) await send("Page.addScriptToEvaluateOnNewDocument", { source: `
if(!localStorage.getItem('mail-store'))localStorage.setItem('mail-store',JSON.stringify({version:3,state:{inbox:[],sent:[{id:'legacy-cancelled',from:'Me',to:'Om Sawkare',subject:'Historical cancelled handoff',body:'Retain the original visitor content.',sentAt:123,read:false,extra:{fixture:'preserve'}}]}}));
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
async function launch(page, kind, id = kind === "finder" ? "finder-desktop" : `app-${kind}`) {
  await click(page, `[data-dock-app="${kind}"]`);
  await page.wait(`!!document.querySelector('${frame(id)}')&&!document.querySelector('${frame(id)}').inert`, `${kind} opened`);
  await sleep(320);
}
async function type(page, text) {
  await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:4, commands:["selectAll"] });
  await page.send("Input.dispatchKeyEvent", { type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:4 });
  await page.send("Input.insertText", { text });
}

const before=process.env.STAGE11_BEFORE==='1';
const report={before,browser:version.Browser,host:{platform:os.platform(),release:os.release(),arch:os.arch()},localBuildId:(await readFile(new URL('../.next/BUILD_ID',import.meta.url),'utf8')).trim(),scenarios:[]};
let failures=0;
const menuTrigger=label=>`[data-menu-key="${label}"] > button`;
const menuAction=label=>`[role="menu"] [data-menu-action="${label}"]`;
async function choose(page,menu,label){if(await page.evaluate(`document.querySelector('${menuTrigger(menu)}')?.ariaExpanded`)!=='true')await click(page,menuTrigger(menu));await click(page,menuAction(label));await sleep(100);}
async function scenario(name,run,legacy=false){const page=await pageFor(legacy),result={name},start=Date.now();
 try{await page.boot();await run(page,result);assert.deepEqual(page.errors,[]);result.status='PASS';}
 catch(error){failures++;result.status='FAIL';result.error=error.stack;try{result.text=await page.evaluate('document.querySelector("#desktop-root")?.innerText');await page.screenshot('failed-'+name);}catch{/* Preserve original failure. */}}
 finally{result.elapsedMs=Date.now()-start;report.scenarios.push(result);console.log(`${result.status} ${name}${result.error?'\n'+result.error:''}`);await page.close();}
}
if(before){
const page=await pageFor();
try{
 await page.boot();
 if(before){
 await click(page,'[data-file-icon="about-me"]',2);await sleep(400);
 report.aboutMe=await page.evaluate(`document.querySelector('[data-window-frame="finder-about-me"]')?.textContent`);
 const menu=label=>`nav[aria-label="macOS Menu Bar"] > div:first-child > div:nth-child(${label})`;
 await click(page,menu(1));await click(page,'nav button:first-of-type');await sleep(400);
 report.aboutMac=await page.evaluate(`document.querySelector('[data-window-frame="app-settings"]')?.textContent`);
 await click(page,menu(8));
 await page.evaluate(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent==='About This Portfolio')?.click()`);await sleep(400);
 report.aboutPortfolio=await page.evaluate(`document.querySelector('[data-window-frame="about-portfolio"]')?.textContent`);
 await page.screenshot('before-about-portfolio');
 await launch(page,'mail');await page.evaluate(`Array.from(document.querySelectorAll('[data-window-frame="app-mail"] button')).find(b=>b.textContent.includes('Compose')).click()`);
 await click(page,'[data-window-frame="app-mail"] input');await type(page,'Cancelled handoff fixture');await click(page,'[data-window-frame="app-mail"] textarea');await type(page,'Not sent; isolated test only.');
 await page.evaluate('window.__handoffs=[];window.open=(...args)=>{window.__handoffs.push(args);return null}');
 await click(page,menu(2));await page.evaluate(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent==='Send')?.click()`);await sleep(120);
 report.mail=await page.evaluate(`({handoffs:window.__handoffs,cache:JSON.parse(localStorage.getItem('mail-store')),compose:!!document.querySelector('[data-window-frame="app-mail"] textarea')})`);
 assert.equal(report.mail.cache.state.sent.length,1);assert.equal(report.mail.compose,false);
 await page.screenshot('before-false-sent');
 }
}finally{report.errors=page.errors;await page.close();}
}else{
await scenario('real-about-and-existing-project-launchers',async(page,result)=>{
 await click(page,'[data-file-icon="about-me"]',2);await page.wait(`!!document.querySelector('[data-window-frame="about-me"] h1')`,'populated About Me');
 assert.match(await page.evaluate(`document.querySelector('[data-window-frame="about-me"]').textContent`),/Om Nilesh Sawkare/);assert.equal(await page.evaluate(`!!document.querySelector('[data-window-frame="finder-about-me"]')`),false);await page.screenshot('about-me');
 await choose(page,'','About This Mac');await page.wait(`!!Array.from(document.querySelectorAll('[data-window-frame="app-settings"] h2')).find(e=>e.textContent==='About This Mac')`,'Settings About');
 await click(page,'[data-window-frame="app-settings"] [data-settings-section="appearance"]'); // first section = Appearance
 await click(page,control('app-settings','minimize'));await choose(page,'','About This Mac');
 assert.equal(await page.evaluate(`document.querySelector('[data-window-frame="app-settings"]').inert`),false);assert.equal(await page.evaluate(`document.querySelector('[data-window-frame="app-settings"] h2').textContent`),'About This Mac');await page.screenshot('settings-about');
 await choose(page,'Help','About This Portfolio');const about=await page.evaluate(`document.querySelector('[data-portfolio-about]').textContent`);assert.match(about,/Om’s Portfolio/);assert.match(about,/Om Nilesh Sawkare/);assert.doesNotMatch(about,/Version 26.4/);await page.screenshot('portfolio-about');
 await launch(page,'finder');await click(page,'[data-window-frame="finder-desktop"] [data-file-icon="about-me"]',2);assert.equal(await page.evaluate(`document.querySelector('[data-window-frame="about-me"]').dataset.windowActive`),'true');
 await launch(page,'finder');await click(page,'[data-window-frame="finder-desktop"] [data-file-icon="projects"]',2);
 const id='3d-macos-web-portfolio';await click(page,`[data-window-frame="finder-desktop"] [data-file-icon="${id}"]`,2);
 await page.wait(`!!document.querySelector('[data-window-frame="file-${id}"] h1')`,'real project detail');assert.equal(await page.evaluate(`document.querySelector('[data-window-frame="file-${id}"] h1').textContent`),'3D macOS Web Portfolio');
 result.aboutPortfolio=about;
});
await scenario('refresh-feedback-and-active-menu-routing',async(page,result)=>{
 await launch(page,'notes');await click(page,menuTrigger('File'));await click(page,menuTrigger('View'));assert.equal(await page.evaluate(`document.querySelector('${menuAction('Refresh App')}').disabled`),true);await key(page,'Escape','Escape',27);
 await launch(page,'safari');const current=await page.evaluate(`document.querySelector('[data-safari-page]:not([hidden])').dataset.safariReload`);await choose(page,'View','Reload Page');assert.equal(await page.evaluate(`document.querySelector('[data-safari-page]:not([hidden])').dataset.safariReload`),String(Number(current)+1));
 await launch(page,'notes');await click(page,menuTrigger('View'));await launch(page,'music');assert.equal(await page.evaluate(`!!document.querySelector('[role="menu"]')`),false);await click(page,menuTrigger('View'));
 assert.equal(await page.evaluate(`!!document.querySelector('${menuAction('Toggle Sidebar')}')`),true);assert.equal(await page.evaluate(`!!document.querySelector('${menuAction('Refresh App')}')`),false);await key(page,'Escape','Escape',27);
 await launch(page,'mail');await click(page,menuTrigger('Mail'));assert.equal(await page.evaluate(`document.querySelector('${menuAction('Open in your email app')}').disabled`),true);await key(page,'Escape','Escape',27);
 result.reloadChanged=true;await page.screenshot('truthful-refresh');
});
await scenario('native-editor-undo-redo-and-filesystem-undo-stay-separate',async(page,result)=>{
 await launch(page,'finder');await choose(page,'File','New Folder');const input='[data-file-rename-input]';await page.wait(`!!document.querySelector('${input}')`,'new folder rename');const folder=await page.evaluate(`document.querySelector('${input}').dataset.fileRenameInput`);
 await type(page,'Keep This Folder');await key(page,'Enter','Enter',13);await page.wait(`!document.querySelector('${input}')`,'rename complete');
 await launch(page,'notes');await choose(page,'File','New Note');const editor='[data-window-frame="app-notes"] [contenteditable="true"]';await click(page,editor);await page.send('Input.insertText',{text:'Native editor text'});
 await choose(page,'Edit','Undo');assert.equal(await page.evaluate(`document.querySelector('${editor}').textContent.trim()`),'');assert.equal(await page.evaluate(`document.activeElement===document.querySelector('${editor}')`),true);
 assert.equal(await page.evaluate(`!!document.querySelector('[data-window-frame="finder-desktop"] [data-file-icon="${folder}"]')`),true);
 await choose(page,'Edit','Redo');assert.equal(await page.evaluate(`document.querySelector('${editor}').textContent.trim()`),'Native editor text');
 await page.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:4,commands:['undo']});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:4});
 assert.equal(await page.evaluate(`document.querySelector('${editor}').textContent.trim()`),'');assert.equal(await page.evaluate(`!!document.querySelector('[data-window-frame="finder-desktop"] [data-file-icon="${folder}"]')`),true);
 await launch(page,'finder');await choose(page,'Edit','Undo');assert.equal(await page.evaluate(`document.querySelector('[data-window-frame="finder-desktop"] [data-file-icon="${folder}"]').textContent.includes('Untitled Folder')`),true);
 await choose(page,'Edit','Redo');assert.equal(await page.evaluate(`document.querySelector('[data-window-frame="finder-desktop"] [data-file-icon="${folder}"]').textContent.includes('Keep This Folder')`),true);
 await launch(page,'mail');await choose(page,'File','New Message');const body='[data-window-frame="app-mail"] textarea';await click(page,body);await page.send('Input.insertText',{text:'Native mail draft'});await choose(page,'Edit','Undo');assert.equal(await page.evaluate(`document.querySelector('${body}').value`),'');await choose(page,'Edit','Redo');assert.equal(await page.evaluate(`document.querySelector('${body}').value`),'Native mail draft');
 result.folderIdentity=folder;await page.screenshot('editor-undo');
});
await scenario('menu-keyboard-dismissal-and-shortcut-ownership',async(page,result)=>{
 await launch(page,'notes');await click(page,menuTrigger('File'));await key(page,'End','End',35);assert.equal(await page.evaluate('document.activeElement.dataset.menuAction'),'Close Window');
 await key(page,'Home','Home',36);assert.equal(await page.evaluate('document.activeElement.dataset.menuAction'),'New Note');await key(page,'ArrowDown','ArrowDown',40);assert.equal(await page.evaluate('document.activeElement.dataset.menuAction'),'Close Window'); // disabled Delete is skipped
 await key(page,'ArrowRight','ArrowRight',39);assert.equal(await page.evaluate(`document.querySelector('[data-menu-key="Edit"] > button').ariaExpanded`),'true');
 await key(page,'Escape','Escape',27);assert.equal(await page.evaluate(`document.activeElement===document.querySelector('${menuTrigger('Edit')}')`),true);assert.equal(await page.evaluate(`!!document.querySelector('[role="menu"]')`),false);
 await key(page,'ArrowRight','ArrowRight',39);await key(page,'ArrowDown','ArrowDown',40);assert.equal(await page.evaluate(`document.querySelector('[data-menu-key="View"] > button').ariaExpanded`),'true');await key(page,'Tab','Tab',9);assert.equal(await page.evaluate(`!!document.querySelector('[role="menu"]')`),false);
 await choose(page,'File','New Note');
 result.menuSemantics=await page.evaluate(`({bar:document.querySelector('[role="menubar"]').getAttribute('aria-label'),triggers:document.querySelectorAll('[role="menubar"] > div > [aria-haspopup="menu"]').length})`);
 result.shortcuts=await page.evaluate(`['r','w','q'].map(key=>{const e=new KeyboardEvent('keydown',{key,metaKey:true,bubbles:true,cancelable:true});document.querySelector('[data-window-frame="app-notes"] [contenteditable="true"]').dispatchEvent(e);return{key,prevented:e.defaultPrevented}})`);assert.ok(result.shortcuts.every(e=>!e.prevented));
});
await scenario('mail-cancelled-handoff-preserves-draft-and-legacy-copies',async(page,result)=>{
 await launch(page,'mail');await click(page,'[aria-label="Previous copies, delivery unverified"]');const legacy=await page.evaluate(`document.querySelector('[data-window-frame="app-mail"]').textContent`);assert.match(legacy,/Unverified copy/);assert.match(legacy,/Retain the original visitor content/);
 await choose(page,'File','New Message');const subject='[aria-label="Mail subject"]',body='[aria-label="Mail message"]';await click(page,subject);await type(page,'Cancelled visitor draft');await click(page,body);await type(page,'Keep this complete message.');
 await page.evaluate('window.__handoffs=[];window.open=(...args)=>{window.__handoffs.push(args);return null}');await click(page,'[data-mail-handoff]');
 const check=async()=>{assert.equal(await page.evaluate(`document.querySelector('${body}').value`),'Keep this complete message.');assert.equal(await page.evaluate(`document.querySelector('${subject}').value`),'Cancelled visitor draft');const cache=await page.evaluate(`JSON.parse(localStorage.getItem('mail-store'))`);assert.equal(cache.version,4);assert.equal(cache.state.sent.length,1);assert.equal(cache.state.sent[0].body,'Retain the original visitor content.');assert.deepEqual(cache.state.sent[0].extra,{fixture:'preserve'});};
 await check();await page.send('Page.bringToFront');await check();await choose(page,'Mail','Open in your email app');await check();
 await click(page,control('app-mail','close'));await page.wait(`!document.querySelector('[data-window-frame="app-mail"]')`,'Mail closed');await launch(page,'mail');await choose(page,'File','New Message');await check();
 await page.evaluate('window.open=()=>{throw new Error("no email handler fixture")}');await choose(page,'Mail','Open in your email app');await check();assert.match(await page.evaluate(`document.querySelector('[data-window-frame="app-mail"] [role="status"]').textContent`),/could not be opened/);
 result.requests=await page.evaluate('window.__handoffs');assert.equal(result.requests.length,2);result.retainedLegacyCopies=1;result.cancelFixture='window.open returns null; sending is not attempted or asserted';await page.screenshot('mail-preserved-draft');
},true);
await scenario('intentional-neural-and-game-placeholders-remain-unfinished',async(page,result)=>{
 await choose(page,'Go','Documents');const finder=await page.evaluate(`document.querySelector('[data-window-frame][data-window-active="true"]').dataset.windowFrame`);await click(page,`[data-window-frame="${finder}"] [data-file-icon="game"]`,2);await click(page,`[data-window-frame="${finder}"] [data-file-icon="Neural Block"]`,2);
 const content=await page.evaluate(`document.querySelector('[data-window-frame="file-Neural Block"]').textContent`);assert.match(content,/Neural Block/);assert.doesNotMatch(content,/Open in Safari/);result.placeholder='Neural Block remains the existing placeholder; no game or invented project implementation was added.';
});
}
await mkdir(output,{recursive:true});await writeFile(new URL(before?'before-browser-results.json':'browser-results.json',output),JSON.stringify(report,null,2)+'\n');socket.close();if(failures)process.exitCode=1;

