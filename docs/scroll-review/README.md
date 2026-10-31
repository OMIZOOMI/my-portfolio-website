# Projected desktop scrolling repair

## Scope and findings

Two related problems were investigated. First, focusing an app through its launcher could programmatically scroll Drei's `overflow: hidden` projection wrapper. On the baseline production build, its offset became 98px and the projected desktop's client Y became −37354.32px. The wrapper's perspective transforms produced a very large intermediate scrollable area. The projection and its outer clipping layers now use `overflow: clip`, while individual app panes keep their own scroll containers. Repeating the launcher action kept the wrapper offset at zero and the desktop in place.

That change alone did **not** fix the user's physical Safari trackpad problem: the user tested it and reported that the page still did not scroll. The second change therefore adds one non-passive, document-capture wheel listener, scoped to the projected desktop. It hit-tests the current pointer, scrolls the nearest actual overflowing app region, and passes any remaining distance through nested scrollable ancestors, respecting containment. It never scrolls projection wrappers. The flat desktop and outside workspace controls retain native wheel handling.

The handler preserves signed fractional device deltas, converts line/page units, and carries rounding fractions without inventing velocity or reversing direction. It cancels each handled native event before applying its movement to prevent double scrolling. Ctrl/pinch, Meta, Alt, Shift, previously canceled and noncancelable events are left alone. Plain horizontal input uses actual horizontal scroll regions. One listener is removed when the desktop unmounts; rounding state uses weak references.

The user then confirmed that real Safari two-finger scrolling works, while requesting smoother motion. A second refinement combines rapid input into at most one scroll-position write per axis/pane per display frame. The pending positions are used for nested chaining and bounds before they are painted, so no input is lost or duplicated. Reversals take effect on the next frame; there is no easing tail, synthetic momentum, continuous animation loop or React state update. Keyboard/scrollbar changes in the same frame retain their fresh base position. Pending frames are canceled on disposal, and disconnected app panes are skipped.

## Verification

Production preview: `http://127.0.0.1:3012`, final build `VDDturc0Th1R1DPgOJ7pg`. Hardware: Apple M1 MacBook Air, 8GB; macOS 27.2; Chrome 156.0.8078.76; 1440×900 viewport; device scale 2. These are local browser input checks, supplemented by the user's physical Safari test, not field interaction metrics.

| Check | Result |
| --- | --- |
| Settings content | Down/down/down/up/up/down produced offsets 27, 54, 81, 54, 27, 54px |
| Portfolio Safari app | Same offsets; inactive Settings position unchanged |
| Music library with credits expanded | Same offsets; other apps unchanged |
| Notes editor scroller | Same offsets; bottom clamped at 597.5px and returned to 0 |
| Settings lower controls | Reached wallpaper mode controls at 364.5px |
| Projection stability | Wrapper offset remained 0; desktop client Y remained 38.73556px |
| Targeted regression tests | 17 passed: units, fractions, reversals, nested chaining/containment, boundaries, pointer retargeting, modified gestures, axes, native flat mode, frame coalescing, same-frame native changes, disposal |
| Combined regression suite | 222 tests passed |
| Lint / TypeScript / production build | Passed |
| Real Safari trackpad | User tested the final refinement in Settings/Music and confirmed “Smooth and responsive now” |

Raw observations: [chrome-scroll-samples.json](./chrome-scroll-samples.json). Build and regression logs are in this directory. [Settings after scrolling](./settings-scrolled.jpg) shows the lower controls, with the desktop anchored.

## Safari feedback and coverage

Safari 27.2 is installed, but native gesture automation could not access its window (`noWindowsAvailable`). It was possible to open a temporary test tab and inspect Settings, but no successful native Safari scroll action was exercised by the agent. The temporary Safari tab was closed without touching the user's other tabs. The user physically retested the shared handler and reported: “it scrolls but could be more smoother.” After the frame-coalescing refinement and another Safari refresh/test in Settings and Music, the user confirmed: **“Smooth and responsive now.”** Functional Safari scrolling and final smoothness are therefore verified by user report, separately from agent-executed Chrome checks.

For future regression checking, refresh port 3012, open Settings, keep the pointer over the content, and scroll down/up with two fingers. Repeat in the portfolio browser, Music with credits expanded, and Notes. Check slow movements, momentum, immediate reversals, top/bottom bounds, moving the pointer between panes, and pinch/Shift gestures. If Safari supplies a noncancelable wheel sequence, that native tail is intentionally not manually applied to avoid doubled movement. Windows physical trackpad and all Safari gesture variants were not certified in this follow-up. The unit fixture proves that 100 events in one frame cause one write while retaining their full net distance, rather than 100 writes. That is a verified scheduling change, not a claimed measured FPS gain.

Git-based diff checking is unavailable because this checkout has a pre-existing `.git` pointer to a missing worktree. No repository metadata was changed.
