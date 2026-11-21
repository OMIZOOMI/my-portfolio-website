# Controls, motion, and Mail review — 17 November 2026

Production preview: http://127.0.0.1:3012. No commit, push, or deployment.

## Changes and reproduced causes

- Settings retained accent-colored outer shadows, and shared button backings painted refractive rims. Removed colored/external button shadows and rim images; the button backing retains restrained frost and an inset highlight. Text stays outside the filtered backing. Keyboard focus still has a visible outline.
- The installed Glisse switch's JavaScript travel was 21.7125px while the scaled CSS travel was 19.686px. Its drag distance also assumed client pixels. Replaced that switch path with one stable semantic button, a 180ms transform-only thumb transition, and shared desktop-coordinate conversion for dragging. Reduced motion disables the transition without remounting the control or losing focus.
- Window dragging previously measured the desktop and inverted its projection on each pointermove. It now consumes the latest sample once per animation frame, remeasures the current projection, and flushes the release sample before saving position. Bounds and docking policy are unchanged.
- Mail and ContactEmail referenced missing CSS-module selectors. Restored the matching header/actions/sidebar/reader/composer styles, dark contrast, and app-width layout. A further real 360×300px content-area check found an unreachable message field; the composer now scrolls and retains a usable textarea height. Draft and mailto/store behavior were not rewritten.

## Verification

Machine: Apple M1 MacBook Air, 8GB, macOS 27.2 (26B123). Browser: Chrome 157.0.0.0, 1200×683 CSS pixels, DPR 2. Local production server, no network throttling, reload with cache bypass. Native Safari, Windows, and physical trackpad/touch hardware were not tested in this pass.

| Check | Observed result |
| --- | --- |
| Button halo | Computed outer shadow and rim image are `none`; backing only has a subtle inset highlight and 2px frost. |
| Switch | Space toggles once and retains focus; normal thumb transition is 0.18s, reduced motion is 0s. Browser frame samples show intermediate positions before settling. |
| Pointer scheduling fixture | 100 queued samples produce one latest-sample paint; release flush, cancellation, projected switch dragging, and cleanup pass. This is a controlled fixture, not an FPS benchmark. |
| Window geometry | Actual pointer drag reached the desktop bottom at 683px while the Dock began at 593px; maximize/restore remained usable. |
| Mail | 640px-wide reader and 360px-wide composer fit without horizontal overflow. Draft survived messages→compose and close→reopen. |
| Short Mail | At 360×300px content size, composer scrolls through all fields. Textarea is 128px high and reachable, including with the longer handoff status present. The email-app launch was intercepted for this layout check; no email was sent. |
| View/theme continuity | Light/dark and laptop/Screen changes retain the same Mail and Settings windows and draft. Final test preferences restored to dark Screen view. |
| Startup | No console errors on final reload; one scene canvas and no active camera tracks. |

An exploratory automated drag sampled uneven frame intervals before the change, but its duration included tool idle time and only three pointer moves. It is not a valid matched performance comparison. No FPS gain, field INP, or cross-device smoothness claim is made.

Passed: ESLint, TypeScript, production build, all 354 unit tests. After the final CSS-only short-window correction: production build and 14 focused tests passed again. `git diff --check` is clean.

## Captures

- `settings-before.png` / `settings-after.png`: same 1200×683 viewport; clear primary controls.
- `mail-before.png` / `mail-after.png`: same viewport; repaired layout.
- `settings-light.png`, `laptop-light.png`: alternate material/view checks.
- `mail-narrow.png`, `mail-short.png`: narrow composer and short-height scrolling.

Remaining manual check: on native Safari, type/edit a Mail draft, scroll through a short composer, toggle Settings repeatedly, and drag overlapping windows behind the Dock in both views. Physical touch/trackpad behavior and perceived smoothness remain hardware checks.
