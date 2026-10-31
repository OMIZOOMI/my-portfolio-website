# Stage 11 — truthful visitor actions

The existing production app reproduced all three About-route defects and Mail's false Sent behavior before implementation. The email launch was intercepted in an isolated browser: one launch still added a persisted Sent entry, cleared the draft, and closed the composer. See [before evidence](before-browser-results.json), [old Portfolio fallback](before-about-portfolio.png), and [false Sent state](before-false-sent.png).

## Launchers

- The built-in About Me ID now opens the already populated `AboutMeWindow` from the desktop, Finder, or its context menu. Folder data stays untouched; a visitor-created folder merely named About Me still opens as a folder.
- About This Mac opens Settings **About**, including when Settings is already open or minimized. The requested section is window-local transient metadata; the regular Settings launcher preserves its current section.
- About This Portfolio displays Om’s Portfolio, Om Nilesh Sawkare, the existing Portfolio OS 26.4 identity, and the established Next.js/React/Three.js/Zustand stack. It uses a laptop mark rather than Finder's icon/version fallback. Unknown app information uses a neutral app mark.
- Existing project file IDs already lead to their populated detail views. The browser check opened the real 3D portfolio detail, and store checks cover all three existing project IDs. Unknown project/game placeholders no longer offer an Open in Safari button that would merely open an unrelated start page.

[About Me](about-me.png) · [Settings About](settings-about.png) · [Portfolio About](portfolio-about.png)

## Menus and editing

Safari exposes its existing **Reload Page** operation in View; it refreshes the intended tab's internal view without changing its history. Unsupported **Refresh App** entries are disabled. Focusing a window is no longer called refresh. Empty Bin, unavailable note actions, missing-window controls, and empty Mail handoffs reflect their actual availability.

Menu triggers and popups have menubar/menu/menuitem semantics. Keyboard support includes Left/Right, Up/Down with disabled-item skipping, Home/End, Enter/Space, simple letter matching, Escape, and Tab dismissal. Escape restores trigger focus. Outside clicks close the popup and reach their intended control in one click; there is no full-desktop click shield. An active-window change closes the old menu. Hover switching and clicking a newly hovered trigger keep a useful open menu. A menu containing only disabled items also dismisses with Tab.

Edit preserves the prior editor's selection before focus moves to the menu, then returns native Undo/Redo to that editor. Notes' rich text and Mail's textarea were exercised in the real browser, with a Finder folder/history entry left unchanged. Finder Undo/Redo subsequently changed only that folder's rename. The editor's ordinary keyboard undo remains native. Filesystem shortcuts are scoped to file apps and portfolio surfaces, skip editors and already handled/composition events, and do not bind browser/OS refresh, close, quit, or global menu shortcuts. Clipboard actions also target the remembered editor, with useful feedback when permission is unavailable.

## Mail and retained data

Both the composer and Mail menu call the same **Open in your email app** action. A `mailto:` request is only a request to open the visitor's email client. Sending is completed there; the portfolio cannot observe whether it was sent or cancelled. A nullable return and a thrown failure both leave the draft and composer intact. No Sent entry is added, no draft is cleared, and no success or delivery confirmation is shown.

The existing storage policy is preserved: drafts remain in session memory across app close/reopen, while the portfolio stays open. Reloading the website resets these in-memory drafts; this stage does not silently start persisting visitor drafts or add a backend service.

The old write path had no delivery acknowledgement, so existing Sent records cannot be treated as proof of sending. Mail now exposes them as **Previous copies** and explains that delivery is unverified. Version 4 migration preserves their IDs, body, subject, recipient, original timestamp, and additional message fields, along with the inbox. It also preserves valid older-version collections instead of using the former discard-all migration. No retained message is silently deleted or asserted to have been sent.

The browser used a seeded version-3 legacy copy, verified its content and additional fields after migration/handoffs, and preserved it while testing cancellation and error. These are controlled fixtures, not an inspection of another visitor's browser profile. No real OS email app was opened, and no email was sent.

[Preserved Mail draft after failed handoff](mail-preserved-draft.png)

## Intentional unfinished content

Neural Block.app has no implemented project/game content available to route to, so its existing placeholder remains. Block Rush and Kingdom Siege retain their existing concept/detail placeholders; no games were implemented. Intentional empty folders were not populated. Existing biography and project prose were not rewritten.

## Verification

Production build `zerEq8nPVRLpETp_C14N_` passed compilation/TypeScript and lint. All **193 unit tests** pass, including **12 Stage 11 regressions**. All **six production-browser scenarios** pass in macOS Chrome 156 using trusted synthetic mouse/key input. Programmatically dispatched shortcut checks only verify that the app does not cancel those events; they do not claim to exercise OS shortcuts. The email cancellation/error cases are intercepted fixtures. No Windows, native Safari, physical trackpad, actual email-client cancellation, or email delivery test is claimed.

[Unit output](unit-tests.txt) · [Browser results](browser-results.json) · [Lint output](lint.txt)

```sh
node --test tests/stage11-actions.test.mjs
node --test tests/*.test.mjs
CDP_URL=http://127.0.0.1:9228 STARTUP_TEST_URL=http://127.0.0.1:3001 node tests/stage11-actions.browser.mjs
```
