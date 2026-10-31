# Stage 9 — Window and desktop interactions

**Dock-drag correction:** normal windows now move behind the dock up to the actual screen edge. Only maximize reserves dock space; dragging and restore use separate screen bounds. See the [current verification](dock-drag/README.md). Original Stage 9 measurements below are retained as historical evidence of the earlier boundary policy.

Stage 9 keeps the current appearance, gesture/camera lifecycle, folder filesystem and window modes. The changes address geometry, stacking/focus and desktop icon input.

## Geometry and coordinate spaces

- Window rectangles use **virtual desktop CSS pixels**, including the frame's border and title bar. The normal size in the existing store still describes app content.
- One desktop observer measures the actual menu bar and dock layout. The always-visible dock reserves its base footprint and bottom gap; hover magnification does not resize the work area. At the normal dock size, the 1400 × 900 desktop has a work area of **x=0, y=28, width=1400, height=782**. Maximize fills that area, rather than using browser viewport units or a fixed 40 px inset.
- Maximize remembers the exact normal outer rectangle. Restore returns to it, fitting it only if the desktop's usable area has become smaller. Normal positions are clamped so the full frame and traffic lights remain reachable. The fixed laptop desktop keeps its virtual geometry when the browser viewport changes; the flat desktop responds to its actual local dimensions.
- Browser/client pointer points pass through one shared planar projection. Four inert, zero-size corner probes identify the real projected screen quad. The inverse maps input into desktop-local points, including under perspective; the forward map is available for matching local geometry to browser/client points. The current camera view's previous bounding-box approximation missed the lower corner by **25.23 virtual pixels**.
- Window dragging, close-to-dock animation, file dragging/overlay and folder context menu positioning reuse that conversion. Browser dimensions appear only where needed to clip a menu to the visible browser region, after converting the clip points into desktop space.

There was no existing window resize control in this implementation; no new resize mode or handle was added. Browser/desktop resizing and dock-size changes update the usable bounds. Existing open/minimize/close motion is retained, and app/OS reduced motion is respected.

## Focus, stacking and icon input

- A minimized window becomes visible, frontmost and active in one store update, including launches through a different ID for a single-instance app.
- Window ranks are compact, starting at 10 and bounded by the number of existing windows. Focusing, restoring, closing and Bring All to Front do not accumulate ever-larger values. Already-active focus is a no-op. Keyboard focus inside an inactive window also activates it.
- Desktop icons visibly distinguish selection and keyboard focus. Single click selects; a genuine double-click opens. Enter and Space each open once; held-key repeats and the browser's extra native button activation are suppressed.
- A completed drag retains its activation guard after the drag store clears on pointer-up. It cannot become an accidental click/double-click opening. The existing 6 client-pixel drag threshold is unchanged. Inline rename, composition, F2 and Shift+F10 remain independent.

## Shield finding

No VM shield is currently rendered, and no component reads `isVMLocked`; Laptop's existing capture handler only writes the flag without cancelling the event. Actual portal ancestry and hit testing confirmed the HTML screen sits above the scene, with pointer events enabled on the inner screen and disabled on its outer placement wrappers. No speculative shield removal was made.

The [shield investigation](../stage9-shield-review/README.md) and [baseline hit-testing evidence](../stage9-shield-review/portal-hit-testing.json) cover single dock/control clicks after laptop-body interaction and overlapping-window clicks without click-through. Those baseline checks passed before the geometry change. The [final integration run](shield-final/portal-hit-testing.json) passes the same four checks after all Stage 9 changes.

## Verification

**Production build `ICtUyCYGQ0K-mAqF_ClPz`; Chrome 156.0.8078.48; Apple M1 MacBook Air, macOS 26.6.1 arm64.** The automated browser inputs are trusted CDP mouse/key events on the actual macOS Chrome browser, not a physical mouse or trackpad hardware run. DPR and page-scale emulation are explicitly distinguished from native browser-toolbar zoom. Browser contexts use focus emulation to keep the isolated headless camera/3D frames active.

- **Build, TypeScript and full lint pass.** The build also verifies the existing local MediaPipe package/lockfile/runtime checksums.
- **163/163 unit tests pass**, including the focused window-store, work-area, projective-coordinate, exact file-grab and icon-input regressions, plus the existing folder/camera/music checks. [Output](unit-tests.txt).
- **6/6 Stage 9 browser scenarios pass.** [Results](browser-results.json).
- **5/5 existing window-control scenarios pass:** padded traffic-light targets, repeated real actions and synchronous race fixtures, keyboard/reduced motion, drag cleanup on blur/cancel/close and maximize through browser resizing. [Results](window-controls/after-browser-results.json).
- **4/4 final portal/click checks pass**, including one control click after laptop-body interaction and no activation of the underlying window. [Results](shield-final/portal-hit-testing.json).

| Stage 9 browser check | Observed result |
| --- | --- |
| Maximize/restore at 1280 × 800, 1440 × 1000 with DPR 2, and 1920 × 1080 with page-scale 1.25 | Normal outer rectangle remains 250,150 / 642 × 478; maximize is 0,28 / 1400 × 782; restore returns exactly to the prior normal rectangle |
| Three overlapping apps, 12 minimize/thumbnail-restore cycles | Notes becomes visible, active and topmost in one action; menu follows Notes; stack ranks remain 10,11,12 |
| Actual Dock size preference changed by keyboard in Settings | Size 0.75 gives dock top 818 / maximized height 790; size 1.5 gives dock top 782 / height 754; original normal rectangle survives |
| Unclamped interior drag and all four edges | Requested +117,+79 gives +117,+78.998, a 0.002 virtual-pixel discrepancy; all frame edges stay inside the measured usable area |
| Icon focus, click, double-click, held Enter/Space and drag | Single click only selects; genuine two-click sequence opens; each held key opens once without a second native click; sub-threshold movement selects and drag does not open |
| Finder create/F2/Shift+F10/secondary-click rename and nested creation | Inline rename/cancel works; ordinary secondary click uses the custom menu; renamed parent and nested child retain their real IDs |

Views: [maximized with enlarged Dock](maximized-real-large-dock-reservation.png), [restored Notes above overlapping windows](overlap-restored-notes-active.png), [selected icon after dragging](desktop-selected-projects-after-drag.png), [Finder rename/nested identity](finder-rename-nested-identity.png), [traffic-light targets](window-controls/after-controls.png).

The [initial diagnostics](initial/browser-results.json) are retained separately. The first implementation's descendant layout effect could run before the desktop host ref attached, leaving no active bounds observer; measuring in the desktop owner fixed the real Dock-size failure. An early drag fixture also computed a client endpoint while the camera was still easing; the corrected fixture resolves each local target through a fresh browser DOM probe and retains its strict 0.6 px assertion. The final report above uses the corrected production build and test input.

The pre-existing narrow app-window fixtures for Notes, Finder and Camera now resize the outer frame rather than its flexing content. This is a test-fixture adjustment for explicit outer rectangles, not a new user-facing resize mode.

Reproduce against the stable production preview and an isolated Chrome debugger:

```sh
node --test tests/*.test.mjs
CDP_URL=http://127.0.0.1:9226 node tests/stage9-interactions.browser.mjs
CDP_URL=http://127.0.0.1:9226 WINDOW_CONTROLS_OUTPUT_DIR=../docs/stage9-review/window-controls/ node tests/window-controls.browser.mjs
CDP_URL=http://127.0.0.1:9226 STAGE9_SHIELD_OUTPUT_DIR=../docs/stage9-review/shield-final/ node tests/stage9-shield.browser.mjs
```

Run browser suites sequentially, and do not replace the production build under their preview server.

Remaining physical checks:

1. On a Mac trackpad, two-finger secondary-click an icon, rename it, drag across every edge, then minimize/restore and activate a control with one click after touching the laptop body.
2. Repeat with a Windows mouse and trackpad, checking right click, double-click, held Enter/Space and inline text selection.
3. Use native browser zoom at 80%, 100% and 125%; check maximize/restore and dock access with several overlapping windows. Repeat in Safari where available.

These hardware checks remain unexecuted here; the code and fixture results do not claim to prove them.
