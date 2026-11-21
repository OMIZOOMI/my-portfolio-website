import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext, runInThisContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const modules = new Map();
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
function load(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = specifier => {
    if (specifier.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (!specifier.startsWith(".")) return require(specifier);
    const base = resolve(dirname(filename), specifier);
    return load(/\.tsx?$/.test(base) ? base : existsSync(base + ".ts") ? base + ".ts" : base + ".tsx");
  };
  runInThisContext(`(function(module,exports,require){${output}\n})`, { filename })(loaded, loaded.exports, localRequire);
  return loaded.exports;
}
const { PROJECTS, getProjectById } = load(resolve(root, "src/data/projectsData.ts"));
const { PORTFOLIO_PROFILE: profile, SKILL_GROUPS, PROJECT_EXPERIENCE } = load(resolve(root, "src/data/portfolioProfile.ts"));
const { runPortfolioAction } = load(resolve(root, "src/components/portfolio/portfolioActions.ts"));
const { useWindowStore: windows } = load(resolve(root, "src/components/window-manager/useWindowStore.ts"));
const { useMailStore: mail } = load(resolve(root, "src/components/window-manager/useMailStore.ts"));
const { useDisplayStore: display } = load(resolve(root, "src/components/window-manager/useDisplayStore.ts"));
const { APPEARANCE_BOOTSTRAP } = load(resolve(root, "src/data/appearanceBootstrap.ts"));
const { parseAppearancePreferences, APPEARANCE_STORAGE_KEY } = load(resolve(root, "src/data/wallpapers.ts"));
beforeEach(() => {
  windows.setState(windows.getInitialState(), true);
  mail.setState(mail.getInitialState(), true);
  display.setState(display.getInitialState(), true);
  storage.clear();
});

test("the overview renders identity, both featured projects and working contact URLs without a scene", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { PortfolioOverview } = load(resolve(root, "src/components/portfolio/PortfolioOverview.tsx"));
  const html = renderToStaticMarkup(createElement(PortfolioOverview));
  assert.ok(html.includes(profile.name));
  assert.ok(html.includes(profile.role));
  assert.ok(html.includes(profile.education));
  assert.ok(html.includes(`mailto:${profile.email}`));
  assert.ok(html.includes(profile.github) && html.includes(profile.linkedin));
  for (const project of PROJECTS.filter(project => project.featured)) {
    assert.ok(html.includes(project.name) && html.includes(project.repositoryUrl));
  }
  assert.equal((html.match(/<article/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<canvas|<video|<audio/);
  assert.ok(html.indexOf("Veyra") < html.indexOf("Adobe"));
});

test("Skills and Experience references resolve to verified catalogue entries", () => {
  for (const section of [...SKILL_GROUPS, ...PROJECT_EXPERIENCE]) {
    assert.ok(section.detail && section.projects.length);
    for (const key of section.projects) assert.ok(getProjectById(key), key);
  }
  assert.ok(PROJECT_EXPERIENCE.some(section => section.projects.includes("adobe")));
  assert.doesNotMatch(JSON.stringify({ SKILL_GROUPS, PROJECT_EXPERIENCE }), /hardware-state-edge|employment|graduated in/i);
});

test("overview app actions reuse stable existing identities and do not replace unrelated windows", () => {
  windows.getState().openWindow({ id: "app-notes", kind: "notes", title: "Notes" });
  const notes = windows.getState().windows["app-notes"];
  runPortfolioAction("projects"); runPortfolioAction("about");
  for (const project of PROJECTS.filter(project => project.featured)) {
    runPortfolioAction({ projectId: project.key }); runPortfolioAction({ projectId: project.id });
    assert.equal(windows.getState().windows[`file-${project.id}`].title, project.name);
  }
  assert.equal(windows.getState().windows["finder-projects"].folderId, "projects");
  assert.equal(windows.getState().windows["about-me"].kind, "about-me");
  assert.equal(windows.getState().windows["app-notes"], notes);
  assert.equal(Object.keys(windows.getState().windows).length, 5);
  const before = windows.getState();
  assert.equal(runPortfolioAction({ projectId: "missing" }), false);
  assert.equal(windows.getState(), before);
});

test("contact opens the existing draft without sending, replacing content or starting a camera", () => {
  mail.getState().setDraftSubject("Existing subject"); mail.getState().setDraftBody("Keep this draft.");
  runPortfolioAction("contact"); runPortfolioAction("contact");
  assert.equal(mail.getState().draftBody, "Keep this draft.");
  assert.equal(mail.getState().draftSubject, "Existing subject");
  assert.equal(mail.getState().composing, true);
  assert.equal(mail.getState().sent.length, 0);
  assert.deepEqual(Object.keys(windows.getState().windows), ["app-mail"]);
});

test("reading actions use existing display and Settings state without changing size preferences", () => {
  display.getState().setInterfaceScale(1.3); display.getState().setIconScale(1.4);
  runPortfolioAction("readability");
  assert.equal(windows.getState().windows["app-settings"].settingsSection, "accessibility");
  assert.equal(display.getState().screenView, false);
  runPortfolioAction("screen");
  assert.equal(display.getState().screenView, true);
  assert.equal(display.getState().interfaceScale, 1.3);
  assert.equal(display.getState().iconScale, 1.4);
  runPortfolioAction("screen");
  assert.equal(display.getState().screenView, false);
});

test("prepaint theme bootstrap agrees with the existing parser and never changes preferences", () => {
  for (const raw of [null, "{bad", "null", "false", '{"theme":"light"}', '{"version":1,"state":{"theme":"light","wallpaper":"coast"}}', '{"theme":"dark"}', '{"state":{"theme":"invalid"}}']) {
    const toggles = [], reads = [], dataset = {};
    runInNewContext(APPEARANCE_BOOTSTRAP, {
      localStorage: { getItem: key => { reads.push(key); return raw; }, setItem: () => assert.fail("bootstrap must not persist state") },
      document: { documentElement: { dataset, classList: { toggle: (...args) => toggles.push(args) } } },
    });
    assert.deepEqual(reads, [APPEARANCE_STORAGE_KEY]);
    assert.deepEqual(toggles, [["dark", parseAppearancePreferences(raw).theme === "dark"]]);
    assert.equal(dataset.theme, parseAppearancePreferences(raw).theme);
  }
});

test("blocked storage still leaves the bootstrap and readable default usable", () => {
  const toggles = [], dataset = {};
  runInNewContext(APPEARANCE_BOOTSTRAP, {
    localStorage: { getItem: () => { throw Error("Storage denied"); } },
    document: { documentElement: { dataset, classList: { toggle: (...args) => toggles.push(args) } } },
  });
  assert.deepEqual(toggles, [["dark", true]]);
  assert.equal(dataset.theme, "dark");
});
