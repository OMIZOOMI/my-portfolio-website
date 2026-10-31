// Production preview + an isolated Chrome context. No test dependencies.
// FOLDERS_PHASE=before FOLDERS_TEST_FILTER=baseline node tests/folders.browser.mjs
// STARTUP_TEST_URL=http://127.0.0.1:3001 CDP_URL=http://127.0.0.1:9223 node tests/folders.browser.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9223";
const phase = process.env.FOLDERS_PHASE ?? "after";
const filter = process.env.FOLDERS_TEST_FILTER;
const output = new URL("../docs/folders-review/", import.meta.url);
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
  await send("Page.addScriptToEvaluateOnNewDocument", {source:`window.__folderContextEvents=[];window.__folderKeys=[];document.addEventListener('contextmenu',event=>{window.__folderContextEvents.push({get prevented(){return event.defaultPrevented},target:event.target?.tagName,inside:!!event.target?.closest('#desktop-root')});},true);document.addEventListener('keydown',event=>{window.__folderKeys.push({key:event.key,ctrl:event.ctrlKey,meta:event.metaKey,get prevented(){return event.defaultPrevented},input:event.target?.matches('input,textarea,[contenteditable=true]')});},true);${options.init??""}`});
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  return {send,evaluate,errors,
    wait:(expression,label,timeout)=>until(()=>evaluate(expression),label,timeout),
    async boot(){await send("Page.navigate",{url:site});await until(()=>evaluate(`!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`),"3D entry",45000);await sleep(400);},
    async screenshot(name,selector){await mkdir(output,{recursive:true});let clip;
      if(selector)clip=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.max(0,r.x-6),y:Math.max(0,r.y-6),width:r.width+12,height:r.height+12,scale:1}})()`);
      const {data}=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,...(clip?{clip}:{})});
      await writeFile(new URL(`${name}.png`,output),Buffer.from(data,"base64"));},
    async close(){listeners.delete(onEvent);await command("Target.disposeBrowserContext",{browserContextId});},
  };
}
async function point(page, selector) {
  await page.evaluate("window.__folderPoint=null");
  return page.wait(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;
   el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
   const hit=document.elementFromPoint(x,y);if(!r.width||!r.height||x<0||x>innerWidth||y<0||y>innerHeight||!(el===hit||el.contains(hit)))return false;
   const previous=window.__folderPoint,now=performance.now();if(!previous||Math.hypot(x-previous.x,y-previous.y)>.5){window.__folderPoint={x,y,at:now};return false;}
   return now-previous.at>150?{x,y}:false;})()`,selector);
}
async function mouse(page, position, button="left", clickCount=1) {
  const {x,y}=position;
  await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",x,y});
  await page.send("Input.dispatchMouseEvent",{type:"mousePressed",button,clickCount,x,y});
  await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",button,clickCount,x,y});
}
async function click(page,selector,count=1){await mouse(page,await point(page,selector),"left",count);}
async function secondary(page,selector){await mouse(page,await point(page,selector),"right");}
async function key(page,key,code=key,virtualKey,modifiers=0){
  await page.send("Input.dispatchKeyEvent",{type:"keyDown",key,code,windowsVirtualKeyCode:virtualKey,modifiers,...(key==="Enter"?{text:"\r",unmodifiedText:"\r"}:{})});
  await page.send("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode:virtualKey,modifiers});
}
async function menuBar(page,label){
  await page.evaluate(`(()=>{const el=[...document.querySelectorAll('nav[aria-label="macOS Menu Bar"]>div:first-child>div')].find(el=>el.firstChild?.textContent===${JSON.stringify(label)});if(!el)throw Error('Missing menu');el.dataset.folderTestMenu=${JSON.stringify(label)}})()`);
  await click(page,`[data-folder-test-menu="${label}"]`);
}
async function buttonText(page,label){
  await page.evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)});if(!el)throw Error('Missing button: '+${JSON.stringify(label)});el.dataset.folderTestButton=${JSON.stringify(label)}})()`);
  await click(page,`[data-folder-test-button="${label}"]`);
}
const frame='[data-window-frame="finder-desktop"]';
const item=(id,root=frame)=>`${root} [data-file-item="${id}"]`;
async function openFinder(page){await click(page,'[data-dock-app="finder"]');await page.wait(`!!document.querySelector('${frame} [data-finder-content="desktop"]')`,"Finder desktop");await sleep(450);}
async function current(page,id,root=frame){await page.wait(`!!document.querySelector('${root} [data-finder-content="${id}"]')`,`${id} content`);}
const renameInput='[data-file-rename-input]';
const context='[data-file-context-menu]';
async function editor(page){return page.wait(`(()=>{const el=document.querySelector('${renameInput}');return el?{id:el.dataset.fileRenameInput,value:el.value,selected:el.selectionStart===0&&el.selectionEnd===el.value.length,focused:document.activeElement===el}:false})()`,"inline editor");}
async function text(page,value){await key(page,"a","KeyA",65,4);await key(page,"Backspace","Backspace",8);if(value)await page.send("Input.insertText",{text:value});}
async function commit(page,value){await text(page,value);await key(page,"Enter","Enter",13);await page.wait(`!document.querySelector('${renameInput}')`,"rename committed");}
async function create(page,name,root=frame){await click(page,`${root} button[aria-label="New Folder"]`);const editing=await editor(page);assert.equal(editing.selected,true,"Generated name starts selected");assert.equal(editing.focused,true);if(name!==undefined)await commit(page,name);return editing.id;}
async function action(page,name){await click(page,`${context} [data-file-action="${name}"]`);}
async function rename(page,id,name,root=frame){await click(page,`${item(id,root)} button[aria-label^="Open "]`);await key(page,"F2","F2",113);assert.equal((await editor(page)).id,id);await commit(page,name);}
async function label(page,id,root=frame){return page.wait(`(()=>{const b=document.querySelector('${item(id,root)} button[aria-label^="Open "]');return b?b.getAttribute('aria-label').slice(5):false})()`,`${id} icon label`);}
async function nav(page,id,root=frame){await click(page,`${root} [data-finder-location="${id}"]`);await current(page,id,root);}
async function drag(page,sourceSelector,targetSelector){
  const source=await point(page,sourceSelector),target=await point(page,targetSelector);
  await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",...source});await page.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...source});
  for(let i=1;i<=12;i++){await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",buttons:1,x:source.x+(target.x-source.x)*i/12,y:source.y+(target.y-source.y)*i/12});await sleep(18);}
  await page.wait(`document.body.classList.contains('is-finder-dragging')`,"physical file drag active");
  await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...target});await page.wait(`!document.body.classList.contains('is-finder-dragging')`,"drop completed");
}
const report={phase,browser:version.Browser,viewport:{width:1440,height:1000},scenarios:[]};
let failures=0;
async function scenario(name,run){
  if(filter&&!name.includes(filter))return;
  const page=await pageFor();const started=Date.now();const result={name};
  try{await page.boot();await run(page,result);assert.deepEqual(page.errors,[],"No runtime exceptions");result.status="PASS";}
  catch(error){failures++;result.status="FAIL";result.error=error.stack;try{result.dom=await page.evaluate(`({active:document.activeElement?.outerHTML.slice(0,2000),context:document.querySelector('[data-file-context-menu]')?.outerHTML,keys:window.__folderKeys.slice(-15),windows:[...document.querySelectorAll('[data-window-frame]')].map(el=>({id:el.dataset.windowFrame,location:el.querySelector('[data-finder-content]')?.dataset.finderContent}))})`);await page.screenshot(`failed-${name}`);}catch{}}
  finally{result.elapsedMs=Date.now()-started;report.scenarios.push(result);console.log(`${result.status} ${name} ${result.elapsedMs}ms${result.error?'\n'+result.error:''}`);await page.close();}
}

if(phase==="before")await scenario("baseline-identity-and-context-menu",async(page,result)=>{
  await openFinder(page);
  await menuBar(page,"File");await buttonText(page,"New Folder");
  const created=await page.wait(`(()=>{const el=[...document.querySelectorAll('#desktop-root>[data-file-item]')].find(el=>el.dataset.fileItem.startsWith('folder-'));return el?{id:el.dataset.fileItem,label:el.textContent.trim()}:false})()`,"new folder created");
  await click(page,`#desktop-root>[data-file-item="${created.id}"] button`,2);
  const opened=await page.wait(`(()=>{const el=document.querySelector('[data-window-frame="finder-${created.id}"] [data-finder-content]');return el?el.dataset.finderContent:false})()`,"new folder Finder opened");
  assert.equal(opened,"desktop","Reproduce current title-to-ID fallback");
  await secondary(page,`[data-window-frame="finder-${created.id}"] [data-finder-content]`);
  await sleep(100);const context=await page.evaluate("window.__folderContextEvents.at(-1)");
  assert.equal(context.prevented,false,"Reproduce missing native context-menu suppression");
  await key(page,"Escape","Escape",27);
  result.findings={created,openedLocation:opened,contextMenuEvent:context,inlineRenamePresent:await page.evaluate(`!!document.querySelector('[data-file-rename-input]')`)};
  await page.screenshot("before-folder-identity");
});

if(phase!=="before"){
await scenario("desktop-context-create-inline-text-selection-and-open",async(page,result)=>{
  const p=await page.evaluate(`(()=>{const r=document.querySelector('#desktop-root').getBoundingClientRect();return {x:r.left+100*r.width/1400,y:r.top+110*r.height/900}})()`);
  await mouse(page,p,"right");await page.wait(`!!document.querySelector('${context}')`,"desktop secondary-click menu");
  assert.equal((await page.evaluate("window.__folderContextEvents.at(-1)")).prevented,true);
  await action(page,"new-folder");const created=await editor(page);assert.equal(created.selected,true);await commit(page,"Trackpad Folder");
  const desktopItem=`#desktop-root>[data-file-item="${created.id}"]`;
  assert.equal(await label(page,created.id,"#desktop-root"),"Trackpad Folder");
  await secondary(page,`${desktopItem} button`);await action(page,"rename");
  const editing=await editor(page);assert.equal(editing.id,created.id);
  const r=await page.evaluate(`(()=>{const r=document.querySelector('${renameInput}').getBoundingClientRect();return {left:r.left+3,right:r.right-3,y:r.top+r.height/2}})()`);
  await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:r.left,y:r.y});await page.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,x:r.left,y:r.y});
  for(let i=1;i<=8;i++)await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",buttons:1,x:r.left+(r.right-r.left)*i/8,y:r.y});
  await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,x:r.right,y:r.y});
  assert.equal(await page.evaluate("document.body.classList.contains('is-finder-dragging')"),false,"Inline text selection cannot start folder dragging");
  assert.ok(await page.evaluate(`(()=>{const el=document.querySelector('${renameInput}');return el.selectionEnd>el.selectionStart})()`),"Mouse can select text inside inline editor");
  await commit(page,"Mouse Folder");await click(page,`${desktopItem} button`,2);
  const opened=`[data-window-frame="finder-${created.id}"]`;await current(page,created.id,opened);
  assert.equal(await page.evaluate(`document.querySelector('${opened} h1').textContent`),"Mouse Folder");
  result.identity=created.id;result.checks=["Desktop secondary click handles normal contextmenu event","Create immediately selects generated name","Mouse text selection works without dragging","Desktop folder opens its real ID after rename"];
  await page.screenshot("after-desktop-folder",opened);
});

await scenario("create-rename-nested-move-trash-restore-and-two-windows",async(page,result)=>{
  await openFinder(page);
  const parent=await create(page,"Research");
  assert.equal(await label(page,parent),"Research");
  await click(page,`${item(parent)} button`,2);await current(page,parent);
  // The menu bar must use the current ID, not the generated folder's title.
  await menuBar(page,"File");await buttonText(page,"New Folder");
  const nestedEditing=await editor(page);assert.equal(nestedEditing.selected,true);
  const child=nestedEditing.id;await commit(page,"Notes");
  assert.equal(await label(page,child),"Notes");
  await nav(page,"desktop");
  await click(page,`${item(parent)} button`);await click(page,`${frame} button[aria-label="Rename selected folder"]`);await commit(page,"Research Archive");
  await click(page,`${item(parent)} button`,2);await current(page,parent);
  // Open the same folder in another Finder; both subscribe to the live metadata.
  await nav(page,"desktop");await secondary(page,`${item(parent)} button`);await action(page,"open-new-window");
  const mirrorId=await page.wait(`(()=>{const el=[...document.querySelectorAll('[data-window-frame]')].find(el=>el.dataset.windowFrame!=='finder-desktop'&&el.querySelector('[data-finder-content="${parent}"]'));return el?.dataset.windowFrame||false})()`,"mirrored folder window");
  const mirror=`[data-window-frame="${mirrorId}"]`;
  assert.equal(await label(page,child,mirror),"Notes");
  // Minimize through its working title-bar control so the original desktop is reachable.
  await click(page,`${mirror} button[aria-label="Minimize"]`);await sleep(650);
  await rename(page,parent,"Research Renamed");
  await page.wait(`document.querySelector('${mirror} h1')?.textContent==='Research Renamed'`,"other Finder window title updates after parent rename");
  assert.ok(await page.evaluate(`document.querySelector('${mirror} [data-finder-path]').textContent.includes('Research Renamed')`),"Other window's path updates from the same ID");
  await drag(page,`${item(parent)} button`,`${frame} [data-finder-location="documents"]`);
  await page.wait(`!document.querySelector('${item(parent)}')`,"moved folder leaves Desktop");await nav(page,"documents");
  await page.wait(`document.querySelector('${mirror} [data-finder-path]').textContent.includes('Documents')`,"Other window's parent path updates after move");
  assert.equal(await label(page,parent),"Research Renamed");
  await click(page,`${item(parent)} button`,2);await current(page,parent);assert.equal(await label(page,child),"Notes");
  const breadcrumb=await page.evaluate(`document.querySelector('${frame} [data-finder-path]').textContent`);assert.ok(breadcrumb.includes("Documents")&&breadcrumb.includes("Research Renamed"));
  await nav(page,"documents");await secondary(page,`${item(parent)} button`);await action(page,"trash");
  await page.wait(`!document.querySelector('${item(parent)}')`,"trashed folder leaves Documents");await nav(page,"bin");
  assert.ok(await page.evaluate(`document.querySelector('${mirror} [data-finder-content]').textContent.includes('moved to the Bin')`),"Other open window reports the moved subtree");
  await page.wait(`!!document.querySelector('${item(parent)}')`,"parent in Bin");
  assert.equal(await page.evaluate(`document.querySelector('${frame} button[aria-label="New Folder"]').disabled`),true,"Bin cannot create folders");
  await secondary(page,`${item(parent)} button`);
  assert.equal(await page.evaluate(`document.querySelector('${context} [data-file-action="rename"]')?.disabled??true`),true,"Bin cannot rename folders");
  await action(page,"restore");await page.wait(`!document.querySelector('${item(parent)}')`,"restored parent leaves Bin");
  assert.equal(await page.evaluate(`document.querySelectorAll('${frame} [data-file-item="${child}"]').length`),0,"Restored child does not remain separately in Bin");
  await nav(page,"documents");assert.equal(await label(page,parent),"Research Renamed");await click(page,`${item(parent)} button`,2);await current(page,parent);assert.equal(await label(page,child),"Notes");
  assert.equal(await label(page,child,mirror),"Notes","Both existing windows recover the same restored child");
  await page.screenshot("after-folder-lifecycle",frame);
  result.identities={parent,child,mirrorId};result.checks=["Real-ID nested creation through File menu","Parent ID stable through rename, move, trash, restore","Nested child restored with parent","Bin create/rename disabled","Folder content remains a grid"];
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('${frame} [data-finder-grid]')).display`),"grid");
});

await scenario("rename-cancel-validation-numbering-and-rapid-creation",async(page,result)=>{
  await openFinder(page);
  const first=await create(page);await key(page,"Escape","Escape",27);
  assert.equal(await label(page,first),"Untitled Folder","Escape cancels only rename, retaining newly created folder");
  const second=await create(page);const secondName=(await editor(page)).value;assert.equal(secondName,"Untitled Folder 2");await key(page,"Escape","Escape",27);
  await rename(page,first,"Research");
  await click(page,`${item(first)} button`);await key(page,"F2","F2",113);await text(page,"   ");await key(page,"Enter","Enter",13);
  assert.equal(await page.evaluate(`document.querySelector('${renameInput}')?.getAttribute('aria-invalid')`),"true","Blank Enter keeps editor and exposes validation");
  await page.screenshot("after-inline-validation",frame);
  await key(page,"Escape","Escape",27);assert.equal(await label(page,first),"Research");
  await click(page,`${item(second)} button`);await key(page,"F2","F2",113);await text(page,"Research");await key(page,"Enter","Enter",13);
  assert.equal(await page.evaluate(`document.querySelector('${renameInput}')?.getAttribute('aria-invalid')`),"true","Duplicate Enter keeps editor and exposes validation");
  await key(page,"Escape","Escape",27);assert.equal(await label(page,second),secondName);
  // A valid blur commits; invalid blur cancels, leaving the previous safe name.
  await click(page,`${item(first)} button`);await key(page,"F2","F2",113);await text(page,"Committed on blur");await click(page,`${frame} h1`);
  await page.wait(`!document.querySelector('${renameInput}')`,"valid blur finishes rename");assert.equal(await label(page,first),"Committed on blur");
  await click(page,`${item(first)} button`);await key(page,"F2","F2",113);await text(page,"");await click(page,`${frame} h1`);
  await page.wait(`!document.querySelector('${renameInput}')`,"invalid blur cancels rename");assert.equal(await label(page,first),"Committed on blur");
  // Two rapid physical clicks create distinct IDs; the latest item owns the one editor.
  const p=await point(page,`${frame} button[aria-label="New Folder"]`);
  await mouse(page,p);await mouse(page,p);const latest=await editor(page);await key(page,"Escape","Escape",27);
  const generated=await page.evaluate(`Array.from(document.querySelectorAll('${frame} [data-file-item]'),el=>({id:el.dataset.fileItem,label:el.textContent.trim()})).filter(el=>el.id.startsWith('folder-'))`);
  assert.equal(new Set(generated.map(el=>el.id)).size,generated.length);assert.equal(generated.length,4,"Rapid create preserves both folders");
  assert.equal(new Set(generated.map(el=>el.label)).size,generated.length,"Generated sibling names stay unique");
  result.folders=generated;result.latestEditorId=latest.id;
});

await scenario("secondary-click-keyboard-menu-and-bounds",async(page,result)=>{
  await openFinder(page);const id=await create(page,"Menu Test");
  await secondary(page,`${item(id)} button`);await page.wait(`!!document.querySelector('${context}')`,"secondary-click menu");
  assert.equal((await page.evaluate("window.__folderContextEvents.at(-1)")).prevented,true);
  assert.equal(await page.evaluate(`!!document.querySelector('${frame} [data-finder-content="desktop"]')`),true,"Menu does not open the folder underneath");
  assert.equal(await page.evaluate("document.body.classList.contains('is-finder-dragging')"),false,"Secondary click does not drag");
  await page.screenshot("after-context-menu");
  await key(page,"Escape","Escape",27);await page.wait(`!document.querySelector('${context}')`,"Escape closes menu");
  await click(page,`${item(id)} button`);await key(page,"F10","F10",121,8);await page.wait(`!!document.querySelector('${context}')`,"Shift+F10 context menu");
  for(let i=0;i<8;i++){if(await page.evaluate(`document.activeElement?.dataset.fileAction==='rename'`))break;await key(page,"ArrowDown","ArrowDown",40);}
  assert.equal(await page.evaluate(`document.activeElement?.dataset.fileAction`),"rename","Arrow keys reach Rename in the menu");
  await key(page,"Enter","Enter",13);assert.equal((await editor(page)).id,id);await commit(page,"Keyboard Menu");
  const bounds=[];
  for(const corner of["top-left","top-right","bottom-left","bottom-right"]){
    // The screen is a perspective quadrilateral. Its bounding box corners can be
    // outside the actual screen, so verify a real desktop hit near each edge.
    const p=await page.evaluate(`(()=>{const r=document.querySelector('#desktop-root').getBoundingClientRect();const y=${corner.includes('bottom')?'r.bottom-6':'r.top+45*(r.height/900)'};for(let inset=6;inset<=60;inset+=3){const x=${corner.includes('right')?'r.right-inset':'r.left+inset'},hit=document.elementFromPoint(x,y);if(hit?.closest('#desktop-root')&&!hit.closest('[data-window-frame],[data-dock],nav,[data-file-item]'))return {x,y,inset};}throw Error('No desktop hit near ${corner}');})()`);
    await mouse(page,p,"right");await page.wait(`!!document.querySelector('${context}')`,`${corner} menu`);
    const b=await page.evaluate(`(()=>{const d=document.querySelector('#desktop-root').getBoundingClientRect(),m=document.querySelector('${context}').getBoundingClientRect();return {desktop:{left:d.left,top:d.top,right:d.right,bottom:d.bottom},menu:{left:m.left,top:m.top,right:m.right,bottom:m.bottom}}})()`);
    assert.ok(b.menu.left>=b.desktop.left-1&&b.menu.right<=b.desktop.right+1&&b.menu.top>=b.desktop.top-1&&b.menu.bottom<=b.desktop.bottom+1,`Menu stays inside desktop at ${corner}`);
    bounds.push({corner,pointer:p,...b});await key(page,"Escape","Escape",27);
  }
  await secondary(page,`${item(id)} button`);await click(page,`${frame} h1`);await page.wait(`!document.querySelector('${context}')`,"outside click dismisses context menu");
  await mouse(page,{x:4,y:4},"right");await sleep(80);const outside=await page.evaluate("window.__folderContextEvents.at(-1)");assert.equal(outside.inside,false);assert.equal(outside.prevented,false,"Normal browser context menu is preserved outside desktop");await key(page,"Escape","Escape",27);
  // Other application windows are not Finder context surfaces.
  await click(page,'[data-dock-app="settings"]');await page.wait(`!!document.querySelector('[data-window-frame="app-settings"]')`,"Settings open");
  await secondary(page,'[data-window-frame="app-settings"] h3');await sleep(80);assert.equal((await page.evaluate("window.__folderContextEvents.at(-1)")).prevented,false,"Settings retains browser context behavior");await key(page,"Escape","Escape",27);
  result.bounds=bounds;result.outsideContext=outside;
});

await scenario("undo-redo-keyboard-and-native-text-editing",async(page,result)=>{
  await openFinder(page);const id=await create(page,"Original");await rename(page,id,"Renamed");
  await click(page,`${frame} h1`);await key(page,"z","KeyZ",90,2);await page.wait(`document.querySelector('${item(id)} button')?.getAttribute('aria-label')==='Open Original'`,"Ctrl+Z undoes rename");
  await key(page,"y","KeyY",89,2);await page.wait(`document.querySelector('${item(id)} button')?.getAttribute('aria-label')==='Open Renamed'`,"Ctrl+Y redoes rename");
  await key(page,"z","KeyZ",90,4);await page.wait(`document.querySelector('${item(id)} button')?.getAttribute('aria-label')==='Open Original'`,"Meta+Z undoes rename");
  await key(page,"z","KeyZ",90,12);await page.wait(`document.querySelector('${item(id)} button')?.getAttribute('aria-label')==='Open Renamed'`,"Meta+Shift+Z redoes rename");
  await click(page,`${item(id)} button`);await key(page,"F2","F2",113);await text(page,"Text Edit");await key(page,"z","KeyZ",90,4);
  const nativeUndo=await page.evaluate("window.__folderKeys.at(-1)");assert.equal(nativeUndo.input,true);assert.equal(nativeUndo.prevented,false,"Filesystem handler leaves native text undo alone");
  assert.equal(await page.evaluate(`document.querySelectorAll('${item(id)}').length`),1,"Text undo does not remove folder");
  await key(page,"Escape","Escape",27);assert.equal(await label(page,id),"Renamed");
  // Both platform modifiers create in the currently focused Finder destination.
  await click(page,`${item(id)} button`,2);await current(page,id);
  await key(page,"N","KeyN",78,10);const ctrlCreated=await editor(page);await key(page,"Escape","Escape",27);
  await key(page,"N","KeyN",78,12);const metaCreated=await editor(page);await key(page,"Escape","Escape",27);
  assert.notEqual(ctrlCreated.id,metaCreated.id);await current(page,id);assert.equal(await label(page,ctrlCreated.id),"Untitled Folder");assert.equal(await label(page,metaCreated.id),"Untitled Folder 2");
  result.nativeTextUndo=nativeUndo;result.platformModifierPaths=["Ctrl+Z","Ctrl+Y","Meta+Z","Meta+Shift+Z","Ctrl+Shift+N","Meta+Shift+N"];
});
}

await mkdir(output,{recursive:true});
await writeFile(new URL(`${phase}${phase!=="before"&&filter?'-'+filter:''}-browser-results.json`,output),JSON.stringify(report,null,2)+"\n");
socket.close();
if(failures)process.exitCode=1;
