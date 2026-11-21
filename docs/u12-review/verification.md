# U12 — Optional portfolio introduction

Implemented U12 only. No commit, push, deployment, dependency upgrade or new desktop/entrance system.

## Focused baseline and changes

The existing entry already identifies Om outside the projected screen, offers Projects/About/Contact and a readable Quick overview, and reports desktop availability after the readiness-controlled entrance. There was no introduction controller, completed/skipped preference or replay action. The existing display store already distinguished temporary view previews from an explicitly saved default. Terminal already supported optional commands, decorative typing, Show now and reduced motion.

The new page-level guide uses a small, opaque, theme-aware panel with native buttons. It does not block the desktop, trap focus, move the real pointer or require commands. Its reading copy is short; there are no timed advances.

1. **Welcome:** Om’s shared name, role and portfolio purpose; Show me around / Skip introduction. The ordinary identity/navigation and Quick overview remain available independently of the tour and WebGL.
2. **Step 1 of 4 — Screen view:** explains readability before the visitor presses Try Screen view. This calls the existing temporary preview action and reuses ScreenSurface’s 680 ms zoom; reduced motion follows the existing immediate path.
3. **Step 2 of 4 — Terminal:** waits for desktop availability and the actual view transition to settle, then opens/focuses the existing single-instance Terminal once. A temporary, immediately readable identity section offers Projects, Skills and About buttons using the existing command renderer. Existing input/history are not replaced. Show now skips decorative typing. If closed/minimized, Terminal can be reopened explicitly; it is not repeatedly forced open.
4. **Step 3 of 4 — Projects:** highlights the actual stable Projects destination (or its active Files content) and offers Open projects plus Veyra/Adobe actions through existing launchers/catalogue IDs. Visitors can explore while the panel waits.
5. **Step 4 of 4 — View choice:** Keep Screen view / Return to laptop uses the existing validated default-view strategy. Only this explicit choice changes the saved default. Ordinary Back/Skip never saves the demonstrated view.

Back, Next, progress labels and Skip are available through the active stages. Quick overview remains reachable from every stage. No camera, microphone or Music is launched. No note/draft/folder content or window identities are changed.

## Memory, focus and interruption contract

- `portfolio-introduction` stores only `{status: "completed" | "skipped"}` in this browser. There is no release/version re-enrolment. Completed/skipped legacy records are accepted. New browsers and cleared site storage naturally have no preference; there is no cross-device memory.
- Skip, Escape **within the guide**, route departure and pagehide/reload dismiss the guide. Leaving before completion records skipped. Replay introduction is available in **Quick overview** and **Settings → Accessibility**. Skipping a replay does not downgrade a previous completion. Reset portfolio settings leaves this key and in-memory status alone.
- Restricted/malformed storage cannot trap the guide. It stays dismissed in memory for the mounted visit. Storage failures are described in the guide/Quick overview; persistence across reloads is not promised when storage fails.
- Automatic welcome does not steal focus. Start/replay/step changes focus the heading. Dismissal returns focus to the original visible control when possible, otherwise Quick overview. The panel is nonmodal, with no global keyboard/pointer interception or scroll lock.
- Only an active stage measures targets: one 120 ms observer timer and one resize listener, both removed on stage change/dismissal. It reads real transformed DOM **client rectangles**, clamps the outline to the viewport, and issues no synthetic clicks or alternate coordinate offsets. Missing/hidden/minimized targets produce no ghost rectangle. A missing Terminal has a retry and a usable Next; an unavailable desktop has wait/overview/skip options.
- Dismissal ends the temporary view preview immediately through a narrow transient display flag. ScreenSurface cancels the existing animation and removes its transition interaction marker. Later ordinary view changes retain their normal zoom. No second Canvas, projected HTML root, app owner or entrance timeline was introduced.

## Verification completed

Local machine: macOS 27.2 (26B123), Apple M1 MacBook Air / 8 GB. Dependencies were resolved locally: Next 16.3.1, React 19.2.8, MediaPipe 1.0.1; installed Next client guidance and frontend accessibility guidance were read. No browser/hardware performance score is claimed.

**340/340 regression tests pass**, including **15 U12 checks** across `introduction.test.mjs`, `introduction-targets.test.mjs` and `introduction-ui.test.mjs`. Lint, TypeScript through production compilation, installed MediaPipe asset checks, production build and `git diff --check` pass.

| Acceptance area | Evidence |
| --- | --- |
| Fresh, returning, skip at every step, completion and explicit replay | Actual introduction/display stores with controlled storage; persisted status reloads, expected-step guards, default choices and preservation of existing window identity. |
| Storage failure and reset | Blocked reads/writes, read-only failure, in-memory dismissal and actual preference-reset integration. Only the introduction key and an explicit default-view choice are written. |
| Focus, scoped Escape and interrupted navigation | Controlled component/effect execution checks initial non-stealing focus, replay focus/return, route/pagehide dismissal, and listener removal. |
| Target failure, move, resize and rapid steps | Controlled DOM geometry checks clipping, moved targets, hidden/minimized targets, transition settling, explicit retry and no repeated automatic Terminal opening. Observer teardown rejects late callbacks. |
| Interrupted zoom and reduced motion | ScreenSurface effect check proves a pending preview animation is cancelled with no residual transition marker; later ordinary zoom and reduced-motion behavior still work. |
| Unrelated systems | Existing camera/photo/gesture, Music, files/rename/undo, browser tabs, display geometry, reset and project catalogue regressions remain passing. |

These controlled checks do **not** prove rendered layout, physical keyboard/touch behavior, actual Safari/Windows compatibility or visual smoothness. Browser access to `http://127.0.0.1:3014` was declined during the baseline attempt, so no further browser route, alternative browser or automation workaround was used. **No new before/after screenshots or live browser acceptance pass are claimed.** The temporary baseline server was stopped. The production build is served on the existing local/home-network preview bindings after verification.

## Remaining browser checklist

Use a fresh browser profile/private context for the welcome; use Replay introduction for subsequent runs. Do not clear all origin storage. Skip at welcome and each stage, reload, and confirm the guide stays absent. Complete once with each explicit view choice, reload, then verify Reset portfolio settings does not replay it. Navigate to a public case study mid-tour and return; the guide should remain dismissed.

With Notes/drafts and Music state already present, run the guide and compare their contents/ownership afterward. Try rapid Next/Back, close/minimize/move Terminal, resize during zoom, move/rename the Projects folder, and open both case studies. Skip mid-zoom and verify immediate desktop interaction. Test laptop/Screen views, light/dark, every text/icon size, 390 px and short windows, browser zoom, keyboard-only and physical touch. Check that all guide actions remain reachable by scrolling the panel, that focus remains visible, and that the outline never intercepts the target. Repeat with reduced motion, blocked WebGL/flat fallback and restricted storage. These visual/input/hardware checks remain outstanding.
