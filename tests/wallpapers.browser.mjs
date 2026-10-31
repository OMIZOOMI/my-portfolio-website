// Node 24, a production server and Chrome's remote-debugging endpoint suffice.
// STARTUP_TEST_URL=http://127.0.0.1:3001 CDP_URL=http://127.0.0.1:9223 node tests/wallpapers.browser.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const site = process.env.STARTUP_TEST_URL ?? "http://127.0.0.1:3000";
const endpoint = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const output = new URL("../.next/wallpaper-verification/", import.meta.url);
const ids = ["coast", "lake", "forest", "dunes", "alpine", "drift"];
const imagePath = (id, variant = "light") => `/wallpapers/${id}-${variant}.webp`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const version = await (await fetch(`${endpoint}/json/version`)).json();
console.log(`Browser: ${version.Browser}`);
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
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  } else for (const listener of listeners) listener(message);
});
function command(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function until(check, label, timeout = 20000) {
  const started = Date.now(); let last;
  while (Date.now() - started < timeout) {
    try { last = await check(); if (last) return last; } catch (error) { last = error.message; }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}
async function pageFor(options = {}) {
  const { browserContextId } = await command("Target.createBrowserContext");
  try {
    const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => command(method, params, sessionId);
    const requests = [], paused = [], errors = [], finished = new Set();
    const onEvent = (event) => {
      if (event.sessionId !== sessionId) return;
      if (event.method === "Network.requestWillBeSent") requests.push(new URL(event.params.request.url).pathname);
      if (event.method === "Network.loadingFinished") finished.add(event.params.requestId);
      if (event.method === "Fetch.requestPaused") paused.push(event.params);
      if (event.method === "Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.text);
    };
    listeners.add(onEvent);
    await send("Runtime.runIfWaitingForDebugger"); await send("Page.bringToFront");
    await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Network.enable")]);
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send("Network.clearBrowserCache");
    if (options.block) await send("Network.setBlockedURLs", { urls: options.block });
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__wallpaperDocument=crypto.randomUUID(); window.__bootSamples=[];
        new MutationObserver(() => {
          const overlay=document.querySelector('[data-startup-overlay]');
          const bar=document.querySelector('[data-startup-progress]');
          if(overlay && bar){const step=bar.getAttribute('aria-valuenow') ?? bar.getAttribute('data-startup-progress');
            if(!window.__bootSamples.length || window.__bootSamples.at(-1).step!==step)
              window.__bootSamples.push({step,text:overlay.textContent});}
        }).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-startup-progress','aria-valuenow']});
        ${options.preferences ? `if(!localStorage.getItem('portfolio-appearance'))localStorage.setItem('portfolio-appearance',${JSON.stringify(JSON.stringify(options.preferences))});` : ""}
        ${options.init ?? ""}`,
    });
    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    }
    return {
      send, evaluate, requests, paused, errors, finished,
      wait: (expression, label, timeout) => until(() => evaluate(expression), label, timeout),
      async navigate() { await send("Page.navigate", { url: site }); },
      async screenshot(name) {
        await mkdir(output, { recursive: true });
        const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(new URL(`${name}.png`, output), Buffer.from(data, "base64"));
      },
      async close() { listeners.delete(onEvent); await command("Target.disposeBrowserContext", { browserContextId }); },
    };
  } catch (error) { await command("Target.disposeBrowserContext", { browserContextId }); throw error; }
}
const current = `document.querySelector('[data-wallpaper-current]')?.getAttribute('data-wallpaper-current')`;
async function wallpaper(page, path, state = "ready") {
  await page.wait(`${current}===${JSON.stringify(path)} && document.querySelector('[data-wallpaper-status]')?.getAttribute('data-wallpaper-status')===${JSON.stringify(state)}`, `${path} (${state})`);
}
async function click(page, selector) {
  await page.evaluate("window.__wallpaperClickPoint=null");
  const point = await page.wait(`(() => {
    const target=document.querySelector(${JSON.stringify(selector)}); if(!target)return false;
    target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    const r=target.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    const hit=document.elementFromPoint(x,y);
    if(!(r.width>0 && x>0 && x<innerWidth && y>0 && y<innerHeight &&
      (hit===target || target.contains(hit))))return false;
    const previous=window.__wallpaperClickPoint, now=performance.now();
    if(!previous || Math.hypot(previous.x-x,previous.y-y)>0.5){window.__wallpaperClickPoint={x,y,at:now};return false;}
    return now-previous.at>=150 ? {x,y}:false;
  })()`, `clickable ${selector}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
}
async function clickLabel(page, text) {
  await page.evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});
    if(!b)throw Error('Missing recovery button'); b.setAttribute('data-wallpaper-test-target','');})()`);
  await click(page, "[data-wallpaper-test-target]");
  await page.evaluate(`document.querySelector('[data-wallpaper-test-target]')?.removeAttribute('data-wallpaper-test-target')`);
}
async function boot(page, path = imagePath("coast")) {
  await page.navigate();
  await page.wait(`!document.querySelector('[data-startup-overlay]') && !!document.querySelector('#desktop-root') && !!document.querySelector('canvas')`, "normal 3D startup", 45000);
  await wallpaper(page, path);
  assert.deepEqual(page.errors, [], "Normal startup must not throw");
}
async function settings(page) {
  await click(page, '[data-dock-app="settings"]');
  await page.wait(`document.querySelectorAll('[data-wallpaper-option]').length===6`, "six wallpaper options");
}
async function thumbnails(page, variant) {
  await page.wait(`(() => {const imgs=[...document.querySelectorAll('img[data-wallpaper-thumbnail]')];
    return imgs.length===6 && imgs.every(img=>img.complete && img.naturalWidth>0 && img.naturalHeight>0 &&
      img.dataset.thumbnailStatus==='ready' && getComputedStyle(img).opacity==='1' &&
      img.getBoundingClientRect().width>0 && img.getBoundingClientRect().height>0 &&
      new URL(img.currentSrc).pathname==='/wallpapers/thumbs/'+img.dataset.wallpaperThumbnail+'-${variant}.webp');})()`, `six visible ${variant} thumbnail images`);
}
function fullImages(page) { return [...new Set(page.requests.filter((path) => /^\/wallpapers\/[a-z]+-(light|dark)\.webp$/.test(path)))].sort(); }
async function choose(page, kind, value) {
  const selector = `[data-${kind}="${value}"]`;
  await click(page, selector);
  if (kind === "appearance-theme") {
    await page.wait(`document.documentElement.classList.contains('dark')===${value === "dark"}`, `${value} appearance committed`);
  } else {
    await page.wait(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-pressed')==='true'`, `${value} selection committed`);
  }
}
let failed = 0;
async function scenario(name, options, run) {
  if (process.env.WALLPAPER_TEST_FILTER && !name.includes(process.env.WALLPAPER_TEST_FILTER)) return;
  const page = await pageFor(options); const started = Date.now();
  try { await run(page); await page.screenshot(name); console.log(`PASS ${name} (${((Date.now()-started)/1000).toFixed(1)}s)`); }
  catch (error) {
    failed++; console.error(`FAIL ${name}: ${error.message}`);
    console.error(JSON.stringify(await page.evaluate(`({current:${current},state:document.querySelector('[data-wallpaper-status]')?.getAttribute('data-wallpaper-status'),
      boot:document.querySelector('[data-startup-overlay]')?.textContent,storage:localStorage.getItem('portfolio-appearance')})`).catch(() => ({}))));
    await page.screenshot(`${name}-failure`).catch(() => {});
  } finally { await page.close(); }
}

try {
  await scenario("cold-start-and-six-thumbnails", {}, async (page) => {
    await boot(page);
    assert.deepEqual(fullImages(page), [imagePath("coast")], "Startup must request only the selected full wallpaper");
    assert.ok(!page.requests.some((path) => path.startsWith("/wallpapers/thumbs/")), "Previews must not compete with startup assets");
    const samples = await page.evaluate("window.__bootSamples");
    assert.ok(samples.some((sample) => sample.text.includes("Loading Om")), "The loader must explain what is loading");
    const steps = samples.map((sample) => Number(sample.step));
    assert.ok(samples.length && samples.every((sample) => sample.step !== null), "Real preparation progress must be exposed");
    assert.ok(steps.every((step) => Number.isInteger(step) && step >= 0 && step <= 5));
    assert.equal(steps.at(-1), 5, "All five preparation steps must complete before handoff");
    await settings(page); await thumbnails(page, "light");
    assert.ok(await page.evaluate(`Array.from(document.querySelectorAll('img[data-wallpaper-thumbnail]')).every(img=>img.loading==='eager')`), "All six small previews must load when Settings opens without scrolling");
    assert.deepEqual(await page.evaluate(`Array.from(document.querySelectorAll('[data-wallpaper-option]'),e=>e.dataset.wallpaperOption).sort()`), [...ids].sort());
    assert.deepEqual(fullImages(page), [imagePath("coast")], "Opening Settings must fetch thumbnails, not the wallpaper collection");
    await page.evaluate(`document.querySelector('[data-wallpaper-mode="dark"]').scrollIntoView({block:'end',behavior:'instant'})`);
    await sleep(1200);
    await page.screenshot("settings-wallpapers");
  });
  await scenario("thumbnail-visibility-does-not-wait-for-decode", {
    init: `const originalDecode=HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode=function(){
        if(this.src.includes('/wallpapers/thumbs/'))return new Promise(()=>{});
        return originalDecode.call(this);
      };`,
  }, async (page) => {
    await boot(page); await settings(page); await thumbnails(page, "light");
    assert.deepEqual(fullImages(page), [imagePath("coast")], "Preview recovery must not fetch full backgrounds");
  });
  await scenario("cached-previews-remain-visible-on-reopen", {}, async (page) => {
    await boot(page); await settings(page); await thumbnails(page, "light");
    await click(page, '[data-window-frame] button[aria-label="Close"]');
    await page.wait(`!document.querySelector('[data-wallpaper-picker]')`, "Settings unmounted");
    await settings(page); await thumbnails(page, "light");
    assert.deepEqual(fullImages(page), [imagePath("coast")]);
  });
  await scenario("explicit-variants-and-automatic-mode", {}, async (page) => {
    await boot(page); await settings(page);
    await choose(page, "wallpaper-option", "lake"); await wallpaper(page, imagePath("lake"));
    await choose(page, "appearance-theme", "dark");
    await choose(page, "wallpaper-mode", "light"); await wallpaper(page, imagePath("lake")); await thumbnails(page, "light");
    await choose(page, "wallpaper-mode", "dark"); await wallpaper(page, imagePath("lake", "dark"));
    await choose(page, "appearance-theme", "light"); await wallpaper(page, imagePath("lake", "dark")); await thumbnails(page, "dark");
    await choose(page, "wallpaper-mode", "auto"); await wallpaper(page, imagePath("lake")); await thumbnails(page, "light");
    await choose(page, "appearance-theme", "dark"); await wallpaper(page, imagePath("lake", "dark")); await thumbnails(page, "dark");
  });
  await scenario("late-response-cannot-replace-new-selection", {}, async (page) => {
    await boot(page); await settings(page);
    await page.send("Fetch.enable", { patterns: [{ urlPattern: `*${imagePath("lake")}`, requestStage: "Response" }] });
    try {
      await choose(page, "wallpaper-option", "lake");
      const held = await until(() => page.paused.find((event) => new URL(event.request.url).pathname === imagePath("lake")), "held old wallpaper response");
      await wallpaper(page, imagePath("coast"), "loading");
      await choose(page, "wallpaper-option", "forest"); await wallpaper(page, imagePath("forest"));
      await page.send("Fetch.continueResponse", { requestId: held.requestId });
      await until(() => page.finished.has(held.networkId), "late old response completion");
      await sleep(250); await wallpaper(page, imagePath("forest"));
    } finally { await page.send("Fetch.disable"); }
  });
  await scenario("failed-wallpaper-keeps-current-and-retries", {}, async (page) => {
    await boot(page); await settings(page);
    await page.send("Network.setBlockedURLs", { urls: [`*${imagePath("lake")}`] });
    await choose(page, "wallpaper-option", "lake"); await wallpaper(page, imagePath("coast"), "error");
    await page.screenshot("wallpaper-failure-recovery");
    await page.send("Network.setBlockedURLs", { urls: [] });
    await clickLabel(page, "Retry wallpaper"); await wallpaper(page, imagePath("lake"));
  });
  await scenario("failed-thumbnail-retries-independently", { block: ["*/wallpapers/thumbs/dunes-light.webp*"] }, async (page) => {
    await boot(page); await settings(page);
    await page.wait(`!!document.querySelector('[data-wallpaper-thumbnail-retry="dunes"]')`, "thumbnail retry control");
    await wallpaper(page, imagePath("coast"));
    assert.deepEqual(fullImages(page), [imagePath("coast")]);
    await page.screenshot("thumbnail-failure-recovery");
    await page.send("Network.setBlockedURLs", { urls: [] });
    await click(page, '[data-wallpaper-thumbnail-retry="dunes"]'); await thumbnails(page, "light");
  });
  await scenario("stalled-thumbnail-offers-retry", {}, async (page) => {
    await boot(page);
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "*/wallpapers/thumbs/dunes-light.webp", requestStage: "Response" }] });
    try {
      await settings(page);
      await until(() => page.paused.some((event) => new URL(event.request.url).pathname === "/wallpapers/thumbs/dunes-light.webp"), "held thumbnail response");
      await page.wait(`!!document.querySelector('[data-wallpaper-thumbnail-retry="dunes"]')`, "stalled thumbnail recovery", 12000);
      assert.equal(await page.evaluate(`document.querySelector('img[data-wallpaper-thumbnail="dunes"]').dataset.thumbnailStatus`), "error");
      await page.screenshot("thumbnail-timeout-recovery");
      // The retry URL bypasses the held response; the old image is unmounted.
      await click(page, '[data-wallpaper-thumbnail-retry="dunes"]'); await thumbnails(page, "light");
      await wallpaper(page, imagePath("coast"));
      assert.deepEqual(fullImages(page), [imagePath("coast")]);
    } finally { await page.send("Fetch.disable"); }
  });
  await scenario("reload-restores-selection-before-loading", {}, async (page) => {
    await boot(page); await settings(page);
    await choose(page, "wallpaper-option", "lake"); await wallpaper(page, imagePath("lake"));
    await choose(page, "wallpaper-mode", "dark"); await wallpaper(page, imagePath("lake", "dark"));
    await choose(page, "appearance-theme", "light"); await wallpaper(page, imagePath("lake", "dark"));
    const previous = await page.evaluate("window.__wallpaperDocument"); page.requests.length = 0;
    await page.send("Page.reload", { ignoreCache: false });
    await page.wait(`window.__wallpaperDocument && window.__wallpaperDocument!==${JSON.stringify(previous)}`, "new reload document");
    await page.wait(`!document.querySelector('[data-startup-overlay]') && !!document.querySelector('#desktop-root')`, "restored startup", 45000);
    await wallpaper(page, imagePath("lake", "dark"));
    assert.deepEqual(fullImages(page), [imagePath("lake", "dark")], "Restored appearance must avoid a default coast request");
    const saved = await page.evaluate(`JSON.parse(localStorage.getItem('portfolio-appearance'))`);
    assert.equal(saved.version, 1); assert.deepEqual(saved.state, { theme: "light", wallpaper: "lake", wallpaperMode: "dark" });
  });
  await scenario("legacy-name-migration-and-persistence-boundary", {
    preferences: { version: 1, state: { theme: "light", wallpaper: "Monterey", wallpaperMode: "dark", draggedItem: { id: "poison" }, desktopIds: [], fileSystem: { poison: [] } } },
  }, async (page) => {
    await boot(page, imagePath("lake", "dark"));
    assert.deepEqual(fullImages(page), [imagePath("lake", "dark")]);
    assert.ok(await page.evaluate(`document.querySelectorAll('#desktop-root > [data-file-item]').length>0`), "Persisted file/drag state must not replace the virtual desktop");
    await settings(page); await choose(page, "appearance-theme", "dark");
    const saved = await page.evaluate(`JSON.parse(localStorage.getItem('portfolio-appearance'))`);
    assert.deepEqual(Object.keys(saved.state).sort(), ["theme", "wallpaper", "wallpaperMode"].sort());
    assert.deepEqual(saved.state, { theme: "dark", wallpaper: "lake", wallpaperMode: "dark" });
  });
  await scenario("loading-screen-shows-real-preparation", {}, async (page) => {
    await page.send("Fetch.enable", { patterns: [{ urlPattern: `*${imagePath("coast")}`, requestStage: "Response" }] });
    try {
      await page.navigate();
      const held = await until(() => page.paused.find((event) => new URL(event.request.url).pathname === imagePath("coast")), "pending startup wallpaper");
      await page.wait(`!!document.querySelector('[data-startup-overlay] [data-startup-progress]')`, "visible preparation progress");
      const progress = await page.evaluate(`Number(document.querySelector('[data-startup-progress]').getAttribute('aria-valuenow'))`);
      assert.ok(progress >= 0 && progress < 5, "A pending critical asset must not be reported complete");
      await page.screenshot("loading-screen");
      await page.send("Fetch.continueResponse", { requestId: held.requestId });
      await page.wait(`!document.querySelector('[data-startup-overlay]') && !!document.querySelector('#desktop-root')`, "handoff after real loading progress", 45000);
      await wallpaper(page, imagePath("coast"));
    } finally { await page.send("Fetch.disable"); }
  });
} finally { socket.close(); }
if (failed) process.exitCode = 1;
console.log(`${failed ? `${failed} scenario(s) failed` : "All wallpaper browser scenarios passed"}. Screenshots: ${decodeURIComponent(output.pathname)}`);
