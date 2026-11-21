// U13 server-rendered production checks. No browser/CDP automation or content mutation.
import assert from "node:assert/strict";
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
const base = "http://127.0.0.1:3012";
const started = Date.now(), results = [];
for (const [path, title, marker] of [
  ["/projects/veyra", "Veyra — Om Sawkare", 'data-public-project="veyra"'],
  ["/projects/adobe-brand-audit", "Adobe Hackathon · Brand AI Readiness Audit — Om Sawkare", 'data-public-project="adobe-brand-audit"'],
  ["/projects/u13-unknown-project", null, "data-project-not-found"],
]) {
  const response = await fetch(base + path), html = await response.text();
  assert.equal(response.status, title ? 200 : 404); assert.ok(html.includes(marker));
  const actualTitle = html.match(/<title>(.*?)<\/title>/)?.[1];
  if (title) assert.equal(actualTitle, title); else assert.match(html, /noindex/);
  assert.doesNotMatch(html, /<canvas|<video|<audio|id="desktop-root"/);
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
  assert.ok(links.length); assert.ok(links.every(link => !link.startsWith("portfolio:")));
  assert.doesNotMatch(html, /rel="canonical"[^>]*(?:localhost|127\.0\.0\.1)/);
  results.push({ path, status: response.status, title: actualTitle, readableInitialHTML: true, mediaElements: 0, links });
}
const home = await (await fetch(base)).text();
for (const text of ["Om Sawkare", "Computer vision, AI workflows, and backend development.", "Quick overview", "Projects", "About", "Contact"]) assert.ok(home.includes(text), text);
results.push({ path: "/", readableIdentityAndNavigationInInitialHTML: true });
const assets = [];
for (const folder of ["public/wallpapers", "public/music", "public/workspaces", "public/macbook.glb"]) {
  for (const name of await readdir(folder)) {
    const path = `${folder}/${name}`, info = await stat(path);
    if (info.isFile() && /\.(webp|mp3|mp4|png|bin|gltf)$/.test(name)) assets.push({ path, bytes: info.size });
  }
}
await writeFile("docs/u13-review/http-results.json", JSON.stringify({ buildID: (await readFile(".next/BUILD_ID", "utf8")).trim(), durationMs: Date.now() - started, conditions: "Loopback HTTP; server checks, not browser navigation timings or cold-cache measurements", results, assets }, null, 2) + "\n");
console.log("U13 HTTP checks passed: home identity, both reading pages, genuine unknown-project 404, metadata, public links and media independence.");
