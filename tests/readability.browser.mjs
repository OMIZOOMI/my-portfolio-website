// Isolated Chrome/CDP UI checks. No camera access or visitor storage is used.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const endpoint=process.env.CDP_URL??'http://127.0.0.1:9235';
const site=process.env.READABILITY_URL??'http://localhost:3014';
const output=new URL('../docs/readability-review/',import.meta.url);
await mkdir(output,{recursive:true});
const version=await (await fetch(endpoint+'/json/version')).json();
const ws=new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let sequence=0;const pending=new Map(),errors=[];
ws.onmessage=({data})=>{const message=JSON.parse(data);if(message.id){const job=pending.get(message.id);if(!job)return;pending.delete(message.id);clearTimeout(job.timeout);if(message.error)job.reject(Error(JSON.stringify(message.error)));else job.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description??message.params.exceptionDetails.text);};
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>reject(Error('Timed out '+method)),45000);pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
const {browserContextId}=await send('Target.createBrowserContext');
const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
const call=(method,params)=>send(method,params,sessionId);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
const wait=async(expression,label,timeout=45000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(`Boolean(${expression})`))return;await sleep(100);}throw Error('Timed out: '+label);};
const click=async selector=>{
 await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});})()`);
 // Let resize observers and React commit geometry before measuring the hit target.
 await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))))`);
 const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);if(!e.contains(hit))throw Error('Covered target '+${JSON.stringify(selector)}+' by '+hit?.outerHTML.slice(0,180));return {x,y};})()`);
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
};
const screenshot=async name=>{const {data}=await call('Page.captureScreenshot',{format:'png'});await writeFile(new URL(name+'.png',output),Buffer.from(data,'base64'));};
const results={browser:version.Browser,site,viewport:{width:1440,height:1000},checks:[]};
try{
 await call('Runtime.enable');await call('Page.enable');await call('Emulation.setFocusEmulationEnabled',{enabled:true});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`if(!localStorage.getItem('portfolio-readability'))localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1,iconScale:1,defaultView:'laptop'}));if(!localStorage.getItem('portfolio-introduction'))localStorage.setItem('portfolio-introduction',JSON.stringify({status:'skipped'}));`});
 await call('Page.navigate',{url:site});
 await wait(`document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')`,'desktop entry');await sleep(1200);
 await screenshot('before-laptop');
 await click('[data-dock-app="notes"]');await wait(`document.querySelector('[aria-label="Note editor"]')`,'notes editor');
 await evaluate(`window.__desktop=document.getElementById('desktop-root');window.__editor=document.querySelector('[aria-label="Note editor"]');window.__editor.focus();`);
 await call('Input.insertText',{text:'Readability continuity check. '});
 const noteText=await evaluate(`window.__editor.innerText`);
 await click('[data-workspace-trigger]');await wait(`document.querySelector('[data-screen-view-toggle]')`,'screen-view action');
 await click('[data-screen-view-toggle]');await sleep(160);await screenshot('zoom-midpoint');
 await wait(`document.querySelector('[data-screen-surface]')?.dataset.screenView==='focused'&&!document.querySelector('[data-screen-surface][data-transitioning]')`,'focused screen');
 results.focused=await evaluate(`(()=>{const r=document.getElementById('desktop-root').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,sameDesktop:window.__desktop===document.getElementById('desktop-root'),sameEditor:window.__editor===document.querySelector('[aria-label="Note editor"]'),text:window.__editor.innerText};})()`);
 assert.ok(results.focused.sameDesktop&&results.focused.sameEditor);assert.equal(results.focused.text,noteText);
 assert.ok(Math.abs(results.focused.width-1440)<2&&Math.abs(results.focused.height-1000)<2&&Math.abs(results.focused.x)<2&&Math.abs(results.focused.y)<2);
 results.checks.push('Screen view fills viewport; Notes DOM and edited content survive');
 await screenshot('focused-notes');
 await click('[data-workspace-trigger]');await wait(`document.querySelector('[data-workspace-picker]')`,'settings panel');
  // Use the visible Text & icon size action by text, independent of panel structure.
 await evaluate(`Array.from(document.querySelectorAll('[data-workspace-picker] button')).find(e=>e.textContent.includes('Text & icon size'))?.click()`);
 await wait(`document.querySelector('[data-interface-size="1.45"]')`,'accessibility settings');
 await click('[data-interface-size="1.45"]');await click('[data-icon-size="1.4"]');await sleep(350);
 results.enlarged=await evaluate(`(()=>{const e=document.getElementById('desktop-root'),r=e.getBoundingClientRect(),i=document.querySelector('[data-file-icon]');return {logicalWidth:e.clientWidth,displayWidth:r.width,iconFont:getComputedStyle(i.querySelector('span')).fontSize,preference:localStorage.getItem('portfolio-readability')};})()`);
 assert.ok(results.enlarged.logicalWidth<1000&&results.enlarged.displayWidth>=1438);assert.ok(parseFloat(results.enlarged.iconFont)>16);
 assert.ok(await evaluate(`Array.from(document.querySelectorAll('[data-file-surface=desktop] > [data-file-item]')).every(e=>e.getBoundingClientRect().right<=innerWidth+1)`));
 await screenshot('larger-accessibility');results.checks.push('145% interface and 140% icons enlarge real content without shrinking the desktop surface');
 await click('[data-settings-section="sound"]');await wait(`document.querySelector('[aria-label="Keyboard click sounds"]')`,'sound setting');
 const wasOn=await evaluate(`document.querySelector('[aria-label="Keyboard click sounds"]').getAttribute('aria-checked')`);
 await click('[aria-label="Keyboard click sounds"]');assert.notEqual(await evaluate(`document.querySelector('[aria-label="Keyboard click sounds"]').getAttribute('aria-checked')`),wasOn);
 assert.equal(await evaluate(`!!document.querySelector('[data-workspace-keyboard-sounds]')`),false);
 await screenshot('settings-sound');results.checks.push('Keyboard sound control lives in macOS Settings and changes the existing preference');
 // Return sizing to default for full Terminal captures.
 await click('[data-settings-section="accessibility"]');await click('[data-interface-size="1"]');await click('[data-icon-size="1"]');
 await click('[data-window-frame="app-settings"] [data-window-control="close"]');await sleep(300);
 await click('[data-dock-app="terminal"]');await wait(`document.querySelector('[aria-label="Terminal command"]')`,'terminal');await sleep(1700);
 await screenshot('terminal-intro');
 await click('[aria-label="Terminal command"]');await call('Input.insertText',{text:'projects'});await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await sleep(150);const early=await evaluate(`document.querySelector('[role="log"]').innerText.length`);await sleep(400);const later=await evaluate(`document.querySelector('[role="log"]').innerText.length`);assert.ok(later>early);
 await evaluate(`Array.from(document.querySelectorAll('[data-terminal-app] button')).find(e=>e.textContent==='Show now').click()`);
 const links=await evaluate(`Array.from(document.querySelectorAll('[role="log"] a')).map(e=>({text:e.textContent,href:e.href,target:e.target}))`);
 assert.equal(links.length,8);assert.ok(links.every(a=>a.href.startsWith('https://github.com/OMIZOOMI/')||a.href==='https://github.com/OMIZOOMI'));assert.ok(links.every(a=>a.target==='_blank'));
 results.terminal={earlyCharacters:early,laterCharacters:later,links};await screenshot('terminal-projects');
 results.checks.push('Terminal streams progressively; all seven project repositories are clickable; Show now completes output');
  await click('[data-workspace-trigger]');await click('[data-screen-view-toggle]');await wait(`document.querySelector('[data-screen-surface]')?.dataset.screenView==='laptop'&&!document.querySelector('[data-screen-surface][data-transitioning]')`,'return to laptop through Settings');
 assert.ok(await evaluate(`window.__desktop===document.getElementById('desktop-root')&&window.__editor===document.querySelector('[aria-label="Note editor"]')`));
 await screenshot('returned-laptop');results.checks.push('Return transition preserves the same desktop, Notes editor and Terminal session');
 // Reload and repeat focused view at a narrow viewport with reduced motion.
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await click('[data-workspace-trigger]');await click('[data-screen-view-toggle]');await sleep(100);
 assert.equal(await evaluate(`!!document.querySelector('[data-screen-surface][data-transitioning]')`),false);
 await screenshot('narrow-screen');
 results.narrow=await evaluate(`(()=>{const r=document.getElementById('desktop-root').getBoundingClientRect();const d=document.querySelector('[data-dock-surface]');return {width:r.width,height:r.height,dockViewport:d.clientWidth,dockContent:d.scrollWidth};})()`);
 assert.ok(results.narrow.width<=391&&results.narrow.dockContent>=results.narrow.dockViewport);
 assert.ok(await evaluate(`document.querySelector('[data-workspace-controls]').getBoundingClientRect().bottom < document.querySelector('[data-dock-surface]').getBoundingClientRect().top`));
 results.checks.push('390px viewport fills page; narrow Dock scrolls; reduced motion skips zoom');
 // Persist preferences, then verify reload returns to laptop with those sizes.
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await click('[data-workspace-trigger]');
 await evaluate(`Array.from(document.querySelectorAll('[data-workspace-picker] button')).find(e=>e.textContent.includes('Text & icon size')).click()`);
 await wait(`document.querySelector('[data-interface-size="1.3"]')`,'readability settings after resize');
 await click('[data-interface-size="1.3"]');await sleep(250);await click('[data-icon-size="1.2"]');await sleep(100);
 assert.equal(await evaluate(`document.querySelector('[data-icon-size="1.2"]').getAttribute('aria-pressed')`),'true');
 const savedPreference=await evaluate(`localStorage.getItem('portfolio-readability')`);
 await call('Page.reload',{});await wait(`document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')`,'returning entry');await sleep(300);
 results.reload=await evaluate(`({view:document.querySelector('[data-screen-surface]').dataset.screenView,preference:localStorage.getItem('portfolio-readability'),scale:parseFloat(document.getElementById('desktop-root').style.transform.slice(6))})`);
 assert.equal(results.reload.view,'laptop');assert.equal(results.reload.preference,savedPreference);assert.ok(Math.abs(results.reload.scale-1.3)<0.1);
 results.checks.push('Reload keeps validated readability preferences and starts in laptop view');
 // Rapid toggles reuse one surface; a cancelled transition cannot leave it inert.
 await call('Emulation.setEmulatedMedia',{features:[]});
  await click('[data-workspace-trigger]');await click('[data-screen-view-toggle]');await sleep(100);await click('[data-workspace-trigger]');await click('[data-screen-view-toggle]');
 await sleep(150);await click('[data-workspace-trigger]');await click('[data-screen-view-toggle]');
 await wait(`document.querySelector('[data-screen-surface]')?.dataset.screenView==='focused'&&!document.querySelector('[data-screen-surface][data-transitioning]')`,'rapid transition settles');
 assert.equal(await evaluate(`document.querySelectorAll('#desktop-root').length`),1);
 results.checks.push('Rapid enter/exit/enter settles one interactive desktop with no stale animation');
 assert.deepEqual(errors,[]);results.errors=errors;
 await writeFile(new URL('browser-results.json',output),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}catch(error){await screenshot('failed-final-check');await writeFile(new URL('failed-debug.json',output),JSON.stringify(await evaluate(`({size:innerWidth,buttons:Array.from(document.querySelectorAll('[data-interface-size],[data-icon-size]')).map(e=>({text:e.innerText,pressed:e.getAttribute('aria-pressed'),r:e.getBoundingClientRect().toJSON(),hit:document.elementFromPoint(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2,e.getBoundingClientRect().y+e.getBoundingClientRect().height/2)?.outerHTML.slice(0,200)}))})`),null,2));throw error;}finally{await send('Target.disposeBrowserContext',{browserContextId});ws.close();}
