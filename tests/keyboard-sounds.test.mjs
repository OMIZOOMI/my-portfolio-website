import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Controlled event fixtures, not browser/hardware or listening evidence.
function harness() {
  const listeners = new Set(), keyups = new Set(), blurs = new Set(), visibility = new Set(), plays = [], releases = [], engines = [];
  const doc = { hidden: false, addEventListener(name, callback) {assert.equal(name,'visibilitychange');visibility.add(callback);},removeEventListener(_name,callback){visibility.delete(callback);} };
  const events = {keydown:listeners,keyup:keyups,blur:blurs};
  let effect;
  const loaded = { exports: {} };
  const output=ts.transpileModule(readFileSync(new URL('../src/components/webcam/useKeyboardSounds.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  runInNewContext(`(function(module,exports,require){${output}\n})(module,module.exports,require)`,{
    module:loaded,document:doc,
    window:{addEventListener(name,callback){assert.ok(events[name]);events[name].add(callback);},removeEventListener(name,callback){events[name].delete(callback);}},
    require(name){
      if(name==='react')return {useEffect(setup,deps){if(!effect||deps[0]!==effect.enabled){effect?.cleanup?.();effect={enabled:deps[0],cleanup:setup()};}}};
      if(name==='./keyboardLayout')return {KEY_CODE_TO_INDEX:new Map(['KeyA','KeyC','ShiftLeft','ControlLeft','MetaLeft','AltRight','Enter'].map((code,i)=>[code,i]))};
      if(name==='./keyboardClickAudio')return {createKeyboardClickAudio(){const engine={disposed:0,play:code=>plays.push(code),release:code=>releases.push(code),dispose(){this.disposed++;}};engines.push(engine);return engine;}};
      throw Error(name);
    },
  });
  return {plays,releases,engines,listeners,keyups,blurs,visibility,doc,render:enabled=>loaded.exports.useKeyboardSounds(enabled),
    key(patch={}){for(const callback of listeners)callback({isTrusted:true,repeat:false,metaKey:false,ctrlKey:false,altKey:false,code:'KeyA',...patch});},
    up(patch={}){for(const callback of keyups)callback({isTrusted:true,code:'KeyA',...patch});},
    blur(){for(const callback of blurs)callback();},
    hide(){doc.hidden=true;for(const callback of visibility)callback();},
    unmount(){effect?.cleanup?.();},
  };
}
test('each physical key press sounds once, including modifiers and shortcut letters',()=>{
  const h=harness();h.render(true);assert.deepEqual(h.plays,[]);
  h.key();h.key({code:'ShiftLeft'});h.key({code:'ControlLeft',ctrlKey:true});h.key({code:'KeyC',ctrlKey:true});h.key({code:'MetaLeft',metaKey:true});h.key({code:'AltRight',altKey:true});h.key({code:'Enter'});
  assert.deepEqual(h.plays,['KeyA','ShiftLeft','ControlLeft','KeyC','MetaLeft','AltRight','Enter']);
  h.unmount();
});
test('held-key repeats, synthetic events, hidden pages and non-model keys remain quiet',()=>{
  const h=harness();h.render(true);h.key({repeat:true});h.key({isTrusted:false});h.key({code:'Unidentified'});
  h.doc.hidden=true;h.key();assert.deepEqual(h.plays,[]);h.unmount();
});
test('switching off releases sound/listeners; reopening installs only one listener',()=>{
  const h=harness();h.render(false);assert.equal(h.engines.length,0);
  h.render(true);h.render(true);assert.equal(h.listeners.size,1);h.render(false);
  h.key();assert.deepEqual(h.plays,[]);assert.equal(h.engines[0].disposed,1);assert.equal(h.listeners.size,0);
  h.render(true);h.key();assert.deepEqual(h.plays,['KeyA']);assert.equal(h.listeners.size,1);
  h.unmount();assert.equal(h.listeners.size,0);assert.equal(h.engines[1].disposed,1);
  assert.equal(h.keyups.size+h.blurs.size+h.visibility.size,0);
});
test('a quiet release follows only a real held key; repeated downs and stray ups do not double clicks',()=>{
  const h=harness();h.render(true);h.up();h.key();h.key();h.key({repeat:true});h.up({isTrusted:false});
  assert.deepEqual(h.plays,['KeyA']);assert.deepEqual(h.releases,[]);
  h.up();h.up();assert.deepEqual(h.releases,['KeyA']);h.key();h.up();
  assert.deepEqual(h.plays,['KeyA','KeyA']);assert.deepEqual(h.releases,['KeyA','KeyA']);h.unmount();
});
test('blur, hide and missing macOS Command keyups cannot leave a key stuck or play late returns',()=>{
  const h=harness();h.render(true);h.key();h.blur();h.up();assert.deepEqual(h.releases,[]);
  h.key();h.hide();h.up();h.doc.hidden=false;h.key();h.up();assert.deepEqual(h.releases,['KeyA']);
  h.key({code:'MetaLeft',metaKey:true});h.key({code:'KeyC',metaKey:true});h.up({code:'MetaLeft'});h.key({code:'KeyC'});
  assert.deepEqual(h.plays.slice(-3),['MetaLeft','KeyC','KeyC']);h.unmount();
});
