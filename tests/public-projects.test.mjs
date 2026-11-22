import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext, runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url), cache = new Map();
const root = fileURLToPath(new URL("../", import.meta.url));
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} }; cache.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const imports = name => {
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith(".")) {
      const base = resolve(dirname(filename), name);
      return load(existsSync(base + ".ts") ? base + ".ts" : base + ".tsx");
    }
    return require(name);
  };
  runInThisContext(`(function(module,exports,require){${output}\n})`, { filename })(loaded, loaded.exports, imports);
  return loaded.exports;
}
const source = path => load(resolve(root, "src", path));
const { PUBLIC_PROJECTS, getPublicProject, projectPublicPath, projectPortfolioPath } = source("data/publicProjects.ts");
const { getProjectById } = source("data/projectsData.ts");
const { projectMetadata, PROJECT_NOT_FOUND_METADATA } = source("data/projectMetadata.ts");

test("only the two reviewed flagship case studies have stable public reading paths", () => {
  assert.deepEqual(PUBLIC_PROJECTS.map(project => project.id), ["veyra", "adobe-brand-audit"]);
  assert.equal(projectPublicPath("veyra"), "/projects/veyra");
  assert.equal(projectPublicPath("adobe"), "/projects/adobe-brand-audit");
  for (const project of PUBLIC_PROJECTS) {
    assert.equal(getPublicProject(project.publicSlug), project);
    for (const reference of [project.id, project.key, ...project.aliases]) {
      assert.equal(projectPublicPath(reference), projectPublicPath(project.id));
      assert.equal(projectPortfolioPath(reference), `/?project=${project.id}`);
      assert.equal(getProjectById(reference), project);
    }
    assert.ok(!projectPublicPath(project.id).includes("portfolio:"));
  }
  for (const slug of ["missing", "Cross-Exam", "adobe", "white-box", "../veyra", "veyra/", "VEYRA"]) assert.equal(getPublicProject(slug), null);
  assert.equal(projectPublicPath("white-box"), null); assert.equal(projectPublicPath("missing"), null);
});

test("project metadata is specific and only emits absolute URLs from a validated configured origin", () => {
  // Reserved example domain is a test fixture, never deployment configuration.
  for (const project of PUBLIC_PROJECTS) {
    const local = projectMetadata(project);
    assert.equal(local.title, `${project.name} — Om Sawkare`); assert.ok(local.description.includes(project.summary));
    assert.equal(local.alternates, undefined); assert.equal(local.openGraph.url, undefined); assert.equal(local.openGraph.images, undefined);
    assert.equal(local.twitter.title, local.title); assert.equal(local.openGraph.title, local.title);
    const deployed = projectMetadata(project, "https://portfolio.example.org");
    assert.equal(deployed.alternates.canonical, `https://portfolio.example.org${projectPublicPath(project.id)}`);
    assert.equal(deployed.openGraph.url, deployed.alternates.canonical);
    assert.equal(deployed.openGraph.images[0].url, "https://portfolio.example.org/identity/share.png");
    for (const invalid of ["http://localhost:3012", "https://127.0.0.1", "https://portfolio.example.org/projects/veyra", "javascript:alert(1)"]) {
      assert.equal(projectMetadata(project, invalid).alternates, undefined);
    }
  }
  assert.equal(PROJECT_NOT_FOUND_METADATA.robots.index, false); assert.equal(PROJECT_NOT_FOUND_METADATA.alternates.canonical, null);
});

test("public pages render the approved evidence and limitations without any desktop or media", () => {
  const { PublicProjectPage } = source("components/portfolio/PublicProjectPage.tsx");
  const { createElement } = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  for (const project of PUBLIC_PROJECTS) {
    const html = renderToStaticMarkup(createElement(PublicProjectPage, { project }));
    for (const text of [project.name, "Back to Portfolio", "The problem", "Where it stands", "Implementation sources", project.repositoryUrl]) assert.ok(html.includes(text), text);
    assert.ok(html.includes(projectPortfolioPath(project.id).replaceAll("&", "&amp;")));
    assert.ok(html.includes(project.caseStudy.evidenceExample.sourceUrl));
    assert.ok(html.includes(project.caseStudy.evidenceExample.caveat));
    assert.doesNotMatch(html, /<canvas|<audio|<video|portfolio:\/\//);
  }
});

test("route visibility is an ephemeral flag and never replaces app windows or history", () => {
  const { usePortfolioActivity: activity } = source("components/portfolio/usePortfolioActivity.ts");
  const { useWindowStore: windows } = source("components/window-manager/useWindowStore.ts");
  windows.getState().openWindow({ id: "app-notes", kind: "notes", title: "Notes" });
  const before = windows.getState();
  activity.getState().setDesktopActive(false); assert.equal(activity.getState().desktopActive, false);
  const inactive = activity.getState(); activity.getState().setDesktopActive(false); assert.equal(activity.getState(), inactive);
  activity.getState().setDesktopActive(true); assert.equal(windows.getState(), before);
  assert.equal(activity.persist, undefined);
});

test("case studies open in a separate tab and still accept project aliases", () => {
  const { ProjectPublicLink } = source("components/portfolio/ProjectPublicLink.tsx");
  const { createElement } = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  for (const [projectId, path] of [["Cross-Exam", "/projects/veyra"], ["adobe", "/projects/adobe-brand-audit"]]) {
    const html = renderToStaticMarkup(createElement(ProjectPublicLink, { projectId }));
    assert.ok(html.includes(`href="${path}" target="_blank" rel="noopener noreferrer"`));
  }
  assert.equal(renderToStaticMarkup(createElement(ProjectPublicLink, { projectId: "missing" })), "");
});

test("entry intent waits for readiness, runs once per navigation and does not write real or simulated history", () => {
  const filename = resolve(root, "src/components/portfolio/PortfolioProjectEntry.tsx");
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let reference = "Cross-Exam"; const ref = { current: null }, calls = [];
  const imports = {
    react: { useRef: () => ref, useEffect: effect => effect() },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "next/navigation": { useSearchParams: () => ({ get: () => reference }) },
    "../../data/projectsData": { getProjectById },
  };
  const loaded = { exports: {} };
  runInNewContext(`(function(module,exports,require){${output}\n})(module,module.exports,require)`, { module: loaded, require: name => imports[name] }, { filename });
  const render = (active, available) => loaded.exports.PortfolioProjectEntry({ active, available, open: action => calls.push(action.projectId) });
  render(true, false); assert.deepEqual(calls, []);
  render(true, true); render(true, true); assert.deepEqual(calls, ["veyra"]);
  render(false, true); render(true, true); assert.deepEqual(calls, ["veyra", "veyra"]);
  reference = "adobe"; render(true, true); render(true, true); assert.deepEqual(calls, ["veyra", "veyra", "adobe-brand-audit"]);
  reference = "missing"; assert.equal(render(true, true).props.role, "status"); assert.equal(calls.length, 3);
});
