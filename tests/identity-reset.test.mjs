import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { beforeEach, test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url), cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} }; cache.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const imports = name => name.startsWith(".") ? load(resolve(dirname(filename), `${name}.ts`)) : require(name);
  runInThisContext(`(function(module,exports,require){${output}\n})`, { filename })(loaded, loaded.exports, imports);
  return loaded.exports;
}
const root = fileURLToPath(new URL("../", import.meta.url));
const source = path => load(resolve(root, "src", path));
const values = new Map(), removed = [];
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => { removed.push(key); values.delete(key); }, clear: () => assert.fail("Never clear origin storage") };
globalThis.window = { localStorage: storage, location: { reload: () => assert.fail("Reset must preserve the mounted apps") } };
globalThis.localStorage = storage;
const { useSystemStore: system } = source("components/window-manager/useSystemStore.ts");
const { useDisplayStore: display } = source("components/window-manager/useDisplayStore.ts");
const { useWorkspaceStore: workspace } = source("components/workspace/useWorkspaceStore.ts");
const { useWindowStore: windows } = source("components/window-manager/useWindowStore.ts");
const { useMailStore: mail } = source("components/window-manager/useMailStore.ts");
const { resetPortfolioSettings } = source("components/desktop/resetPortfolioSettings.ts");
const { OWNED_PREFERENCE_KEYS, removeOwnedPreferenceKeys } = source("data/portfolioPreferences.ts");
const { appWindowTitle } = source("data/appIdentity.ts");
const { portfolioMetadata } = source("data/siteMetadata.ts");
const { resolvePublicOrigin } = source("data/siteIdentity.ts");

beforeEach(() => {
  system.setState(system.getInitialState(), true); display.setState(display.getInitialState(), true);
  workspace.setState(workspace.getInitialState(), true); windows.setState(windows.getInitialState(), true);
  mail.setState(mail.getInitialState(), true); values.clear(); removed.length = 0;
});

for (const introStatus of ["completed", "skipped"]) test(`reset preserves draft, filesystem, windows and ${introStatus} introduction fixtures`, () => {
  values.set("portfolio-appearance", JSON.stringify({ state: { theme: "light", wallpaper: "forest", wallpaperMode: "dark" } }));
  values.set("portfolio-readability", JSON.stringify({ interfaceScale: 1.45, iconScale: 1.4, defaultView: "screen" }));
  values.set("portfolio-workspace", JSON.stringify({ environment: "sage" })); values.set("portfolio-keyboard-sounds", "off");
  system.getState().hydrateAppearance(); display.getState().hydrate(); workspace.getState().hydrate();
  system.setState({ accent: "orange", reduceMotion: true, dockMagnification: false, dockSize: 1.4 });
  const id = system.getState().createFolder("desktop", "Keep this folder");
  system.getState().moveToDesktop(id, { x: 400, y: 120 });
  const filesystem = system.getState().fileSystem, history = system.getState().past, positions = system.getState().desktopPositions;
  display.getState().previewScreenView(false);
  windows.getState().openWindow({ id: "app-notes", kind: "notes", title: "Notes" });
  const openWindows = windows.getState().windows;
  mail.getState().setDraftSubject("Keep this draft"); mail.getState().setDraftBody("Do not send or erase me");
  const protectedValues = new Map([
    ["unrelated-origin-key", "unrelated bytes"], ["notes-store", "edited note fixture"],
    ["portfolio-introduction", JSON.stringify({ status: introStatus })], ["portfolio-workspace-extra", "prefix is not permission"],
    ["mail-store", values.get("mail-store")],
  ]);
  for (const [key, value] of protectedValues) values.set(key, value);
  const result = resetPortfolioSettings();
  assert.deepEqual(result.failedKeys, []); assert.deepEqual(removed, [...OWNED_PREFERENCE_KEYS]);
  for (const key of OWNED_PREFERENCE_KEYS) assert.equal(values.has(key), false);
  for (const [key, value] of protectedValues) assert.equal(values.get(key), value, key);
  assert.equal(system.getState().theme, "dark"); assert.equal(system.getState().wallpaper, "coast"); assert.equal(system.getState().wallpaperMode, "light");
  assert.equal(system.getState().accent, "blue"); assert.equal(system.getState().dockSize, 1); assert.equal(system.getState().reduceMotion, false);
  assert.equal(system.getState().fileSystem, filesystem); assert.equal(system.getState().past, history); assert.equal(system.getState().desktopPositions, positions);
  assert.equal(system.getState().getFileItem(id).name, "Keep this folder"); assert.equal(windows.getState().windows, openWindows);
   assert.equal(display.getState().defaultView, "screen"); assert.equal(display.getState().screenView, false); assert.equal(display.getState().previewReturnView, true);
  assert.equal(display.getState().interfaceScale, 1); assert.equal(display.getState().iconScale, 1);
  assert.equal(workspace.getState().environment, "beach"); assert.equal(workspace.getState().keyboardSounds, true); assert.equal(workspace.getState().resetRevision, 1);
  assert.equal(mail.getState().draftSubject, "Keep this draft"); assert.equal(mail.getState().draftBody, "Do not send or erase me");
});

test("partial or restricted storage reports saved-preference failures without touching other keys", () => {
  const calls = [];
  const failed = removeOwnedPreferenceKeys({ removeItem(key) { calls.push(key); if (key === "portfolio-workspace") throw Error("Blocked fixture"); } });
  assert.deepEqual(calls, [...OWNED_PREFERENCE_KEYS]); assert.deepEqual(failed, ["portfolio-workspace"]);
  assert.deepEqual(removeOwnedPreferenceKeys(), [...OWNED_PREFERENCE_KEYS]);
});

test("legacy app references display current names while visitor folder titles and IDs remain unchanged", () => {
  for (const [kind, old, current] of [["finder", "Finder", "Files"], ["safari", "Safari", "Browser"], ["facetime", "FaceTime", "Camera"], ["music", "Apple Music", "Music"]]) {
    const app = { id: `about-${kind}`, kind: "about-app", title: `About ${old}` };
    assert.equal(appWindowTitle(app), `About ${current}`); assert.equal(app.id, `about-${kind}`);
    if (kind !== "finder") assert.equal(appWindowTitle({ ...app, kind, id: `app-${kind}`, title: old }), current);
  }
  assert.equal(appWindowTitle({ id: "finder-visitor", kind: "finder", folderId: "visitor", title: "Safari" }), "Safari");
  assert.equal(appWindowTitle({ id: "finder-visitor", kind: "finder", folderId: "visitor", title: "Finder" }), "Finder");
  assert.equal(appWindowTitle({ id: "legacy-finder", kind: "finder", title: "Finder" }), "Files");
  assert.equal(appWindowTitle({ id: "file-Safari", kind: "file-viewer", title: "Safari" }), "Safari");
});

test("local-only metadata has Om identity with no invented canonical, localhost or share URL", () => {
  const metadata = portfolioMetadata();
  assert.equal(metadata.title, "Om Sawkare — Interactive Portfolio"); assert.match(metadata.description, /computer vision, AI workflows, and backend development/);
  assert.equal(metadata.metadataBase, undefined); assert.equal(metadata.alternates, undefined); assert.equal(metadata.openGraph.images, undefined);
  assert.equal(metadata.openGraph.siteName, "Om’s Portfolio"); assert.equal(metadata.twitter.card, "summary");
  assert.doesNotMatch(JSON.stringify(metadata), /localhost|127\.0\.0\.1|Create Next App/);
  for (const value of ["http://localhost:3012", "https://localhost", "https://192.168.1.1", "https://[::1]", "https://office.local", "invalid", "https://user:pass@portfolio.example", "https://portfolio.example/path"]) assert.equal(resolvePublicOrigin(value), undefined);
  const configured = portfolioMetadata("https://portfolio.example"); // Reserved example domain: fixture only, never configuration.
  assert.equal(configured.openGraph.images[0].url, "https://portfolio.example/identity/share.png");
  assert.equal(configured.alternates.canonical, "https://portfolio.example");
});

test("identity artwork is local, original vector geometry and valid sized PNG/ICO", async () => {
  const sharp = require("sharp");
  const share = await sharp(resolve(root, "public/identity/share.png")).metadata();
  assert.equal(share.width, 1200); assert.equal(share.height, 630); assert.equal(share.format, "png");
  const touch = await sharp(resolve(root, "src/app/apple-icon.png")).metadata(); assert.equal(touch.width, 180);
  const ico = readFileSync(resolve(root, "src/app/favicon.ico")); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 3);
  assert.doesNotMatch(readFileSync(resolve(root, "src/app/icon.svg"), "utf8"), /<text|href=|<image/);
});
