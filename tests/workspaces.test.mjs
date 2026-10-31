import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { WORKSPACES, DEFAULT_WORKSPACE, getWorkspace, parseWorkspacePreference, serializeWorkspacePreference } from '../src/data/workspaces.ts';
import { EMPTY_WORKSPACE, workspaceTransition as act } from '../src/components/workspace/workspaceTransition.ts';

const select=(s,id,key)=>act(s,{type:'select',selection:{id,key}});
const ready=(s,key,animate=true)=>act(s,{type:'ready',key,animate});
const finish=(s,key)=>act(s,{type:'finish',key});
const active=s=>s.layers.find(l=>l.key===s.active)?.id;
const beach=()=>ready(select(EMPTY_WORKSPACE,'beach',1),1);

test('catalog contains two HD live views, three non-landscape PNGs and six zero-request solid colors',async()=>{
 assert.equal(WORKSPACES.length,11);
 assert.equal(WORKSPACES.filter(x=>x.kind==='motion').length,2);
 assert.equal(WORKSPACES.filter(x=>x.kind==='still').length,3);
 assert.equal(WORKSPACES.filter(x=>x.kind==='color').length,6);
 assert.equal(new Set(WORKSPACES.map(w=>w.id)).size,WORKSPACES.length);
 for(const w of WORKSPACES){
  if(w.kind==='color'){
   assert.match(w.color,/^#[0-9a-f]{6}$/i);
   assert.equal(w.poster,undefined);assert.equal(w.thumbnail,undefined);assert.equal(w.video,undefined);
   continue;
  }
  for(const [url,thumb]of [[w.poster,false],[w.thumbnail,true]]){
   const file=fileURLToPath(new URL('../public'+url,import.meta.url)),m=await sharp(file).metadata();
   assert.equal(m.format,thumb||w.kind==='motion'?'webp':'png');
   assert.ok((await sharp(file).raw().toBuffer()).length>0);
   assert.ok((await stat(file)).size<(thumb?30000:6000000));
   if(thumb)assert.deepEqual([m.width,m.height],[160,100]);
   else {assert.ok(m.width>=1600&&m.height>=900);assert.ok(Math.abs(m.width/m.height-16/9)<.002);}
  }
  if(w.video){
   const bytes=await readFile(new URL('../public'+w.video,import.meta.url));
   assert.ok(bytes.includes(Buffer.from('ftyp')));assert.ok(bytes.includes(Buffer.from('avc1')));
   assert.ok(!bytes.includes(Buffer.from('soun')),'no audio handler/track');
   assert.ok(bytes.length<30000000,'quality-first HD encode, bounded below 30 MB');
   const tkhd=bytes.indexOf(Buffer.from('tkhd')),size=bytes.readUInt32BE(tkhd-4),end=tkhd-4+size;
   assert.deepEqual([bytes.readUInt32BE(end-8)/65536,bytes.readUInt32BE(end-4)/65536],[1920,1080]);
  }
 }
});

test('corrupt/unknown preferences use Beach; a saved location is independent of theme',()=>{
 for(const raw of [null,'','{','null','[]','99','{"state":{"environment":"nope"}}'])assert.equal(parseWorkspacePreference(raw),DEFAULT_WORKSPACE);
 for(const {id} of WORKSPACES)assert.equal(parseWorkspacePreference(JSON.stringify({state:{environment:id,theme:'light',wallpaper:'dunes'}})),id);
 assert.equal(getWorkspace(null).id,'beach');
});

test('serialization saves only a version and environment, never drag/media/window/pause state',()=>{
 const encoded=serializeWorkspacePreference('forest');assert.deepEqual(JSON.parse(encoded),{version:1,state:{environment:'forest'}});
 assert.equal(parseWorkspacePreference(encoded),'forest');
});

test('the first usable destination arrives without a travel animation',()=>{
 const s=beach();assert.equal(active(s),'beach');assert.equal(s.phase,'idle');assert.equal(s.layers.length,1);
});

test('the outgoing location remains active until the new media and travel finish',()=>{
 let s=select(beach(),'forest',2);assert.equal(active(s),'beach');assert.equal(s.phase,'preparing');
 s=ready(s,2);assert.equal(active(s),'beach');assert.equal(s.phase,'travelling');
 s=finish(s,2);assert.equal(active(s),'forest');assert.equal(s.layers.length,1);
});

test('late readiness and failures from superseded requests cannot change the latest selection',()=>{
 let s=select(select(beach(),'forest',2),'studio',3);
 const current=s;s=ready(s,2);assert.equal(s,current);
 s=act(s,{type:'failed',key:2,message:'late error'});assert.equal(s,current);
 s=finish(ready(s,3),3);assert.equal(active(s),'studio');
});

test('rapid choices during travel form a bounded latest-only queue',()=>{
 let s=ready(select(beach(),'forest',2),2);
 s=select(s,'beach',3);s=select(s,'studio',4);
 assert.equal(s.layers.length,2);assert.equal(s.queued.id,'studio');
 s=finish(s,2);assert.equal(active(s),'forest');assert.equal(s.incoming,4);assert.equal(s.layers.length,2);
 s=finish(ready(s,4),4);assert.equal(active(s),'studio');assert.equal(s.layers.length,1);assert.equal(s.queued,null);
});

test('failure preserves the old scene and an actionable failed destination',()=>{
 let s=select(beach(),'forest',2);s=act(s,{type:'failed',key:2,message:'try again'});
 assert.equal(active(s),'beach');assert.equal(s.phase,'idle');assert.equal(s.error.id,'forest');assert.equal(s.layers.length,1);
 s=finish(ready(select(s,'forest',3),3),3);assert.equal(active(s),'forest');assert.equal(s.error,null);
});

test('selecting the current location cancels a pending destination',()=>{
 const s=select(select(beach(),'forest',2),'beach',3);assert.equal(active(s),'beach');assert.equal(s.phase,'idle');assert.equal(s.layers.length,1);
});

test('reduced motion settles immediately and stale completion cannot disturb it',()=>{
 let s=ready(select(beach(),'forest',2),2,false);assert.equal(active(s),'forest');assert.equal(s.phase,'idle');
 const saved=s;s=finish(s,1);assert.equal(s,saved);
});

test('repeated changes and stale motion callbacks retain no retired layers',()=>{
 let s=beach();for(let key=2;key<50;key++){s=select(s,key%2?'beach':'forest',key);s=ready(s,key);s=finish(s,key);assert.equal(s.layers.length,1);}
 const saved=s;s=act(s,{type:'motion',key:1,status:'playing'});assert.equal(s,saved);
});

test('color and PNG selections use the same latest-only readiness path and persist independently',()=>{
 let s=select(beach(),'paper',2);s=select(s,'chalk',3);
 s=ready(s,2);assert.equal(active(s),'beach');
 s=finish(ready(s,3),3);assert.equal(active(s),'chalk');assert.equal(s.layers.length,1);
 assert.equal(parseWorkspacePreference(serializeWorkspacePreference('chalk')),'chalk');
 s=ready(select(s,'slate',4),4,false);assert.equal(active(s),'slate');assert.equal(s.phase,'idle');
});
