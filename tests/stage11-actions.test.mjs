import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// Exercise the actual Zustand store and its real imports without adding a test
// framework or changing the application's extensionless bundler imports.
const require = createRequire(import.meta.url);
const modules = new Map();
function loadTypeScript(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const localRequire = (specifier) => specifier.startsWith(".")
    ? loadTypeScript(resolve(dirname(filename), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`))
    : require(specifier);
  runInThisContext(`(function(module, exports, require) { ${output}\n})`, { filename })(loaded, loaded.exports, localRequire);
  return loaded.exports;
}

const root = fileURLToPath(new URL('../', import.meta.url));
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const {useMailStore:mail}=loadTypeScript(resolve(root,'src/components/window-manager/useMailStore.ts'));
const {useWindowStore:windows}=loadTypeScript(resolve(root,'src/components/window-manager/useWindowStore.ts'));
const {openPortfolioItem,openSettings,openPortfolioAbout}=loadTypeScript(resolve(root,'src/components/desktop/visitorLaunchers.ts'));
const {fileHistoryShortcut}=loadTypeScript(resolve(root,'src/components/webcam/editorMenuCommands.ts'));
const {PROJECTS}=loadTypeScript(resolve(root,'src/data/projectsData.ts'));
const m=()=>mail.getState(),w=()=>windows.getState();
let launches=[];
beforeEach(()=>{storage.clear();mail.setState(mail.getInitialState(),true);windows.setState(windows.getInitialState(),true);launches=[];globalThis.open=(...args)=>{launches.push(args);return null;};});

test('built-in About Me opens populated app identity from every shared launcher',()=>{
 openPortfolioItem({id:'about-me',name:'About Me',type:'folder'});assert.equal(w().windows['about-me'].kind,'about-me');assert.equal(w().windows['finder-about-me'],undefined);
 openPortfolioItem({id:'about-me',name:'Renamed built-in',type:'folder'},{navigateFolder:()=>assert.fail('About Me must not navigate into empty folder')});assert.equal(Object.keys(w().windows).length,1);
});
test('a visitor folder merely named About Me remains a real folder and navigates normally',()=>{
 let destination=null;openPortfolioItem({id:'visitor-folder',name:'About Me',type:'folder'},{navigateFolder:id=>destination=id});assert.equal(destination,'visitor-folder');assert.deepEqual(w().windows,{});
 openPortfolioItem({id:'visitor-folder',name:'About Me',type:'folder'});assert.equal(w().windows['finder-visitor-folder'].folderId,'visitor-folder');
});
test('existing project file identities retain their populated detail routes; placeholders are not invented',()=>{
 for(const p of PROJECTS){openPortfolioItem({id:p.id,name:p.name,type:'file'});const frame=w().windows['file-'+p.id];assert.equal(frame.kind,'file-viewer');assert.equal(frame.title,p.name);}
 openPortfolioItem({id:'Neural Block',name:'Neural Block.app',type:'app'});assert.equal(w().windows['file-Neural Block'].kind,'file-viewer');assert.equal(PROJECTS.find(p=>p.id==='Neural Block'),undefined);
});
test('About This Mac selects About on a new, existing, or minimized Settings window',()=>{
 openSettings('about');assert.equal(w().windows['app-settings'].settingsSection,'about');w().setSettingsSection('app-settings','appearance');w().toggleMinimize('app-settings');
 openSettings('about');assert.equal(w().windows['app-settings'].settingsSection,'about');assert.equal(w().windows['app-settings'].minimized,false);assert.equal(w().focusedWindowId,'app-settings');
 openSettings();assert.equal(w().windows['app-settings'].settingsSection,'about');assert.equal(Object.keys(w().windows).length,1);
});
test('Settings section updates are local and respect closing lifecycle',()=>{
 openSettings();w().openWindow({id:'notes',kind:'notes',title:'Notes'});const other=w().windows.notes;w().setSettingsSection('app-settings','dock');assert.equal(w().windows.notes,other);w().setSettingsSection('notes','about');assert.equal(w().windows.notes,other);
 w().beginCloseWindow('app-settings');const closing=w().windows['app-settings'];openSettings('about');assert.equal(w().windows['app-settings'],closing);
});
test('About This Portfolio has a stable portfolio-specific route',()=>{
 openPortfolioAbout();assert.equal(w().windows['about-portfolio'].title,'About This Portfolio');assert.equal(w().windows['about-portfolio'].kind,'about-app');
});
test('a nullable email-app launch retains the exact draft and composer, without recording Sent',()=>{
 m().openComposer();m().setDraftSubject('Hello & question?');m().setDraftBody('Line one\nLine two é');const existing=[{id:'legacy',subject:'Old copy',body:'Preserve me'}];mail.setState({sent:existing});
 assert.equal(m().openDraftInEmailApp(),true);assert.deepEqual(launches,[['mailto:sawkare.om@gmail.com?subject=Hello%20%26%20question%3F&body=Line%20one%0ALine%20two%20%C3%A9','_self']]);
 assert.equal(m().sent,existing);assert.equal(m().draftSubject,'Hello & question?');assert.equal(m().draftBody,'Line one\nLine two é');assert.equal(m().composing,true);assert.match(m().handoffMessage,/cannot confirm delivery/);
 m().closeComposer();m().openComposer();assert.equal(m().draftBody,'Line one\nLine two é');
});
test('email-app errors preserve the draft and give useful truthful feedback',()=>{
 m().setDraftSubject('Opportunity');m().setDraftBody('Keep this text');globalThis.open=()=>{throw Error('No handler fixture');};assert.equal(m().openDraftInEmailApp(),false);assert.equal(m().draftBody,'Keep this text');assert.equal(m().sent.length,0);assert.match(m().handoffMessage,/could not be opened/);
});
test('empty and whitespace-only drafts never request a mail handoff',()=>{
 for(const [subject,body] of [['',''],['   ','body'],['subject',' \n']]){m().setDraftSubject(subject);m().setDraftBody(body);assert.equal(m().openDraftInEmailApp(),false);}assert.equal(launches.length,0);assert.equal(m().sent.length,0);
});
test('legacy mail migrations preserve copies, inbox, identifiers and unknown message content without claiming delivery',()=>{
 const entry={id:'old-id',from:'Me',to:'Om',subject:'Do not delete',body:'Possibly cancelled',sentAt:123,read:false,extra:{attachment:'keep'}};
 for(const version of [0,1,2,3]){const old={inbox:[{...entry,id:'inbox'}],sent:[entry]};const migrated=mail.persist.getOptions().migrate(old,version);assert.equal(migrated.sent,old.sent);assert.equal(migrated.inbox,old.inbox);assert.deepEqual(migrated.sent[0],entry);}
});
test('persistence retains legacy copies but does not silently start storing visitor drafts or handoff status',()=>{
 m().setDraftSubject('Private session draft');m().setDraftBody('Memory-only body');m().openDraftInEmailApp();const persisted=JSON.parse(storage.get('mail-store'));assert.equal(persisted.version,4);assert.equal(persisted.state.draftBody,undefined);assert.equal(persisted.state.handoffMessage,undefined);assert.deepEqual(persisted.state.sent,[]);
 m().clearDraft();assert.equal(m().draftSubject,'');assert.equal(m().draftBody,'');
});
test('filesystem undo shortcuts remain scoped and never replace editor or browser/OS commands',()=>{
 const base={key:'z',ctrlKey:false,metaKey:true,altKey:false,shiftKey:false,defaultPrevented:false,isComposing:false};
 assert.equal(fileHistoryShortcut(base,false,'finder'),'undo');assert.equal(fileHistoryShortcut({...base,shiftKey:true},false,'bin'),'redo');assert.equal(fileHistoryShortcut({...base,metaKey:false,ctrlKey:true,key:'y'},false,'finder'),'redo');
 for(const kind of ['notes','mail','safari','settings','terminal','facetime'])assert.equal(fileHistoryShortcut(base,false,kind),null);
 for(const patch of [{altKey:true},{defaultPrevented:true},{isComposing:true},{key:'r'},{key:'w'},{key:'q'},{key:'F10'},{metaKey:false}])assert.equal(fileHistoryShortcut({...base,...patch},false,'finder'),null);
 assert.equal(fileHistoryShortcut(base,true,'finder'),null);
});
