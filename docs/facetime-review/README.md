# Stage 7: camera and gesture reliability

Stage 7 preserves the existing layout and gesture mapping. The broader interface redesign is deferred to Stage 8. Peace still produces confetti; thumbs up still produces floating likes.

## Runtime compatibility and asset provenance

The application resolves the top-level `@mediapipe/tasks-vision` **1.0.1** from both the installed package and lockfile. The old hook paired it with **0.10.14** WASM. Drei's separate nested **0.10.17** dependency is not the package resolved by this hook and was left alone. No MediaPipe upgrade was performed: the existing top-level version is now pinned exactly.

The six unmodified runtime artifacts were copied from the installed 1.0.1 package into `public/mediapipe/tasks-vision-1.0.1/wasm`. The model is Google's official Hand Landmarker `float16/1` task bundle, stored locally. Both are Apache 2.0; the license, notice, sources, exact sizes, and SHA-256 hashes are in [the shipped manifest](../../public/mediapipe/manifest.json), [license](../../public/mediapipe/LICENSE.txt), and [notice](../../public/mediapipe/NOTICE.txt).

| Artifact | Actual bytes |
| --- | ---: |
| Hand Landmarker float16 revision 1 model | 7,819,105 |
| SIMD loader / WASM | 323,377 / 11,756,954 |
| No-SIMD loader / WASM | 323,180 / 10,960,242 |
| Module loader / WASM | 323,415 / 11,756,972 |
| All seven stored artifacts | 43,263,245 |

Only the runtime pair selected by MediaPipe and the one model are requested when a playable camera session starts. The whole collection is not downloaded at startup. The usual SIMD pair plus model total 19,899,436 uncompressed bytes; these are original executable/model binaries, not image assets that can be resized. Browser caching and a bounded five-minute model-byte cache reduce repeat downloads. The selected runtime files are preflighted before native initialization so ordinary blocked downloads have abortable timeouts.

`npm run check:mediapipe` runs before every production build. It verifies the manifest against the package declaration, lockfile, installed package, all local asset sizes/checksums, and the actual loader bytes in `node_modules`.

The installed declarations document `FilesetResolver.forVisionTasks`, `HandLandmarker.createFromOptions`, `baseOptions.modelAssetBuffer`, `delegate`, `canvas`, `runningMode: "VIDEO"`, `detectForVideo`, and `close`. The implementation uses these APIs. Native browser tests exercise the bundled runtime/model together, separately from the mocked hook tests.

Primary references: [Google's Hand Landmarker web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js), [model overview](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/index), [official model card and license](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf), and [MediaPipe web setup](https://developers.google.com/edge/mediapipe/solutions/setup_web). Google names Chrome and Safari; Edge compatibility remains an actual acceptance-test obligation.

## Camera and lifecycle behavior

- The video element remains mounted throughout permission and model loading. Camera permission, arriving playable frames, and successful gesture inference are separate readiness stages.
- Requests contain video with ideal dimensions/facing mode and **audio: false**. This local gesture demo has no audio feature, so it no longer requests a microphone or displays a fictitious microphone-on toggle.
- Camera labels follow actual video-track state. Preview playback rejection shows **Resume camera**, invoked directly from the user's click. Denied/dismissed permission, busy/missing/disconnected cameras, insecure contexts, unsupported media APIs, missing/stalled video, and playback errors have specific status and retry actions.
- Permission waiting is bounded at **15 seconds**; arriving/stalled frames at **10 seconds**. A native `getUserMedia` request cannot be aborted. The broker therefore permits only one outstanding native request. A timed-out/closed attempt never attaches its later stream: its tracks are stopped. Retry while that prompt is still pending explains that it must be answered/dismissed; a subsequent retry starts a fresh attempt.
- Camera-off stops tracks. Minimize, close, hidden pages, and page-hide release immediately with **0 ms configured grace**. Native page-hide/visibility handlers release before a page can freeze; page-show reconciles even when React did not render between hide/show. A guarded deferred initial start avoids StrictMode duplicate prompts.
- Restore reacquires only when the user had left the camera enabled. Explicit camera-off survives hiding/restoring. Playback policy can still require the visible Resume camera action.
- Closing cancels timers/listeners, detaches video, stops tracks, aborts detector ownership, and unmounts effects. Camera generation also keys detector/reaction state so a late result or old pose cannot revive a replacement session.

[getUserMedia documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) explains secure contexts, failure types, and unresolved permission requests. [Video playback documentation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play) explains rejected play promises. [Track-ended documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/ended_event) distinguishes device termination from an explicit `stop()`; the implementation also monitors actual track/frame state.

## Detector, mirroring, and effects

The existing GPU-to-CPU initialization fallback is retained in one shared exclusive runtime. After three consecutive GPU inference errors or context-loss failures, that task closes before one CPU replacement is created. Three CPU failures stop inference and expose retry. Asset failures do not trigger a pointless delegate retry. Fetch and initialization waits are bounded at **20 seconds**. Native initialization itself is uncancellable: a timed-out task retains serialization until it settles, then its late result is closed. A queued retry reports busy and is also bounded, rather than spawning competing native tasks.

Inference is capped at **15 fps**, skips duplicate video frames, and stops when its owner is disabled/hidden. Ready means a successful inference has occurred, not merely that the model downloaded. Model bytes are bounded below 10 MiB and retained at most five minutes; active native detectors close on release.

Only the selfie preview is mirrored. Classification receives raw normalized image coordinates, preserving wrist distances and upward-y checks. The threshold remains a strict **1.15** wrist-distance ratio with the existing thumb-up checks. There is no added hold-time debounce. A held pose fires once; neutral/re-entry or pose changes re-arm it subject to the existing **2,500 ms** cooldown. A new pose entered during cooldown can fire once at expiry if still held; an already disappeared pose cannot fire later. Invalid/non-finite landmark frames safely classify as no hand. See [fixture definitions and exact mapping](../gesture-fixtures.md).

Confetti keeps its 70 fragments, palette, explosion behavior, and 2,600 ms lifetime using CSS rather than a second WebGL canvas. This preserves the peace effect when GPU detection falls back to CPU. Floating likes keep their existing renderer/lifetime. Both effects are bounded, respect reduced motion, and unmount on pause/close. Clicking the preview still demonstrates confetti without claiming that a camera gesture was detected.

The main-thread native inference call cannot be interrupted if a driver hard-hangs synchronously. The frame cap and CPU fallback reduce ordinary load/failures; they do not prove all Windows driver combinations. Physical-device results must be recorded independently.

## Acceptance evidence

Production build (including TypeScript), asset verification, and full lint pass. All **70 focused controller/classifier/runtime/hook/effect/window checks** pass: [test output](unit-tests.txt). All **15 browser scenarios** pass with zero skips and zero unexpected runtime exceptions on a MacBook Air M1, macOS 26.6.1, Chrome 156.0.8078.48. The runtime context-loss scenario used native `WEBGL_lose_context`; both forced GPU initialization refusal and context loss recovered to successful CPU inference. The camera input remained a synthetic canvas stream throughout.

Browser fixtures and exact environment/results are documented in [the acceptance matrix](../stage7-browser-matrix.md) and [generated browser report](browser-results.json). The six component-wiring checks execute the actual FaceTime component with controlled hook/camera/detector mocks to check both gesture-to-effect mappings, reduced motion, stale-generation suppression, pause/close behavior, and truthful manual preview clicks; they are not hardware evidence.

**Windows 11 Chrome/Edge and real macOS Safari/physical-camera acceptance are not claimed.** The linked matrix provides the exact remaining device/browser checklist. Synthetic landmarks, canvas-camera streams, injected errors, and macOS WebGL faults are labeled fixtures, not live Windows/Safari hardware evidence.
