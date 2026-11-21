import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function compile(filename, globals, imports, jsx = false) {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
  const loaded = { exports: {} };
  runInNewContext(`(function(module,exports,require){${output}\n})(module,module.exports,require)`, {
    module: loaded,
    require: specifier => imports[specifier] ?? (() => { throw Error(`Unexpected import ${specifier}`); })(),
    ...globals,
  });
  return loaded.exports;
}

function harness(viewport) {
  let hookCursor = 0;
  const refs = [], effects = [], pending = [];
  const react = {
    useRef: initial => refs[hookCursor++] ??= { current: initial },
    useLayoutEffect: (setup, deps) => {
      const index = hookCursor++;
      if (!effects[index] || deps.some((value, position) => !Object.is(value, effects[index].deps[position]))) pending.push({ index, setup, deps });
    },
    useEffect() {}, useState() { throw Error("GuideCursor should not use state"); },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const cursorModule = compile(new URL("../src/components/portfolio/introductionCursor.ts", import.meta.url), {}, {});
  const imports = {
    "../ui/PortfolioGlass": { GlassButton: "button" },
    react,
    "react-dom": { createPortal: node => node },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "../../data/portfolioProfile": { PORTFOLIO_PROFILE: { name: "Om Sawkare" } },
    "../../data/projectsData": { PROJECTS: [] },
    "../window-manager/useWindowStore": { useWindowStore: { getState: () => ({}) } },
    "../window-manager/useDisplayStore": { useDisplayStore: () => false },
    "../window-manager/useSystemStore": { useSystemStore: () => false },
    "../desktop/useSafariStore": { SAFARI_START_URL: "portfolio://start", useSafariStore: { getState: () => ({}) } },
    "../desktop/desktopIconLayout": { DESKTOP_ICON_W: 84 },
    "./portfolioActions": { runPortfolioAction() {} },
    "./useIntroductionStore": { useIntroductionStore: () => ({}), INTRODUCTION_STEPS: ["screen", "projects", "terminal", "contact", "finish"] },
    "./introductionTargets": { measureIntroductionTarget: () => ({ target: null }), observeIntroductionTarget() {} },
    "./introductionCursor": cursorModule,
    "./PortfolioIntroduction.module.css": { default: { cursor: "cursor", cursorContent: "cursorContent", cursorIcon: "cursorIcon", cursorTooltip: "cursorTooltip" } },
  };
  const component = compile(new URL("../src/components/portfolio/PortfolioIntroduction.tsx", import.meta.url), { HTMLElement: class {}, window: viewport }, imports, true).GuideCursor;
  const render = props => {
    hookCursor = 0; pending.length = 0;
    const output = component(props);
    const element = { style: {}, dataset: {}, getBoundingClientRect() { this.departure = this.style.transform; } };
    output.props.ref.current = element;
    for (const { index, setup, deps } of pending.splice(0)) {
      effects[index]?.cleanup?.();
      effects[index] = { deps, cleanup: setup() };
    }
    return { output, element };
  };
  return { render };
}

const target = (x, y, width = 100, height = 60) => ({ x, y, width, height });

test("initial cursor positioning is direct, then step changes use a long compositor transition", () => {
  const h = harness();
  const first = h.render({ step: "screen", target: target(20, 40), available: true, reduceMotion: false });
  assert.equal(first.element.style.transform, "translate3d(70px, 70px, 0)");
  assert.equal(first.element.style.transitionDuration, "0ms");
  assert.equal(first.output.props["aria-hidden"], "true");
  const next = h.render({ step: "projects", target: target(760, 320), available: true, reduceMotion: false });
  assert.match(next.element.style.transform, /^translate3d\(810px, 350px, 0\)$/);
  assert.ok(Number.parseInt(next.element.dataset.cursorDuration, 10) >= 700);
  assert.ok(Number.parseInt(next.element.dataset.cursorDuration, 10) <= 900);
  assert.equal(next.output.props.style, undefined);
});

test("the first Settings pointer glides in and its tooltip stays above the bottom edge", () => {
  const h = harness({ innerWidth: 1200, innerHeight: 800 });
  const arrival = h.render({ step: "laptop", target: target(18, 732, 48, 48), available: true, reduceMotion: false });
  assert.equal(arrival.element.departure, "translate3d(142px, 671px, 0)");
  assert.equal(arrival.element.style.transform, "translate3d(42px, 756px, 0)");
  assert.equal(arrival.output.props["data-cursor-vertical"], "above");
  assert.ok(Number(arrival.element.dataset.cursorDuration) >= 700);
});

test("live target repositioning follows with a short transition and reduced motion removes travel", () => {
  const h = harness();
  h.render({ step: "projects", target: target(760, 320), available: true, reduceMotion: false });
  const moved = h.render({ step: "projects", target: target(790, 350), available: true, reduceMotion: false });
  const liveDuration = Number.parseInt(moved.element.dataset.cursorDuration, 10);
  assert.ok(liveDuration >= 120 && liveDuration <= 240);
  assert.equal(moved.element.style.transform, "translate3d(840px, 380px, 0)");
  const reduced = h.render({ step: "projects", target: target(820, 380), available: true, reduceMotion: true });
  assert.equal(reduced.element.style.transitionDuration, "0ms");
  assert.equal(reduced.output.props["data-reduced-motion"], true);
});
