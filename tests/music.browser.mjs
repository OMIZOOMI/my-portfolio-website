// Production preview + isolated Chrome CDP; no autoplay policy override.
// MUSIC_PHASE=before STARTUP_TEST_URL=http://127.0.0.1:3001 CDP_URL=http://127.0.0.1:9223 node tests/music.browser.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3001";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9223";
const phase = process.env.MUSIC_PHASE ?? "after";
const filter = process.env.MUSIC_TEST_FILTER;
const output = new URL("../docs/music-review/", import.meta.url);
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
const frame='[data-window-frame="app-music"]';
async function pageFor(options={}){
 const {browserContextId}=await command("Target.createBrowserContext");
 const {targetId}=await command("Target.createTarget",{url:"about:blank",browserContextId});
 const {sessionId}=await command("Target.attachToTarget",{targetId,flatten:true});
 const send=(method,params)=>command(method,params,sessionId),errors=[],requests=[],paused=[];
 const onEvent=event=>{if(event.sessionId!==sessionId)return;if(event.method==="Runtime.exceptionThrown")errors.push(event.params.exceptionDetails.text);if(event.method==="Network.requestWillBeSent")requests.push({url:event.params.request.url,type:event.params.type});if(event.method==="Fetch.requestPaused")paused.push(event.params);};listeners.add(onEvent);
 await Promise.all([send("Page.enable"),send("Runtime.enable"),send("Network.enable")]);
 await send("Network.clearBrowserCache");
 await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send("Page.addScriptToEvaluateOnNewDocument",{source:`localStorage.setItem('portfolio-appearance',JSON.stringify({version:1,state:{theme:'dark',wallpaper:'coast',wallpaperMode:'auto'}}));window.__musicEvents=[];for(const name of ['playing','waiting','stalled','pause','ended','error','loadedmetadata'])document.addEventListener(name,event=>{if(event.target instanceof HTMLMediaElement)window.__musicEvents.push({name,src:event.target.currentSrc,time:event.target.currentTime,duration:event.target.duration,at:performance.now()})},true);${options.init??""}`});
 if(options.block)await send("Network.setBlockedURLs",{urls:options.block});
 async function evaluate(expression){const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;}
 return {send,evaluate,errors,requests,paused,wait:(expression,label,timeout)=>until(()=>evaluate(expression),label,timeout),
  async boot(){await send("Page.navigate",{url:site});await until(()=>evaluate(`!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('#desktop-root')`),"3D entry",45000);await sleep(400);},
  async screenshot(name,selector){await mkdir(output,{recursive:true});let clip;if(selector)clip=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.max(0,r.x-6),y:Math.max(0,r.y-6),width:r.width+12,height:r.height+12,scale:1}})()`);const{data}=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,...(clip?{clip}:{})});await writeFile(new URL(`${name}.png`,output),Buffer.from(data,"base64"));},
  async close(){listeners.delete(onEvent);await command("Target.disposeBrowserContext",{browserContextId});}
 };
}
async function point(page,selector){await page.evaluate("window.__musicPoint=null");return page.wait(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(!r.width||!r.height||x<0||x>innerWidth||y<0||y>innerHeight||!(el===hit||el.contains(hit)))return false;const p=window.__musicPoint,now=performance.now();if(!p||Math.hypot(x-p.x,y-p.y)>.5){window.__musicPoint={x,y,at:now};return false;}return now-p.at>150?{x,y}:false;})()`,selector);}
async function click(page,selector,count=1){const p=await point(page,selector);await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",...p});await page.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:count,...p});await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:count,...p});}
async function key(page,key,code=key,virtualKey){await page.send("Input.dispatchKeyEvent",{type:"keyDown",key,code,windowsVirtualKeyCode:virtualKey});await page.send("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode:virtualKey});}
async function menuBar(page,label){await page.evaluate(`(()=>{const el=[...document.querySelectorAll('nav[aria-label="macOS Menu Bar"]>div:first-child>div')].find(el=>el.firstChild?.textContent===${JSON.stringify(label)});if(!el)throw Error('Missing menu');el.dataset.musicTestMenu=${JSON.stringify(label)}})()`);await click(page,`[data-music-test-menu="${label}"]`);}
async function buttonText(page,label){await page.evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)});if(!el)throw Error('Missing button: '+${JSON.stringify(label)});el.dataset.musicTestButton=${JSON.stringify(label)}})()`);await click(page,`[data-music-test-button="${label}"]`);}
async function openMusic(page){await click(page,'[data-dock-app="music"]');await page.wait(`!!document.querySelector('${frame} audio')`,"Music opened");await sleep(500);}
async function geometry(page){return page.evaluate(`(()=>{const host=document.querySelector('${frame}').lastElementChild,app=document.querySelector('${frame} audio').parentElement,rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,localWidth:el.clientWidth,localHeight:el.clientHeight}};return{host:rect(host),app:rect(app),sidebar:rect(app.querySelector('aside')),header:rect(app.querySelector('section').firstElementChild),content:rect(app.querySelector('section').children[1]),footer:rect(app.querySelector('section').lastElementChild),artwork:rect(app.querySelector('section').firstElementChild.firstElementChild),theme:document.documentElement.className}})()`);}
const audioExpression=`document.querySelector('${frame} audio')`;
const mediaRequests=page=>page.requests.filter(r=>/\.(mp3|m4a|ogg|wav)(?:\?|$)/i.test(r.url));
async function audioState(page){return page.evaluate(`(()=>{const a=${audioExpression};return a?{src:a.currentSrc,source:a.getAttribute('src'),paused:a.paused,time:a.currentTime,duration:a.duration,volume:a.volume,ended:a.ended,readyState:a.readyState,networkState:a.networkState,error:a.error?.code}:null})()`);}
async function tracks(page){return page.evaluate(`Array.from(document.querySelectorAll('${frame} [data-music-track]'),el=>({id:el.dataset.musicTrack,text:el.innerText}))`);}
async function select(page,id){await click(page,`${frame} [data-music-track="${id}"]`);}
async function playing(page,label="real audio playback"){return page.wait(`(()=>{const a=${audioExpression};return a&&!a.paused&&a.currentTime>.1&&a.readyState>=2?{src:a.currentSrc,time:a.currentTime,duration:a.duration}:false})()`,label,30000);}
async function pause(page){if(!(await audioState(page)).paused)await click(page,`${frame} button[aria-label="Pause"]`);await page.wait(`${audioExpression}.paused`,"paused");}
async function setRange(page,label,value){const selector=`${frame} input[aria-label="${label}"]`;await click(page,selector);await key(page,"Home","Home",36);for(let i=0;i<value;i++)await key(page,"ArrowRight","ArrowRight",39);}
function timeLabel(seconds){return`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(Math.floor(seconds%60)).padStart(2,"0")}`;}
async function seekPercent(page,percent){const selector=`${frame} input[aria-label="Track progress"]`,p=await page.evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return{x:r.x+r.width*${percent}/100,y:r.y+r.height/2}})()`);await page.send("Input.dispatchMouseEvent",{type:"mouseMoved",...p});await page.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...p});await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...p});}
const report={phase,browser:version.Browser,viewport:{width:1440,height:1000},autoplayPolicyOverride:false,scenarios:[]};let failures=0;
async function scenario(name,run,options={}){if(filter&&!name.includes(filter))return;const page=await pageFor(options),started=Date.now(),result={name};try{await page.boot();await run(page,result);assert.deepEqual(page.errors,[],"No runtime exceptions");result.status="PASS";}catch(error){failures++;result.status="FAIL";result.error=error.stack;try{result.dom=await page.evaluate(`({music:document.querySelector('${frame}')?.innerText,audio:[...document.querySelectorAll('audio')].map(a=>({src:a.currentSrc,paused:a.paused,currentTime:a.currentTime,duration:a.duration,error:a.error?.code})),events:window.__musicEvents})`);await page.screenshot(`failed-${name}`);}catch{}}finally{result.elapsedMs=Date.now()-started;report.scenarios.push(result);console.log(`${result.status} ${name} ${result.elapsedMs}ms${result.error?'\n'+result.error:''}`);await page.close();}}

if(phase==="before")await scenario("baseline-music-layout-and-short-synthesized-tracks",async(page,result)=>{
 await openMusic(page);
 await page.wait(`document.querySelector('${frame} audio').duration>0`,"old synthesized track metadata");
 result.geometry=await geometry(page);
 result.library=await page.evaluate(`(()=>{const app=document.querySelector('${frame} audio').parentElement;return[...app.querySelector('section').children[1].querySelector('.space-y-1').children].map(el=>({text:el.innerText}))})()`);
 result.audio=await page.evaluate(`(()=>{const a=document.querySelector('${frame} audio');return{src:a.currentSrc,duration:a.duration,paused:a.paused,preload:a.preload}})()`);
 assert.equal(result.geometry.host.localWidth,640);assert.equal(result.geometry.host.localHeight,440);
 assert.ok(result.audio.src.startsWith("blob:"));assert.ok(result.audio.duration>=12&&result.audio.duration<=16);
 await page.screenshot("before-music-desktop");await page.screenshot("before-music",frame);
});

if(phase!=="before"){
await scenario("preserved-layout-and-no-startup-library-download",async(page,result)=>{
 assert.equal(mediaRequests(page).length,0,"Desktop entry must not download the music library");
 await openMusic(page);await sleep(500);
 result.geometry=await geometry(page);result.tracks=await tracks(page);result.audio=await audioState(page);
 assert.ok(result.tracks.length>=4,"At least four full-length tracks");
 assert.equal(mediaRequests(page).length,0,"Opening Music must wait for explicit playback intent");
 assert.equal(result.audio.paused,true);assert.equal(result.audio.source,null,"An idle player has no source to download");
 assert.equal(await page.evaluate(`document.querySelectorAll('audio').length`),1,"One media element");
 const before=JSON.parse(await readFile(new URL("before-browser-results.json",output),"utf8")).scenarios[0].geometry;
 for(const part of["host","app","sidebar","header","content","footer","artwork"]){
  assert.ok(Math.abs(result.geometry[part].localWidth-before[part].localWidth)<=1,`${part} width preserves original layout`);
  assert.ok(Math.abs(result.geometry[part].localHeight-before[part].localHeight)<=1,`${part} height preserves original layout`);
 }
 result.artwork=await page.evaluate(`(()=>{const el=document.querySelector('${frame} section').firstElementChild.firstElementChild;return{background:getComputedStyle(el).backgroundImage,radius:getComputedStyle(el).borderRadius}})()`);
 assert.match(result.artwork.background,/linear-gradient/);assert.equal(result.artwork.radius,"12px");
 await page.screenshot("after-music-desktop");await page.screenshot("after-music",frame);
});

await scenario("all-real-durations-and-seeking-beyond-two-minutes",async(page,result)=>{
 await openMusic(page);const library=await tracks(page);result.measured=[];
 for(const track of library){
  await select(page,track.id);await playing(page,`${track.id} playing`);
  const initial=await audioState(page);assert.ok(initial.duration>=180,`${track.id} real media duration >=3 minutes`);
  assert.ok(initial.duration<=720,"A deliberate listening piece, not an endless stream");
  assert.ok(!initial.src.startsWith("blob:"),"Compressed controlled assets replace generated WAV blobs");
  const ownUrl=new URL(initial.src);assert.equal(ownUrl.origin,new URL(site).origin,"Audio is hosted with this site");
  await seekPercent(page,75);await page.wait(`${audioExpression}.currentTime>120&&!${audioExpression}.paused`,`${track.id} seek beyond two minutes`);
  const sought=await audioState(page);await sleep(250);assert.ok((await audioState(page)).time>sought.time,"Playback progresses after seeking");
  await pause(page);const stopped=await audioState(page);
  const labels=await page.evaluate(`({elapsed:document.querySelector('${frame} [data-music-elapsed]')?.textContent,remaining:document.querySelector('${frame} [data-music-remaining]')?.textContent})`);
  assert.equal(labels.elapsed,timeLabel(stopped.time),"Elapsed display reflects actual media time");
  assert.equal(labels.remaining,`-${timeLabel(Math.max(0,stopped.duration-stopped.time))}`,"Remaining time reflects real media metadata");
  result.measured.push({id:track.id,src:initial.src,duration:initial.duration,seekSeconds:sought.time,labels});
 }
 const unique=new Set(result.measured.map(t=>t.src));assert.equal(unique.size,library.length,"Each selection uses a distinct full-length media asset");
});

await scenario("restrained-credits-name-real-creators-and-licenses",async(page,result)=>{
 await openMusic(page);const before=await geometry(page);await click(page,`${frame} [data-music-credits]`);
 await page.wait(`document.querySelector('${frame} [data-music-credits]').getAttribute('aria-expanded')==='true'`,"credits expanded");
 result.credits=await page.evaluate(`(()=>{const b=document.querySelector('${frame} [data-music-credits]'),panel=document.getElementById(b.getAttribute('aria-controls'));return{text:panel.innerText,links:Array.from(panel.querySelectorAll('a'),a=>({text:a.textContent,href:a.href})),scrollWidth:panel.scrollWidth,width:panel.clientWidth}})()`);
 for(const artist of["HoliznaCC0","Chris Zabriskie","Kevin MacLeod"])assert.ok(result.credits.text.includes(artist),`${artist} is credited by name`);
 assert.ok(result.credits.text.includes("CC0")&&result.credits.text.includes("Attribution 4.0"));
 assert.equal(result.credits.links.filter(l=>l.text==="Source").length,9);assert.equal(result.credits.links.filter(l=>l.href.includes("creativecommons.org/")).length,9);
 assert.ok(result.credits.links.some(l=>l.href.endsWith("/music/manifest.json")));
 assert.ok(result.credits.scrollWidth<=result.credits.width+1,"Credits do not overflow the existing content pane");
 assert.equal(mediaRequests(page).length,0,"Reading credits does not download music");
 await page.screenshot("after-music-credits",frame);await click(page,`${frame} button[aria-label="Close music credits"]`);
 assert.equal((await geometry(page)).footer.localHeight,before.footer.localHeight,"Credits do not move the playback footer");
});

await scenario("natural-ending-next-repeat-shuffle-and-volume",async(page,result)=>{
 await openMusic(page);const library=await tracks(page);await select(page,library[0].id);await playing(page);
 const firstSource=(await audioState(page)).src;
 // Seeking close to the ending saves wall time; the browser still emits its real media ended event.
 await page.evaluate(`${audioExpression}.currentTime=${audioExpression}.duration-1`);
 await page.wait(`window.__musicEvents.some(e=>e.name==='ended')`,"real ending",6000);
 await page.wait(`(()=>{const a=${audioExpression};const e=window.__musicEvents.find(e=>e.name==='ended');return a.currentSrc!==e.src&&!a.paused&&a.currentTime>.1})()`,"natural ending advances to another real source",12000);
 result.next=await audioState(page);
 await click(page,`${frame} button[aria-label="Previous track"]`);await page.wait(`${audioExpression}.currentSrc===${JSON.stringify(firstSource)}&&!${audioExpression}.paused`,"Previous restores preceding track");
 await click(page,`${frame} button[aria-label="Next track"]`);await page.wait(`${audioExpression}.currentSrc===${JSON.stringify(result.next.src)}&&!${audioExpression}.paused`,"Next restores following track");
 await click(page,`${frame} button[aria-label="Toggle repeat"]`);
 const repeated=(await audioState(page)).src;await page.evaluate(`${audioExpression}.currentTime=${audioExpression}.duration-1`);
 await page.wait(`window.__musicEvents.filter(e=>e.name==='ended').length>=2`,"repeat natural ending",6000);
 await page.wait(`${audioExpression}.currentSrc===${JSON.stringify(repeated)}&&!${audioExpression}.paused&&${audioExpression}.currentTime<3`,"repeat restarts current track",8000);
 await click(page,`${frame} button[aria-label="Toggle repeat"]`);await click(page,`${frame} button[aria-label="Toggle shuffle"]`);
 const before=(await audioState(page)).src;await click(page,`${frame} button[aria-label="Next track"]`);await playing(page);
 assert.notEqual((await audioState(page)).src,before,"Shuffle chooses another track");
 await setRange(page,"Volume",25);const volume=(await audioState(page)).volume;assert.ok(volume>=.24&&volume<=.26,"Keyboard volume reaches actual media element");
 result.volume=volume;result.events=await page.evaluate(`window.__musicEvents.filter(e=>e.name==='ended')`);
});

await scenario("pause-minimize-close-and-reopen-lifecycle",async(page,result)=>{
 await openMusic(page);const library=await tracks(page);await select(page,library[0].id);await playing(page);
 await pause(page);const paused=(await audioState(page)).time;await sleep(400);assert.ok(Math.abs((await audioState(page)).time-paused)<.05,"Pause freezes elapsed time");
 await click(page,`${frame} button[aria-label="Play"]`);await playing(page);const oldTime=(await audioState(page)).time;
 await click(page,`${frame} button[aria-label="Minimize"]`);await sleep(750);const minimized=await audioState(page);
 assert.equal(minimized.paused,false,"Minimizing retains playback");assert.ok(minimized.time>oldTime,"Minimized track progresses");
 await click(page,'[data-dock-app="music"]');await point(page,`${frame} button[aria-label="Close"]`);
 await page.evaluate(`window.__closedMusicAudio=${audioExpression};void 0`);await click(page,`${frame} button[aria-label="Close"]`);
 result.immediateClose=await page.evaluate(`({paused:window.__closedMusicAudio.paused,source:window.__closedMusicAudio.getAttribute('src')})`);
 assert.equal(result.immediateClose.paused,true,"Close stops playback immediately before its exit animation");
 await page.wait(`!document.querySelector('${frame}')`,"Music closed");
 result.closed=await page.evaluate(`({paused:window.__closedMusicAudio.paused,source:window.__closedMusicAudio.getAttribute('src'),connected:window.__closedMusicAudio.isConnected,time:window.__closedMusicAudio.currentTime})`);
 assert.equal(result.closed.paused,true);assert.equal(result.closed.source,null,"Closing removes the source and releases resources");
 await openMusic(page);const reopened=await audioState(page);assert.equal(reopened.paused,true,"Reopening does not autoplay");
 assert.equal(await page.evaluate("document.querySelectorAll('audio').length"),1,"Reopening has one player");
 assert.equal(await page.evaluate(`window.__closedMusicAudio===${audioExpression}`),false,"Closed media element is not retained as a duplicate player");
 result.minimized=minimized;result.reopened=reopened;
});

await scenario("pause-during-loading-cancels-pending-playback",async(page,result)=>{
 await openMusic(page);const library=await tracks(page);await page.send("Fetch.enable",{patterns:[{urlPattern:"*.mp3*",requestStage:"Response"}]});
 await select(page,library[0].id);const held=await until(()=>page.paused.shift(),"audio response held during loading");
 await click(page,`${frame} button[aria-label="Pause"]`);assert.equal((await audioState(page)).paused,true);
 try{await page.send("Fetch.continueResponse",{requestId:held.requestId});}catch{}
 await page.send("Fetch.disable");await sleep(700);
 result.paused=await audioState(page);assert.equal(result.paused.paused,true,"Late buffering completion must respect explicit Pause");
 assert.ok(await page.evaluate(`!!document.querySelector('${frame} button[aria-label="Play"]')`));
 await click(page,`${frame} button[aria-label="Play"]`);await playing(page,"Play after canceled pending playback");
});

await scenario("saved-position-survives-reopen-and-pre-metadata-timeout",async(page,result)=>{
 await openMusic(page);const library=await tracks(page);
 await page.send("Network.setCacheDisabled",{cacheDisabled:true});
 await page.send("Fetch.enable",{patterns:[{urlPattern:"*.mp3*",requestStage:"Response"}]});await select(page,library[0].id);
 const initial=await until(()=>page.paused.shift(),"first media response for no-store");
 await page.send("Fetch.continueResponse",{requestId:initial.requestId,responseCode:initial.responseStatusCode,responseHeaders:[...initial.responseHeaders.filter(h=>!['cache-control','expires'].includes(h.name.toLowerCase())),{name:"Cache-Control",value:"no-store"}]});await page.send("Fetch.disable");
 await playing(page);await seekPercent(page,75);await page.wait(`${audioExpression}.currentTime>120`,"saved position beyond two minutes");await pause(page);
 const saved=(await audioState(page)).time;await click(page,`${frame} button[aria-label="Close"]`);await page.wait(`!document.querySelector('${frame}')`,"Music closed with position");await openMusic(page);
 result.savedTime=saved;result.reopened=await audioState(page);assert.equal(result.reopened.source,null);assert.equal(result.reopened.paused,true);
 await page.send("Network.clearBrowserCache");await page.send("Fetch.enable",{patterns:[{urlPattern:"*.mp3*",requestStage:"Request"}]});await page.evaluate("window.__musicTimeoutFast=true");
 await click(page,`${frame} button[aria-label="Play"]`);const held=await until(()=>page.paused.shift(),"resumed audio held before metadata");
 await page.wait(`!!document.querySelector('${frame} [role="alert"]')`,"pending saved position timeout",5000);
 result.timeoutElapsed=await page.evaluate(`document.querySelector('${frame} [data-music-elapsed]').textContent`);
 const seconds=result.timeoutElapsed.split(":").map(Number);assert.ok(Math.abs(seconds[0]*60+seconds[1]-saved)<1.1,"A metadata timeout preserves the saved position");
 try{await page.send("Fetch.continueResponse",{requestId:held.requestId});}catch{}
 await page.send("Fetch.disable");await page.evaluate("window.__musicTimeoutFast=false");await click(page,`${frame} button[aria-label="Retry playback"]`);
 await page.wait(`${audioExpression}.currentTime>${saved-1}&&!${audioExpression}.paused&&${audioExpression}.readyState>=2`,"Retry resumes the saved position",15000);result.recovered=await audioState(page);
},{init:`(()=>{const original=window.setTimeout;window.__musicTimeoutFast=false;window.setTimeout=function(callback,delay,...args){return original.call(this,callback,window.__musicTimeoutFast&&delay===12000?800:delay,...args)}})();`});

await scenario("menu-bar-close-stops-playback-immediately",async(page,result)=>{
 await openMusic(page);const library=await tracks(page);await select(page,library[0].id);await playing(page);
 await page.evaluate(`window.__closedMusicAudio=${audioExpression};void 0`);await menuBar(page,"File");await buttonText(page,"Close Window");
 result.closed=await page.evaluate(`({paused:window.__closedMusicAudio.paused,source:window.__closedMusicAudio.getAttribute('src')})`);
 assert.equal(result.closed.paused,true);assert.equal(result.closed.source,null,"Menu-bar Close releases the selected media source immediately");
 await page.wait(`!document.querySelector('${frame}')`,"Menu-bar close removes Music");
 await openMusic(page);await click(page,`${frame} button[aria-label="Play"]`);await playing(page);
 await page.evaluate(`window.__closedMusicAudio=${audioExpression};void 0`);await click(page,'[data-dock-app="finder"]');await page.wait(`!!document.querySelector('[data-window-frame="finder-desktop"]')`,"another app opens while Music plays");
 await menuBar(page,"");await buttonText(page,"Close All Windows");
 result.closeAll=await page.evaluate(`({paused:window.__closedMusicAudio.paused,source:window.__closedMusicAudio.getAttribute('src')})`);assert.equal(result.closeAll.paused,true);assert.equal(result.closeAll.source,null);
 await page.wait(`!document.querySelector('[data-window-frame]')`,"Close All Windows removes all mounted apps");
});

await scenario("rapid-track-switches-keep-latest-choice",async(page,result)=>{
 await openMusic(page);const library=await tracks(page);await page.send("Fetch.enable",{patterns:[{urlPattern:"*.mp3*",requestStage:"Response"},{urlPattern:"*.m4a*",requestStage:"Response"}]});
 await select(page,library[0].id);await until(()=>page.paused.length,"first response held");const held=page.paused.shift();
 // Hold only the first source; other selections can finish before its late response.
 await page.send("Fetch.enable",{patterns:[{urlPattern:held.request.url,requestStage:"Response"}]});
 for(const track of library.slice(1))await select(page,track.id);
 const finalId=library.at(-1).id;await page.wait(`document.querySelector('${frame} [data-music-current]')?.dataset.musicCurrent===${JSON.stringify(finalId)}||document.querySelector('${frame}').dataset.musicCurrent===${JSON.stringify(finalId)}`,"latest selected track");
 result.audio=await playing(page);
 // Changing src may cancel the old request before it is released, which is also correct cancellation.
 try{await page.send("Fetch.continueResponse",{requestId:held.requestId});}catch{}
 await page.send("Fetch.disable");await sleep(500);
 const current=await audioState(page);assert.equal(current.src,result.audio.src,"Late response cannot replace the latest source");
 assert.equal(await page.evaluate("document.querySelectorAll('audio').length"),1);
 result.requests=mediaRequests(page);
});

await scenario("blocked-audio-reports-error-and-recovers",async(page,result)=>{
 await openMusic(page);const library=await tracks(page);await page.send("Network.setBlockedURLs",{urls:["*.mp3*","*.m4a*","*.ogg*"]});
 await select(page,library[0].id);await page.wait(`!!document.querySelector('${frame} [role="alert"]')`,"visible failed-audio state",15000);
 result.message=await page.evaluate(`document.querySelector('${frame} [role="alert"]').innerText`);
 assert.equal((await audioState(page)).paused,true);
 await page.send("Network.setBlockedURLs",{urls:[]});await click(page,`${frame} button[aria-label="Retry playback"]`);await playing(page,"same track retries after blocked media");
 await page.wait(`!document.querySelector('${frame} [role="alert"]')`,"old audio error clears");
 result.recovered=await audioState(page);
});

await scenario("unsupported-audio-fails-without-endless-loading",async(page,result)=>{
 await openMusic(page);await page.send("Fetch.enable",{patterns:[{urlPattern:"*.mp3*",requestStage:"Request"},{urlPattern:"*.m4a*",requestStage:"Request"}]});
 const library=await tracks(page);await select(page,library[0].id);
 const request=await until(()=>page.paused.shift(),"audio request for invalid body");
 await page.send("Fetch.fulfillRequest",{requestId:request.requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"audio/mpeg"}],body:Buffer.from("not a valid playable audio file").toString("base64")});
 await page.wait(`!!document.querySelector('${frame} [role="alert"]')`,"invalid media visible error",15000);
 result.message=await page.evaluate(`document.querySelector('${frame} [role="alert"]').innerText`);
 assert.equal((await audioState(page)).paused,true);assert.ok((await audioState(page)).error>=3,"Actual browser decoder rejected the invalid response");
 await page.send("Fetch.disable");await select(page,library[1].id);await playing(page,"decoder failure can recover on next track");
});

await scenario("rejected-play-promise-needs-intent-and-recovers",async(page,result)=>{
 await openMusic(page);const library=await tracks(page);await select(page,library[0].id);
 await page.wait(`!!document.querySelector('${frame} [role="alert"]')`,"NotAllowedError visible",10000);
 result.message=await page.evaluate(`document.querySelector('${frame} [role="alert"]').innerText`);assert.match(result.message,/play|click|tap|permission|allow/i);
 assert.equal((await audioState(page)).paused,true);await click(page,`${frame} button[aria-label="Play"]`);await playing(page,"subsequent user play recovers");
 result.playAttempts=await page.evaluate("window.__musicPlayAttempts");assert.ok(result.playAttempts>=2);
},{init:`(()=>{const original=HTMLMediaElement.prototype.play;window.__musicPlayAttempts=0;HTMLMediaElement.prototype.play=function(){window.__musicPlayAttempts++;if(window.__musicPlayAttempts===1)return Promise.reject(new DOMException('Playback requires a user gesture.','NotAllowedError'));return original.call(this)}})();`});

await scenario("browser-autoplay-policy-is-enforced",async(page,result)=>{
 // A separate probe runs before any trusted page interaction. It is not application autoplay.
 result.policy=await page.evaluate(`(async()=>{const a=new Audio('/music/roof-tops.mp3');a.preload='none';try{await a.play();return{allowed:true}}catch(error){return{allowed:false,name:error.name,message:error.message}}finally{a.pause();a.removeAttribute('src');a.load()}})()`);
 assert.equal(result.policy.allowed,false);assert.equal(result.policy.name,"NotAllowedError","Chrome's real autoplay policy is active");
 await openMusic(page);const library=await tracks(page);await select(page,library[0].id);await playing(page,"trusted track click permits playback");
});

await scenario("slow-network-buffering-recovers",async(page,result)=>{
 await openMusic(page);await page.send("Network.emulateNetworkConditions",{offline:false,latency:200,downloadThroughput:18000,uploadThroughput:100000});
 const library=await tracks(page);await select(page,library[0].id);await playing(page,"slow first audio start");
 await page.evaluate("window.__bufferSeekAt=performance.now()");await seekPercent(page,75);await page.wait(`window.__musicEvents.some(e=>e.name==='waiting'&&e.at>=window.__bufferSeekAt)`,"natural media buffering event after seek",12000);
 await page.wait(`!!document.querySelector('${frame} [data-music-status="buffering"]')`,"visible buffering feedback",3000);
 result.buffered=await page.evaluate(`window.__musicEvents.filter(e=>e.name==='waiting'&&e.at>=window.__bufferSeekAt)`);
 await page.send("Network.emulateNetworkConditions",{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await page.wait(`${audioExpression}.currentTime>120&&!${audioExpression}.paused&&${audioExpression}.readyState>=3`,"buffering recovers after connection resumes",30000);
 result.recovered=await audioState(page);
});
}

await mkdir(output,{recursive:true});await writeFile(new URL(`${process.env.MUSIC_REPORT_NAME??`${phase}-browser-results`}.json`,output),JSON.stringify(report,null,2)+"\n");
socket.close();if(failures)process.exitCode=1;
