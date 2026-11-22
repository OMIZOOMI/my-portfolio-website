import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
const require=createRequire(import.meta.url);
function load(path,context={}){
 const loadedModule={exports:{}};
 const source=ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const localRequire=specifier=>specifier.startsWith(".")?load(join(dirname(path),specifier)+".ts",context):require(specifier);
 runInNewContext(`(function(module,exports,require){${source}\n})(module,module.exports,require)`,{module:loadedModule,require:localRequire,...context});return loadedModule.exports;
}
const {laptopProjectionMatrix,screenQuadMatrix}=load('components/webcam/screenViewGeometry.ts');
const {getProjectionViewportSize}=load('components/webcam/projectionViewportSize.ts');
test('projection sizing aligns CSS and display pixels at normal and Safari page zoom ratios',()=>{
 for(const ratio of [1,1.25,1.5,1.7000000476837158,1.8,2,2.2,2.5,2.625,3,4]) {
  for(const [width,height] of [[1694,953],[1693.9889,952.9926],[391,845],[1440,901]]) {
   const size=getProjectionViewportSize(width,height,ratio);
   for(const [axis,available] of [['width',width],['height',height]]) {
    assert.ok(size[axis]<=available&&available-size[axis]<40);
    assert.equal(size[axis]%2,0);
    assert.ok(Math.abs(size[axis]*ratio/2-Math.round(size[axis]*ratio/2))<0.0001);
   }
  }
 }
 assert.equal(JSON.stringify(getProjectionViewportSize(1694,953,1.7)),JSON.stringify({width:1680,height:940}));
});
test('projection sizing ignores hidden or invalid viewports and tolerates unavailable DPR',()=>{
 for(const dimensions of [[0,900],[1400,0],[-1,900],[NaN,900],[1400,Infinity]]) assert.equal(getProjectionViewportSize(...dimensions),null);
 for(const ratio of [0,-1,NaN,Infinity]) assert.equal(JSON.stringify(getProjectionViewportSize(1401,901,ratio)),JSON.stringify({width:1400,height:900}));
});
test('zoom homography reaches all four perspective corners, including a translated trapezoid',()=>{
 const corners=[{x:115,y:83},{x:928,y:92},{x:906,y:661},{x:133,y:645}];
 const matrix=screenQuadMatrix(1400,900,corners).slice(9,-1).split(',').map(Number);
 for(const [index,[x,y]] of [[0,0],[1400,0],[1400,900],[0,900]].entries()){
  const w=matrix[3]*x+matrix[7]*y+matrix[15];
  assert.ok(Math.abs((matrix[0]*x+matrix[4]*y+matrix[12])/w-corners[index].x)<1e-7);
  assert.ok(Math.abs((matrix[1]*x+matrix[5]*y+matrix[13])/w-corners[index].y)<1e-7);
 }
 assert.equal(screenQuadMatrix(0,900,corners),null);
 assert.equal(screenQuadMatrix(1400,NaN,corners),null);
});
test('a single projected plane preserves the calibrated laptop screen at the framed camera position',()=>{
 const viewport={width:1440,height:848};
 const camera=new PerspectiveCamera(32,viewport.width/viewport.height,.1,50);
 camera.position.set(0,2.17,2.6);camera.lookAt(0,.87,0);camera.updateMatrixWorld(true);
 const plane=new Matrix4().makeRotationX(-.355).setPosition(.0002,.09,-.19)
  .premultiply(new Matrix4().makeScale(6.9,6.9,6.9));
 const css=laptopProjectionMatrix(1400,900,1.78/1400*7.28*10/400,plane,camera,viewport);
 const transform=new Matrix4().fromArray(css.slice(9,-1).split(',').map(Number));
 const expected=[[319,36.5],[1122,36.5],[1108,545.5],[333,545.5]];
 for(const [index,[x,y]] of [[0,0],[1400,0],[1400,900],[0,900]].entries()){
  const projected=new Vector3(x,y,0).applyMatrix4(transform);
  assert.ok(Math.abs(projected.x-expected[index][0])<1);
  assert.ok(Math.abs(projected.y-expected[index][1])<1);
 }
});
test('readability preferences save an explicit default while live view and unrelated state stay temporary',()=>{
 const writes=[];const saved=JSON.stringify({interfaceScale:1.3,iconScale:1.4,screenView:true,windows:{private:'draft'}});
 const localStorage={getItem:()=>saved,setItem:(key,value)=>writes.push({key,value})};
 const {useDisplayStore:store,DISPLAY_STORAGE_KEY}=load('components/window-manager/useDisplayStore.ts',{window:{localStorage}});
  store.getState().hydrate();assert.equal(store.getState().interfaceScale,1.3);assert.equal(store.getState().iconScale,1.4);assert.equal(store.getState().screenView,true);
 const before=writes.length;store.getState().setScreenView(true);assert.equal(writes.length,before);
 store.getState().setInterfaceScale(1.45);const parsed=JSON.parse(writes.at(-1).value);
  assert.deepEqual(parsed,{interfaceScale:1.45,iconScale:1.4,defaultView:'screen'});assert.equal(writes.at(-1).key,DISPLAY_STORAGE_KEY);
 store.getState().setDefaultView('screen');assert.equal(store.getState().screenView,true);assert.equal(JSON.parse(writes.at(-1).value).defaultView,'screen');
 const savedWrites=writes.length;store.getState().setScreenView(false);assert.equal(writes.length,savedWrites);assert.equal(store.getState().defaultView,'screen');
 store.getState().setInterfaceScale(Infinity);store.getState().setIconScale(-5);assert.equal(store.getState().interfaceScale,1.45);assert.equal(store.getState().iconScale,1.4);
});
test('restricted or malformed readability storage still leaves usable defaults',()=>{
 const {parseDisplayPreferences, useDisplayStore:store}=load('components/window-manager/useDisplayStore.ts',{window:{localStorage:{getItem(){throw Error('restricted');},setItem(){throw Error('restricted');}}}});
  assert.deepEqual(JSON.parse(JSON.stringify(parseDisplayPreferences('{bad'))),{interfaceScale:1,iconScale:1,defaultView:'screen'});
 store.getState().hydrate();store.getState().setIconScale(1.2);assert.equal(store.getState().hydrated,true);assert.equal(store.getState().iconScale,1.2);
});
test('saved default view returns, while a tour preview cannot overwrite a saved or subsequent user choice',()=>{
 const writes=[];const localStorage={getItem:()=>JSON.stringify({defaultView:'screen',interfaceScale:1.15,iconScale:1.2}),setItem:(_,value)=>writes.push(JSON.parse(value))};
 const {useDisplayStore:store}=load('components/window-manager/useDisplayStore.ts',{window:{localStorage}});
 store.getState().hydrate();assert.equal(store.getState().screenView,true);assert.equal(writes.length,0);
 store.getState().previewScreenView(false);assert.equal(store.getState().screenView,false);
 store.getState().previewScreenView(true);store.getState().endViewPreview();assert.equal(store.getState().screenView,true);assert.equal(writes.length,0);
 store.getState().previewScreenView(false);store.getState().setScreenView(false);store.getState().endViewPreview();assert.equal(store.getState().screenView,false);assert.equal(writes.length,0);
 store.getState().setDefaultView('laptop');assert.equal(writes.at(-1).defaultView,'laptop');
 assert.deepEqual(Object.keys(writes.at(-1)).sort(),['defaultView','iconScale','interfaceScale']);
 store.getState().setDefaultView('bad');assert.equal(store.getState().defaultView,'laptop');
});
const {TERMINAL_PROJECTS,terminalResponse}=load('data/terminalProfile.ts');
test('project commands use distinct real repository links and preserve Veyra display naming',()=>{
 assert.equal(TERMINAL_PROJECTS.length,5);assert.equal(new Set(TERMINAL_PROJECTS.map(p=>p.repository)).size,5);
 const output=terminalResponse('PROJECTS');const links=output.filter(line=>line.href);
 for(const p of TERMINAL_PROJECTS)assert.ok(links.some(line=>line.href===p.repository));
 assert.equal(terminalResponse('project veyra')[0].text,'Veyra');assert.equal(terminalResponse('project veyra').at(-1).href,'https://github.com/OMIZOOMI/Cross-Exam');
 assert.equal(terminalResponse('projects skywatch').filter(line=>line.href).length,1);
 assert.match(terminalResponse('project task-api')[0].text,/Choose a project/);
 assert.doesNotMatch(output.map(line=>line.text).join(' '),/hardware.state/i);
});
test('unknown terminal input stays literal text; partial project names have no external execution',()=>{
 const input='<img src=x onerror=alert(1)>';
 assert.equal(terminalResponse(input)[0].text,`Command not found: ${input}. Try help.`);
 assert.ok(terminalResponse('project missing').every(line=>!line.href));
 for(const command of ['help','skills','about','experience','contact','github','pwd'])assert.ok(terminalResponse(command).length>0);
});
