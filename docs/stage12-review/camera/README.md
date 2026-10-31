# Stage 12 camera integration measurements

The executable check is `tests/stage12-camera.browser.mjs`. Results are written only when run; this document alone is not test evidence.

## Bounded offline trace attribution

The baseline PerformanceObserver timestamps were aligned with `CrRendererMain` trace timestamps using the recorded native-inference measures. The 61 ms task at page 18.1153 s contains a 45.1 ms native inference; its owning callback took 45.367 ms wall time but 3.314 ms thread CPU. The 84 ms task at page 21.6004 s contains a 51.9 ms inference, a 53.487 ms owning callback (5.413 ms thread CPU), a 5.088 ms pointer dispatch and 1.908 ms layout. Neither shows a substantial GC/layout bottleneck that justifies changing particle styles or store subscriptions.

The largest 155 ms task at page 18.2334 s has no inference/GC overlap and only about 1.94 ms of traced main-thread work, with an approximately 152.6 ms uninstrumented gap before a 0.424 ms style update. It begins about 10.7 ms after peace recognition/confetti onset; this is temporal proximity, not proof that the effect caused it. The captured trace lacks scheduling/GPU-wait detail, sampled stacks and top-level `RunTask` slices. Low CPU relative to wall time is compatible with native waiting or descheduling, but does not prove either. Its exact cause remains unresolved, so no speculative production patch was applied.

The final matching workload had no long tasks; maximum owning callback/native inference/layout/main-thread GC were 30.770/30.6/2.209/5.229 ms. To attempt reproduction on the current build, run with `STAGE12_PHASE=diagnostic STAGE12_CAMERA_FILTER=combined-scene`. The harness waits 7 s with no hand, shows thumb/peace fixtures for 3.5 s each, then alternates fixtures through four 45-event Notes drag passes while Music plays. The historical 61/155 ms events occurred near the first peace transition and the 84 ms event near the first drag/thumb transition. Recurrence is nondeterministic; the identical final workload did not reproduce them. Repeating the exact baseline code also requires its historical build.

```sh
STARTUP_TEST_URL=http://127.0.0.1:3012 CDP_URL=http://127.0.0.1:9229 STAGE12_PHASE=baseline node tests/stage12-camera.browser.mjs
STARTUP_TEST_URL=http://127.0.0.1:3012 CDP_URL=http://127.0.0.1:9229 STAGE12_PHASE=after node tests/stage12-camera.browser.mjs
```

`STAGE12_CAMERA_FILTER` selects a scenario by substring. `STAGE12_CAMERA_OUTPUT` overrides the output directory. Labels preserve separate baseline/after JSON, screenshots and compressed Chrome traces. A phase label does not restore earlier source code: each report must identify its actual tested production build.

The combined profile runs the real portfolio 3D scene, installed MediaPipe model and classifier, native video playback from a 640 × 480 `canvas.captureStream(30)` stream fed by hand photographs, actual native Music playback, both recognized effects, and trusted pointer events dragging Notes. The measured phases are 7 seconds neutral, 7 seconds recognition/effects, and four drag passes with recognition/effects/music. It reports measured inference rate/native call time, rAF callback distributions, tasks above 50 ms, pointer listener to next rAF latency, main-thread TaskDuration/elapsed-time proxy, heap, live media tracks, pending video callbacks, effect population and progressing audio time.

These are local controlled measurements, **not field INP, GPU presentation/completion measurements, physical-camera evidence or native permission-prompt coverage**. Browser version, actual host OS, device, GPU, viewport, conditions and phase windows are recorded in JSON. Isolated headless Chrome focus emulation keeps the measured target active. The hidden/restore and denial/retry cases are labelled event/permission fixtures.

The second scenario checks camera-denial/retry, hidden/restore, minimize/restore, pagehide/pageshow, eight close/reopen cycles, no inference while paused/closed, and release of tracks/video callbacks/effects. Resource samples at cycles 0, 2, 4, 6 and 8 collect GC-assisted JS heap and DOM/listener counts. Harness-only historical media arrays are cleared before collection; its WebGL canvas references are weak. The remaining scene renderer is expected; gesture canvases should be released.

Test-only source JPEGs (not shipped website assets) are stored in `/private/tmp/portfolio-stage12-fixtures`, or `FACETIME_FIXTURE_DIR`:

- [Google MediaPipe thumb-up fixture](https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg), 80,388 bytes.
- [Google MediaPipe victory fixture](https://storage.googleapis.com/mediapipe-assets/victory.jpg), 69,362 bytes.

The source fixtures and the original Stage 8 classifier/inference scope are documented in [the existing camera review](../../facetime-stage8/README.md#reproducing-the-checks). This run does not establish Windows Chrome/Edge or real Safari/physical-camera support. Use the [remaining hardware matrix](../../stage7-browser-matrix.md#remaining-physical-acceptance-matrix) for those checks.

## Baseline observations

Production build `YDm78Ayaf0KK_VzrB0uGz`, 30 October 2026: MacBook Air M1 (`MacBookAir10,1`), macOS 27.2 / Darwin 27.2.0 arm64, Chrome 156.0.8078.76 with ANGLE Metal Apple M1. Viewport 1440 × 1000, DPR 1, unthrottled localhost. The camera/model and native Music playback were warmed before timing. This is the actual reported runtime, not the earlier Stage 8 machine-version record.

| Measured window | Duration | Inferences/sec | Native inference p95 | rAF interval p95 / max | Long tasks >50 ms | Pointer listener → next rAF p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Scene + camera + Music, neutral | 7.00 s | 9.85 | 22.6 ms | 16.7 / 16.8 ms | 0 | — |
| Recognition + effects + Music | 7.02 s | 9.26 | 27.3 ms | 16.8 / 166.6 ms | 2 (max 155 ms) | — |
| Recognition + effects + Music + dragging Notes | 14.53 s | 9.77 | 23.7 ms | 16.7 / 83.3 ms | 1 (84 ms) | 19.8 ms (180 samples) |

Main-thread TaskDuration/elapsed-time proxy: 31.22% across 28.62 measured seconds. Music's actual playback position advanced from 0.33 to 31.60 seconds. One scheduled inference callback and one camera track were observed live. All camera tracks, inference callbacks, effects and audio nodes were gone after close; one scene renderer canvas remained. Typical frame cadence approaches the 60 Hz goal, but the recorded outliers show that this run was not hitch-free.

The lifecycle fixture passed denial/retry, hidden/restore, minimize/restore, pagehide/pageshow and eight reopen cycles. After GC-assisted samples, DOM nodes/listeners remained 405/579 at every sample. JS heap increased from 13.43 to 14.02 MB (+0.58 MB); this short run does not prove perfectly flat memory. No inference occurred while hidden or after closing. Tracks, fixture paint intervals, effects and pending video callbacks were zero at every closed-cycle sample.

Evidence: [corrected combined run](baseline-results.json), [lifecycle run](baseline-lifecycle-results.json), [Chrome trace](baseline-combined.trace.json.gz), [combined layout](baseline-combined-after-measurement.png). The first harness run sampled Music 350 ms into its close animation and incorrectly required its DOM node to be absent; native playback was already stopped and released. The harness now waits for actual frame removal. Its original report/trace remain as `baseline-initial-harness-assertion.json` and `baseline-initial-combined.trace.json.gz`, rather than silently discarding the failed assertion. That first run's lifecycle scenario passed and is copied unchanged into the dedicated lifecycle report.

## Final production comparison

Final build `tn56yDtmK_Ro_VJQn75ci` used the same actual host/browser, viewport, local network, photo-fed native stream, model, Music track and interaction sequence. Its combined scenario took 38.407 seconds overall, of which 28.114 seconds were the measured phases; the lifecycle scenario took 24.386 seconds. The corrected baseline combined scenario took 39.355 seconds overall, with 28.619 measured seconds, and its lifecycle run took 25.810 seconds.

| Workload | Baseline → final measured duration | Baseline → final native inference p95 | Baseline → final rAF p95 / max | Baseline → final long-task count |
| --- | ---: | ---: | ---: | ---: |
| Neutral + camera + Music | 7.003 → 7.019 s | 22.6 → 22.4 ms | 16.7 / 16.8 → 16.8 / 16.8 ms | 0 → 0 |
| Recognition + effects + Music | 7.016 → 7.028 s | 27.3 → 22.8 ms | 16.8 / 166.6 → 16.7 / 33.3 ms | 2 → 0 |
| Above + dragging Notes | 14.535 → 14.045 s | 23.7 → 22.6 ms | 16.7 / 83.3 → 16.7 / 16.8 ms | 1 → 0 |

Final measured inference rates were 9.83, 9.82 and 9.83 checks/sec respectively. Native inference maxima were 24.0, 30.6 and 24.0 ms. The 180 pointer samples had 1.3 ms p95 and 23.9 ms maximum listener-to-next-rAF latency (baseline 19.8 ms p95). Main-thread busy proxy was 29.81% (baseline 31.22%). These two samples differ; the camera runtime/scheduler was unchanged, and **a single before/after run does not establish a camera performance improvement or the disappearance of stalls**. The baseline's 155 ms long task and 166.6 ms rAF gap remain observed stall evidence; this pass did not isolate a specific cause for those outliers. Native inference still executes on the main thread; no speculative worker rewrite was made.

Both final scenarios passed with no unhandled runtime exceptions. Native Music time advanced 0.32 → 31.04 seconds. Every measured segment began and ended with one pending inference video callback and advancing unpaused audio. After close there were zero camera tracks/callbacks/effects/audio nodes and one scene canvas. Hidden/minimized states had no pending inference callback; no inference occurred during the 1.4-second hidden check or 1.4 seconds after close.

Final GC-assisted closed-cycle samples again held 405 DOM nodes and 579 listeners at cycles 0, 2, 4, 6 and 8. JS heap rose 13.49 → 14.12 MB (+0.63 MB). That modest warm-up trend is documented, not called a memory leak or proof of unlimited stability. Source retains only a bounded five-minute model buffer cache and closes active native detectors. Long sessions and real webcam drivers still require hardware coverage.

Final evidence: [combined/lifecycle results](after-results.json), [separate lifecycle results](after-lifecycle-results.json), [compressed Chrome trace](after-combined.trace.json.gz), [combined layout screenshot](after-combined-after-measurement.png). The screenshot was visually inspected alongside the baseline: camera preview, Notes and native Music remain visible and retain their design. The photograph is a controlled fixture. Windows 11 Chrome/Edge, native macOS Safari, physical camera permissions/live gestures, native page-background scheduling and thermal variation remain outstanding; no hardware parity or universal FPS claim is made.

The main Stage 12 host power observation reported `AC Power` and `lowpowermode=0`. Those OS flags are environmental context, not proof that thermal or power conditions were perfectly controlled across the individual profile windows.
