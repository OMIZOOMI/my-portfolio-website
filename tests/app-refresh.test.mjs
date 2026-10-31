import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
function load(relative, stubs = {}, cache = new Map()) {
  const filename = resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} }; cache.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  runInThisContext(`(function(module,exports,require){${output}\n})`, {filename})(loaded,loaded.exports, specifier => {
    if (specifier in stubs) return stubs[specifier];
    if (specifier.endsWith('.css')) return {};
    if (specifier.startsWith('.')) return load(resolve(dirname(filename),specifier+'.ts'),stubs,cache);
    return require(specifier);
  });
  return loaded.exports;
}

const {keyboardClickSamples,createKeyboardClickAudio} = load('src/components/webcam/keyboardClickAudio.ts');
test('recorded keyboard tap is short, quiet, varied and ends at zero',()=>{
  for(const rate of [44100,48000]) {
    const samples=keyboardClickSamples(rate,0);
    assert.ok(samples.length/rate>=.030&&samples.length/rate<=.110);
    assert.ok(samples.every(Number.isFinite));
    assert.ok(Math.max(...samples.map(Math.abs))<=.481);
    const energy=samples.reduce((total,value)=>total+value*value,0);
    const tail=samples.slice(-Math.ceil(rate*.004));
    assert.ok(tail.reduce((total,value)=>total+value*value,0)<energy*.02,'the click decays to silence');
    assert.equal(Math.abs(samples[0]),0); assert.equal(Math.abs(samples.at(-1)),0);
    assert.notDeepEqual(samples,keyboardClickSamples(rate,1));
    assert.notDeepEqual(samples,keyboardClickSamples(rate,0,'space'));
    assert.ok(Math.max(...keyboardClickSamples(rate,0,'default','release').map(Math.abs))<.15,'return is much quieter than press');
  }
});
function soundContext(state='running') {
  const voices=[], buffers=[]; let finishResume;
  const context={state,sampleRate:44100,destination:{},closed:0,
    createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),
    createBuffer:()=>{const buffer={copyToChannel(){}};buffers.push(buffer);return buffer;},
    createBufferSource:()=>{const voice={onended:null,started:0,stopped:0,connect(){},disconnect(){},start(){this.started++;},stop(){this.stopped++;}};voices.push(voice);return voice;},
    resume:()=>new Promise(resolve=>{finishResume=()=>{context.state='running';resolve();};}),
    close:()=>{context.closed++;context.state='closed';return Promise.resolve();},
  };
  return {context,voices,buffers,resume:()=>finishResume?.()};
}
test('sound starts lazily, caps voices, reuses buffers and releases its context',()=>{
  const fake=soundContext();let created=0;
  const engine=createKeyboardClickAudio(()=>{created++;return fake.context;});
  assert.equal(created,0);
  for(let i=0;i<40;i++)engine.play(i%2?'Space':'KeyA');
  assert.equal(created,1);assert.ok(fake.buffers.length<=12);
  assert.equal(fake.voices.filter(v=>!v.stopped).length,8);
  engine.dispose();assert.equal(fake.context.closed,1);assert.ok(fake.voices.every(v=>v.stopped));
  engine.play('KeyA');assert.equal(fake.voices.length,40);
});
test('a closed sound engine ignores late unlock; unavailable audio never breaks typing',async()=>{
  const fake=soundContext('suspended'),engine=createKeyboardClickAudio(()=>fake.context);
  engine.play('KeyA');engine.dispose();fake.resume();await Promise.resolve();
  assert.equal(fake.voices.length,0);
  assert.doesNotThrow(()=>createKeyboardClickAudio(()=>null).play('KeyA'));
  assert.doesNotThrow(()=>createKeyboardClickAudio(()=>{throw Error('blocked');}).play('KeyA'));
});
test('release never initializes audio and both phases share the same bounded engine',()=>{
  const fake=soundContext();let created=0;
  const engine=createKeyboardClickAudio(()=>{created++;return fake.context;});
  engine.release('KeyA');assert.equal(created,0);
  for(const code of ['KeyA','KeyC','ShiftLeft','ControlLeft','MetaLeft','Space','Enter','Backspace']){engine.play(code);engine.release(code);}
  assert.equal(created,1);assert.ok(fake.buffers.length<=12);assert.equal(fake.voices.filter(v=>!v.stopped).length,8);
  engine.dispose();engine.release('KeyA');assert.equal(fake.context.closed,1);
});
test('all recorded Cream samples match their inline PCM, source manifest and accompanying license',()=>{
  const {KEYBOARD_SOUND_PCM}=load('src/components/webcam/keyboardPressSample.ts');
  const manifest=JSON.parse(readFileSync(resolve(root,'public/sounds/keyboard/manifest.json'),'utf8'));
  assert.equal(manifest.license,'MIT');assert.equal(manifest.assets.length,12);
  for(const entry of manifest.assets){
    const wav=readFileSync(resolve(root,'public'+entry.asset));
    assert.equal(wav.length,entry.bytes);assert.equal(createHash('sha256').update(wav).digest('hex'),entry.sha256);
    assert.deepEqual(wav.subarray(44),Buffer.from(KEYBOARD_SOUND_PCM[entry.role][entry.phase][entry.variant],'base64'));
  }
  assert.match(readFileSync(resolve(root,'public/sounds/keyboard/LICENSE.txt'),'utf8'),/Copyright \(c\) Thomas Lai/);
});
test('keyboard sound defaults on and remembers only its own preference',()=>{
  const storage=new Map(),writes=[];
  globalThis.window={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{storage.set(k,v);writes.push(k);}}};
  try {
    const {useWorkspaceStore:store}=load('src/components/workspace/useWorkspaceStore.ts');
    assert.equal(store.getState().keyboardSounds,true);store.getState().hydrate();
    writes.length=0;store.getState().setKeyboardSounds(false);
    assert.deepEqual(writes,['portfolio-keyboard-sounds']);assert.equal(storage.get('portfolio-keyboard-sounds'),'off');
    const {useWorkspaceStore:reloaded}=load('src/components/workspace/useWorkspaceStore.ts');
    reloaded.getState().hydrate();assert.equal(reloaded.getState().keyboardSounds,false);
  } finally {delete globalThis.window;}
});

const {useNotesStore:notes}=load('src/components/desktop/NotesApp.tsx',{
  '../window-manager/useSystemStore':{}, '../window-manager/desktopCoordinates':{},
});
const resetNotes=()=>notes.setState(notes.getInitialState(),true);
test('rapid note creation produces distinct IDs and deletion of another note keeps the active editor',()=>{
  resetNotes();for(let i=0;i<30;i++)notes.getState().addNote();
  assert.equal(new Set(notes.getState().notes.map(n=>n.id)).size,31);
  const active=notes.getState().activeNoteId;notes.getState().deleteNote('1');
  assert.equal(notes.getState().activeNoteId,active);assert.equal(notes.getState().notes.length,30);
});
test('deleting an edited note and undo restores exact rich text and stable identity once',()=>{
  resetNotes();notes.getState().addNote();const id=notes.getState().activeNoteId;
  const html='<p>My <strong>edited</strong> note</p>';notes.getState().updateNoteContent(id,html);
  notes.getState().deleteActiveNote();assert.equal(notes.getState().activeNoteId,'1');
  notes.getState().undoDelete();notes.getState().undoDelete();
  assert.equal(notes.getState().activeNoteId,id);
  assert.equal(notes.getState().notes.filter(n=>n.id===id).length,1);
  assert.equal(notes.getState().notes[0].contentHtml,html);
});
test('the last note can be deleted, undone, or replaced with a new blank note',()=>{
  resetNotes();notes.getState().deleteActiveNote();
  assert.equal(notes.getState().activeNoteId,null);assert.deepEqual(notes.getState().notes,[]);
  notes.getState().deleteNote('missing');notes.getState().undoDelete();assert.equal(notes.getState().notes.length,1);
  notes.getState().deleteActiveNote();notes.getState().addNote();
  assert.equal(notes.getState().notes[0].contentHtml,'');assert.notEqual(notes.getState().activeNoteId,'1');
});

const {MUSIC_TRACKS,MUSIC_PLAYLISTS,musicTracksForView}=load('src/data/music.ts');
test('nine complete tracks, three per mood, distinct top four and searchable Browse',()=>{
  assert.equal(MUSIC_TRACKS.length,9);assert.equal(new Set(MUSIC_TRACKS.map(t=>t.id)).size,9);
  assert.equal(musicTracksForView('listen').length,4);assert.equal(musicTracksForView('browse').length,9);
  for(const mood of MUSIC_PLAYLISTS)assert.equal(musicTracksForView(mood.id).length,3);
  assert.deepEqual(musicTracksForView('browse','NIGHT venice').map(t=>t.id),['night-in-venice']);
  assert.equal(musicTracksForView('browse','saxophone').length,3);
  assert.equal(musicTracksForView('browse','no such recording').length,0);
  assert.ok(MUSIC_TRACKS.every(t=>t.durationSeconds>=180&&t.credit.includes(t.artist)&&/^https:/.test(t.sourceUrl)));
});
test('served audio matches the duration/source/license manifest and measured file sizes',()=>{
  const manifest=JSON.parse(readFileSync(resolve(root,'public/music/manifest.json'),'utf8'));
  for(const track of MUSIC_TRACKS){
    const entry=manifest.tracks.find(t=>t.id===track.id);assert.ok(entry);
    const bytes=readFileSync(resolve(root,'public'+track.src));
    assert.equal(bytes.length,entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    assert.equal(entry.durationSeconds,track.durationSeconds);assert.equal(entry.sourceUrl,track.sourceUrl);
    assert.equal(entry.license,track.license);
  }
});
