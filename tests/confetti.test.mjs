import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const filename = fileURLToPath(new URL("../src/components/webcam/ConfettiBurst.tsx", import.meta.url));
const loadedModule = { exports: {} };
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const require = createRequire(import.meta.url);
const guardedRequire = (specifier) => {
  assert.notEqual(specifier, "@react-three/fiber", "confetti cannot require a second WebGL renderer");
  assert.notEqual(specifier, "three", "confetti must remain usable with CPU-only gestures");
  return require(specifier);
};
runInThisContext(`(function(module, exports, require) { ${compiled}\n})`, { filename })(loadedModule, loadedModule.exports, guardedRequire);
const render = () => renderToStaticMarkup(React.createElement(loadedModule.exports.ConfettiBurst));

test("the CPU-safe confetti explosion has70deterministic fragments and no canvas", () => {
  const html = render();
  assert.equal(html, render(), "repeated bursts share a deterministic composition");
  assert.match(html, /data-confetti-renderer="css"/);
  assert.equal((html.match(/data-confetti-particle=/g) ?? []).length, 70);
  assert.doesNotMatch(html, /<canvas/);
  assert.match(html, /pointer-events:none/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /prefers-reduced-motion: reduce/);
});

test("all fragment animations finish within the existing2600ms burst lifetime", () => {
  const html = render();
  const fragments = [...html.matchAll(/animation-duration:(\d+)ms;animation-delay:(\d+)ms/g)];
  assert.equal(fragments.length, 70);
  for (const fragment of fragments) {
    assert.equal(Number(fragment[1]) + Number(fragment[2]), 2600);
  }
  assert.match(html, /background-color:#ff5f57/);
  assert.match(html, /background-color:#34c759/);
  assert.match(html, /background-color:#4c8dff/);
});
