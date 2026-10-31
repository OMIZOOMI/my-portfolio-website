import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import sharp from "sharp";
import {
  DEFAULT_APPEARANCE,
  WALLPAPER_THEMES,
  getWallpaperTheme,
  getWallpaperUrl,
  parseAppearancePreferences,
  resolveWallpaperVariant,
  serializeAppearancePreferences,
} from "../src/data/wallpapers.ts";
import { loadWallpaper } from "../src/components/desktop/wallpaperLoader.ts";

const publicRoot = new URL("../public/", import.meta.url);

describe("wallpaper catalog and appearance preferences", () => {
  test("six unique pairs have twelve distinct desktop URLs and dedicated previews", () => {
    assert.equal(WALLPAPER_THEMES.length, 6);
    assert.equal(new Set(WALLPAPER_THEMES.map(({ id }) => id)).size, 6);
    assert.equal(new Set(WALLPAPER_THEMES.map(({ name }) => name)).size, 6);
    const desktops = WALLPAPER_THEMES.flatMap(({ lightUrl, darkUrl }) => [lightUrl, darkUrl]);
    const previews = WALLPAPER_THEMES.flatMap(({ lightThumbnailUrl, darkThumbnailUrl }) => [
      lightThumbnailUrl,
      darkThumbnailUrl,
    ]);
    assert.equal(new Set(desktops).size, 12);
    assert.equal(new Set(previews).size, 12);
    assert.equal(new Set([...desktops, ...previews]).size, 24);
    for (const url of previews) assert.match(url, /^\/wallpapers\/thumbs\//);
  });

  test("all 24 assets decode with the intended dimensions and small dedicated thumbnails", async () => {
    const desktopDigests = new Set();
    for (const wallpaper of WALLPAPER_THEMES) {
      for (const variant of ["light", "dark"]) {
        const desktopUrl = wallpaper[variant + "Url"];
        const thumbnailUrl = wallpaper[variant + "ThumbnailUrl"];
        for (const [url, width, height, thumbnail] of [
          [desktopUrl, 1600, 1000, false],
          [thumbnailUrl, 320, 200, true],
        ]) {
          const path = fileURLToPath(new URL(url.slice(1), publicRoot));
          const metadata = await sharp(path).metadata();
          assert.equal(metadata.format, "webp", url);
          assert.equal(metadata.width, width, url);
          assert.equal(metadata.height, height, url);
          assert.ok((await stat(path)).size > 0, url);
          // metadata alone reads the header; raw output also verifies the compressed pixels decode.
          const { info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
          assert.equal(info.width, width, url);
          assert.equal(info.height, height, url);
          if (thumbnail) assert.ok((await stat(path)).size < 30_000, url + " must remain below 30 KB");
          else {
            assert.ok((await stat(path)).size <= 700_000, url + " must remain at or below 700 KB");
            desktopDigests.add(createHash("sha256").update(await readFile(path)).digest("hex"));
          }
        }
      }
    }
    assert.equal(desktopDigests.size, 12, "no duplicated desktop placeholder assets");
  });

  test("explicit wallpaper modes ignore UI theme, while auto follows it for every option", () => {
    for (const wallpaper of WALLPAPER_THEMES) {
      for (const theme of ["light", "dark"]) {
        for (const mode of ["light", "dark", "auto"]) {
          const expected = mode === "auto" ? theme : mode;
          assert.equal(resolveWallpaperVariant(mode, theme), expected);
          assert.equal(getWallpaperUrl(wallpaper.id, mode, theme), wallpaper[expected + "Url"]);
        }
      }
    }
  });

  test("normalizes current ids/names and migrates earlier wallpaper names", () => {
    for (const wallpaper of WALLPAPER_THEMES) {
      assert.equal(getWallpaperTheme("  " + wallpaper.id.toUpperCase() + "  ").id, wallpaper.id);
      assert.equal(getWallpaperTheme("  " + wallpaper.name.toUpperCase() + "  ").id, wallpaper.id);
    }
    for (const [name, expected] of Object.entries({
      "Big Sur": "coast",
      " BIG-SUR ": "coast",
      Monterey: "lake",
      Ventura: "alpine",
      Sonoma: "forest",
      Sequoia: "dunes",
    })) assert.equal(getWallpaperTheme(name).id, expected, name);
    for (const value of [undefined, null, "", "unknown", {}, 12]) {
      assert.equal(getWallpaperTheme(value).id, "coast");
    }
  });

  test("corrupt, malformed and unknown saved preferences safely resolve defaults", () => {
    for (const value of [null, "", "{", "null", "[]", "12", '"invalid"', '{"state":null}']) {
      assert.deepEqual(parseAppearancePreferences(value), DEFAULT_APPEARANCE, String(value));
    }
    assert.deepEqual(
      parseAppearancePreferences(JSON.stringify({
        theme: "sepia",
        wallpaper: "missing-id",
        wallpaperMode: "system",
      })),
      DEFAULT_APPEARANCE,
    );
  });

  test("reads direct preferences and old Zustand-style envelopes without restoring unrelated state", () => {
    const preference = { theme: "light", wallpaper: "lake", wallpaperMode: "auto" };
    assert.deepEqual(parseAppearancePreferences(JSON.stringify(preference)), preference);
    assert.deepEqual(
      parseAppearancePreferences(JSON.stringify({
        version: 0,
        state: {
          theme: "light",
          wallpaper: " Monterey ",
          wallpaperMode: "auto",
          fileSystem: { privateFolder: true },
          draggingWindow: "finder",
          windows: [{ x: 10, y: 15 }],
        },
      })),
      preference,
    );
  });

  test("serializes only appearance fields and a normalized wallpaper id", () => {
    const serialized = serializeAppearancePreferences({
      theme: "light",
      wallpaper: "Big Sur",
      wallpaperMode: "dark",
      fileSystem: { folders: ["temporary"] },
      draggingWindow: "finder",
      windows: [{ id: "settings", x: 120 }],
    });
    assert.deepEqual(JSON.parse(serialized), {
      version: 1,
      state: { theme: "light", wallpaper: "coast", wallpaperMode: "dark" },
    });
    assert.deepEqual(parseAppearancePreferences(serialized), {
      theme: "light", wallpaper: "coast", wallpaperMode: "dark",
    });
  });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function withMockImages(run, { complete = false } = {}) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const images = [];
  const timers = new Map();
  let nextTimer = 1;
  class MockImage {
    complete = complete;
    naturalWidth = complete ? 1600 : 0;
    decoding = "";
    onload = null;
    onerror = null;
    decodeCalls = 0;
    source = "";
    decoded = deferred();

    constructor() { images.push(this); }
    set src(value) { this.source = value; }
    get src() { return this.source; }
    decode() { this.decodeCalls += 1; return this.decoded.promise; }
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      Image: MockImage,
      setTimeout(callback, delay) {
        const id = nextTimer++;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
    },
  });
  try { await run({ images, timers }); }
  finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  }
}

const flushMicrotasks = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("shared wallpaper loading", { concurrency: false }, () => {
  test("deduplicates a selected URL and waits for decode before resolving or caching success", async () => {
    await withMockImages(async ({ images, timers }) => {
      const url = "/mock-wallpapers/deduplicated.webp";
      const first = loadWallpaper(url);
      const second = loadWallpaper(url);
      assert.equal(first, second);
      assert.equal(images.length, 1, "does not fetch any unselected wallpaper");
      assert.equal(images[0].src, url);
      assert.equal(images[0].decoding, "async");
      let settled = false;
      void first.then(() => { settled = true; });
      images[0].onload();
      await flushMicrotasks();
      assert.equal(images[0].decodeCalls, 1);
      assert.equal(settled, false, "an onload event alone is insufficient");
      images[0].decoded.resolve();
      assert.equal(await first, url);
      assert.equal(timers.size, 0);
      assert.equal(images[0].onload, null);
      assert.equal(images[0].onerror, null);
      assert.equal(loadWallpaper(url), first);
      assert.equal(images.length, 1, "successful decoded images are reused");
    });
  });

  test("a network failure rejects and leaves the same URL retryable", async () => {
    await withMockImages(async ({ images, timers }) => {
      const url = "/mock-wallpapers/network-retry.webp";
      const first = loadWallpaper(url);
      const rejected = assert.rejects(first, /could not be loaded/);
      images[0].onerror();
      await rejected;
      assert.equal(timers.size, 0);
      const retry = loadWallpaper(url);
      assert.notEqual(retry, first);
      assert.equal(images.length, 2);
      images[1].onload();
      images[1].decoded.resolve();
      assert.equal(await retry, url);
    });
  });

  test("a decode failure also remains retryable", async () => {
    await withMockImages(async ({ images }) => {
      const url = "/mock-wallpapers/decode-retry.webp";
      const first = loadWallpaper(url);
      const rejected = assert.rejects(first, /could not be decoded/);
      images[0].onload();
      images[0].decoded.reject(new Error("invalid image data"));
      await rejected;
      const retry = loadWallpaper(url);
      assert.equal(images.length, 2);
      images[1].onload();
      images[1].decoded.resolve();
      assert.equal(await retry, url);
    });
  });

  test("an already downloaded image is still decoded before it becomes usable", async () => {
    await withMockImages(async ({ images }) => {
      const url = "/mock-wallpapers/already-downloaded.webp";
      const result = loadWallpaper(url);
      assert.equal(images[0].decodeCalls, 1);
      let settled = false;
      void result.then(() => { settled = true; });
      await flushMicrotasks();
      assert.equal(settled, false);
      images[0].decoded.resolve();
      assert.equal(await result, url);
    }, { complete: true });
  });

  test("a stalled request times out, clears handlers, and can be retried without waiting eight seconds", async () => {
    await withMockImages(async ({ images, timers }) => {
      const url = "/mock-wallpapers/timeout-retry.webp";
      const first = loadWallpaper(url);
      const rejected = assert.rejects(first, /took too long/);
      assert.equal(timers.size, 1);
      const timer = [...timers.values()][0];
      assert.equal(timer.delay, 8000);
      timer.callback();
      await rejected;
      assert.equal(timers.size, 0);
      assert.equal(images[0].onload, null);
      assert.equal(images[0].onerror, null);
      const retry = loadWallpaper(url);
      assert.equal(images.length, 2);
      images[1].onload();
      images[1].decoded.resolve();
      assert.equal(await retry, url);
    });
  });
});

