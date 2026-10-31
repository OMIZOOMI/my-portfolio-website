import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL("../src/components/desktop/useSafariStore.ts", import.meta.url));
const modules = new Map();
function loadTypeScript(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loadedModule = { exports: {} };
  modules.set(filename, loadedModule);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const localRequire = specifier => specifier.startsWith(".") ? loadTypeScript(resolve(dirname(filename), `${specifier}.ts`)) : require(specifier);
  runInThisContext(`(function(module, exports, require) { ${compiled}\n})`, { filename })(loadedModule, loadedModule.exports, localRequire);
  return loadedModule.exports;
}
const { useSafariStore: store, selectSafariSession, currentSafariEntry, resolveSafariAddress, SAFARI_START_URL } = loadTypeScript(filename);
const state = () => store.getState();
const session = () => selectSafariSession(state());
const tab = (id = session().activeTabId) => session().tabs.find(item => item.id === id);
const page = id => currentSafariEntry(tab(id));
const A = "portfolio://project/edge-ai-hardware-state-detection";
const B = "portfolio://project/cloud-native-asset-management-api";
const C = "portfolio://project/3d-macos-web-portfolio";
beforeEach(() => store.setState(store.getInitialState(), true));

test("A and B keep independent URLs, histories, cursors and titles across repeated activation", () => {
 const a = session().activeTabId;
 state().navigate(A); state().navigate(B);
 const b = state().newTab();
 state().navigate(C); state().navigate(A);
 const aTab = tab(a), bTab = tab(b);
 for(let i=0;i<100;i++){state().activateTab(a);assert.equal(page().url,B);state().activateTab(b);assert.equal(page().url,A);}
 assert.equal(tab(a),aTab); assert.equal(tab(b),bTab);
 assert.deepEqual(tab(a).history.map(p=>p.url),[SAFARI_START_URL,A,B]);
 assert.deepEqual(tab(b).history.map(p=>p.url),[SAFARI_START_URL,C,A]);
 state().goBack(a);assert.equal(page(a).url,A);assert.equal(tab(a).historyIndex,1);assert.equal(tab(b),bTab);
 assert.equal(page(a).title,"Edge AI Hardware State Detection System");
 state().goBack(b);assert.equal(page(b).url,C);assert.equal(page(a).url,A);
 state().goForward(a);assert.equal(page(a).url,B);assert.equal(page(b).url,C);
 state().goForward(b);assert.equal(page(b).url,A);
});
test("activation never navigates and invalid IDs or repeated activation are no-ops",()=>{
 const original=state();state().activateTab('missing');state().activateTab(session().activeTabId);assert.equal(state(),original);
});
test("same-URL submission retains forward history; branching trims only that tab",()=>{
 const a=session().activeTabId;state().navigate(A);state().navigate(B);state().goBack();
 const original=tab(a).history;state().navigate(A);assert.equal(tab(a).history,original);
 const b=state().newTab(C);const other=tab(b);state().navigate(C,undefined,a);
 assert.deepEqual(tab(a).history.map(p=>p.url),[SAFARI_START_URL,A,C]);assert.equal(tab(b),other);
 state().goForward(a);assert.equal(page(a).url,C);
});
test("address drafts and reload update only the intended tab without growing history",()=>{
 const a=session().activeTabId,b=state().newTab();const originalB=tab(b);
 state().setAddress('example.com/draft',a);state().reload(a);
 assert.equal(tab(a).address,SAFARI_START_URL);assert.equal(tab(a).reloadNonce,1);assert.equal(tab(a).history.length,1);assert.equal(tab(b),originalB);
});
test("close active chooses its left neighbor, then right; close inactive preserves focus",()=>{
 const a=session().activeTabId,b=state().newTab(A),c=state().newTab(B);
 state().closeTab(c);assert.equal(session().activeTabId,b);
 const d=state().newTab(C);state().activateTab(a);state().closeTab(b);assert.equal(session().activeTabId,a);
 state().closeTab(a);assert.equal(session().activeTabId,d);
 state().closeTab(d);assert.equal(session().tabs.length,1);assert.notEqual(session().activeTabId,d);assert.equal(page().url,SAFARI_START_URL);
 state().navigate(A);assert.equal(page().url,A);
});
test("stale close, navigate, draft or reload cannot reset the final tab or mutate its replacement",()=>{
 const old=session().activeTabId;state().closeTab(old);const snapshot=state();
 state().closeTab(old);state().setAddress('stale',old);state().reload(old);assert.equal(state().navigate(A,undefined,old),false);assert.equal(state(),snapshot);
});
test("history entries retain separate scroll/disclosure state through back and forward",()=>{
 const a=session().activeTabId,start=page();state().saveView(a,start.id,{scrollTop:355,expandedDetails:['project-one']});
 state().navigate(A);const detail=page();state().saveView(a,detail.id,{scrollTop:89});state().goBack();
 assert.equal(page().scrollTop,355);assert.deepEqual(page().expandedDetails,['project-one']);state().goForward();assert.equal(page().scrollTop,89);
});
test("late view saves target only their own retained entry; stale feedback cannot overwrite a newer page",()=>{
 const a=session().activeTabId,old=page().id;state().navigate(A);const snapshot=tab(a);
 state().saveView(a,old,{scrollTop:999,expandedDetails:['old-page']});state().setFeedback(a,old,'stale');assert.equal(page(a),currentSafariEntry(snapshot));assert.equal(tab(a).feedback,null);assert.equal(tab(a).history[0].scrollTop,999);
 state().goBack(a);state().navigate(B,undefined,a);const pruned=state();state().saveView(a,snapshot.history[1].id,{scrollTop:333});assert.equal(state(),pruned);
 const b=state().newTab(B),newSnapshot=tab(b);state().closeTab(a);state().saveView(a,old,{scrollTop:999});state().setFeedback(a,old,'stale');assert.equal(tab(b),newSnapshot);
});
test("private mode isolates all tabs, history, address drafts, reload and views from normal",()=>{
 state().navigate(A);state().navigate(B);state().goBack();state().setAddress('unfinished.example');const normal=state().normalSession,oldTab=tab(),oldEntry=page();
 state().togglePrivacyMode();assert.equal(state().privacyMode,true);assert.equal(page().url,SAFARI_START_URL);assert.notEqual(session().activeTabId,normal.activeTabId);
 const privateId=session().activeTabId;state().navigate(C);state().newTab(A);state().reload();
 state().setFeedback(oldTab.id,oldEntry.id,'late normal');state().closeTab(oldTab.id);
 assert.equal(state().normalSession,normal);state().togglePrivacyMode();assert.equal(state().privateSession,null);assert.equal(session(),normal);assert.equal(tab().address,'unfinished.example');assert.equal(tab().historyIndex,1);
 const restored=state();state().navigate(B,undefined,privateId);state().setFeedback(privateId,oldEntry.id,'late private');assert.equal(state(),restored);
 state().togglePrivacyMode();assert.equal(session().tabs.length,1);assert.equal(page().url,SAFARI_START_URL);assert.notEqual(session().activeTabId,privateId);
});
test("ending private on app close releases the session and preserves ordinary tabs",()=>{
 state().navigate(C);const normal=state().normalSession;state().togglePrivacyMode();const privateId=session().activeTabId;state().navigate(A);
 state().endPrivateSession();assert.equal(state().privacyMode,false);assert.equal(state().privateSession,null);assert.equal(state().normalSession,normal);
 const old=state();state().endPrivateSession();state().closeTab(privateId);assert.equal(state(),old);
});
test("session policy is memory only; page reload/module initialization starts clean",()=>{
 state().navigate(A);state().togglePrivacyMode();state().navigate(B);
 modules.delete(filename);const fresh=loadTypeScript(filename).useSafariStore.getState();
 assert.equal(fresh.privacyMode,false);assert.equal(fresh.privateSession,null);assert.equal(fresh.normalSession.tabs.length,1);assert.equal(currentSafariEntry(fresh.normalSession.tabs[0]).url,SAFARI_START_URL);
});
test("validation rejects unsupported protocols, missing projects, malformed hosts and credentials without navigation",()=>{
 state().navigate(A);const entry=page(),history=tab().history;
 for(const value of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd','ftp://example.com','portfolio://missing','portfolio://start/fake','portfolio://project/missing','portfolio://project/__proto__','portfolio://project/toString','portfolio://project/constructor','https://','http://user:secret@example.com','not a website','hello','//example.com']){
  assert.ok('error' in resolveSafariAddress(value),value);assert.equal(state().navigate(value),false,value);assert.equal(page(),entry);assert.equal(tab().history,history);assert.match(tab().feedback,/not|valid|supported/i);
 }
});
test("validated HTTP links are only link-preview history entries; internal titles are truthful",()=>{
 assert.deepEqual(resolveSafariAddress(' example.com/path?q=one#two '),{url:'https://example.com/path?q=one#two',title:'Link: example.com'});
 assert.equal(resolveSafariAddress('https://EXAMPLE.com').url,'https://example.com/');
 assert.equal(resolveSafariAddress('localhost:3000/demo').url,'https://localhost:3000/demo');
 assert.equal(resolveSafariAddress('').url,SAFARI_START_URL);assert.equal(resolveSafariAddress(SAFARI_START_URL+'#projects').title,'Project Demos');
 state().openProject('3d-macos-web-portfolio');assert.equal(page().title,'3D macOS Web Portfolio');
 state().openInNewTab('example.com');assert.equal(page().title,'Link: example.com');
});
test("invalid new-tab requests do not create fake successful pages",()=>{
 const old=session();assert.equal(state().newTab('javascript:alert(1)'),null);assert.equal(session().tabs.length,old.tabs.length);assert.equal(session().activeTabId,old.activeTabId);assert.equal(page().url,SAFARI_START_URL);
});

test("normal view cleanup during Private entry saves to its own session; ended Private cleanup is discarded",()=>{
 const normalId=session().activeTabId,entryId=page().id;state().togglePrivacyMode();const privateId=session().activeTabId,privateEntry=page().id;
 state().saveView(normalId,entryId,{scrollTop:246});assert.equal(state().normalSession.tabs[0].history[0].scrollTop,246);assert.equal(page().scrollTop,0);
 state().togglePrivacyMode();const old=state();state().saveView(privateId,privateEntry,{scrollTop:999});assert.equal(state(),old);assert.equal(page().scrollTop,246);
});
