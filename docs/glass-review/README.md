# Portfolio glass update — 17 November 2026

Uses the actual Glisse 0.6.0 package from Kelvin Zhang's reference:

- Demo: https://glisse.kelvinzhang.ca/
- Source/API: https://github.com/0kzh/glisse
- License: MIT, Kelvin Zhang (2026). The full notice is retained in the package and copied to `public/licenses/glisse.txt`.

## Scope

Glisse Button/Glass/Switch are wrapped in `src/components/ui/PortfolioGlass.tsx`. Window title bars, active Browser tabs, Browser toolbar/bookmarks, Files toolbar actions, Camera controls, overview/tour actions and Settings actions use the shared components. The workspace trigger uses a decorative lens plate. Menu bar/dropdowns, context menu and the live Dock use shared neutral glass materials. Existing content surfaces remain opaque. The previous unused LiquidGlassDefs component is no longer mounted.

No `data-glisse-backdrop` content is registered. In Chromium Glisse filters the live CSS backdrop. Other browsers use its frost/rim fallback. This deliberately avoids cloned scene/media content, extra WebGL contexts and continuous backdrop-copy loops. No claim of equivalent refraction in native Safari is made.

The explicit app theme is mirrored to `html[data-theme]`, including the existing prepaint bootstrap, because Glisse watches that attribute to repaint its rim images. No new persisted preference is introduced. Reduced Motion uses a static Settings switch and suppresses button stretching; switching the control preserves keyboard focus.

## Verified

- Production build, MediaPipe asset check, TypeScript and full lint passed.
- All 346 existing unit/fixture regressions passed; full output is `unit-checks.log`.
- Camera/introduction fixtures model the new visual button as a native button so their existing behavior assertions remain applicable. Bootstrap fixtures now also assert the data-theme value.
- Chrome 157 on macOS 27.2 (26B123), 1200 × 683 CSS viewport, device scale 2.
- Browser: new tab, Private/normal transition preserving the two normal tabs, keyboard Enter on Reload, and 298px content width (300px frame). No toolbar overflow at that tested width; address input remained 68px wide.
- Settings: explicit light/dark theme updates both class and data-theme; Space toggles Reduce Motion on and off with focus staying on the switch.
- Laptop/Screen switching kept the same open Browser/Settings windows and two Browser tabs.
- Files menu: Escape dismisses and returns focus to File.
- One scene canvas and zero Glisse drawn/marked-backdrop layers observed with Browser, Files and Settings open. This is a resource count, not a performance benchmark.
- No console errors observed in the exercised flows. Existing Three.js deprecation and unused CSS preload warnings remain.

Native Safari/Windows, physical trackpad/touch, live camera and Music playback were not exercised in this visual update. No FPS or memory improvement is claimed. No commit, push or deployment performed.

## Captures

- `browser-dark.png`
- `browser-narrow.png`
- `settings-light.png`
- `settings-reduced-motion.png`
- `laptop-light.png`
- `files-menu-dark.png`

`browser-first-pass.png` is an intermediate integration capture, not a pre-change baseline. The screenshot save-path tool failure prevented preserving a valid before capture.
