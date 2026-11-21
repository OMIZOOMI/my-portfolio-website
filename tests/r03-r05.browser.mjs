// R03–R05 production-browser coverage. Chrome CDP only; no native Safari or
// Windows validation is implied. STARTUP_TEST_URL=http://127.0.0.1:3015
// CDP_URL=http://127.0.0.1:9222 node tests/r03-r05.browser.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3015";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const output = new URL(process.env.R03_R05_OUTPUT_DIR ?? "../docs/r03-r05-review/", import.meta.url);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const version = await (await fetch(`${endpoint}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
function command(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function pageFor({ width = 1440, height = 1000, reduced = false, touch = false, init = "" } = {}) {
  const { browserContextId } = await command("Target.createBrowserContext");
  const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId, newWindow: true, background: false });
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params = {}) => command(method, params, sessionId);
  const errors = [];
  const onEvent = event => { if (event.sessionId === sessionId && event.method === "Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.text); };
  listeners.add(onEvent);
  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Network.enable")]);
  await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  if (touch) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: init });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async (expression, label, timeout = 45000) => {
    const started = Date.now(); let last;
    while (Date.now() - started < timeout) {
      try { last = await evaluate(expression); if (last) return last; } catch (error) { last = error.message; }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
  };
  const screenshot = async name => {
    await mkdir(output, { recursive: true });
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(`${name}.png`, output), Buffer.from(data, "base64"));
  };
  return {
    send, evaluate, wait, screenshot, errors,
    async navigate() { await send("Page.navigate", { url: site }); },
    async close() { listeners.delete(onEvent); await command("Target.disposeBrowserContext", { browserContextId }); },
  };
}

const listeners = new Set();
async function clickExpression(page, expression) {
  const point = await page.wait(`(() => { const element = ${expression}; if (!element) return false; const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : false; })()`, `click ${expression}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
}
async function click(page, selector) { return clickExpression(page, `document.querySelector(${JSON.stringify(selector)})`); }
async function clickText(page, selector, text) { return clickExpression(page, `[...document.querySelectorAll(${JSON.stringify(selector)})].find(element => element.textContent.trim() === ${JSON.stringify(text)})`); }
async function menuMetrics(page, label, domClick = false, captureName) {
  const trigger = `[...document.querySelectorAll('[role="menubar"] > div > button')].find(element => element.textContent.trim() === ${JSON.stringify(label)})`;
  if (domClick) await page.evaluate(`${trigger}?.click()`);
  else await clickExpression(page, trigger);
  await page.wait(`!!document.querySelector('[role="menu"]')`, `${label} menu`);
  const metrics = await page.evaluate(`(() => { const desktop=document.querySelector('#desktop-root'), popup=document.querySelector('[role="menu"]'), items=[...document.querySelectorAll('[role="menu"] [role="menuitem"]')]; const popupStyle=popup ? getComputedStyle(popup) : null; return {label:${JSON.stringify(label)},popup:popup?.getBoundingClientRect().toJSON(),popupStyle:{minWidth:popupStyle?.minWidth,padding:popupStyle?.padding,borderRadius:popupStyle?.borderRadius},items:items.map(item=>{const rect=item.getBoundingClientRect(),style=getComputedStyle(item);return {label:item.textContent.trim(),height:rect.height,minHeight:style.minHeight,padding:style.padding,gap:style.gap,fontSize:style.fontSize};}),desktop:desktop?.getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth,coarse:matchMedia('(pointer: coarse)').matches}; })()`);
  console.log(`MENU ${metrics.label}: popup ${Math.round(metrics.popup?.width ?? 0)}×${Math.round(metrics.popup?.height ?? 0)}, rows ${metrics.items.map(item => Math.round(item.height)).join('/')}`);
  if (captureName) await page.screenshot(captureName);
  await key(page, "Escape", "Escape", 27);
  await page.wait(`!document.querySelector('[role="menu"]')`, `${label} menu dismissal`);
  return metrics;
}
async function key(page, keyName, code = keyName, virtualKey) {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code, windowsVirtualKeyCode: virtualKey });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: virtualKey });
}
async function typeCommand(page, commandText) {
  await click(page, '[aria-label="Terminal command"]');
  await page.send("Input.insertText", { text: commandText });
  await key(page, "Enter", "Enter", 13);
}
async function boot(page) {
  await page.navigate();
  await page.wait(`!!document.querySelector('#desktop-root')&&!document.querySelector('[data-startup-overlay]')`, "desktop entry");
  await sleep(650);
}

let failed = 0;
async function scenario(name, options, run) {
  const page = await pageFor(options);
  try {
    await run(page);
    assert.deepEqual(page.errors, [], "The scenario must not throw runtime exceptions");
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.stack ?? error.message}`);
    await page.screenshot(`${name}-failure`).catch(() => {});
  } finally {
    await page.close();
  }
}

const baseInit = `localStorage.setItem('portfolio-introduction',JSON.stringify({status:'skipped'}));localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1,iconScale:1,defaultView:'laptop'}));`;

try {
  await scenario("welcome-delay-and-returning-visit", {
    init: `localStorage.removeItem('portfolio-introduction');localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1,iconScale:1,defaultView:'laptop'}));window.__welcomePageAt=performance.now();window.__welcomeShownAt=null;new MutationObserver(()=>{if(window.__welcomeShownAt===null&&document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]'))window.__welcomeShownAt=performance.now();}).observe(document,{childList:true,subtree:true});`,
  }, async page => {
    await page.navigate();
    await page.wait(`!!document.querySelector('#desktop-root')&&!document.querySelector('[data-startup-overlay]')`, "fresh desktop entry");
    await page.wait(`!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "delayed welcome");
    const timing = await page.evaluate(`({shownAt:window.__welcomeShownAt,pageAt:window.__welcomePageAt,elapsed:window.__welcomeShownAt-window.__welcomePageAt})`);
    assert.ok(timing.shownAt !== null && timing.elapsed >= 1900, `Welcome should wait about two seconds (${JSON.stringify(timing)})`);
    await page.screenshot("welcome-layered-right-folders");
    await clickText(page, "[data-introduction-panel] button", "Explore projects");
    await page.wait(`!!document.querySelector('[data-window-frame="finder-projects"]')&&!document.querySelector('[data-introduction-panel]')`, "Explore projects action");
  });

  await scenario("welcome-does-not-repeat-on-return", {
    init: `localStorage.setItem('portfolio-introduction',JSON.stringify({status:'skipped'}));localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1,iconScale:1,defaultView:'laptop'}));`,
  }, async page => {
    await boot(page);
    await sleep(2300);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-introduction-panel]')`), false);
  });

  await scenario("r03-menu-and-r04-windows", { init: baseInit }, async page => {
    await boot(page);
    const laptop = await page.evaluate(`(() => { const root=document.querySelector('#desktop-root'),nav=document.querySelector('[data-menu-bar]')||document.querySelector('nav[aria-label="Portfolio menu bar"]'); return {navHeight:nav?.offsetHeight,displayHeight:nav?.getBoundingClientRect().height,menuHeight:root?.dataset.menuHeight,menuLabels:[...document.querySelectorAll('[role="menubar"] > div > button')].map(e=>e.textContent.trim())}; })()`);
    assert.equal(laptop.navHeight, 44); assert.equal(laptop.menuHeight, "44"); assert.equal(laptop.menuLabels[0], "");
    await page.screenshot("after-laptop-menu");
    const laptopViewMenu = await menuMetrics(page, "View", false, "menu-density-laptop-view");
    const laptopFileMenu = await menuMetrics(page, "File", false, "menu-density-laptop-file");
    assert.ok(laptopViewMenu.popup.width <= 190 && laptopViewMenu.popup.height <= 120, `Short laptop menus should stay compact (${JSON.stringify(laptopViewMenu)})`);
    assert.ok(laptopFileMenu.popup.width <= 260 && laptopFileMenu.popup.height > laptopViewMenu.popup.height, `Long laptop menus should grow with their contents (${JSON.stringify({ short: laptopViewMenu.popup, long: laptopFileMenu.popup })})`);

    await click(page, "[data-workspace-trigger]");
    await page.wait(`!!document.querySelector('[data-workspace-picker]')`, "workspace picker");
    await click(page, "[data-screen-view-toggle]");
    await page.wait(`document.querySelector('[data-screen-surface]')?.dataset.screenView==='focused'&&!document.querySelector('[data-screen-surface][data-transitioning]')`, "Screen view");
    const screen = await page.evaluate(`(() => { const root=document.querySelector('#desktop-root'),nav=document.querySelector('nav[aria-label="Portfolio menu bar"]'),notch=document.querySelector('[data-menu-notch]'),rootRect=root?.getBoundingClientRect(),notchRect=notch?.getBoundingClientRect(); return {navHeight:nav?.offsetHeight,displayHeight:nav?.getBoundingClientRect().height,menuHeight:root?.dataset.menuHeight,notch:{center:notchRect?.left+(notchRect?.width||0)/2,rootCenter:rootRect?.left+(rootRect?.width||0)/2,top:notchRect?.top,bottom:notchRect?.bottom,menuBottom:nav?.getBoundingClientRect().bottom}}; })()`);
    assert.equal(screen.navHeight, 28); assert.equal(screen.menuHeight, "28");
    assert.ok(Math.abs(screen.notch.center - screen.notch.rootCenter) < 2 && screen.notch.bottom <= screen.notch.menuBottom + 1, `Notch must stay centered in the menu row (${JSON.stringify(screen.notch)})`);
    await page.screenshot("after-screen-menu");
    const screenViewMenu = await menuMetrics(page, "View", false, "menu-density-screen-view");
    const screenFileMenu = await menuMetrics(page, "File", false, "menu-density-screen-file");
    assert.ok(screenViewMenu.popup.width <= 190 && screenViewMenu.popup.height <= 120, `Short Screen menus should stay compact (${JSON.stringify(screenViewMenu)})`);
    assert.ok(screenFileMenu.popup.width <= 260 && screenFileMenu.popup.height > screenViewMenu.popup.height, `Long Screen menus should grow with their contents (${JSON.stringify({ short: screenViewMenu.popup, long: screenFileMenu.popup })})`);

    await click(page, "[data-workspace-trigger]");
    await click(page, "[data-screen-view-toggle]");
    await page.wait(`document.querySelector('[data-screen-surface]')?.dataset.screenView==='laptop'&&!document.querySelector('[data-screen-surface][data-transitioning]')`, "Settings path back to laptop");

    await click(page, '[data-dock-app="notes"]');
    await page.wait(`!!document.querySelector('[data-window-frame="app-notes"]')`, "Notes window");
    await click(page, '[data-dock-app="terminal"]');
    await page.wait(`!!document.querySelector('[data-window-frame="app-terminal"]')`, "Terminal window");
    await sleep(300);
    const materials = await page.evaluate(`(() => [...document.querySelectorAll('[data-window-frame]')].flatMap(frame => {
      const app = frame.querySelector('[data-terminal-app],[data-notes-app]');
      if (!app) return [];
      const glass = frame.firstElementChild.querySelector('[data-portfolio-glass-surface]');
      return [{ id: frame.dataset.windowFrame, frameBackdrop: getComputedStyle(frame).backdropFilter,
        titleBackdrop: glass ? getComputedStyle(glass).backdropFilter : '', appBackground: getComputedStyle(app).backgroundColor }];
    }))()`);
    assert.ok(materials.length >= 2);
    assert.ok(materials.every(item => item.frameBackdrop === "none" && item.titleBackdrop.includes("blur") && item.appBackground !== "rgba(0, 0, 0, 0)"), JSON.stringify(materials));
    await page.screenshot("overlapping-windows-title-glass");

    const terminalMenu = `[...document.querySelectorAll('[role="menubar"] > div > button')].find(e=>e.textContent.trim()==='Terminal')`;
    await clickExpression(page, terminalMenu);
    await page.wait(`!!document.querySelector('[role="menu"]')`, "Terminal menu");
    await page.screenshot("menu-dropdown-glass");
    await key(page, "Escape", "Escape", 27);
    assert.equal(await page.evaluate(`!!document.querySelector('[role="menu"]')`), false);
    assert.equal(await page.evaluate(`document.activeElement?.textContent?.trim()==='Terminal'`), true);

    const frame = '[data-window-frame="app-terminal"]';
    const normalSize = await page.evaluate(`(() => { const r=document.querySelector(${JSON.stringify(frame)}).getBoundingClientRect(); return {width:r.width,height:r.height}; })()`);
    await click(page, `${frame} [data-window-control="maximize"]`);
    await page.wait(`document.querySelector(${JSON.stringify(`${frame} [data-window-control="maximize"]`)}).ariaLabel==='Restore'`, "Terminal maximize");
    await click(page, `${frame} [data-window-control="maximize"]`);
    await page.wait(`document.querySelector(${JSON.stringify(`${frame} [data-window-control="maximize"]`)}).ariaLabel==='Maximize'`, "Terminal restore");
    const restoredSize = await page.evaluate(`(() => { const r=document.querySelector(${JSON.stringify(frame)}).getBoundingClientRect(); return {width:r.width,height:r.height}; })()`);
    assert.ok(restoredSize.width > 0 && Math.abs(restoredSize.width - normalSize.width) < 2);
  });

  await scenario("r03-menu-density-large-narrow", {
    init: `localStorage.setItem('portfolio-introduction',JSON.stringify({status:'skipped'}));localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1.45,iconScale:1.4,defaultView:'screen'}));`,
  }, async page => {
    await boot(page);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    const file = await menuMetrics(page, "File", false, "menu-density-large-narrow-file");
    assert.equal(file.overflow, false, `Large narrow File menu must stay within the viewport (${JSON.stringify(file)})`);
    assert.ok(file.popup.right <= file.desktop.right + 1 && file.popup.left >= file.desktop.left - 1, `Large narrow File menu must stay in desktop bounds (${JSON.stringify(file)})`);
  });

  await scenario("r03-menu-density-touch", {
    touch: true,
    init: baseInit,
  }, async page => {
    await page.send("Page.navigate", { url: site + "/?view=desktop" });
    await page.wait(`!!document.querySelector('#desktop-root[data-compact-desktop]')`, "compact touch desktop");
    const view = await menuMetrics(page, "View", true, "menu-density-touch-view");
    assert.equal(view.coarse, true, "Touch coverage must use a coarse pointer");
    assert.ok(view.items.every(item => Number.parseFloat(item.minHeight) >= 44), `Touch menu items must retain 44px targets (${JSON.stringify(view.items)})`);
  });

  await scenario("r05-terminal-actions-and-interruption", { init: baseInit }, async page => {
    await boot(page);
    await click(page, '[data-dock-app="terminal"]');
    await page.wait(`!!document.querySelector('[data-terminal-app]')`, "Terminal");
    await page.screenshot("terminal-initial");
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-terminal-suggestion]').length`), 3);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-terminal-suggestion]')].map(e=>e.textContent.trim())`), ["Projects↵", "Skills↵", "About↵"]);
    await click(page, '[data-terminal-suggestion="projects"]');
    await sleep(100);
    await clickText(page, '[data-terminal-app] button', "Show now");
    const projects = await page.evaluate(`({text:document.querySelector('[role="log"]').innerText,links:[...document.querySelectorAll('[role="log"] a')].map(a=>a.href)})`);
    assert.match(projects.text, /Veyra/); assert.match(projects.text, /Adobe Hackathon/); assert.ok(projects.links.includes("https://github.com/OMIZOOMI/Cross-Exam")); assert.ok(projects.links.includes("https://github.com/OMIZOOMI/brand-ai-readiness-audit"));
    const scroll = `document.querySelector('[data-terminal-app] [role="log"]').parentElement`;
    const atLatest = `(() => { const el = ${scroll}; return el.scrollHeight - el.clientHeight > 50 && el.scrollHeight - el.clientHeight - el.scrollTop <= 2; })()`;
    await page.evaluate(`${scroll}.scrollTop = 0`);
    await typeCommand(page, "skills");
    await page.wait(atLatest, "typed command follows output from old history", 3000);
    await key(page, "Escape", "Escape", 27);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-terminal-output][aria-busy="true"]').length`), 0);
    assert.match(await page.evaluate(`document.querySelector('[role="log"]').innerText`), /VISION & EDGE/);
    await typeCommand(page, "project veyra");
    await clickText(page, '[data-terminal-app] button', "Show now");
    assert.match(await page.evaluate(`document.querySelector('[role="log"]').innerText`), /Veyra/);
    await page.screenshot("terminal-project-response");
    await click(page, '[data-terminal-suggestion="projects"]');
    await page.wait(atLatest, "quick action follows while output is streaming", 3000);
    assert.equal(await page.evaluate(`document.querySelector('[role="log"] [aria-busy="true"]') !== null`), true);
    await page.evaluate(`${scroll}.scrollTop = 0`);
    await page.wait(`!document.querySelector('[role="log"] [aria-busy="true"]')`, "manual reading can outlast streaming", 15000);
    assert.ok(await page.evaluate(`${scroll}.scrollTop <= 2`), "streaming must not pull visitors away from earlier output");
    await click(page, '[data-terminal-suggestion="about"]');
    await page.wait(atLatest, "quick action resumes follow from old history", 3000);
    assert.equal(await page.evaluate("window.scrollY"), 0);
  });

  await scenario("r05-reduced-motion-and-narrow-large-text", {
    reduced: true,
    init: `localStorage.setItem('portfolio-introduction',JSON.stringify({status:'skipped'}));localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1.45,iconScale:1.4,defaultView:'screen'}));`,
  }, async page => {
    await boot(page);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await click(page, '[data-dock-app="terminal"]');
    await page.wait(`!!document.querySelector('[data-terminal-app]')`, "narrow Terminal");
    const state = await page.evaluate(`(() => { const frame=document.querySelector('[data-window-frame="app-terminal"]'), root=document.querySelector('#desktop-root'), output=document.querySelector('[data-terminal-output]'); return {width:frame?.getBoundingClientRect().width,rootWidth:root?.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth,suggestions:document.querySelectorAll('[data-terminal-suggestion]').length,busy:output?.getAttribute('aria-busy')}; })()`);
    assert.equal(state.overflow, false); assert.equal(state.suggestions, 3); assert.notEqual(state.busy, "true"); assert.ok(state.width > 0 && state.width <= 391);
    await page.screenshot("terminal-narrow-large-reduced");
    const scroll = `document.querySelector('[data-terminal-app] [role="log"]').parentElement`;
    await click(page, '[data-terminal-suggestion="projects"]');
    await page.wait(`${scroll}.scrollTop > 50`, "instant reduced-motion output follows the latest command", 3000);
    await page.evaluate(`${scroll}.scrollTop = 0`);
    await click(page, '[data-terminal-suggestion="skills"]');
    await page.wait(`(() => { const el = ${scroll}; return el.scrollHeight - el.clientHeight - el.scrollTop <= 2; })()`, "instant reduced-motion output follows from old history", 3000);
    assert.equal(await page.evaluate(`document.querySelector('[role="log"] [aria-busy="true"]') !== null`), false);
  });

  await scenario("r01-r02-entry-still-available", { init: "localStorage.removeItem('portfolio-introduction');localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1,iconScale:1,defaultView:'screen'}));" }, async page => {
    await boot(page);
    await page.wait(`!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "fresh welcome after its delay");
    assert.ok(await page.evaluate(`!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`));
    assert.ok(await page.evaluate(`!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Take a tour')`));
  });
} finally {
  socket.close();
}
if (failed) process.exitCode = 1;
console.log(`${failed ? `${failed} scenario(s) failed` : "All R03–R05 browser scenarios passed"}. Screenshots: ${decodeURIComponent(output.pathname)}`);
