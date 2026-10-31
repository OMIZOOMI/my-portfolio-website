// Production preview + isolated Chrome CDP, with actual projected desktop input.
// STARTUP_TEST_URL=http://127.0.0.1:3001 CDP_URL=http://127.0.0.1:9223 node tests/notes.browser.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9223";
const phase = process.env.NOTES_PHASE ?? "after";
const filter = process.env.NOTES_TEST_FILTER;
const output = new URL(process.env.NOTES_OUTPUT_DIR ?? "../docs/notes-review/", import.meta.url);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const version = await (await fetch(`${endpoint}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once:true}); socket.addEventListener("error", reject, {once:true}); });
let sequence=0;
const pending=new Map(),listeners=new Set();
socket.addEventListener("message",({data})=>{
 const message=JSON.parse(data);
 if(message.id){const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);if(message.error)request.reject(Error(message.error.message));else request.resolve(message.result);}
 else for(const listener of listeners)listener(message);
});
function command(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},45000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
async function until(check,label,timeout=20000){let last;const start=Date.now();while(Date.now()-start<timeout){try{last=await check();if(last)return last;}catch(error){last=error.message;}await sleep(80);}throw Error(`Timed out: ${label}: ${JSON.stringify(last)}`);}
const frame='[data-window-frame="app-notes"]';
async function pageFor(options={}){
 const {browserContextId}=await command("Target.createBrowserContext");
 const {targetId}=await command("Target.createTarget",{url:"about:blank",browserContextId});
 const {sessionId}=await command("Target.attachToTarget",{targetId,flatten:true});
 const send=(method,params)=>command(method,params,sessionId),errors=[],requests=[],paused=[];
 const onEvent=event=>{if(event.sessionId!==sessionId)return;if(event.method==="Runtime.exceptionThrown")errors.push(event.params.exceptionDetails.text);if(event.method==="Network.requestWillBeSent")requests.push({url:event.params.request.url,type:event.params.type});if(event.method==="Fetch.requestPaused")paused.push(event.params);};listeners.add(onEvent);
 await Promise.all([send("Page.enable"),send("Runtime.enable"),send("Network.enable")]);
 await send("Network.clearBrowserCache");
 await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send("Page.addScriptToEvaluateOnNewDocument",{source:`localStorage.setItem('portfolio-appearance',JSON.stringify({version:1,state:{theme:'dark',wallpaper:'coast',wallpaperMode:'auto'}}));window.__notesEvents=[];for(const name of ['playing','waiting','stalled','pause','ended','error','loadedmetadata'])document.addEventListener(name,event=>{if(event.target instanceof HTMLMediaElement)window.__notesEvents.push({name,src:event.target.currentSrc,time:event.target.currentTime,duration:event.target.duration,at:performance.now()})},true);${options.init??""}`});
 if(options.block)await send("Network.setBlockedURLs",{urls:options.block});
 async function evaluate(expression){const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;}
 return {send,evaluate,errors,requests,paused,wait:(expression,label,timeout)=>until(()=>evaluate(expression),label,timeout),
  async boot(){await send("Page.navigate",{url:site});await until(()=>evaluate(`!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`),"3D entry",45000);await sleep(400);},
  async screenshot(name,selector){await mkdir(output,{recursive:true});let clip;if(selector)clip=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.max(0,r.x-6),y:Math.max(0,r.y-6),width:r.width+12,height:r.height+12,scale:1}})()`);const{data}=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,...(clip?{clip}:{})});await writeFile(new URL(`${name}.png`,output),Buffer.from(data,"base64"));},
  async close(){listeners.delete(onEvent);await command("Target.disposeBrowserContext",{browserContextId});}
 };
}
async function point(page,selector){await page.evaluate("window.__notesPoint=null");return page.wait(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const host=el.closest('[data-window-frame]');if(host?.style.transform&&host.style.transform!=='none')return false;el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(!r.width||!r.height||x<0||x>innerWidth||y<0||y>innerHeight||!(el===hit||el.contains(hit)))return false;const p=window.__notesPoint,now=performance.now();if(!p||Math.hypot(x-p.x,y-p.y)>.5){window.__notesPoint={x,y,at:now};return false;}return now-p.at>150?{x,y}:false;})()`,selector);}
async function click(page,selector,count=1){const p=await point(page,selector);await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",...p});await page.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:count,...p});await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:count,...p});}
async function key(page,key,code=key,virtualKey){await page.send("Input.dispatchKeyEvent",{type:"keyDown",key,code,windowsVirtualKeyCode:virtualKey});await page.send("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode:virtualKey});}
async function menuBar(page,label){await page.evaluate(`(()=>{const el=[...document.querySelectorAll('nav[aria-label="macOS Menu Bar"]>div:first-child>div')].find(el=>el.firstChild?.textContent===${JSON.stringify(label)});if(!el)throw Error('Missing menu');el.dataset.musicTestMenu=${JSON.stringify(label)}})()`);await click(page,`[data-music-test-menu="${label}"]`);}
async function buttonText(page,label){await page.evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)});if(!el)throw Error('Missing button: '+${JSON.stringify(label)});el.dataset.musicTestButton=${JSON.stringify(label)}})()`);await click(page,`[data-music-test-button="${label}"]`);}
async function openNotes(page){await click(page,'[data-dock-app="notes"]');await page.wait(`!!document.querySelector('${frame} [aria-label="Note editor"]')`,"Notes opened");await sleep(450);}
const editor=`${frame} [aria-label="Note editor"]`;
async function text(page){return page.evaluate(`document.querySelector('${editor}').innerText`);}
async function html(page){return page.evaluate(`document.querySelector('${editor}').innerHTML`);}
async function type(page,value){await page.send("Input.insertText",{text:value});await sleep(80);}
async function caret(page,offset=0){await page.evaluate(`(()=>{const e=document.querySelector('${editor}');e.focus();const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n=w.nextNode();if(!n){n=document.createTextNode('');e.append(n)}const r=document.createRange();r.setStart(n,Math.min(${offset},n.length));r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);}
async function rows(page){return page.evaluate(`Array.from(document.querySelectorAll('${frame} h4'),e=>e.innerText)`);}
async function row(page,contains){await page.evaluate(`(()=>{const h=[...document.querySelectorAll('${frame} h4')].find(e=>e.textContent.includes(${JSON.stringify(contains)}));if(!h)throw Error('Note not found');h.parentElement.dataset.notesRow='selected'})()`);await click(page,'[data-notes-row="selected"]');await page.evaluate(`document.querySelector('[data-notes-row="selected"]')?.removeAttribute('data-notes-row')`);}
async function clear(page){await menuBar(page,"Notes");await buttonText(page,"Clear Note");}
const report={phase,browser:version.Browser,viewport:{width:1440,height:1000},scenarios:[]};let failures=0;
async function scenario(name,run,options={}){if(filter&&!name.includes(filter))return;const page=await pageFor(options),started=Date.now(),result={name};try{await page.boot();await run(page,result);assert.deepEqual(page.errors,[],"No runtime exceptions");result.status="PASS";}catch(error){failures++;result.status="FAIL";result.error=error.stack;try{result.dom=await page.evaluate(`({notes:document.querySelector('${frame}')?.innerText,editor:document.querySelector('${editor}')?.innerHTML})`);await page.screenshot(`failed-${name}`);}catch{}}finally{result.elapsedMs=Date.now()-started;report.scenarios.push(result);console.log(`${result.status} ${name} ${result.elapsedMs}ms${result.error?'\n'+result.error:''}`);await page.close();}}

if(phase==="before"){
await scenario("baseline-and-clear-note-stale-content-reproduction",async(page,result)=>{
 await openNotes(page);result.before=await html(page);result.geometry=await page.evaluate(`(()=>{const e=document.querySelector('${frame}'),r=e.getBoundingClientRect();return{width:e.offsetWidth,height:e.offsetHeight,projectedWidth:r.width,projectedHeight:r.height,controls:[...e.querySelectorAll('button[aria-label="Close"],button[aria-label="Minimize"],button[aria-label="Maximize"]')].map(b=>({label:b.ariaLabel,width:b.offsetWidth,height:b.offsetHeight,projectedWidth:b.getBoundingClientRect().width,projectedHeight:b.getBoundingClientRect().height}))}})()`);
 await page.screenshot("before-notes-desktop");await page.screenshot("before-notes",frame);
 await clear(page);result.afterClear=await html(page);result.sidebar=await rows(page);await caret(page,0);await type(page,"CLEARED_CONTENT_PROBE");result.afterTyping=await html(page);
 result.reproduced=result.afterClear===result.before&&result.afterTyping.includes("Final Year");assert.equal(result.reproduced,true,"Baseline stale HTML is reproduced");
 await page.screenshot("before-clear-bug",frame);
});
}

if(phase!=="before"){
await scenario("opening-layout-seed-and-switching",async(page,result)=>{
 await openNotes(page);result.prose=await text(page);assert.match(result.prose,/Lego/i);assert.match(result.prose,/Halo/);assert.match(result.prose,/Veyra/);assert.match(result.prose,/Adobe/);assert.doesNotMatch(result.prose,/hardware.state.edge|Spartan.*award|graduated/i);
 result.geometry=await page.evaluate(`(()=>{const e=document.querySelector('${frame}');return{width:e.offsetWidth,height:e.offsetHeight}})()`);const before=JSON.parse(await readFile(new URL("../docs/notes-review/before-browser-results.json",import.meta.url),"utf8")).scenarios[0].geometry;assert.equal(result.geometry.width,before.width);assert.equal(result.geometry.height,before.height);
 await page.screenshot("after-notes-desktop");await page.screenshot("after-notes",frame);
 await click(page,`${frame} button[title="Create a new note"]`);assert.equal((await text(page)).trim(),"");await caret(page);await type(page,"Visitor orchard note");await row(page,"Developer Log");assert.equal(await text(page),result.prose);await row(page,"Visitor orchard note");assert.equal(await text(page),"Visitor orchard note");
});
await scenario("clear-updates-editor-and-never-resurrects-stale-html",async(page,result)=>{
 await openNotes(page);await clear(page);result.afterClear=await html(page);assert.equal(result.afterClear,"");await caret(page);await type(page,"Fresh words only");result.afterTyping=await text(page);assert.equal(result.afterTyping,"Fresh words only");assert.doesNotMatch(await html(page),/Lego|Veyra|Developer Log/);
 await click(page,`${frame} button[title="Create a new note"]`);await caret(page);await type(page,"Other note");await row(page,"Fresh words only");assert.equal(await text(page),"Fresh words only");await clear(page);assert.equal(await html(page),"");await caret(page);await type(page,"Second clear works");assert.equal(await text(page),"Second clear works");await page.screenshot("after-clear",frame);
});
await scenario("typing-caret-native-formatting-and-undo",async(page,result)=>{
 await openNotes(page);await click(page,`${frame} button[title="Create a new note"]`);await caret(page);await type(page,"Alpha omega");await caret(page,6);await type(page,"warm ");assert.equal(await text(page),"Alpha warm omega");result.caret=await page.evaluate(`({offset:getSelection().anchorOffset,node:getSelection().anchorNode.textContent})`);assert.equal(result.caret.offset,11);
 await page.evaluate(`(()=>{const e=document.querySelector('${editor}'),n=e.firstChild,r=document.createRange();r.setStart(n,6);r.setEnd(n,10);const s=getSelection();s.removeAllRanges();s.addRange(r);e.focus()})()`);await click(page,`${frame} button[aria-label="Bold"]`);assert.match(await html(page),/<(?:b|strong)>warm<\/(?:b|strong)>/);result.formatted=await html(page);
 // Browser-native undo transaction; it is the same editing history used by the keyboard shortcut.
 await page.evaluate(`document.querySelector('${editor}').focus();document.execCommand('undo')`);await sleep(100);result.afterUndo=await html(page);assert.doesNotMatch(result.afterUndo,/<(?:b|strong)>warm/);assert.equal(await text(page),"Alpha warm omega");
 await page.evaluate(`document.execCommand('redo')`);await sleep(100);assert.match(await html(page),/<(?:b|strong)>warm<\/(?:b|strong)>/);await row(page,"Developer Log");await row(page,"Alpha warm omega");assert.match(await html(page),/<(?:b|strong)>warm<\/(?:b|strong)>/);
});
await scenario("search-filter-clear-and-escape",async(page,result)=>{
 await openNotes(page);await click(page,`${frame} button[title="Create a new note"]`);await caret(page);await type(page,"Visitor ORCHARD searchable");await click(page,`${frame} button[aria-label="Search notes"]`);await type(page,"orchard");assert.deepEqual(await rows(page),["Visitor ORCHARD searchable"]);await click(page,`${frame} button[aria-label="Clear search"]`);assert.equal((await rows(page)).length,2);await click(page,`${frame} input[aria-label="Search notes"]`);await type(page,"unmatchable-xyz");assert.equal((await rows(page)).length,0);assert.equal(await text(page),"Visitor ORCHARD searchable");await key(page,"Escape","Escape",27);assert.equal(await page.evaluate(`!!document.querySelector('${frame} input[aria-label="Search notes"]')`),false);assert.equal((await rows(page)).length,2);result.search="Case-insensitive matching, no-match state, clear, and Escape";
});
await scenario("edited-seed-and-visitor-notes-survive-reopening-but-remain-memory-only",async(page,result)=>{
 await openNotes(page);await caret(page,0);await type(page,"MY EDIT ");const edited=await html(page);await click(page,`${frame} button[title="Create a new note"]`);await caret(page);await type(page,"Unpersisted visitor notebook");const storageBefore=await page.evaluate(`({local:{...localStorage},session:{...sessionStorage}})`);
 await click(page,`${frame} button[aria-label="Close"]`);await page.wait(`!document.querySelector('${frame}')`,"Notes closed");await openNotes(page);assert.equal(await text(page),"Unpersisted visitor notebook");await row(page,"MY EDIT");assert.equal(await html(page),edited);
 result.storage=await page.evaluate(`({local:{...localStorage},session:{...sessionStorage}})`);assert.deepEqual(result.storage,storageBefore);assert.doesNotMatch(JSON.stringify(result.storage),/Unpersisted visitor notebook|MY EDIT/);
 await page.send("Page.reload");await page.wait(`!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`,"reload desktop",45000);await sleep(500);await openNotes(page);assert.equal((await rows(page)).length,1);assert.doesNotMatch(await text(page),/Unpersisted visitor notebook|MY EDIT/);assert.match(await text(page),/Lego/);
});
}

if (phase === "format") {
await scenario("new-note-heading-body-changes", async (page,result) => {
 await openNotes(page);
 // Leave the caret in the seeded title before creating a note, as a real user can.
 await caret(page,2);
 await click(page,`${frame} button[title="Create a new note"]`);
 await click(page,`${frame} button[aria-label="Normal text"]`);
 await type(page,"First line in body");
 const format=()=>page.evaluate(`(()=>{const e=document.querySelector('${editor}'),n=getSelection().anchorNode,p=n?.nodeType===1?n:n?.parentElement,b=p?.closest('h1,h2,p,div');return{html:e.innerHTML,text:e.innerText,tag:b?.tagName,size:parseFloat(getComputedStyle(p??e).fontSize),bodySize:parseFloat(getComputedStyle(e).fontSize),headingPressed:document.querySelector('${frame} button[aria-label="Toggle heading"]').ariaPressed,block:document.queryCommandValue('formatBlock')}})()`);
 result.bodyBeforeTyping=await format();
 assert.equal(result.bodyBeforeTyping.text,"First line in body");
 assert.equal(result.bodyBeforeTyping.tag,"P");
 await click(page,`${frame} button[aria-label="Toggle heading"]`);
 result.headingAfterTyping=await format();assert.equal(result.headingAfterTyping.tag,"H1");assert.ok(result.headingAfterTyping.size>result.bodyBeforeTyping.size*1.5);assert.equal(result.headingAfterTyping.headingPressed,"true");
 await click(page,`${frame} button[aria-label="Normal text"]`);
 result.bodyAfterHeading=await format();assert.equal(result.bodyAfterHeading.tag,"P");assert.equal(result.bodyAfterHeading.headingPressed,"false");
 await click(page,`${frame} button[title="Create a new note"]`);
 await click(page,`${frame} button[aria-label="Toggle heading"]`);
 await type(page,"Heading from an empty note");
 result.headingBeforeTyping=await format();assert.equal(result.headingBeforeTyping.tag,"H1");assert.ok(result.headingBeforeTyping.size>result.bodyBeforeTyping.size*1.5);
 await click(page,`${frame} button[aria-label="Normal text"]`);await type(page," continued");
 result.bodyAfterTyping=await format();assert.equal(result.bodyAfterTyping.tag,"P");assert.equal(result.bodyAfterTyping.text,"Heading from an empty note continued");
 await click(page,`${frame} button[title="Create a new note"]`);
 await click(page,`${frame} button[aria-label="Toggle heading"]`);
 await click(page,`${frame} button[aria-label="Normal text"]`);
 await type(page,"Body chosen before the first character");result.emptyHeadingToBody=await format();
 assert.equal(result.emptyHeadingToBody.tag,"P");
 await click(page,`${frame} button[title="Create a new note"]`);
 await click(page,`${frame} button[aria-label="Toggle heading"]`);await type(page,"Previous heading");
 await click(page,`${frame} button[title="Create a new note"]`);
 await click(page,editor);await type(page,"Default new note body");result.defaultBody=await format();
 for(const body of [result.bodyBeforeTyping,result.bodyAfterHeading,result.bodyAfterTyping,result.emptyHeadingToBody,result.defaultBody]) {
  assert.equal(body.size,body.bodySize,"Body first line uses the actual body size");
  assert.equal(body.headingPressed,"false");
 }
 await click(page,`${frame} [data-window-control="maximize"]`);
 await page.wait(`document.querySelector('${frame} [data-window-control="maximize"]').ariaLabel==='Restore'`,"Notes maximized");
 await point(page,`${frame} [data-window-control="maximize"]`);
 await click(page,`${frame} button[aria-label="Toggle heading"]`);result.maximizedHeading=await format();
 await click(page,`${frame} button[aria-label="Normal text"]`);result.maximizedBody=await format();
 assert.equal(result.maximizedBody.size,18);assert.equal(result.maximizedBody.headingPressed,"false");
 assert.ok(result.maximizedHeading.size>result.maximizedBody.size*1.5);
 await page.screenshot("body-first-line",frame);
});
}

if (phase === "design") {
await scenario("maximized-alignment-width-and-unchanged-prose", async (page,result) => {
 await openNotes(page);
 const expected=(await readFile(new URL("../docs/developer-log.md",import.meta.url),"utf8")).split("\n\n").slice(1).join(" ").replace(/\s+/g," ").trim();
 const prose=(await text(page)).replace(/^Developer Log\s*/,"").replace(/\s+/g," ").trim();
 assert.equal(prose,expected,"Every approved word is preserved");
 result.normal=await page.evaluate(`(()=>{const e=document.querySelector('${editor}');return{size:getComputedStyle(e).fontSize,width:e.offsetWidth,left:e.offsetLeft}})()`);
 await click(page,`${frame} [data-window-control="maximize"]`);
 await page.wait(`document.querySelector('${frame} [data-window-control="maximize"]').ariaLabel==='Restore'`,"Notes maximized");
 await point(page,`${frame} [data-window-control="maximize"]`);
 result.maximized=await page.evaluate(`(()=>{const e=document.querySelector('${editor}'),p=e.parentElement,s=p.parentElement;return{width:e.offsetWidth,left:e.offsetLeft,available:s.clientWidth,size:getComputedStyle(e).fontSize,overflow:s.scrollWidth>s.clientWidth,titleFont:getComputedStyle(e.querySelector('h1')).fontFamily,highlights:[...e.querySelectorAll('strong')].map(x=>x.textContent),mark:e.querySelector('mark')?.textContent}})()`);
 assert.ok(result.maximized.left<=48,"Editor begins at a natural left gutter, not a centered narrow column");
 assert.ok(result.maximized.width>=result.maximized.available-96,"Maximized editor uses the available page width");
 assert.ok(parseFloat(result.maximized.size)>=18,"Projected fullscreen text is larger");
 assert.equal(result.maximized.overflow,false);
 assert.deepEqual(result.maximized.highlights,["Veyra","Adobe hackathon"]);
 assert.equal(result.maximized.mark,"top 45");
 await page.screenshot("maximized",frame);await page.screenshot("maximized-desktop");
 await click(page,`${frame} [data-window-control="maximize"]`);await point(page,`${frame} [data-window-control="maximize"]`);
 result.small=[];
 for(const width of [520,420]) {
  await page.evaluate(`document.querySelector('${frame}').style.width='${width+2}px'`);
  await sleep(100);
  const layout=await page.evaluate(`(()=>{const r=document.querySelector('[data-notes-app]'),e=document.querySelector('${editor}'),t=r.querySelector('button[aria-label="Bold"]').parentElement,b=t.getBoundingClientRect();return{width:r.clientWidth,overflow:r.scrollWidth>r.clientWidth,editorWidth:e.clientWidth,toolbarFits:[...t.querySelectorAll('button')].every(x=>{const q=x.getBoundingClientRect();return q.left>=b.left-2&&q.right<=b.right+2})}})()`);
  assert.equal(layout.overflow,false);assert.equal(layout.toolbarFits,true);assert.ok(layout.editorWidth>180);result.small.push(layout);
 }
});
await scenario("light-dark-themes-and-reduced-motion", async (page,result) => {
 await openNotes(page);
 await click(page,'[data-dock-app="settings"]');await buttonText(page,"Light");
 await page.wait(`!document.documentElement.classList.contains('dark')`,"Light appearance");
 await click(page,'[data-window-frame="app-settings"] [data-window-control="close"]');
 await page.wait(`!document.querySelector('[data-window-frame="app-settings"]')`,"Settings closed");
 result.light=await page.evaluate(`(()=>{const e=document.querySelector('${editor}');return{text:getComputedStyle(e).color,paper:getComputedStyle(document.querySelector('[data-notes-app]')).getPropertyValue('--note-paper')}})()`);
 await page.screenshot("light",frame);
 await click(page,'[data-dock-app="settings"]');await buttonText(page,"Dark");
 await page.wait(`document.documentElement.classList.contains('dark')`,"Dark appearance");
 await click(page,'[data-window-frame="app-settings"] [data-window-control="close"]');
 await page.wait(`!document.querySelector('[data-window-frame="app-settings"]')`,"Settings closed");
 result.dark=await page.evaluate(`(()=>{const e=document.querySelector('${editor}');return{text:getComputedStyle(e).color,paper:getComputedStyle(document.querySelector('[data-notes-app]')).getPropertyValue('--note-paper')}})()`);
 assert.notEqual(result.light.paper,result.dark.paper);assert.notEqual(result.light.text,result.dark.text);
 await page.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
 result.motion=await page.evaluate(`(()=>{const e=document.querySelector('${editor}'),p=e.parentElement;return{reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,pageAnimation:getComputedStyle(p).animationName,titleAnimation:getComputedStyle(e.querySelector('h1'),'::after').animationName}})()`);
 assert.equal(result.motion.reduced,true);assert.equal(result.motion.pageAnimation,"none");assert.equal(result.motion.titleAnimation,"none");
 await click(page,`${frame} button[title="Create a new note"]`);await caret(page);await type(page,"Still editable with reduced motion");assert.equal(await text(page),"Still editable with reduced motion");
});
}
await mkdir(output,{recursive:true});await writeFile(new URL(`${process.env.NOTES_REPORT_NAME??`${phase}-browser-results`}.json`,output),JSON.stringify(report,null,2)+"\n");socket.close();if(failures)process.exitCode=1;
