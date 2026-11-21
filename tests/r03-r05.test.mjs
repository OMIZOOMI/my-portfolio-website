import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const source = path => readFileSync(new URL(path, root), "utf8");
const require = createRequire(import.meta.url);

function loadTypeScript(path, cache = new Map()) {
  if (cache.has(path)) return cache.get(path).exports;
  const output = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  cache.set(path, loadedModule);
  const localRequire = specifier => {
    if (!specifier.startsWith(".")) return require(specifier);
    const next = resolve(dirname(path), specifier).replace(/\.tsx?$/, "") + ".ts";
    return loadTypeScript(next, cache);
  };
  runInNewContext(`(function(module,exports,require){${output}\n})(module,module.exports,require)`, { module: loadedModule, require: localRequire });
  return loadedModule.exports;
}

test("R03 uses the compact menu row as the shared icon and work-area baseline", () => {
  const { DESKTOP_MENU_H, desktopIconMetrics } = loadTypeScript("src/components/desktop/desktopIconLayout.ts");
  assert.equal(DESKTOP_MENU_H, 28);
  assert.equal(desktopIconMetrics({ width: 1400, height: 900 }).menuHeight, 28);
  assert.equal(desktopIconMetrics({ width: 1400, height: 900, menuHeight: 44 }).menuHeight, 44);
  assert.match(source("src/app/globals.css"), /data-screen-view="laptop"[^}]*--portfolio-menu-row: 44px/);
  assert.match(source("src/components/webcam/MenuBar.module.css"), /height: var\(--portfolio-menu-row, 28px\)/);
});

test("R04 keeps app content opaque and puts the glass plate only in window chrome", () => {
  const css = source("src/components/window-manager/WindowFrame.module.css");
  const frame = css.slice(css.indexOf(".window {"), css.indexOf(".titleBar {"));
  const titleBar = css.slice(css.indexOf(".titleBar {"), css.indexOf(".titleBar:active"));
  assert.match(frame, /background: transparent/);
  assert.doesNotMatch(frame, /backdrop-filter/);
  assert.doesNotMatch(frame, /will-change: transform, opacity/);
  assert.match(titleBar, /data-window-active="false"/);
  assert.match(css.slice(css.indexOf(".content {")), /background: #f6f6f8/);
  const component = source("src/components/window-manager/WindowFrame.tsx");
  assert.match(component, /className=\{styles.titleBar\}[\s\S]*?<GlassSurface \/>/);
  assert.doesNotMatch(component.slice(component.indexOf("className={styles.content}")), /<GlassSurface/);
});

test("R05 exposes only the three opening suggestions while retaining useful responses", () => {
  const { TERMINAL_SUGGESTIONS, terminalResponse } = loadTypeScript("src/data/terminalProfile.ts");
  assert.deepEqual([...TERMINAL_SUGGESTIONS], ["projects", "skills", "about"]);
  for (const command of TERMINAL_SUGGESTIONS) assert.ok(terminalResponse(command).length > 0);
  assert.equal(terminalResponse("project veyra")[0].text, "Veyra");
  assert.equal(terminalResponse("project adobe")[0].text, "Adobe Hackathon · Brand AI Readiness Audit");
  assert.match(source("src/components/desktop/TerminalApp.tsx"), /const animated = !reduced/);
});
