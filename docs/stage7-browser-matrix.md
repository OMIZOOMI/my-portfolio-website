# Stage 7 camera and gesture verification

This document separates browser execution from fixtures and from the physical-device checks still required. A successful macOS Chromium run does not establish Windows or Safari camera parity.

## Available environment

| Target | Environment available here | Evidence status |
| --- | --- | --- |
| macOS Chrome | MacBook Air (MacBookAir10,1), Apple M1, macOS 26.6.1, arm64; Chrome 156.0.8078.48, isolated headless browser | **15/15 synthetic browser scenarios passed; 0 skipped.** No physical webcam/permission-prompt run |
| macOS Safari | Safari 26.6 is installed on this macOS host | No Safari camera or permission run claimed |
| Windows 11 Chrome | No Windows device/session available | Not exercised |
| Windows 11 Edge | No Windows device/session available | Not exercised |

The browser harness uses a native `canvas.captureStream()` video track and real HTML video playback. Permission denial, busy/missing devices, delayed permission, video-play rejection, a track ending, insecure-context detection, and document visibility changes are deliberately injected fixtures. They do not exercise OS privacy settings, the real browser permission prompt, an actual webcam, native background-tab scheduling, Windows ANGLE, or physical gesture capture.

The GPU-initialization test refuses WebGL on the detector's first owned GPU canvas after the portfolio renderer has loaded, while allowing a fresh canvas for CPU's image-transfer path. It runs actual MediaPipe rather than a fake successful detector. CPU inference does not imply the package can run with every browser WebGL API disabled. The runtime-loss test loses an already initialized detector context with `WEBGL_lose_context` where available, then waits for a successful CPU inference. These are injected failures on macOS, not evidence of an Intel/NVIDIA/AMD Windows driver run. Landmark/classification and scheduling fixtures are described separately in the Stage 7 implementation notes.

## Reproducible automated checks

Start the production site and an isolated Chrome debugging instance, then run:

```sh
STARTUP_TEST_URL=http://127.0.0.1:3001 CDP_URL=http://127.0.0.1:9225 node tests/facetime.browser.mjs
```

The script creates and disposes a separate browser context/window for each scenario, with focus emulation to keep headless animation frames active. It never reads a personal camera feed. It records the browser version, OS, fixture parameters, observed camera/gesture state, actual track state, requested media constraints, unexpected runtime exceptions, and results in [the generated browser report](facetime-review/browser-results.json). Screenshots showing synthetic camera content are in the same directory.

Scenarios cover native video/no-hand behavior, repeated app launch, camera off/on, denial/busy/missing-camera retry, delayed streams, unanswered permission timeout without duplicate prompts, late completion after close, blocked playback and user resume, an externally ended track, minimize/restore, synthetic hidden/visible and pagehide/pageshow transitions, explicit camera-off persistence, actual GPU initialization refusal and runtime context loss with CPU fallback, and blocked model/WASM downloads with retry. Every media request must be video-only. The first scenario also asserts that startup makes no model/WASM requests before FaceTime opens. The CPU fallback scenario checks that confetti uses its bounded CSS renderer, creates no extra canvas, self-removes, and clears on close.

Preliminary diagnostic evidence is retained under [initial-run](facetime-review/initial-run/browser-results.json). That run included an incorrect `transform`-only assertion for Tailwind's individual `scale` property, an intentionally overbroad all-WebGL refusal that also blocked CPU image transfer, and unhydrated startup failures while a production build replaced assets beneath an older preview server. Final acceptance uses the stable-build report linked above; diagnostic failures are not presented as a completed hardware matrix.

## Final browser result

On **29 October 2026**, production build `7qugy3Xr-FETakA9c8zdY` completed **15/15 scenarios, 0 skipped, 0 unexpected runtime exceptions**, in 109.887 seconds of scenario time. Chrome reported **ANGLE Metal Renderer: Apple M1, Apple driver 26.6.1**, not a Windows D3D/ANGLE driver. The real MediaPipe task completed successful inference on GPU and, after deliberately refusing its first GPU canvas, on CPU. `WEBGL_lose_context` also produced a successful CPU replacement without another camera request. Camera-only requests used `audio: false` throughout.

The first scenario observed no `/mediapipe/` requests before opening FaceTime; live native video was 320×240 from the deliberately small canvas fixture, and its horizontal CSS scale was `-1 1`. The no-hand frame fixture produced no detected-gesture label. Pagehide released all tracks in the same event statement, and pageshow resumed one live stream. Model and WASM blockage each preserved camera playback and recovered with Retry gestures. The CPU fallback effect check found 70 CSS confetti particles, no additional canvas, automatic effect expiry, and no residual effect after closing.

These results establish the exercised code and browser-fixture paths on this Mac. **Live peace/thumbs-up capture, native permission prompts, real camera drivers, physical Safari, Windows 11 Chrome, and Windows 11 Edge remain unverified.** Gesture classifications/held-pose behavior are additionally tested with deterministic landmark and timing fixtures, not a recorded claim of Windows or Safari hardware success.

## Remaining physical acceptance matrix

Run this checklist independently on **Windows 11 Chrome**, **Windows 11 Edge**, **macOS Chrome**, and **macOS Safari**. Use a real webcam in a secure HTTPS deployment or a browser-recognized localhost development context. Do not use Playwright WebKit as a substitute for Safari.

For each run record: exact OS version/build; browser full version; computer model, GPU/driver and camera model; site revision and URL; whether a hardware/OS/browser camera block exists; tested delegate; and each result as pass/fail/not-run. Keep any permission-state reset local to the test site's settings.

| Case | Exact action | Expected result |
| --- | --- | --- |
| First allow | Reset this site's camera permission, open FaceTime, allow camera | One camera request, no microphone request; live preview appears; camera and gesture-model readiness are reported separately |
| Deny / dismiss | Reset permission, open, deny; repeat with dismissal/ignored prompt where the browser supports it | Accurate permission/pending status; bounded waiting message with a useful retry; no false camera-on or endless loading |
| Retry after allow | Change only this site's camera permission to allow and use Retry camera | Exactly one usable live stream; no duplicate prompt or detector |
| Busy / unavailable | Exclusively occupy the webcam in another app where supported, or disconnect it, then open FaceTime | Specific useful camera failure; reconnect/release and Retry succeeds |
| Unplug while live | Disconnect/disable an active external camera | Live status clears; inference/effects stop; no repeated exception loop; Retry works after reconnection |
| Insecure origin | Open the deployed app over non-localhost plain HTTP | Secure-context explanation; no misleading permission request or false readiness |
| Slow / unanswered permission | Leave permission unresolved beyond the documented timeout, retry, then resolve it | No second native pending prompt; stale streams are stopped; a clear subsequent retry can start one camera |
| Playback policy | Test Safari/browser autoplay restrictions, including a fresh session | A rejected video play request shows Resume camera; that click starts the existing permitted stream or provides a truthful error |
| Real peace sign | Hold the index and middle fingers extended, other fingers curled, facing the camera | Existing confetti mapping; label matches; no remapped effect |
| Real thumbs up | Hold thumb extended upwards with four fingers curled | Existing floating-likes mapping; label matches; no remapped effect |
| No hand / held pose | Show no hand; hold one recognized pose for at least 8 seconds; remove hand and re-enter after cooldown | No phantom event without hands; held pose does not repeatedly fire; reset and cooldown behave consistently |
| Mirroring | Move a hand to each side and try both supported poses | Selfie preview mirrors once; recognition remains consistent; no extra coordinate flip |
| Minimize / restore | While preview and a gesture effect run, minimize; check camera indicator; restore | Inference/effects stop and camera tracks are released immediately; restore reacquires only if camera was enabled, with truthful resuming/user-action status |
| Explicit camera off | Turn camera off, minimize and restore, then hide/show the browser | Camera remains off until the user enables it; no live track or inference resumes silently |
| Native background lifecycle | Switch tabs, minimize the browser, hide it, and restore | No inference while hidden; camera indicator clears after the documented release policy; return resumes accurately without duplicate streams |
| Close / rapid reopen | Close while live, during model download, and before allowing permission; reopen rapidly | Old tracks, listeners, inference and effects stop; late completions are discarded; at most one active owner/detector |
| Multiple launch paths | Open from each existing launch surface repeatedly, including while minimized | One FaceTime session; no competing inference loops or cameras |
| Model / WASM failure | Block the model, then WASM separately in browser network tools; open, remove block, Retry gestures | Camera remains usable; asset/model failure is shown separately; retry succeeds without reloading the entire site |
| GPU initialization failure | On a Windows test device with an observed ANGLE/driver refusal, or a clearly labeled deliberate fault | CPU fallback is visible and usable; original failure and device/driver are recorded |
| GPU runtime failure | Induce/observe detector WebGL context loss after readiness, retaining the browser/site session | The old GPU task is released; one CPU replacement runs; failure remains retryable if CPU also fails |

Do not mark the last two driver cases as passed merely because a unit fixture or the macOS WebGL-refusal test passed. Record the controlled fault separately from a genuine hardware failure.
