// Production HTTP acceptance checks. Run explicitly with a local preview active.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.PORTFOLIO_TEST_BASE ?? "http://127.0.0.1:3014";
const checks = [];
for (const [path, expectedTitle, marker] of [
  ["/projects/veyra", "Veyra — Om Sawkare", 'data-public-project="veyra"'],
  ["/projects/adobe-brand-audit", "Adobe Hackathon · Brand AI Readiness Audit — Om Sawkare", 'data-public-project="adobe-brand-audit"'],
  ["/projects/not-a-project", "Project not found — Om Sawkare", "data-project-not-found"],
]) {
  const result = await fetch(base + path), html = await result.text();
  assert.equal(result.status, path.endsWith("not-a-project") ? 404 : 200);
  const title = html.match(/<title[^>]*>(.*?)<\/title>/)?.[1];
  // A hard 404 uses Next's root error document metadata on direct HTTP load.
  // Client navigation can resolve the route-specific not-found title instead.
  if (result.status === 200) assert.equal(title, expectedTitle, path);
  else assert.ok(title?.includes("Om Sawkare"));
  assert.ok(html.includes(marker), path);
  assert.doesNotMatch(html, /<canvas|<video|<audio|id="desktop-root"/);
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
  assert.ok(links.length); assert.ok(links.every(link => !link.startsWith("portfolio:")));
  assert.doesNotMatch(html, /<link rel="canonical"[^>]*localhost|<link rel="canonical"[^>]*127\.0\.0\.1/);
  if (result.status === 404) assert.match(html, /noindex/);
  checks.push({ path, status: result.status, title, serverRendered: true, mediaElements: 0, links });
}
const home = await (await fetch(base)).text();
assert.ok(home.includes("Computer vision, AI workflows, and backend development."));
checks.push({ path: "/", readableIdentityInInitialHTML: true });
await writeFile("docs/u10-review/http-results.json", JSON.stringify(checks, null, 2) + "\n");
console.log("Public project HTTP checks passed: two server-rendered pages, genuine 404, metadata, links, and home identity.");
