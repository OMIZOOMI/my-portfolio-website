// Real browser coverage for the loading-to-3D handoff. Requires Node 24 and a
// running Chrome with --remote-debugging-port=9222; no test dependencies needed.
// STARTUP_TEST_URL=http://127.0.0.1:3001 node tests/startup.browser.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3000";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const output = new URL(process.env.STARTUP_OUTPUT_DIR ?? "../.next/startup-verification/", import.meta.url);
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
async function clickButton(page, label) {
  const point = await page.wait(`(() => { const b = [...document.querySelectorAll('button')]
    .find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false;
    const r=b.getBoundingClientRect(); return r.width > 0 ? {x:r.x+r.width/2,y:r.y+r.height/2} : false; })()`, label);
  await clickAt(page, point);
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
  await scenario("cold-and-warm-handoff", { cold: true }, async (page) => {
    await page.navigate();
    await handoff(page);
    await clickAt(page, await page.wait(desktopPoint, "Notes dock target"));
    await page.wait(`!!document.querySelector('[data-window-frame="app-notes"]')`, "Notes window after physical click");
    assert.deepEqual(page.errors, [], "Normal startup must not throw runtime exceptions");
    await page.screenshot("cold-desktop-with-notes");
    const previousDocument = await page.evaluate("window.__startupDocument");
    await page.send("Page.reload", { ignoreCache: false });
    await page.wait(`window.__startupDocument && window.__startupDocument !== ${JSON.stringify(previousDocument)}`, "new document after reload");
    await handoff(page);
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
} finally {
  socket.close();
}
if (failed) process.exitCode = 1;
console.log(`${failed ? `${failed} scenario(s) failed` : "All startup browser scenarios passed"}. Screenshots: ${decodeURIComponent(output.pathname)}`);
