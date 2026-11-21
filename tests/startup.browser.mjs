// Real browser coverage for the loading-to-3D handoff. Requires Node 24 and a
// running Chrome with --remote-debugging-port=9222; no test dependencies needed.
// STARTUP_TEST_URL=http://127.0.0.1:3001 node tests/startup.browser.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3000";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const output = new URL(process.env.STARTUP_OUTPUT_DIR ?? "../.next/startup-verification/", import.meta.url);
const filter = process.env.STARTUP_TEST_FILTER;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const version = await (await fetch(`${endpoint}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
const listeners = new Set();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  } else {
    for (const listener of listeners) listener(message);
  }
});
function command(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timed out: ${method}`));
    }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function pageFor(options = {}) {
  const { browserContextId } = await command("Target.createBrowserContext");
  try {
    const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId, newWindow: true, background: false });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => command(method, params, sessionId);
    const errors = [];
    const blockedRequests = [];
    const onEvent = (event) => {
      if (event.sessionId !== sessionId) return;
      if (event.method === "Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.text);
      if (event.method === "Network.loadingFailed" && event.params.blockedReason) blockedRequests.push(event.params.blockedReason);
    };
    listeners.add(onEvent);
    // Other DevTools clients can auto-attach and pause newly created targets.
    await send("Runtime.runIfWaitingForDebugger");
    await send("Page.bringToFront");
    // Match the production integration harness: native headless tab focus can
    // otherwise leave visibilityState=hidden and legitimately suspend GSAP/rAF.
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Network.enable")]);
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send("Network.setCacheDisabled", { cacheDisabled: false });
    if (options.cold) await send("Network.clearBrowserCache");
    if (options.block) await send("Network.setBlockedURLs", { urls: options.block });
    if (options.reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__startupObserved = false;
        window.__startupDocument = crypto.randomUUID();
        new MutationObserver(() => {
          if (document.querySelector('[data-startup-overlay]')) window.__startupObserved = true;
        }).observe(document, {childList:true, subtree:true});\n${options.init ?? ""}`,
    });
    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    }
    async function wait(expression, label, timeout = 45000) {
      const started = Date.now();
      let last;
      while (Date.now() - started < timeout) {
        try { last = await evaluate(expression); if (last) return last; } catch (error) { last = error.message; }
        await sleep(120);
      }
      throw new Error(`Timed out waiting for ${label}; last value: ${JSON.stringify(last)}`);
    }
    async function screenshot(name) {
      await mkdir(output, { recursive: true });
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(new URL(`${name}.png`, output), Buffer.from(data, "base64"));
    }
    return {
      send, evaluate, wait, screenshot, errors, blockedRequests,
      async navigate() { await send("Page.navigate", { url: site }); },
      async close() { listeners.delete(onEvent); await command("Target.disposeBrowserContext", { browserContextId }); },
    };
  } catch (error) {
    await command("Target.disposeBrowserContext", { browserContextId });
    throw error;
  }
}

const desktopPoint = `(() => {
  const app = document.querySelector('[data-dock-app="notes"]');
  if (!app) return false;
  const box = app.getBoundingClientRect(), x = box.x + box.width/2, y = box.y + box.height/2;
  const hit = document.elementFromPoint(x,y);
  return box.width > 0 && x > 0 && x < innerWidth && y > 0 && y < innerHeight &&
    hit?.closest('[data-dock-app="notes"]') === app ? {x,y} : false;
})()`;
async function handoff(page) {
  await page.wait(`window.__startupObserved && !document.querySelector('[data-startup-overlay]') &&
    !!document.querySelector('#desktop-root')`, "loader removal and desktop");
  assert.equal(await page.evaluate(`(() => { const c = document.querySelector('canvas');
    const r = c?.getBoundingClientRect(); return !!r && r.width > 100 && r.height > 100; })()`), true,
  "The Canvas must have visible dimensions");
  await page.wait(desktopPoint, "unobstructed desktop hit testing");
}
async function clickAt(page, point) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
}

async function touchViewport(page, width, height) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
}

async function tap(page, selector) {
  await page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',inline:'nearest'})`);
  const point = await page.wait(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) return false;
    const box = target.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    return target.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
  })()`, `hittable ${selector}`);
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
async function assertMenuAtTop(page) {
  // Inspect viewport alignment and real hit testing, not just menu DOM presence.
  const menu = await page.wait(`(() => {
    const bar = document.querySelector('[data-menu-bar]');
    const desktop = bar?.closest('#desktop-root');
    const trigger = bar?.querySelector('[data-menu-key] button');
    if (!trigger || !desktop) return false;
    const bounds = bar.getBoundingClientRect(), display = desktop.getBoundingClientRect(), button = trigger.getBoundingClientRect();
    const hit = document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2);
    return {
      top: bounds.top, expectedTop: display.top, height: bounds.height,
      background: getComputedStyle(bar).backgroundColor, canOpen: trigger.contains(hit),
    };
  })()`, "desktop menu bar");
  assert.ok(menu.height > 0 && Math.abs(menu.top - menu.expectedTop) < 1, JSON.stringify(menu));
  assert.notEqual(menu.background, "rgba(0, 0, 0, 0)", "Menu bar paints a base tint independent of the glass layer");
  assert.equal(menu.canOpen, true, "Menu bar trigger is hit-testable");
}
async function clickButton(page, label) {
  const point = await page.wait(`(() => { const b = [...document.querySelectorAll('button')]
    .find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false;
    const r=b.getBoundingClientRect(); return r.width > 0 ? {x:r.x+r.width/2,y:r.y+r.height/2} : false; })()`, label);
  await clickAt(page, point);
}
const tourPanel = '[data-introduction-panel][data-introduction-phase="active"]';
async function takeTour(page) {
  await page.wait(`(() => {
    const panel = document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]');
    return !!panel && !panel.getAnimations().some(animation => animation.playState === 'running');
  })()`, "settled welcome panel");
  await clickButton(page, "Take a tour");
}
async function waitTourStep(page, step, view = "focused") {
  await page.wait(`!!document.querySelector('${tourPanel}[data-introduction-step="${step}"]') &&
    !!document.querySelector('[data-screen-surface][data-screen-view="${view}"]:not([data-transitioning])')`, `tour ${step} step in ${view} view`);
}
async function clickTourButton(page, label) {
  const point = await page.wait(`(() => {
    const button = [...document.querySelectorAll('${tourPanel} button')].find(button =>
      (button.getAttribute('aria-label') || button.textContent.trim()) === ${JSON.stringify(label)});
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return false;
    const r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return button.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
  })()`, label);
  await clickAt(page, point);
}
async function tourAnchor(page) {
  return page.evaluate(`(() => {
    const panel = document.querySelector('${tourPanel}'), next = panel?.querySelector('button[aria-label^="Next:"]');
    const r = panel?.getBoundingClientRect(), b = next?.getBoundingClientRect();
    return { portal: !!panel?.closest('[data-introduction-viewport]'), top: r?.top, right: r?.right, x: b?.left + b?.width / 2, y: b?.top + b?.height / 2,
      label: next?.textContent.trim() };
  })()`);
}
async function assertStableAnchor(page, start) {
  const anchor = await tourAnchor(page);
  assert.ok(anchor.portal, "The active tour card must be anchored outside the projected desktop");
  assert.equal(anchor.label, "Next");
  for (const key of ["top", "right", "x", "y"]) {
    assert.ok(Math.abs(anchor[key] - start[key]) <= 2, `The guide ${key} must stay put (${JSON.stringify({ start, anchor })})`);
  }
}
async function recovery(page) {
  await page.wait(`!!document.querySelector('[data-startup-overlay][data-state="error"]')`, "actionable startup error");
  assert.equal(await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open flat desktop'));
    return !!b && !b.closest('[aria-hidden="true"]') && !!b.closest('[role="alert"]');
  })()`), true, "Recovery controls must remain accessible outside the failed Canvas");
}

let failed = 0;
async function scenario(name, options, run) {
  if (filter && !name.includes(filter)) return;
  const page = await pageFor(options);
  const started = Date.now();
  try {
    await run(page);
    await page.screenshot(name);
    console.log(`PASS ${name} (${((Date.now()-started)/1000).toFixed(1)}s)`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${error.message}`);
    console.error(JSON.stringify(await page.evaluate(`({url:location.href,
      overlay:document.querySelector('[data-startup-overlay]')?.textContent?.trim(),
      windows:[...document.querySelectorAll('[data-window-frame]')].map(e=>e.dataset.windowFrame)})`).catch(() => ({}))));
    await page.screenshot(`${name}-failure`).catch(() => {});
  } finally { await page.close(); }
}

try {
  for (const [label, width, height] of [["small-phone", 320, 568], ["phone", 390, 844], ["large-phone", 430, 932], ["small-phone-landscape", 568, 320], ["phone-landscape", 844, 390], ["tablet", 768, 1024], ["tablet-landscape", 1024, 768], ["large-tablet", 1376, 1032]]) {
    await scenario(`responsive-${label}`, { reduced: true }, async page => {
      await touchViewport(page, width, height);
      await page.navigate();
      await page.wait(`document.querySelector('[data-portfolio-route="reading"]') && document.querySelector('[data-portfolio-reading] h1')?.textContent === 'Om Sawkare'`, "readable landing");
      const landing = await page.evaluate(String.raw`(() => {
        const root = document.querySelector('[data-portfolio-reading]');
        return { width: root.clientWidth, hasOverflow: root.scrollWidth > root.clientWidth,
          touch: matchMedia('(pointer: coarse)').matches,
          routes: [...root.querySelectorAll('a[href^="/projects/"]')].map(link => link.getAttribute('href')),
          targets: [...root.querySelectorAll('a')].filter(link => link.getClientRects().length).every(link => link.getBoundingClientRect().height >= 44),
          guide: root.querySelector('#reading-guide')?.getBoundingClientRect().height > 0 && root.querySelector('#reading-guide')?.getBoundingClientRect().top < innerHeight - 100 && root.querySelector('#reading-guide')?.textContent.includes('laptop or desktop'),
          heavy: performance.getEntriesByType('resource').filter(item => /macbook\.glb|mediapipe|\.hdr|\.mp4|wallpapers\/touch/.test(item.name)).length,
          desktop: !!document.querySelector('#desktop-root,canvas') };
      })()`);
      assert.equal(landing.width, width);
      assert.equal(landing.hasOverflow, false);
      assert.equal(landing.touch, true);
      assert.deepEqual(landing.routes, ["/projects/veyra", "/projects/adobe-brand-audit"]);
      assert.equal(landing.targets, true);
      assert.equal(landing.guide, true);
      assert.equal(landing.heavy, 0);
      assert.equal(landing.desktop, false);
      await page.screenshot(`responsive-${label}-landing`);
      if (label === "small-phone") {
        await tap(page, '#reading-guide button:not([aria-expanded])');
        await page.wait(`JSON.parse(localStorage.getItem('portfolio-introduction'))?.status === 'skipped'`, "Skip remembers the visitor's choice");
      }
      await tap(page, '#reading-guide [aria-expanded="false"]');
      await page.wait(`document.querySelector('#reading-guide [aria-expanded="true"]')?.textContent === 'Hide guide'`, "Quick guide opens by touch");
      if (label !== "phone") {
        await tap(page, '#reading-guide a[href="/?view=desktop"]');
        const coast = width < height ? "/wallpapers/touch/coast-portrait.webp" : "/wallpapers/coast-light.webp";
        await page.wait(`document.querySelector('#desktop-root[data-compact-desktop] [data-wallpaper-current]')?.dataset.wallpaperCurrent === '${coast}'`, "Coast fits the device orientation");
        assert.equal(await page.evaluate(`!!document.querySelector('canvas')`), false);
        return;
      }
      await page.screenshot("responsive-phone-guide");
      await tap(page, '#reading-guide div[id] > button');
      await page.wait(`document.querySelector('#reading-guide [aria-expanded="false"]')?.textContent === 'Open guide' && JSON.parse(localStorage.getItem('portfolio-introduction'))?.status === 'completed'`, "completed guide stays available to reopen");

      await tap(page, '[data-portfolio-reading] nav a[href="#reading-contact"]');
      await page.wait(`location.hash === '#reading-contact' && document.querySelector('[data-portfolio-reading]').scrollTop > 0`, "contact anchors on mobile");
      assert.equal(await page.evaluate(`document.querySelector('#reading-contact a[href^="mailto:"]').getAttribute('href')`), "mailto:sawkare.om@gmail.com");
      await tap(page, '[data-portfolio-reading] a[href="/projects/veyra"]');
      await page.wait(`location.pathname === '/projects/veyra' && !!document.querySelector('[data-public-project]')`, "Veyra case study");
      assert.equal(await page.evaluate(`(() => { const r=document.querySelector('[data-public-project]'); return r.scrollWidth <= r.clientWidth; })()`), true);
      await tap(page, '[data-public-project] nav a[href="/projects/adobe-brand-audit"]');
      await page.wait(`location.pathname === '/projects/adobe-brand-audit' && document.querySelector('[data-public-project]')?.textContent.includes('Adobe')`, "Adobe case study");
      assert.equal(await page.evaluate(`(() => { const r=document.querySelector('[data-public-project]'); return r.scrollWidth <= r.clientWidth; })()`), true);
      await tap(page, '[data-public-project] a[href*="?project="]');
      await page.wait(`!!document.querySelector('#desktop-root[data-compact-desktop]') && !!document.querySelector('[data-window-frame]')`, "deep link opens a case study in the touch desktop");
      assert.equal(await page.evaluate(`!!document.querySelector('canvas,[data-menu-notch]')`), false);
      await page.wait(`document.querySelector('[data-wallpaper-current]')?.dataset.wallpaperCurrent === '/wallpapers/touch/coast-portrait.webp'`, "Coast starts with the portrait asset");
      await tap(page, '[data-window-frame="file-adobe-brand-audit"] [data-window-control="close"]');
      await page.wait(`!document.querySelector('[data-window-frame="file-adobe-brand-audit"]')`, "case study window closes by touch");
      await tap(page, '[data-file-surface="desktop"] [aria-label="Open Projects"]');
      await page.wait(`!!document.querySelector('[data-window-frame="finder-projects"]')`, "one tap on Projects opens its folder");
      await tap(page, '[data-dock-app="notes"]');
      await page.wait(`!!document.querySelector('[data-notes-app]')`, "Notes opened by touch");
      await page.evaluate(`(() => { window.__responsiveDesktop = document.querySelector('#desktop-root'); window.__responsiveNotes = document.querySelector('[data-notes-app]'); })()`);
      await tap(page, '[data-menu-bar] a[href="/?view=reading"]');
      await page.wait(`document.querySelector('[data-portfolio-route="reading"]') && document.querySelector('main[aria-label="Interactive portfolio"]').inert`, "return to reading page");
      assert.equal(await page.evaluate(`document.activeElement?.id`), "reading-title", "Returning from the desktop moves focus into the visible page");
      await page.evaluate(`document.querySelector('[data-portfolio-reading] a[href="/?view=desktop"]').focus()`);
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await page.wait(`document.querySelector('[data-portfolio-route="desktop"]') && document.querySelector('#desktop-root') === window.__responsiveDesktop && document.querySelector('[data-notes-app]') === window.__responsiveNotes`, "return keeps the same desktop and Notes instance");
      await page.evaluate(`history.back()`);
      await page.wait(`document.querySelector('[data-portfolio-route="reading"]') && document.activeElement?.id === 'reading-title'`, "browser Back returns to reading with focus");
      await page.evaluate(`history.forward()`);
      await page.wait(`document.querySelector('[data-portfolio-route="desktop"]') && document.querySelector('[data-notes-app]') === window.__responsiveNotes`, "browser Forward restores the same Notes window");
      await touchViewport(page, height, width);
      await page.wait(`document.querySelector('#desktop-root').getBoundingClientRect().width === ${height}`, "rotation resizes the desktop without changing modes");
      await page.wait(`document.querySelector('[data-wallpaper-current]')?.dataset.wallpaperCurrent === '/wallpapers/coast-light.webp'`, "rotation switches to the landscape asset");
      await tap(page, '[data-dock-app="settings"]');
      await page.wait(`document.querySelectorAll('[data-wallpaper-option]').length === 2`, "touch Settings has two wallpaper options");
      assert.equal(await page.evaluate(`!!document.querySelector('[data-wallpaper-mode]')`), false);
      await tap(page, '[data-wallpaper-option="dunes"]');
      await page.wait(`document.querySelector('[data-wallpaper-current]')?.dataset.wallpaperCurrent === '/wallpapers/dunes-light.webp'`, "Dunes fits landscape");
      await touchViewport(page, width, height);
      await page.wait(`document.querySelector('[data-wallpaper-current]')?.dataset.wallpaperCurrent === '/wallpapers/touch/dunes-portrait.webp'`, "Dunes switches to portrait on rotation");
      await tap(page, '[data-window-frame="app-settings"] [data-window-control="close"]');
      await page.send("Page.reload");
      await page.wait(`document.querySelector('[data-wallpaper-current]')?.dataset.wallpaperCurrent === '/wallpapers/touch/dunes-portrait.webp'`, "Dunes persists on reload");
      assert.deepEqual(page.errors, []);
    });
  }
  await scenario("cold-and-warm-handoff", { cold: true }, async (page) => {
    await page.navigate();
    await handoff(page);
    await assertMenuAtTop(page);
    await clickAt(page, await page.wait(desktopPoint, "Notes dock target"));
    await page.wait(`!!document.querySelector('[data-window-frame="app-notes"]')`, "Notes window after physical click");
    assert.deepEqual(page.errors, [], "Normal startup must not throw runtime exceptions");
    await page.screenshot("cold-desktop-with-notes");
    const previousDocument = await page.evaluate("window.__startupDocument");
    await page.send("Page.reload", { ignoreCache: false });
    await page.wait(`window.__startupDocument && window.__startupDocument !== ${JSON.stringify(previousDocument)}`, "new document after reload");
    await handoff(page);
    await assertMenuAtTop(page);
    await clickButton(page, "View");
    await page.wait(`!!document.querySelector('[data-menu-bar] [role="menu"]')`, "Screen view menu opens");
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await page.wait(`!document.querySelector('[data-menu-bar] [role="menu"]')`, "Escape dismisses the menu");
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await page.wait(`!!document.querySelector('[data-screen-view="laptop"]:not([data-transitioning])')`, "return to the laptop");
    await assertMenuAtTop(page);
    assert.equal(await page.evaluate(`(() => {
      const display = document.getElementById('desktop-root').getBoundingClientRect();
      return display.left > 10 && display.top > 10 && display.right < innerWidth - 10 && display.bottom < innerHeight;
    })()`), true, "desktop stays inside the projected laptop after the zoom settles");
    await clickButton(page, "View");
    await page.wait(`!!document.querySelector('[data-menu-bar] [role="menu"]')`, "laptop menu opens");
  });
  await scenario("reduced-motion", { reduced: true }, async (page) => {
    await page.navigate(); await handoff(page);
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await sleep(200);
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await sleep(200);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-startup-overlay]')`), false,
      "Changing motion preferences after handoff must not restore the loader");
  });
  for (const [name, block] of [["model", ["*/macbook.glb/scene.gltf*"]], ["lighting", ["*potsdamer_platz*.hdr*"]]]) {
    await scenario(`${name}-failure-and-retry`, { cold: true, block }, async (page) => {
      await page.navigate(); await recovery(page);
      assert.ok(page.blockedRequests.length, "The intended critical asset request must have been blocked");
      await page.screenshot(`${name}-recovery`);
      await page.send("Network.setBlockedURLs", { urls: [] });
      await clickButton(page, "Retry 3D view"); await handoff(page);
    });
  }
  await scenario("wallpaper-failure-fallback", {
    cold: true,
    block: ["coast", "lake", "forest", "dunes", "alpine", "drift"].map((id) => `*/wallpapers/${id}-light.webp`),
  }, async (page) => {
    await page.navigate(); await handoff(page);
    assert.ok(page.blockedRequests.length, "Wallpaper requests must actually fail");
    assert.equal(await page.evaluate(`!!document.querySelector('[data-startup-overlay][data-state="error"]')`), false);
  });
  await scenario("unavailable-webgl-flat-desktop", {
    init: `const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type,...args) {
        return /^webgl/.test(type) ? null : originalGetContext.call(this,type,...args);
      };`,
  }, async (page) => {
    await page.navigate(); await recovery(page);
    await clickButton(page, "Open flat desktop");
    await page.wait(`!document.querySelector('[data-startup-overlay]') && !!document.querySelector('#desktop-root')`, "flat desktop");
    await clickAt(page, await page.wait(desktopPoint, "flat desktop dock"));
    await page.wait(`!!document.querySelector('[data-window-frame="app-notes"]')`, "usable flat desktop Notes");
  });
  await scenario("context-loss-and-retry", {}, async (page) => {
    await page.navigate(); await handoff(page);
    await page.evaluate(`document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true}))`);
    await recovery(page); await page.screenshot("context-loss-recovery");
    await clickButton(page, "Retry 3D view"); await handoff(page);
  });
  await scenario("stalled-lighting-deadline", {
    cold: true,
    // Accelerate only the application's 30-second recovery deadline, never its
    // entrance/animation timing. The real HDR request remains deliberately held.
    init: `const nativeTimeout = window.setTimeout;
      window.setTimeout = (fn,ms,...args) => nativeTimeout(fn,ms === 30000 ? 2500 : ms,...args);`,
  }, async (page) => {
    let intercepted = false;
    const listener = (event) => {
      if (event.method === "Fetch.requestPaused" && event.params.request.url.includes("potsdamer_platz")) intercepted = true;
    };
    listeners.add(listener);
    try {
      await page.send("Fetch.enable", { patterns: [{ urlPattern: "*potsdamer_platz*.hdr*", requestStage: "Request" }] });
      await page.navigate(); await recovery(page);
      assert.ok(intercepted, "A pending HDR request must exercise the stalled-asset path");
      await clickButton(page, "Open flat desktop");
      await page.wait(`!!document.querySelector('#desktop-root') && !document.querySelector('[data-startup-overlay]')`, "fallback after asset deadline");
    } finally { listeners.delete(listener); await page.send("Fetch.disable"); }
  });
  await scenario("welcome-entry-animation", {}, async (page) => {
    await page.navigate();
    await page.wait(`!!document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "ready welcome notification");
    await page.evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Take a tour')?.click()`);
    await page.wait(`!!document.querySelector('[data-introduction-panel][data-introduction-phase="active"]')`, "tour start");
    await page.evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Skip')?.click()`);
    await page.wait(`!document.querySelector('[data-introduction-panel]')`, "tour skip");
    await page.evaluate(`document.querySelector('[data-menu-key="Om"] > button')?.click()`);
    await page.wait(`!!document.querySelector('[data-menu-action="Replay introduction"]')`, "Om menu replay action");
    await page.evaluate(`document.querySelector('[data-menu-action="Replay introduction"]')?.click()`);
    await page.wait(`!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "replayed welcome notification");
    await page.evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Explore projects')?.click()`);
    await page.wait(`!document.querySelector('[data-introduction-panel]')&&!!document.querySelector('[data-window-frame]')`, "project action");
    await page.evaluate(`document.querySelector('[data-menu-key="Om"] > button')?.click()`);
    await page.wait(`!!document.querySelector('[data-menu-action="Replay introduction"]')`, "second Om menu replay action");
    await page.evaluate(`document.querySelector('[data-menu-action="Replay introduction"]')?.click()`);
    await page.wait(`!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "second replayed welcome notification");
    await page.evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Dismiss')?.click()`);
    await page.wait(`!document.querySelector('[data-introduction-panel]')`, "welcome dismissal");
    await page.evaluate(`document.querySelector('[data-menu-key="Om"] > button')?.click()`);
    await page.wait(`!!document.querySelector('[data-menu-action="Replay introduction"]')`, "animation replay action");
    await page.evaluate(`document.querySelector('[data-menu-action="Replay introduction"]')?.click()`);
    await page.wait(`!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "animation welcome notification");
    await sleep(40);
    const midpoint = await page.evaluate(`(() => { const panel = document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]'); const animation = panel?.getAnimations()[0]; return { transform: panel ? getComputedStyle(panel).transform : null, currentTime: animation?.currentTime ?? null, right: panel?.getBoundingClientRect().right ?? null, desktopRight: document.getElementById('desktop-root')?.getBoundingClientRect().right ?? null }; })()`);
    assert.ok(midpoint.transform && midpoint.transform !== "none", "The welcome must have a visible entry transform while it is entering");
    assert.ok(midpoint.currentTime !== null && midpoint.currentTime < 360, "The captured frame must be during the welcome animation");
    assert.ok(midpoint.right > midpoint.desktopRight, "The midpoint must begin beyond the virtual desktop edge");
    await page.screenshot("welcome-midpoint");
    await page.wait(`!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')?.getAnimations().some(animation => animation.playState === 'running')`, "welcome animation settle");
    await page.screenshot("welcome-settled");
    const settled = await page.evaluate(`(() => { const panel = document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]'); const rect = panel?.getBoundingClientRect(); const desktop = document.getElementById('desktop-root')?.getBoundingClientRect(); return { transform: panel ? getComputedStyle(panel).transform : null, right: rect?.right ?? null, desktopRight: desktop?.right ?? null, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
    assert.ok(settled.transform === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(settled.transform), "The welcome must settle without a transform");
    assert.ok(settled.right <= settled.desktopRight + 1, "The settled welcome must remain inside the virtual desktop");
    assert.equal(settled.overflow, false, "The off-canvas animation must not create page overflow");
  });
  await scenario("welcome-light-theme", {
    cold: true,
    init: `localStorage.setItem('portfolio-appearance',JSON.stringify({state:{theme:'light',wallpaper:'coast',wallpaperMode:'light'}}));`,
  }, async (page) => {
    await page.navigate();
    await page.wait(`!!document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "light-theme welcome");
    await sleep(420);
    await page.screenshot("welcome-light-theme");
    const details = await page.evaluate(`(() => { const panel = document.querySelector('[data-introduction-panel]'); const rect = panel?.getBoundingClientRect(); const desktop = document.getElementById('desktop-root')?.getBoundingClientRect(); const style = panel ? getComputedStyle(panel) : null; return { dark: document.documentElement.classList.contains('dark'), background: style?.backgroundColor ?? null, filter: style?.backdropFilter ?? null, right: rect?.right ?? null, desktopRight: desktop?.right ?? null, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
    assert.equal(details.dark, false, "The light theme must be active");
    assert.ok(details.background && details.right <= details.desktopRight + 1, "The light welcome must stay inside the desktop");
    assert.equal(details.overflow, false, "The light welcome must not create page overflow");
  });
  await scenario("welcome-saved-laptop", {
    cold: true,
    init: `localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1,iconScale:1,defaultView:'laptop'}));`,
  }, async (page) => {
    await page.navigate();
    await page.wait(`!!document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "saved laptop welcome");
    await sleep(420);
    await page.screenshot("welcome-saved-laptop");
    const details = await page.evaluate(`(() => { const panel = document.querySelector('[data-introduction-panel]'); const rect = panel?.getBoundingClientRect(); const desktop = document.getElementById('desktop-root')?.getBoundingClientRect(); return { view: document.querySelector('[data-screen-surface]')?.dataset.screenView ?? null, right: rect?.right ?? 0, desktopRight: desktop?.right ?? 0, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
    assert.equal(details.view, "laptop", "The explicit saved laptop preference must be honoured");
    assert.ok(details.right <= details.desktopRight + 1, "The laptop welcome must remain inside its projected desktop");
    assert.equal(details.overflow, false, "The laptop welcome must not create page overflow");
  });
  await scenario("welcome-narrow-largest", {
    cold: true,
    init: `localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1.45,iconScale:1.4,defaultView:'screen'}));`,
  }, async (page) => {
    await page.navigate();
    await handoff(page);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await page.wait(`!!document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "narrow welcome");
    await sleep(420);
    await page.screenshot("welcome-narrow-largest");
    const details = await page.evaluate(`(() => { const panel = document.querySelector('[data-introduction-panel]'); const root = document.getElementById('desktop-root'); const rect = panel?.getBoundingClientRect(); const desktop = root?.getBoundingClientRect(); const dock = document.querySelector('[data-dock]')?.getBoundingClientRect(); const style = panel ? getComputedStyle(panel) : null; return { panelWidth: rect?.width ?? 0, panelRight: rect?.right ?? 0, panelBottom: rect?.bottom ?? 0, panelMaxHeight: style?.maxHeight ?? null, panelClientHeight: panel?.clientHeight ?? 0, dockTop: dock?.top ?? innerHeight, desktopRight: desktop?.right ?? 0, viewportWidth: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, iconScale: root?.dataset.iconScale ?? null, dockInset: root ? getComputedStyle(root).getPropertyValue('--desktop-dock-inset') : null }; })()`);
    assert.ok(details.panelWidth > 0 && details.panelRight <= details.desktopRight + 1, "The largest notification must remain reachable at narrow width");
    assert.ok(details.panelBottom <= details.dockTop + 1, `The largest notification must remain above the Dock (${JSON.stringify(details)})`);
    assert.equal(details.viewportWidth, 390);
    assert.equal(details.overflow, false, "The narrow largest notification must not create page overflow");
    assert.equal(details.iconScale, "1.4");
  });
  await scenario("r02-tour-skip-restores-view", {}, async (page) => {
    await page.navigate();
    await page.wait(`!!document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "tour welcome in Screen view");
    await takeTour(page);
    await waitTourStep(page, "laptop", "laptop");
    await clickTourButton(page, "Skip");
    await page.wait(`!document.querySelector('[data-introduction-panel]')&&!document.querySelector('[data-introduction-cursor]')&&!document.querySelector('[data-introduction-highlight]')&&!!document.querySelector('[data-screen-surface][data-screen-view="focused"]:not([data-transitioning])')`, "skip restores Screen view and cleans up the guide");
    assert.equal(await page.evaluate(`localStorage.getItem('portfolio-readability')`), null, "Skipping must not persist an incidental view");
    assert.equal(await page.evaluate(`JSON.parse(localStorage.getItem('portfolio-introduction')).status`), "skipped");
  });
  await scenario("r02-guided-tour-flow", {}, async (page) => {
    await page.navigate();
    await page.wait(`!!document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "tour entry");
    await takeTour(page);
    await waitTourStep(page, "laptop", "laptop");
    await page.wait(`Number(document.querySelector('[data-introduction-cursor]')?.dataset.cursorDuration) >= 700`, "Laptop cursor glides toward Settings");
    await page.wait(`(() => {
      const cursor = document.querySelector('[data-introduction-cursor] svg'), gear = document.querySelector('[data-workspace-trigger]');
      if (!cursor || !gear) return false;
      const c = cursor.getBoundingClientRect(), g = gear.getBoundingClientRect();
      return Math.abs(c.left + 3 - (g.left + g.width/2)) < 12 && Math.abs(c.top + 2.5 - (g.top + g.height/2)) < 12;
    })()`, "The visible guide cursor points at the actual Laptop settings gear");
    const cursor = await page.evaluate(`(() => { const e=document.querySelector('[data-introduction-cursor]'); const style=getComputedStyle(e); return {aria:e.getAttribute('aria-hidden'),pointer:style.pointerEvents,target:!!document.querySelector('[data-introduction-highlight]'),transition:style.transitionProperty}; })()`);
    assert.equal(cursor.aria, "true"); assert.equal(cursor.pointer, "none"); assert.ok(cursor.target); assert.match(cursor.transition, /transform/);
    const anchor = await tourAnchor(page);
    await assertStableAnchor(page, anchor);
    await page.screenshot("r02-laptop-settings-cursor");
    await clickTourButton(page, "Next: Screen view");
    await waitTourStep(page, "screen");
    await assertStableAnchor(page, anchor);
    await page.screenshot("r02-screen-readability");
    await clickTourButton(page, "Back");
    await waitTourStep(page, "laptop", "laptop");
    await assertStableAnchor(page, anchor);
    await clickTourButton(page, "Next: Screen view");
    await waitTourStep(page, "screen");
    await page.wait(`!!document.querySelector('[data-introduction-cursor]')`, "Screen settings cursor");
    await clickTourButton(page, "Next: Projects");
    await waitTourStep(page, "projects");
    await assertStableAnchor(page, anchor);
    await page.wait(`Number(document.querySelector('[data-introduction-cursor]')?.dataset.cursorDuration) >= 700`, "Projects cursor travels from Settings");
    await sleep(180);
    await page.screenshot("r02-projects-cursor-midpoint");
    await sleep(750);
    const projectsCursor = await page.evaluate(`(() => {
      const cursor=document.querySelector('[data-introduction-cursor]'), tip=cursor?.querySelector('[class*="cursorTooltip"]'), rect=tip?.getBoundingClientRect();
      const panel=document.querySelector('${tourPanel}')?.getBoundingClientRect();
      return {transition:cursor && getComputedStyle(cursor).transitionProperty, tooltip:rect?.toJSON(), viewport:innerWidth,
        hidden:tip && getComputedStyle(tip).visibility === 'hidden', overlaps:rect && panel && rect.left < panel.right - 2 && rect.right > panel.left + 2 && rect.top < panel.bottom - 2 && rect.bottom > panel.top + 2};
    })()`);
    assert.match(projectsCursor.transition, /transform/);
    assert.ok(projectsCursor.tooltip && projectsCursor.tooltip.width > 0 && projectsCursor.tooltip.left >= -1 && projectsCursor.tooltip.right <= projectsCursor.viewport + 1, `Projects cursor tooltip must stay visible (${JSON.stringify(projectsCursor)})`);
    assert.ok(!projectsCursor.overlaps || projectsCursor.hidden, "The moving tooltip must not show behind the stationary card");
    await page.screenshot("r02-projects-cursor");
    await clickTourButton(page, "Open projects");
    await page.wait(`!!document.querySelector('[data-window-frame="finder-projects"]')`, "Projects action");
    await clickTourButton(page, "Next: Terminal");
    await waitTourStep(page, "terminal");
    await assertStableAnchor(page, anchor);
    await clickTourButton(page, "Open Terminal");
    await page.wait(`!!document.querySelector('[data-window-frame="app-terminal"]')&&!!document.querySelector('[data-terminal-introduction]')`, "Terminal action");
    await sleep(300);
    await page.screenshot("r02-terminal-cursor");
    await clickTourButton(page, "Next: Contact");
    await waitTourStep(page, "contact");
    await assertStableAnchor(page, anchor);
    await clickTourButton(page, "Open GitHub & LinkedIn");
    await page.wait(`!!document.querySelector('[data-window-frame="app-safari"]')&&!!document.querySelector('[data-professional-profiles]')`, "Contact action");
    await sleep(300);
    await page.screenshot("r02-contact-cursor");
    await clickTourButton(page, "Next: Choose a view");
    await waitTourStep(page, "finish");
    assert.equal(await page.evaluate(`!!document.querySelector('[data-introduction-cursor], [data-introduction-highlight]')`), false, "The choice cannot point at itself or leave a box behind the card");
    assert.equal(await page.evaluate(`localStorage.getItem('portfolio-readability')`), null, "Neither demonstration saves a preference");
    await page.screenshot("r02-finish");
    assert.ok(await page.evaluate(`[...document.querySelectorAll('${tourPanel} button')].some(button=>button.textContent.trim()==='Start in Screen view')`));
    await clickTourButton(page, "Start in Laptop view");
    await page.wait(`!document.querySelector('[data-introduction-panel]')&&JSON.parse(localStorage.getItem('portfolio-introduction')||'{}').status==='completed'&&!!document.querySelector('[data-screen-surface][data-screen-view="laptop"]:not([data-transitioning])')`, "Completion returns to chosen Laptop view");
    assert.equal(await page.evaluate(`JSON.parse(localStorage.getItem('portfolio-readability')).defaultView`), "laptop");
    const previous = await page.evaluate("window.__startupDocument");
    await page.send("Page.reload", { ignoreCache: false });
    await page.wait(`window.__startupDocument && window.__startupDocument !== ${JSON.stringify(previous)} && !!document.querySelector('[data-screen-surface][data-screen-view="laptop"]') && !document.querySelector('[data-startup-overlay]')`, "Saved Laptop view survives reload");
    assert.equal(await page.evaluate(`!!document.querySelector('[data-introduction-panel]')`), false, "The completed tour must stay dismissed");
  });
  await scenario("r02-terminal-tour-highlight", { reduced: true }, async (page) => {
    await page.navigate();
    await page.wait(`!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "welcome for Terminal highlight");
    await takeTour(page);
    await waitTourStep(page, "laptop", "laptop");
    await clickTourButton(page, "Next: Screen view");
    await waitTourStep(page, "screen");
    await clickTourButton(page, "Next: Projects");
    await waitTourStep(page, "projects");
    await clickTourButton(page, "Next: Terminal");
    await waitTourStep(page, "terminal");
    await clickTourButton(page, "Open Terminal");
    const intro = '[data-window-frame="app-terminal"] [data-terminal-introduction]';
    await page.wait(`!!document.querySelector('${intro}')`, "Terminal introduction in the transcript");
    await page.evaluate(`document.querySelector('[data-terminal-suggestion="skills"]').click()`);
    await page.wait(`document.querySelector('[aria-label="Terminal command history"]').textContent.includes('LANGUAGES')`, "enough Terminal output to scroll the introduction away");
    const scrollIntro = (part) => page.evaluate(`(() => {
      const target = document.querySelector('${intro}'), viewport = target.parentElement;
      viewport.scrollTop = 0;
      const r = target.getBoundingClientRect(), p = viewport.getBoundingClientRect();
      viewport.scrollTop = Math.max(0, r.top - p.top + r.height * ${part});
    })()`);
    const geometry = `(() => {
      const target = document.querySelector('${intro}'), viewport = target.parentElement;
      const r = target.getBoundingClientRect(), p = viewport.getBoundingClientRect(), visibleTop = Math.max(r.top, p.top), visibleBottom = Math.min(r.bottom, p.bottom);
      const overlay = document.querySelector('[data-introduction-highlight]')?.getBoundingClientRect();
      const cursor = document.querySelector('[data-introduction-cursor] svg')?.getBoundingClientRect();
      const nativeHighlight = document.querySelector('[data-terminal-introduction-highlight]');
      return { transcriptTop: p.top, introTop: r.top, introBottom: r.bottom, visibleHeight: Math.max(0, visibleBottom - visibleTop),
        overlayTop: overlay?.top, overlayBottom: overlay?.bottom, cursorTip: cursor ? { x:cursor.left+3, y:cursor.top+2.5 } : null,
        nativeWithinTranscript: !!nativeHighlight && viewport.contains(nativeHighlight),
        cursorWithinVisibleIntro: !!cursor && cursor.left+3 >= Math.max(r.left,p.left)-2 && cursor.left+3 <= Math.min(r.right,p.right)+2 && cursor.top+2.5 >= visibleTop-2 && cursor.top+2.5 <= visibleBottom+2 };
    })()`;
    await scrollIntro(.67);
    await sleep(400);
    const partial = await page.evaluate(geometry);
    assert.ok(partial.introTop < partial.transcriptTop - 12 && partial.visibleHeight > 28, `The fixture must actually clip the Terminal introduction (${JSON.stringify(partial)})`);
    assert.equal(partial.overlayTop, undefined, `The open Terminal must not use a page-level outline (${JSON.stringify(partial)})`);
    assert.ok(partial.nativeWithinTranscript && partial.cursorWithinVisibleIntro, `A partial introduction keeps its local highlight and cursor on its visible part (${JSON.stringify(partial)})`);
    await page.screenshot("r02-terminal-highlight-partly-scrolled");
    await scrollIntro(1.15);
    await page.wait(`(${geometry}).visibleHeight === 0 && !document.querySelector('[data-introduction-cursor], [data-introduction-highlight]')`, "No floating highlight or cursor when the introduction is fully scrolled away");
    await page.screenshot("r02-terminal-highlight-scrolled-out");
    await scrollIntro(0);
    await page.wait(`(${geometry}).cursorWithinVisibleIntro`, "Terminal hint returns when its introduction is visible");
    await clickAt(page, await page.wait(desktopPoint, "Notes Dock button above the Terminal tutorial"));
    await page.wait(`!!document.querySelector('[data-window-frame="app-notes"][data-window-active="true"]') && !document.querySelector('[data-introduction-cursor], [data-introduction-highlight], [data-terminal-introduction-highlight]')`, "Focus on another window removes Terminal highlighting");
    await page.screenshot("r02-terminal-highlight-unfocused");
    const terminalDock = await page.wait(`(() => {
      const button=document.querySelector('[data-dock-app="terminal"]'), r=button?.getBoundingClientRect();
      if (!r) return false;
      const x=r.left+r.width/2,y=r.top+r.height/2;
      return button.contains(document.elementFromPoint(x,y)) ? {x,y} : false;
    })()`, "Terminal Dock button");
    await clickAt(page, terminalDock);
    await page.wait(`!!document.querySelector('[data-window-frame="app-terminal"][data-window-active="true"]') && (${geometry}).nativeWithinTranscript && (${geometry}).cursorWithinVisibleIntro`, "Terminal highlight returns after refocus");
  });
  await scenario("r02-reduced-motion", {
    reduced: true,
  }, async (page) => {
    await page.navigate();
    await page.wait(`!!document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "reduced-motion R02 entry");
    await page.evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Take a tour')?.click()`);
    await page.wait(`!!document.querySelector('[data-introduction-cursor]')`, "reduced-motion cursor");
    const motion = await page.evaluate(`(() => { const cursor=document.querySelector('[data-introduction-cursor]'), target=document.querySelector('[data-introduction-highlight]'); const style=getComputedStyle(cursor); return {cursorAnimation:style.animationName,cursorTransition:style.transitionDuration,cursorDuration:cursor?.dataset.cursorDuration,targetAnimation:target?getComputedStyle(target).animationName:'none',pointer:style.pointerEvents}; })()`);
    assert.equal(motion.pointer, "none"); assert.equal(motion.cursorAnimation, "none"); assert.equal(motion.cursorTransition, "0s"); assert.equal(motion.cursorDuration, "0"); assert.equal(motion.targetAnimation, "none");
    await page.screenshot("r02-reduced-motion");
  });
  await scenario("r02-largest-narrow-tour", {
    cold: true,
    init: `localStorage.setItem('portfolio-readability',JSON.stringify({interfaceScale:1.45,iconScale:1.4,defaultView:'screen'}));`,
  }, async (page) => {
    await page.navigate();
    await handoff(page);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await page.wait(`!!document.querySelector('[data-workspace-trigger]')&&!document.querySelector('[data-startup-overlay]')&&!!document.querySelector('[data-introduction-panel][data-introduction-phase="welcome"]')`, "largest narrow R02 entry");
    await page.evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Take a tour')?.click()`);
    await page.wait(`!!document.querySelector('[data-introduction-cursor]')`, "largest narrow cursor");
    await sleep(450);
    const details = await page.evaluate(`(() => { const panel=document.querySelector('[data-introduction-panel]')?.getBoundingClientRect(); return {panel:panel?.toJSON(),overflow:document.documentElement.scrollWidth>innerWidth}; })()`);
    assert.ok(details.panel && details.panel.width > 0 && details.panel.right <= 391 && details.panel.bottom <= 845);
    assert.equal(details.overflow, false);
    await page.screenshot("r02-largest-narrow-laptop");
    await waitTourStep(page, "laptop", "laptop");
    await clickTourButton(page, "Next: Screen view");
    await waitTourStep(page, "screen");
    const gear = await page.wait(`(() => {
      const e = document.querySelector('[data-workspace-trigger]'), r = e?.getBoundingClientRect(), p = document.querySelector('${tourPanel}')?.getBoundingClientRect();
      if (!e || !r || !p || !r.width || !p.width) return false;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      return e.contains(document.elementFromPoint(x,y)) ? { x, y, overlaps: r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top } : false;
    })()`, "narrow Screen gear is reachable beside the tour");
    assert.equal(gear.overlaps, false, "Settings must fit outside the stationary guide card at the narrowest tested layout");
    await clickAt(page, gear);
    await page.wait(`!!document.querySelector('[data-workspace-picker]')`, "narrow Screen settings opens");
    assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('${tourPanel}')).visibility`), "hidden", "The narrow guide yields while settings is open");
    assert.equal(await page.evaluate(`!!document.querySelector('[data-workspace-picker] [data-workspace-option], [data-workspace-picker] [data-workspace-pause]')`), false);
    await page.screenshot("r02-largest-narrow-settings");
    const close = await page.wait(`(() => {
      const button = document.querySelector('[data-workspace-picker] button[aria-label="Close portfolio settings"]');
      const r = button?.getBoundingClientRect(); if (!button || !r) return false;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      return button.contains(document.elementFromPoint(x,y)) ? { x, y } : false;
    })()`, "narrow settings close button is reachable");
    await clickAt(page, close);
    await page.wait(`!document.querySelector('[data-workspace-picker]') && getComputedStyle(document.querySelector('${tourPanel}')).visibility === 'visible'`, "closing settings restores the same tour step");
    await clickTourButton(page, "Next: Projects");
    await waitTourStep(page, "projects");
  });
  await scenario("heat-sink-arcade", {
    reduced: true,
    init: `localStorage.setItem('portfolio-introduction','{"status":"skipped"}');`,
  }, async page => {
    await page.navigate();
    await handoff(page);
    const click = async selector => {
      const point = await page.wait(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el || el.disabled) return false;
        const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        return r.width && el.contains(document.elementFromPoint(x,y)) ? { x, y } : false;
      })()`, selector);
      await clickAt(page, point);
    };
    const key = async (value, code = value) => {
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: value, code });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: value, code });
    };
    const game = '[data-heat-sink]';
    const phase = name => `document.querySelector('${game}')?.dataset.heatPhase === '${name}'`;
    const hints = ['[data-heat-player]', '[data-heat-score]', '[data-heat-carried]'];
    await click('[data-dock-app="finder"]');
    await click('[data-finder-location="documents"]');
    await page.wait(`!!document.querySelector('[data-finder-content="documents"]')`, "Documents opens");
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-finder-content="documents"] [data-file-icon], [data-finder-content="documents"] [data-finder-app]').length`), 0);
    await click('[data-finder-location="game"]');
    await page.wait(`!!document.querySelector('[data-finder-app="heat-sink"]')`, "Apps includes Heat Sink");
    assert.equal(await page.evaluate(`!!document.querySelector('[data-dock-app="heat-sink"]')`), false);
    assert.ok(await page.evaluate(`document.querySelectorAll('[data-finder-app] img').length >= 9`), "Apps uses actual artwork for the launchers");
    assert.ok(await page.evaluate(`(() => { const pane = document.querySelector('[data-finder-content="game"]'); return [...pane.querySelectorAll('[data-finder-app]')].every(el => el.getBoundingClientRect().bottom <= pane.getBoundingClientRect().bottom + 1); })()`), "All launchers fit in the default Apps window");
    await page.screenshot("heat-sink-finder-apps");
    await click('[data-finder-app="notes"]');
    await page.wait(`!!document.querySelector('[data-window-frame="app-notes"]')`, "Notes launch from Apps");
    await click('[data-window-frame="app-notes"] [data-window-control="close"]');
    await click('[data-finder-app="heat-sink"]');
    await page.wait(phase("ready"), "Heat Sink ready screen");
    await page.screenshot("heat-sink-ready");
    await click(`${game} input[aria-label="Leaderboard initials"]`);
    await page.send("Input.insertText", { text: "OMS" });
    await click(`${game} [data-heat-board] section button`);
    await page.wait(`${phase("running")} && document.activeElement?.hasAttribute('data-heat-controls')`, "Start puts focus on playfield");
    for (const direction of ["ArrowRight", "ArrowRight", "ArrowUp", "ArrowLeft", "ArrowLeft", "ArrowDown"]) await key(direction);
    await page.wait(`document.querySelector('${hints[1]}')?.textContent === '250'`, "Two cells bank together for a multiplier");
    assert.equal(await page.evaluate(`document.querySelector('${hints[0]}').dataset.heatPlayer`), "4,3");
    assert.equal(await page.evaluate(`document.querySelector('${hints[2]}').textContent`), "0/6");
    await page.screenshot("heat-sink-bank");
    await click('[data-dock-app="notes"]');
    await page.wait(phase("paused"), "Switching apps pauses the run");
    const before = await page.evaluate(`document.querySelector('[data-heat-temperature]').textContent`);
    await sleep(700);
    assert.equal(await page.evaluate(`document.querySelector('[data-heat-temperature]').textContent`), before);
    await click('[data-window-frame="app-notes"] [data-window-control="close"]');
    await click(`${game} [data-heat-board] section button`);
    await page.wait(phase("running"), "Explicit resume");
    await page.wait(`!!document.querySelector('[data-heat-tile][data-terrain="warning"], [data-heat-tile][data-terrain="hot"]')`, "Hazards start during the run", 12000);
    await page.screenshot("heat-sink-running");
    await page.wait(phase("ended"), "Real-time run overheats", 45000);
    const saved = await page.evaluate(`JSON.parse(localStorage.getItem('portfolio-heat-sink-v1'))`);
    assert.deepEqual([saved.best, saved.last.score, saved.last.initials, saved.entries[0].score], [250, 250, "OMS", 250]);
    await page.screenshot("heat-sink-game-over");
    await click(`${game} button[aria-expanded="false"]`);
    await page.wait(`document.querySelector('${game} tbody')?.textContent.includes('OMS')`, "Saved high score appears in Top 10");
    await page.screenshot("heat-sink-leaderboard");
    await page.send("Page.reload", { ignoreCache: false });
    await page.wait(`!document.querySelector('[data-startup-overlay]') && !!document.querySelector('[data-dock-app="finder"]')`, "Desktop reload");
    await click('[data-dock-app="finder"]');
    await click('[data-finder-location="game"]');
    await click('[data-finder-app="heat-sink"]');
    await page.wait(phase("ready"), "Reopen Heat Sink after reload");
    await click(`${game} button[aria-expanded="false"]`);
    await page.wait(`document.querySelector('${game} tbody')?.textContent.includes('OMS')`, "Leaderboard survives reload");
    await click(`${game} button[aria-expanded="true"]`);
    await click(`${game} button[aria-label="Game sound"]`);
    assert.equal(await page.evaluate(`JSON.parse(localStorage.getItem('portfolio-heat-sink-v1')).muted`), true);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await page.wait(`document.querySelector('${game}')?.clientWidth <= 390`, "Narrow app reflow");
    assert.ok(await page.evaluate(`(() => { const app = document.querySelector('${game}'); return app.scrollWidth <= app.clientWidth; })()`));
    await click(`${game} [data-heat-board] section button`);
    await click(`${game} button[aria-label="Move right"]`);
    await page.wait(`document.querySelector('${hints[0]}')?.dataset.heatPlayer === '5,3'`, "Pointer movement controls work in a narrow window");
    await page.screenshot("heat-sink-narrow");
    assert.deepEqual(page.errors, []);
  });
  await scenario("heat-sink-pressure", {
    init: `localStorage.setItem('portfolio-introduction','{"status":"skipped"}');`,
  }, async page => {
    await page.navigate();
    await handoff(page);
    const click = async selector => {
      const point = await page.wait(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const box = el.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        return el.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
      })()`, selector);
      await clickAt(page, point);
    };
    const press = async directions => {
      for (const direction of directions) {
        const key = `Arrow${direction}`;
        await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
        await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
      }
    };
    const routeTo = (selector, exit = false) => page.evaluate(`(() => {
      const tiles = [...document.querySelectorAll('[data-heat-tile]')];
      const targets = new Set(${exit ? "tiles.filter(el => !el.dataset.terrain)" : `tiles.filter(el => el.matches(${JSON.stringify(selector)}) || el.querySelector(${JSON.stringify(selector)}))`});
      const start = document.querySelector('[data-heat-player]').dataset.heatPlayer;
      const seen = new Set([start]);
      const queue = [[start, []]];
      const directions = [['Left',-1,0], ['Right',1,0], ['Up',0,-1], ['Down',0,1]];
      for (const [position, steps] of queue) {
        const [x, y] = position.split(',').map(Number);
        for (const [name, dx, dy] of directions) {
          const id = [x + dx, y + dy].join(',');
          const tile = tiles.find(el => el.dataset.heatTile === id);
          if (!tile || seen.has(id)) continue;
          if (targets.has(tile)) return [...steps, name];
          if (!tile.dataset.terrain) { seen.add(id); queue.push([id, [...steps, name]]); }
        }
      }
      return null;
    })()`);
    await click('[data-dock-app="finder"]');
    await click('[data-finder-location="game"]');
    await click('[data-finder-app="heat-sink"]');
    const originalRandom = `window.__heatNormalRandom`;
    await page.evaluate(`${originalRandom} = Math.random; Math.random = () => 0`);
    try {
      await click('[data-heat-board] section button');
    } finally {
      await page.evaluate(`Math.random = ${originalRandom}; delete ${originalRandom}`);
    }
    await page.wait(`document.activeElement?.hasAttribute('data-heat-controls')`, "game accepts keyboard movement");
    await press(["Right", "Right", "Up", "Down", "Down", "Left", "Left", "Down", "Up", "Left", "Up", "Left", "Right", "Right"]);
    await page.wait(`document.querySelector('[data-heat-score]')?.textContent === '800' && document.querySelector('[data-heat-level]')?.textContent === '3'`, "banking four cells raises pressure");
    const upgrade = await page.wait(`document.querySelector('[data-heat-upgrade]')?.dataset.heatUpgrade`, "rare upgrade drops on the board");
    const towardUpgrade = await routeTo('[data-heat-upgrade]');
    assert.ok(towardUpgrade?.length);
    await press(towardUpgrade);
    await page.wait(`!document.querySelector('[data-heat-upgrade]') && document.querySelector('[aria-label="Run upgrade"]')?.textContent.includes('Upgrade equipped')`, "upgrade can be collected and its tradeoff is visible");
    if (upgrade === "cargo-rack") assert.match(await page.evaluate(`document.querySelector('[data-heat-carried]').textContent`), /\/8$/);
    await page.wait(`document.querySelectorAll('[data-terrain="hot"]').length >= 4`, "higher pressure creates more than three simultaneous hot tiles", 13500);
    const towardHot = await routeTo('[data-terrain="hot"]');
    assert.ok(towardHot?.length);
    await press(towardHot.slice(0, -1));
    const before = await page.evaluate(`parseInt(document.querySelector('[data-heat-temperature]').textContent)`);
    await press(towardHot.slice(-1));
    await page.wait(`(() => {
      const wash = document.querySelector('[data-heat-hit]');
      return wash && getComputedStyle(wash).opacity > .35 && getComputedStyle(wash).pointerEvents === 'none' &&
        document.querySelector('[data-heat-sink]').textContent.includes('Heat rising twice as fast');
    })()`, "crossing a hot tile visibly tints the game window", 4000);
    assert.ok(await page.evaluate(`parseInt(document.querySelector('[data-heat-temperature]').textContent) >= ${before + 8}`));
    await page.screenshot("heat-sink-hot-tile");
    const away = await routeTo("", true);
    assert.ok(away?.length);
    await press(away);
    await page.wait(`!document.querySelector('[data-heat-hit]')`, "red tint fades off the hot tile", 4000);
    await page.screenshot("heat-sink-upgraded");
    await page.wait(`document.querySelector('[data-heat-sink]')?.dataset.heatPhase === 'ended'`, "upgraded run ends", 32000);
    assert.equal(await page.evaluate(`document.querySelector('[aria-label="Run upgrade"],[data-heat-upgrade]') === null`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-heat-carried]').textContent`), "0/6");
    assert.equal(await page.evaluate(`document.querySelector('[data-heat-score]').textContent`), "800");
    await click('[data-heat-board] section button');
    await page.wait(`document.querySelector('[data-heat-carried]')?.textContent === '0/6' && document.querySelector('[data-heat-score]')?.textContent === '0'`, "restart begins without upgrades");
    assert.deepEqual(page.errors, []);
  });
  await scenario("keyboard-click-recovery", {
    reduced: true,
    init: `
      localStorage.setItem('portfolio-introduction','{"status":"skipped"}');
      window.__clickStarts = 0;
      const makeSource = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function() {
        window.__typingAudio = this;
        const source = makeSource.call(this), start = source.start;
        source.start = function(...args) { window.__clickStarts++; return start.apply(this, args); };
        return source;
      };`,
  }, async page => {
    await page.navigate();
    await handoff(page);
    const down = () => page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA" });
    const up = () => page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA" });
    assert.equal(await page.evaluate("window.__clickStarts"), 0);
    await down();
    await page.wait("window.__clickStarts === 1", "first trusted key unlocks sound");
    await down();
    await page.wait("window.__clickStarts === 2", "another press still sounds after a lost keyup");
    await up();
    await page.wait("window.__clickStarts === 3", "one quiet release follows");
    await page.evaluate("window.__typingAudio.suspend()");
    await down();
    await page.wait("window.__clickStarts === 4 && window.__typingAudio.state === 'running'", "first key after suspension recovers audio");
    await up();
    await page.wait("window.__clickStarts === 5", "release after resume");
    await page.evaluate("window.__typingAudio.close()");
    await down();
    await page.wait("window.__clickStarts === 6 && window.__typingAudio.state === 'running'", "a closed audio context is replaced on the next key");
    await up();
    assert.deepEqual(page.errors, []);
  });
} finally {
  socket.close();
}
if (failed) process.exitCode = 1;
console.log(`${failed ? `${failed} scenario(s) failed` : "All startup browser scenarios passed"}. Screenshots: ${decodeURIComponent(output.pathname)}`);
