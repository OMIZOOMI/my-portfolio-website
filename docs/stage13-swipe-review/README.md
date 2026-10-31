# Sideways travel and corner workspace control

Implemented on production build `tzLjDbWpdyQ5J2PwXlxdh`. Workspace assets, preference schema, desktop/apps, camera and media lifecycle are unchanged.

| Behavior | Before | After |
|---|---|---|
| Travel | Radial forward zoom | 800 ms right-to-left slide with restrained horizontal light streaks |
| Laptop | Anchored | Anchored; backgrounds alone translate, no scaling |
| Launcher | Fixed at middle-left (top-left on narrow layouts) | Bottom-left at all widths, respecting safe areas |
| Idle | Always showed its label on wide layouts | 164 px launcher collapses after 3 idle seconds to a visible 48×48 px icon |
| Discovery | Click to open | Hover or keyboard focus reveals label; one click/tap opens the full picker above |
| Interaction | Escape/outside dismissal | Preserved; full picker stays open while in use, keyboard focus keeps launcher visible |

The idle timer stops while the pointer is inside or the picker is open and is cleared on cleanup. Focus-visible styling keeps the launcher discoverable for keyboard users even after the timer expires. Touch opens the picker directly and does not depend on hover. Reduced motion and Pause Motion continue to disable travel motion. No new package, canvas, renderer or animation loop.

## Verification

- Production build, lint, TypeScript checks and all 12 workspace regression tests passed.
- Nine existing browser cases passed on the first swipe build: loading only selected media; all choices and persistence; app/Canvas continuity; rapid/late switching; blocked media/retry; rejected autoplay; pause/visibility/reduced motion/loop ending; keyboard/touch/narrow layouts; frame sampling and eight-cycle media cleanup.
- Final build passed five targeted cases: launcher idle/hover/click/keyboard/touch, actual swipe transforms, keyboard/touch layouts at 320/390/800/1440 px, frame sampling, and recording.
- Actual browser transforms at 0/400/700 ms: outgoing x 0/−722/−1428.64 px, incoming x 1444/722/15.36 px on a 1444 px background layer. Matching edges stayed joined within 1 px; y remained 0; x/y scale remained 1. Laptop Canvas and desktop nodes stayed identical; desktop position difference was 0.000946 px after the existing entry camera finished settling.
- The first new geometry fixture sampled the still-settling entry camera and failed a subpixel position assertion. It now waits for the existing camera to settle, without changing the camera. A separate 4 px inline-button baseline gap was fixed with block layout so the control sits exactly 18 px above the bottom edge.

## Local performance observations

Same Apple M1 MacBookAir10,1, 8 GB, macOS 27.2, Chrome 156.0.8078.76 / ANGLE Metal; headless native macOS Chrome, 1440×1000 CSS px at DPR 1. Production localhost, unthrottled network, selected media prepared. These are local rAF/Event Timing observations, not field INP, physical-display FPS or proof of Windows/Safari hardware coverage. No build/encoding/other workload ran during the final measured windows.

| Workload | p95 frame interval | Maximum | Long tasks |
|---|---:|---:|---:|
| Beach + 3D idle, 8 seconds | 16.7 ms | 16.8 ms | 0 |
| Forest + 3D idle, 8 seconds | 16.8 ms | 16.8 ms | 0 |
| Six prepared sideways changes | 16.8 ms | 16.8 ms | 0 |

The prior forward-warp profiled repeat was also 16.8 ms maximum. No performance improvement is claimed. Local Event Timing maximum during six sideways switches was 32 ms. Physical touch/trackpad, Windows and Safari were not exercised; touch is labelled CDP emulation.

## Views and evidence

- [Collapsed launcher](final-corner-collapsed.png), [hover reveal](final-corner-hover.png), [full picker](final-corner-picker.png), [touch layout](final-corner-touch-390.png), [swipe midpoint](final-swipe-midpoint.png)
- [Actual UI recording](sideways-travel.mp4): 4.10 seconds from 124 CDP screencast frames; two UI-selected transitions, no simulated motion added in editing.
- [Launcher results](final-corner-launcher-workspace-results.json), [geometry](final-horizontal-swipe-workspace-results.json), [narrow/keyboard](final-keyboard-touch-workspace-results.json), [frame samples](final-video-idle-workspace-results.json)
- [Initial full matrix](initial-workspace-results.json), [build](build.txt), [lint](lint.txt), [workspace tests](workspace-tests.txt)
- Existing quality/license evidence remains in [the media revision report](../stage13-revision/README.md).

Git status/diff remains unavailable because the pre-existing checkout points to a missing worktree metadata directory; it was not changed.
