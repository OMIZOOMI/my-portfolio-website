import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = specifier => specifier.endsWith(".css")
    ? { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
    : specifier.startsWith(".")
    ? load(resolve(dirname(filename), /\.tsx?$/.test(specifier) ? specifier : existsSync(resolve(dirname(filename), `${specifier}.ts`)) ? `${specifier}.ts` : `${specifier}.tsx`))
    : require(specifier);
  runInThisContext(`(function(module,exports,require){${output}\n})`, { filename })(loaded, loaded.exports, localRequire);
  return loaded.exports;
}
const { PROJECTS, PROJECTS_BY_ID, getProjectById, getProjectOverview } = load(resolve(root, "src/data/projectsData.ts"));
const { FILE_SYSTEM } = load(resolve(root, "src/data/fileSystem.ts"));
const { TERMINAL_PROJECTS, terminalResponse } = load(resolve(root, "src/data/terminalProfile.ts"));
const { useSafariStore: safari, selectSafariSession, currentSafariEntry, resolveSafariAddress } = load(resolve(root, "src/components/desktop/useSafariStore.ts"));
const { useWindowStore: windows } = load(resolve(root, "src/components/window-manager/useWindowStore.ts"));
const { useSystemStore: system } = load(resolve(root, "src/components/window-manager/useSystemStore.ts"));
const { openPortfolioItem } = load(resolve(root, "src/components/desktop/visitorLaunchers.ts"));

beforeEach(() => {
  safari.setState(safari.getInitialState(), true);
  windows.setState(windows.getInitialState(), true);
  system.setState(system.getInitialState(), true);
});

test("one ordered catalogue supplies all seeded project files and Terminal entries", () => {
  assert.equal(PROJECTS.length, 7);
  assert.deepEqual(PROJECTS.filter(project => project.featured).map(project => project.key), ["veyra", "adobe"]);
  assert.deepEqual(FILE_SYSTEM.projects.map(file => [file.id, file.name]), PROJECTS.map(project => [project.id, project.name]));
  assert.deepEqual(TERMINAL_PROJECTS.map(project => [project.key, project.name, project.repository, project.stack, project.status, project.detail]),
    PROJECTS.map(project => [project.key, project.name, project.repositoryUrl, project.stack.join(" · "), project.status, getProjectOverview(project)]));
  assert.equal(new Set(PROJECTS.map(project => project.id)).size, PROJECTS.length);
  assert.equal(new Set(PROJECTS.map(project => project.repositoryUrl)).size, PROJECTS.length);
});

test("legacy IDs and command aliases resolve to the same object without replacing identities", () => {
  for (const project of PROJECTS) {
    assert.equal(PROJECTS_BY_ID[project.id], project);
    for (const alias of [project.id, project.key, ...project.aliases]) {
      assert.equal(getProjectById(alias), project);
      assert.equal(getProjectById(alias.toUpperCase()), project);
      assert.equal(terminalResponse(`project ${alias}`)[0].text, project.name);
    }
  }
  assert.equal(getProjectById("edge-ai-hardware-state-detection").id, "edge-ai-hardware-state-detection");
  assert.equal(getProjectById("white-box").name, "White Box Detection");
  assert.equal(getProjectById("cloud-native-asset-management-api").key, "task-api");
  assert.equal(getProjectById("3d-macos-web-portfolio").key, "portfolio");
  // This is a different project, not another name for White Box.
  assert.equal(getProjectById("hardware-state-edge-ai-detector"), null);
});

test("unknown or inherited property names never resolve as projects", () => {
  for (const id of ["__proto__", "constructor", "toString", "", "missing", "Neural Block", "https://github.com/OMIZOOMI"]) {
    assert.equal(getProjectById(id), null, id);
    assert.ok("error" in resolveSafariAddress(`portfolio://project/${id}`), id);
  }
});

test("old and alias Browser addresses retain their URL and resolve accurate titles", () => {
  for (const project of PROJECTS) {
    for (const reference of [project.id, project.key, ...project.aliases]) {
      const url = `portfolio://project/${reference}`;
      assert.deepEqual(resolveSafariAddress(url), { url, title: project.name });
    }
  }
  const first = safari.getState().normalSession.activeTabId;
  const oldUrl = "portfolio://project/cloud-native-asset-management-api";
  safari.getState().navigate(oldUrl);
  const oldEntry = currentSafariEntry(selectSafariSession(safari.getState()).tabs[0]);
  const second = safari.getState().newTab("portfolio://project/veyra");
  safari.getState().navigate("portfolio://project/adobe");
  safari.getState().activateTab(first);
  assert.equal(currentSafariEntry(selectSafariSession(safari.getState()).tabs[0]), oldEntry);
  assert.equal(oldEntry.url, oldUrl);
  assert.equal(oldEntry.title, "Cloud-Native Task API");
  safari.getState().activateTab(second);
  safari.getState().goBack();
  assert.equal(currentSafariEntry(selectSafariSession(safari.getState()).tabs.find(tab => tab.id === second)).title, "Veyra");
});

test("project launchers ignore stale supplied titles while preserving file window IDs", () => {
  for (const project of PROJECTS) {
    openPortfolioItem({ id: project.id, name: "Previous display title", type: "file" });
    const frame = windows.getState().windows[`file-${project.id}`];
    assert.equal(frame.title, project.name);
    assert.equal(frame.kind, "file-viewer");
  }
  const before = Object.keys(windows.getState().windows).length;
  openPortfolioItem({ id: "cloud-native-asset-management-api", name: "Old title again", type: "file" });
  assert.equal(Object.keys(windows.getState().windows).length, before);
});

test("moving, trashing, restoring and undoing a project file retain its catalogue association", () => {
  const id = "edge-ai-hardware-state-detection";
  const folder = system.getState().createFolder("projects", "Project review");
  assert.ok(folder);
  system.getState().moveToFolder(id, folder);
  assert.ok(system.getState().fileSystem[folder].some(file => file.id === id));
  system.getState().addToTrash(folder);
  assert.equal(system.getState().isHidden(id), true);
  system.getState().restoreFromTrash(folder);
  assert.equal(system.getState().isHidden(id), false);
  const file = system.getState().getFileItem(id);
  assert.equal(file.name, getProjectById(id).name);
  openPortfolioItem(file);
  assert.equal(windows.getState().windows[`file-${id}`].title, "White Box Detection");
  system.getState().undo();
  system.getState().redo();
  assert.equal(system.getState().getFileItem(id).id, id);
});

test("scope distinguishes shipped implementation, author notes and planned work", () => {
  const api = getProjectById("task-api");
  assert.ok(api.stack.includes("SQLite"));
  for (const technology of ["AWS", "Docker", "PostgreSQL", "JWT"]) assert.equal(api.stack.includes(technology), false);
  assert.match(api.futurePlans.join(" "), /PostgreSQL.*not implemented/);
  const white = getProjectById("white-box");
  assert.match(white.repositoryUrl, /edge-ai-white-box$/);
  assert.doesNotMatch([white.name, white.description, ...white.capabilities].join(" "), /modem|hardware.state/i);
  assert.ok(white.evidence.some(source => source.basis === "project-notes"));
  assert.match(getProjectById("veyra").limitations.join(" "), /AI-provider execution are unavailable/);
  for (const project of PROJECTS) {
    assert.ok(project.status && project.statusDetail && project.capabilities.length && project.limitations.length && project.evidence.length);
    for (const source of project.evidence) assert.equal(new URL(source.url).hostname, "github.com");
  }
});

test("the existing detail renderer resolves retained file IDs and exposes factual scope", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ProjectDetailView } = load(resolve(root, "src/components/desktop/ProjectDetailView.tsx"));
  for (const project of PROJECTS) {
    const html = renderToStaticMarkup(createElement(ProjectDetailView, { window: { id: `file-${project.id}`, title: "Previous display title" } }));
    assert.ok(html.includes(project.name));
    assert.ok(html.includes(project.status));
    assert.ok(html.includes(project.caseStudy ? "Implementation sources" : "Scope &amp; evidence"));
    for (const source of project.evidence) assert.ok(html.includes(source.url));
    assert.equal(html.includes("Previous display title"), false);
  }
});

test("Veyra's shared case study keeps the evidence example and unfinished work explicit", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ProjectCaseStudy } = load(resolve(root, "src/components/desktop/ProjectCaseStudy.tsx"));
  const project = getProjectById("veyra");
  const html = renderToStaticMarkup(createElement(ProjectCaseStudy, { project, onBack: () => {}, onExternal: () => {} }));
  assert.ok(html.includes("Back to favorites"));
  for (const text of ["The problem", "What I built", "solo project", "Evidence before conclusions", "up to eight pages", "Zod contracts", "Implementation diagram", "Controlled test input", "imagesWithoutAlt: 1", "Images omit the alt attribute", "Observed", "Derived", "Low severity", "not a live website report or product screenshot", "synthetic fixture data", "Browser scanning and AI-provider execution are unavailable", "Where it stands"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes('href="https://github.com/OMIZOOMI/Cross-Exam"'));
  assert.ok(html.includes(project.caseStudy.evidenceExample.sourceUrl));
  assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
  assert.match(project.caseStudy.evidenceExample.sourceUrl, /blob\/[a-f0-9]{40}\/apps\/scanner\/src\/investigate\.test\.ts#/);
  assert.equal((html.match(/<figure\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<img\b|<iframe\b|<video\b|<canvas\b/);
  assert.doesNotMatch(html.replace(/href="[^"]+"/g, ""), /Cross-Exam|Open in Safari|LCP|\d+ users/);
});

test("retained Veyra references render the same case study alongside the separate Adobe case", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ProjectDetailView } = load(resolve(root, "src/components/desktop/ProjectDetailView.tsx"));
  for (const reference of ["veyra", "Cross-Exam"]) {
    const html = renderToStaticMarkup(createElement(ProjectDetailView, { window: { id: `file-${reference}`, title: "Old display title" } }));
    assert.ok(html.includes('data-project-case-study="veyra"'));
    assert.ok(html.includes("Open in Browser"));
    assert.ok(html.includes("Useful next step"));
    assert.equal(html.includes("Old display title"), false);
  }
  assert.deepEqual(PROJECTS.filter(item => item.caseStudy).map(item => item.id), ["veyra", "adobe-brand-audit"]);
});

test("Adobe's case study distinguishes supplied team history, implementation and fixture evidence", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ProjectCaseStudy } = load(resolve(root, "src/components/desktop/ProjectCaseStudy.tsx"));
  const project = getProjectById("adobe");
  const story = project.caseStudy;
  const html = renderToStaticMarkup(createElement(ProjectCaseStudy, { project, onBack: () => {}, onExternal: () => {} }));
  for (const text of ["My contribution", "three-person team", "co-built", "one teammate", "Claude and GPT", "Top 45 teams", "approximately 100,000 teams", "supplied by Om", "not independently verified here", "One crawl, shared evidence", "stdin", "Four isolated analyzers", "Crawl &amp; HTML access", "AI citability cues", "Freshness &amp; corroboration", "Visitor engagement", "Prioritized JSON report", "NOT_EVALUATED", "FC-10", "synthetic", "not performance measurements or hackathon judging evidence", "do not measure or guarantee AI citations", "Target JavaScript is not executed", "not an official Adobe product"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes(project.repositoryUrl));
  assert.ok(html.includes(story.evidenceExample.excerpt.sourceUrl));
  assert.equal(story.evidenceExample.steps.length, 3);
  assert.equal(story.evidenceExample.steps[1].items.length, 4);
  const excerpt = JSON.parse(story.evidenceExample.excerpt.content);
  assert.deepEqual(excerpt, { scope: "FC-10", title: "Off-site corroboration of brand facts", status: "NOT_EVALUATED" });
  for (const source of project.evidence) assert.match(source.url, /brand-ai-readiness-audit\/blob\/[a-f0-9]{40}\//);
  assert.doesNotMatch(html, /Cross-Exam|http-document-v1|imagesWithoutAlt|Veyra|<iframe\b|<video\b|<canvas\b/);
  assert.doesNotMatch(html, /solo project|winner|award-winning|sponsor.endorsed|300,000/);
});

test("Adobe aliases retain the file association and both featured cases are equally discoverable", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ProjectDetailView } = load(resolve(root, "src/components/desktop/ProjectDetailView.tsx"));
  const project = getProjectById("adobe");
  for (const reference of [project.id, project.key, ...project.aliases]) {
    const html = renderToStaticMarkup(createElement(ProjectDetailView, { window: { id: `file-${reference}`, title: "Old display title" } }));
    assert.ok(html.includes('data-project-case-study="adobe-brand-audit"'));
    assert.ok(html.includes("Open in Browser"));
    assert.ok(html.includes(project.name));
    assert.equal(html.includes("Old display title"), false);
  }
  assert.deepEqual(PROJECTS.slice(0, 2).map(item => [item.id, item.featured, Boolean(item.caseStudy)]), [["veyra", true, true], ["adobe-brand-audit", true, true]]);
  assert.equal(getProjectById("veyra").caseStudy.reportedResult, undefined);
});

test("Documents is empty and the Apps location retains the old game folder identity", () => {
  assert.deepEqual(FILE_SYSTEM.documents, []);
  assert.deepEqual(FILE_SYSTEM.game, []);
  assert.deepEqual(FILE_SYSTEM["about-me"], []);
  assert.equal(system.getState().createFolder("game", "Not an app"), null);
});
