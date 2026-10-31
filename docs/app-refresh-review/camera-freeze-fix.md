# Safari camera freeze correction — 31 October 2026

**User hardware retest confirmed: “Live video and effects work.”** This is the user’s Safari result after refreshing the updated production build, reopening FaceTime, moving a hand and trying peace/thumbs-up. It supersedes the prior report’s pending Safari live-preview item. The agent did not inspect the user’s native Safari window or save camera images/recordings.

## Defect and repair

The previous canvas preview could remain on its first frame when an exposed requestVideoFrameCallback API stopped delivering callbacks. Both preview and detector waited on that API indefinitely. Their fallback handled an absent API only. The capture element was also a nearly invisible 1px video, an unsuitable source presentation for this WebKit path. Those are confirmed code weaknesses; the exact internal Safari compositor failure was not instrumented directly.

- Keep the always-mounted, muted, inline source video at the full preview size beneath the canvas, with the correct crop and mirror.
- Prefer native video callbacks, but switch to a single requestAnimationFrame loop if callbacks go silent for 350 ms, throw, or report stale media timestamps while the video advances. This change is shared by preview and inference. The fallback processes changed video time only and retains the 30 Hz preview / 10 Hz inference caps.
- Cancel the stale callback and its watchdog. Ticket checks reject late callbacks; backpressure prevents overlapping operations even through stop/restart. Stop clears both scheduling mechanisms. Late resize callbacks cannot reallocate a retired camera canvas.
- Preserve camera ownership, permission handling, GPU/CPU recovery, gesture mapping, reduced motion, and minimize/hidden/close cleanup. No additional stream, model or WebGL context was added.

The [video-frame callback specification](https://wicg.github.io/video-rvfc/) ties callbacks to compositor presentation. [WebKit’s documented hidden-window callback issue](https://bugs.webkit.org/show_bug.cgi?id=282797) illustrates a compositor-dependent delivery path; that historical resolved bug is **not** asserted to be the same Safari version/root cause here.

## Evidence

Production build **tYjsnfcJbf8U7tp0bDieb**, served at http://127.0.0.1:3012.

- Targeted tests first reproduced the old failure: one native callback followed by silence, present-but-silent/throwing API, and competing operations after stop/restart.
- Fixed tests cover continuing canvas draws, duplicate-frame suppression, capped processing, stale metadata, late callback cancellation, resize cleanup and one detector recognizing both peace/thumbs-up fixtures after delivery stalls. Fixtures are controlled/generated input, not physical-camera evidence.
- [Full regression checks](camera-freeze-tests.txt), [lint](camera-freeze-lint.txt) and [production build/TypeScript](camera-freeze-build.txt) pass.
- **Real Chrome generated-video check:** production scheduling/preview helpers ran against canvas.captureStream(30), with native callback delivery deliberately frozen after the first callback. Draws continued to **1,471** at video time **54.904 s**. The actual output canvas changed between blue RGB 132,182,216 and green RGB 182,207,141 while a shape moved. The preview was projected with CSS perspective. This is a functional regression fixture, not an FPS benchmark or a live camera/Safari run. [Observed readout](camera-freeze-browser.txt), [fixture screenshot](camera-freeze-fixture.jpg).
- The fixture was stopped, all synthetic tracks released, its tab closed and its temporary local server stopped. No camera permission was requested by the fixture.
- **Safari:** user explicitly confirmed live video and effects after the update. Gesture-by-gesture timings, retained-resource profiling and Windows hardware parity were not newly measured in this correction.

Earlier app-refresh records remain historical. This change is confined to the camera frame scheduler, capture-video styling, preview cleanup and related regression tests.
