# U02 — Identity and readable core content

31 October 2026. Scope: page-level introduction and Quick overview, About content/contrast, and discoverable reading controls. No tour, public case-study routes, metadata rewrite, certificate collection, camera redesign, or later stage was implemented.

## What changed

- The page is a Server Component with a server-rendered overview passed into a client experience wrapper. Identity, both featured projects, repository links, and contact information exist in the initial HTML independently of Canvas readiness.
- A visible page-level header identifies **Om Sawkare — computer vision, AI workflows, and backend development**. Projects, About, and Contact open the corresponding readable overview section.
- Quick overview uses native HTML `details`/`summary`, so it can open before hydration. Fragment links also reveal its sections when application scripts are blocked. Hydrated behavior adds outside dismissal, Escape/focus return, and existing desktop actions.
- Existing launchers/stores open Projects, About, featured project files, Mail's existing composer, and Accessibility settings. Desktop actions wait for actual scene availability; source/contact links do not. No second desktop/app root or media player was introduced.
- The laptop scene reserves room for the page header. Screen view releases that space and keeps the existing mounted screen. A compact overview control remains reachable above the dock, using the same shared offset policy as the workspace controls.
- About now has opaque light/dark surfaces, readable text, restrained project cards, grouped demonstrated skills, project-based experience, and working project actions. Its narrow layout follows its own container width. New section selection starts at its heading instead of inheriting an old scroll position.
- Reading controls expose the existing Screen view and text/icon sizing. Reduced motion respects both the existing app preference and operating-system media query.
- A small prepaint bootstrap reads only the existing appearance preference and applies its theme class before the new HTML surfaces paint. It does not write preferences or introduce a new persistence policy.

## Content basis

Technical examples resolve through the shared U01 catalogue and [its source-to-claim map](../u01-review/source-map.md). The new `portfolioProfile.ts` holds the common name, role, public contact details, skill-group references, and personal project reflections. Stack labels come from the catalogue rather than separate hand-written technology lists.

Final-year VIT status, Lego/Halo history, current Veyra focus, and the Adobe team result are Om's supplied history. The top-45/approximately-100,000-team statement remains his personal account; this stage did not independently establish the competition denominator or ranking. No employment or graduation year is invented. AWS remains a learning direction, not a shipped project deployment claim. Approved Notes content was not edited.

## Automated checks

| Check | Result |
| --- | --- |
| Complete Node regression suite | **281 passed, 0 failed**, including seven new overview/action/bootstrap checks |
| Lint | Passed with no warnings |
| TypeScript | Passed; also checked by the production build |
| Production build | Passed; exact final build identifier is in `build-results.txt` |
| MediaPipe integrity prebuild | Existing package/runtime/lockfile and seven asset checks passed |
| Whitespace check | Passed |

The new tests exercise scene-independent HTML, featured-project/reference consistency, existing app identities, preserved Mail drafts, reading actions, and prepaint preference parsing including blocked storage. Existing folder, browser history, media lifecycle, startup, scroll and geometry regressions continue to pass. This does not substitute for hardware/browser acceptance of those unrelated features.

## Browser coverage and observations

Native Chrome **156.0.8078.76**, **macOS 27.2 (26B123), arm64**. Default viewport **1440 × 722**. Responsive overrides **390 × 844**, **320 × 740**, and **390 × 430** were used and reset afterward. Responsive overrides are not physical phone/touch hardware tests. Application interface size **145%** and the app's Reduce motion setting were exercised. No browser-zoom result is claimed.

The production build was served on a temporary local port. `tests/portfolio-overview-fixtures.mjs` provided loopback-only proxies for controlled failures; no fixture flags or WebGL stubs are shipped in application code. These were functional checks, not startup or performance benchmarks.

| Flow | Observation |
| --- | --- |
| Initial page | Name, role, navigation, and overview access appear outside the projected screen |
| Model delayed by 12 seconds | Overview opens with both featured projects while startup is still `loading` and there are **zero desktops**; saved light theme is already applied |
| Application script requests blocked | Native overview/fragment navigation still exposes actual server HTML and both repository links; no desktop mounts |
| WebGL unavailable fixture | Startup recovery appears, but identity and project overview remain reachable without using the fallback first |
| Model HTTP 503 fixture | Contact remains reachable alongside the confirmed startup error; the email URL is correct |
| Existing flat fallback | Opens **one** desktop and removes the boot overlay; the expected model error is retained only in the fixture log |
| Overview → About → project | Existing About and Veyra file windows open; no new desktop or player ownership path |
| Laptop → Screen view | Desktop fills the viewport and the fixture observes **one desktop mount**, with no errors on the successful path |
| Light/dark About | Computed backgrounds are opaque `rgb(250,250,252)` and `rgb(32,33,38)`; wallpaper no longer supplies the reading background |
| 145% sizing at 390px width | About becomes approximately **267 logical pixels** wide; navigation becomes a row; no page horizontal overflow; the same desktop remains mounted |
| Narrow overview | Final 320px panel ends at approximately 699px in a 740px viewport; the short-view panel fits from y=8 to y=422 in 430px; all sections scroll and remain reachable |
| Keyboard Escape | Closes the overview, returns focus to `SUMMARY`, and leaves Screen view active |
| Section navigation | Overview, Skills, Projects and Experience expose current selection and project actions; new-section scroll resets to the heading |

Raw observed DOM measurements and fixture results are in [browser-results.json](browser-results.json). Expected fixture errors are distinguished from successful-path errors.

## Views

| Surface | Before | After |
| --- | --- | --- |
| Entry | [Before](before-entry.jpg) | [After](after-entry.jpg) |
| About in laptop view | [Before](before-about.jpg) | [After](after-about-laptop.jpg) |
| About in Screen view | [Before](before-about-screen.jpg) | [Dark](after-about-screen-dark.jpg) / [Light, larger text](after-about-light-large.jpg) |
| Project-based experience | — | [After](after-experience.jpg) |
| Narrow app and overview | — | [App](after-narrow-large-text.jpg) / [Overview](after-narrow-overview.jpg) |
| Delayed startup | — | [Overview while loading](delayed-model-overview.jpg) |
| Script failure | — | [Native HTML overview](blocked-js-native-overview.jpg) |
| WebGL failure | — | [Overview remains available](webgl-unavailable-overview.jpg) |
| Model failure | — | [Contact remains available](failed-model-contact.jpg) |

Baseline and default after views use the same browser viewport. About's logical window size is preserved; laptop-view projection changes because the scene now reserves header space. Screen view is the direct full-page contrast comparison. Larger-text and narrow views are deliberately different test conditions.

## Limits

- Native Safari, Windows, physical touch, and assistive-technology hardware runs were not performed. No WCAG certification, cross-browser parity, field INP, or performance gain is claimed.
- The external email client was not launched and no message sent. No camera or microphone permission was requested, and Music was not started.
- Scenery selection, sound defaults, wallpapers, Notes, folder data, stable IDs, and existing screen mounting/coordinate helpers remain intact. Existing uncommitted work was preserved.
- The tour and its once-only storage belong to U12. Quick overview remains an optional, immediately reachable reading surface; it does not start a tour automatically.
- Nothing was committed, pushed or deployed. U02 ends here.
