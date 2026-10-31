# Stage 10 — simulated Safari tabs and history

The original defect was reproduced in the production app **before changing the store**: clicking tab A kept B selected and navigated B to A's URL. The tab button called `navigate(tab.url)` rather than selecting an ID. See [before evidence](before-browser-results.json) and [before view](before-tab-switch-bug.png).

Tabs now activate by ID. Each owns history entries (URL, title, scroll position, expanded architecture disclosures), a history cursor, an address draft, feedback, and its reload counter. Back/forward restore the entry's title and view. New navigation trims only that tab's forward branch; submitting its current URL keeps the branch. Closing the active tab prefers its left neighbor, then the first remaining tab. Closing the final tab creates a fresh Start Page. Missing/stale IDs are no-ops. The menu bar uses the same selected-session actions.

The project browser, project data, and external handoff cards are preserved. The tab strip scrolls the selected tab into view and keeps New Tab reachable at the ordinary window width. Tabs also support Left/Right/Home/End focus and activation; close buttons are separate buttons rather than nested interactive elements.

[Independent tabs](independent-tabs.png) · [Preserved page state](restored-page-state.png) · [Narrow window](narrow-tabs.png)

## Session and privacy policy

- **Normal:** memory-only, preserved across minimizing and closing/reopening the simulated app. A real website reload resets it. No new local/session storage or persistence was added.
- **Private:** a separate temporary tab collection, initially one Start Page. Minimize preserves it. Leaving Private or closing the simulated app discards it; entering again starts fresh. Normal tabs, drafts and history return unchanged. Saved normal scroll/disclosure state stays in the normal collection.
- The UI explicitly explains that this is isolated history **inside the demo**, not network anonymity or real browser privacy. External sites open in the visitor's regular browser.

Only known portfolio routes and validated HTTP/HTTPS destinations are accepted. Invalid addresses leave the actual page and history intact and show feedback. HTTP destinations show **External link preview**, explicitly saying the website has not loaded. The external-open action reports only that a browser-tab request was made, because a null `window.open` result with `noopener` does not prove either success or blocking. Thrown errors give a useful message; blocked pop-ups can be allowed by the visitor. Script/data/file schemes, credential-bearing URLs and unknown project IDs are rejected.

Internal content renders synchronously from the existing project data; there are no page-fetch requests to race or cancel. Queued view callbacks target a unique tab/history-entry ID, never the current active tab implicitly. Cleanup can save its own retained history entry; it cannot modify a newer entry, pruned history, a closed tab, or a discarded private session. Scroll uses a local ref during scrolling and is saved on leaving the page, avoiding a global store update on every scroll frame. Disclosure listeners and private page trees are removed on cleanup.

## Verification

Production build `Yx_fn2D0rHhnJVHL7JnOA` passes compilation/TypeScript and lint, all **181 unit tests** (including **15 Safari regressions**), and all **six browser scenarios**.

See [targeted tests](../../tests/safari.test.mjs), [full unit output](unit-tests.txt), [browser results](browser-results.json), and [lint output](lint.txt).

Browser checks run against the production build in an isolated macOS Chrome 156 browser using trusted synthetic mouse/key/wheel input. The rapid 200-click stress check is explicitly programmatic. External-open null/throw cases use controlled fixtures; no claim is made of visiting an external website or testing a real Safari browser. No physical trackpad or Windows run is claimed.

The browser scenarios cover:

1. A and B each navigate twice, switch repeatedly, independently go back/forward, then undergo rapid activation.
2. Scroll and expanded sections survive tab switching, back, reload, and a private-mode round trip.
3. Predictable close selection, final-tab usability, keyboard activation.
4. Normal/private separation, minimize/restore, private close/reopen cleanup, storage inspection, and an actual website reload.
5. A narrow window keeps the selected tab, close control and New Tab reachable.
6. Invalid address feedback and external-link preview/request/failure behavior.

```sh
node --test tests/safari.test.mjs
node --test tests/*.test.mjs
CDP_URL=http://127.0.0.1:9227 STARTUP_TEST_URL=http://127.0.0.1:3001 node tests/safari.browser.mjs
```
