import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { beforeEach, test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url), cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} }; cache.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const imports = name => {
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith(".")) return load(resolve(dirname(filename), `${name}.ts${name.includes("ProfessionalProfiles") ? "x" : ""}`));
    return require(name);
  };
  runInThisContext(`(function(module,exports,require){${output}\n})`, { filename })(loaded, loaded.exports, imports);
  return loaded.exports;
}
const root = fileURLToPath(new URL("../", import.meta.url));
const source = path => load(resolve(root, "src", path));
const storage = new Map(); globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const { useMailStore: mail } = source("components/window-manager/useMailStore.ts");
const { MAIL_WELCOME, migrateMailWelcome, isPortfolioWelcome } = source("data/mailWelcome.ts");
const { copyContactEmail } = source("components/portfolio/contactActions.ts");
const { PORTFOLIO_PROFILE: profile } = source("data/portfolioProfile.ts");
beforeEach(() => { mail.setState(mail.getInitialState(), true); storage.clear(); });

const legacy = { id: "welcome-1", from: "You", to: "Om Sawkare", subject: "Welcome to my portfolio!", body: "Hi there! Welcome to my portfolio's mail client.\n\nTo get in touch, choose Compose, then Open in your email app. You complete sending in your own email app; this portfolio cannot confirm delivery. Your draft stays here while the portfolio remains open.\n\nLooking forward to hearing from you!", sentAt: 123, read: true, extra: { keep: true } };

test("new welcome names the real author and explains contact without pretending to be received mail", () => {
  const note = mail.getState().inbox[0]; assert.equal(note.from, profile.name); assert.equal(note.subject, "Write to Om");
  assert.match(note.body, /sawkare\.om@gmail\.com/); assert.match(note.body, /cannot confirm delivery/); assert.ok(isPortfolioWelcome(note));
});
test("welcome migration updates only exact built-in content and preserves IDs, metadata and edits", () => {
  const edited = { ...legacy, body: legacy.body + "\nMy own writing" };
  const visitor = { ...legacy, id: "visitor-1" };
  const result = migrateMailWelcome([legacy, edited, visitor]);
  assert.equal(result[0].id, legacy.id); assert.equal(result[0].from, profile.name); assert.equal(result[0].sentAt, 123); assert.equal(result[0].read, true); assert.equal(result[0].extra, legacy.extra);
  assert.equal(result[1], edited); assert.equal(result[2], visitor); assert.equal(isPortfolioWelcome(edited), false);
  const existing = [{ ...legacy, ...MAIL_WELCOME }]; assert.equal(migrateMailWelcome(existing), existing);
  const copies = [{ ...legacy, id: "unverified-copy" }]; const migrated = mail.persist.getOptions().migrate({ inbox: [legacy], sent: copies }, 4);
  assert.equal(migrated.sent, copies); assert.equal(migrated.inbox[0].id, "welcome-1"); assert.equal(migrated.inbox[0].from, profile.name);
});
test("copy reports success only after the canonical email has actually been written", async () => {
  const writes = []; let release;
  const pending = copyContactEmail({ writeText: value => { writes.push(value); return new Promise(resolve => { release = resolve; }); } });
  assert.deepEqual(writes, [profile.email]); release(); assert.deepEqual(await pending, { copied: true, message: "Email copied." });
});
test("missing, rejected and inaccessible clipboard APIs offer manual copy rather than false success", async () => {
  for (const clipboard of [undefined, {}, { writeText: () => Promise.reject(Error("Blocked fixture")) }, { get writeText() { throw Error("Policy fixture"); } }]) {
    const result = await copyContactEmail(clipboard); assert.equal(result.copied, false); assert.match(result.message, /Select the address/);
  }
});
test("cancelled/null and failed handoffs keep the exact draft and all unverified copies", () => {
  const copies = [{ ...legacy, id: "unverified-copy" }]; mail.setState({ sent: copies });
  mail.getState().setDraftSubject("U08 subject & question?"); mail.getState().setDraftBody("Line one\nLine two é"); mail.getState().openComposer();
  const requests = []; globalThis.open = (...args) => { requests.push(args); return null; };
  assert.equal(mail.getState().openDraftInEmailApp(), true);
  assert.deepEqual(requests, [[`mailto:${profile.email}?subject=U08%20subject%20%26%20question%3F&body=Line%20one%0ALine%20two%20%C3%A9`, "_self"]]);
  assert.equal(mail.getState().sent, copies); assert.match(mail.getState().handoffMessage, /cannot confirm delivery/); assert.match(mail.getState().handoffMessage, /If nothing opens/);
  mail.getState().closeComposer(); mail.getState().openComposer(); assert.equal(mail.getState().draftBody, "Line one\nLine two é");
  globalThis.open = () => { throw Error("No email handler fixture"); };
  assert.equal(mail.getState().openDraftInEmailApp(), false); assert.equal(mail.getState().sent, copies); assert.equal(mail.getState().draftSubject, "U08 subject & question?");
  const persisted = JSON.parse(storage.get("mail-store")); assert.equal(persisted.state.draftBody, undefined); assert.equal(persisted.state.composing, undefined);
});
test("profile cards are named native external links with exact shared destinations and no embedded navigation", () => {
  const { ProfessionalProfiles } = source("components/portfolio/ProfessionalProfiles.tsx");
  const { renderToStaticMarkup } = require("react-dom/server");
  const html = renderToStaticMarkup(require("react").createElement(ProfessionalProfiles));
  assert.equal((html.match(/<a /g) ?? []).length, 2);
  for (const url of [profile.github, profile.linkedin]) assert.ok(html.includes(`href="${url}"`));
  assert.equal((html.match(/target="_blank"/g) ?? []).length, 2); assert.equal((html.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
  assert.match(html, /GitHub/); assert.match(html, /LinkedIn/); assert.match(html, /new browser|real browser/);
  assert.doesNotMatch(html, /<button|portfolio:\/\//);
});

test("Mail and contact controls have matching module styles instead of silently losing their layout", () => {
  for (const component of ["components/desktop/MailApp", "components/portfolio/ContactEmail"]) {
    const jsx = readFileSync(resolve(root, "src", `${component}.tsx`), "utf8");
    const css = readFileSync(resolve(root, "src", `${component}.module.css`), "utf8");
    const classes = new Set([...jsx.matchAll(/styles\.([A-Za-z][A-Za-z0-9_]*)/g)].map(match => match[1]));
    for (const name of classes) assert.match(css, new RegExp(`\\.${name}(?![A-Za-z0-9_-])`), `${component}: missing .${name}`);
  }
});
