# Workspace quality revision

Production build `vEe7Zo3GwNY-OZLfGkORG`. Tested 30 October 2026 on MacBookAir10,1, Apple M1, 8 GB, macOS 27.2 (Darwin 27.2.0), Chrome Chrome/156.0.8078.76. Isolated headless native macOS Chrome with ANGLE Metal; 1440×1000 CSS px, DPR 1 and 2. Unthrottled localhost. Background matrix took 114.7 seconds. Not a physical-display FPS or field INP measurement.

## What changed

- Beach: replaced the drifting sunset clip with a native 1920×1080 fixed-camera surf shot by Edgar Fernandez. No pan, zoom, speed change, reverse playback, artificial resolution upscale, or camera motion at the ending.
- Forest: retained the composition but replaced its heavily compressed 720p derivative with the actual Full HD master and a higher-quality encode. Rejected the alternate “Quiet forest” candidate after measured ~3% zoom and ~37 px translation.
- Added original Paper and Slate material/architectural PNGs and restored Studio directly from its native PNG master. No landscape stills. Six CSS solid colors: Ink, Graphite, Chalk, Stone, Sage, Mist.
- Picker groups Live views, Still images and Solid colors; five dedicated thumbnails only. Colors require no media download. Existing saved beach/forest/studio IDs remain valid. The desktop wallpaper, app state and Canvas remain independent and mounted.
- Preserved decode-before-reveal, latest-only switching, bounded two layers, retry/poster fallback, hidden-page pausing, reduced motion, and freezing decoded frames during the 800 ms travel. Updated capability checking from an old 720p codec-level string to MP4 support so new High L4 video is not rejected by an obsolete probe.

## Assets and permission

| Option | Desktop asset | Dimensions | Actual bytes | Duration |
|---|---|---|---:|---:|
| Beach | `beach-hd.webp` | 1920×1080 | 833,548 | — |
| Beach | `beach-hd.mp4` | 1920×1080 | 19,613,425 | 15.25 s |
| Forest | `forest-hd.webp` | 1920×1080 | 873,512 | — |
| Forest | `forest-hd.mp4` | 1920×1080 | 19,537,742 | 15.0 s |
| Studio | `studio.png` | 1672×941 | 2,903,482 | — |
| Paper | `paper.png` | 1672×941 | 2,606,726 | — |
| Slate | `slate.png` | 1672×941 | 3,282,586 | — |
| Ink | CSS #15191f | Resolution independent | 0 | — |
| Graphite | CSS #34383c | Resolution independent | 0 | — |
| Chalk | CSS #e7e4de | Resolution independent | 0 | — |
| Stone | CSS #a79c8d | Resolution independent | 0 | — |
| Sage | CSS #81928b | Resolution independent | 0 | — |
| Mist | CSS #667889 | Resolution independent | 0 | — |

Five 160×100 WebP thumbnails are 778–6,704 bytes. Videos are silent, H.264 High L4, 24 fps, yuv420p, fast-start, CRF20 with 10 Mbps ceiling/20 Mb buffer. Wrap blends are 0.75 s Beach and 1 s Forest; these blend environmental motion, with fixed framing. Larger ~19.6 MB files deliberately preserve detail rather than the old 1.8 Mbps/720p compression. The full video is not needed before first playback; only the selected view is requested. PNGs are losslessly optimized at native **1672×941**, not advertised as 4K or enlarged to manufacture resolution. Very large/Retina screens may still exceed source resolution.

Both individual Mixkit item pages explicitly carry the Free license. It permits download, modification and incorporated website playback; attribution is optional and voluntary credits are in the picker. No stock redistribution/download UI is supplied. Sources: [Beach](https://mixkit.co/free-stock-video/waves-reaching-the-shore-1925/), [Forest](https://mixkit.co/free-stock-video/the-wind-gently-moves-the-forests-lush-vegetation-on-a-50870/), [license](https://mixkit.co/license/modal/videoFree/), [terms](https://mixkit.co/terms/). Static artwork is original image_gen project artwork, with no third-party stock attribution requirement. See [full provenance, hashes and sizes](../../public/workspaces/provenance.json).

## Camera and loop review

Inspected contact sheets across the source clips and the ending, SIFT/RANSAC spot checks, plus **every source and encoded-loop frame** against stationary sand/bark patches. Source Beach: 719 frames, zero-pixel patch displacement, minimum normalized correlation 0.9366. Source Forest: 442 frames, maximum 1 px, correlation ≥0.9789. Final loops: Beach 365 checked subsequent frames, 0 px, correlation ≥0.9309; Forest 359, ≤1 px, correlation ≥0.9844. These checks measure fixed features, excluding moving waves/leaves; they do not guarantee subjective comfort. Browser loop wrap is also exercised.

Evidence: [source checks](camera-stability.json), [encoded loop checks](loop-camera-stability.json), [Beach frames](beach1925-source-sheet.jpg), [Forest frames](forest50870-source-sheet.jpg). The unused drifting candidate sheet is retained only as rejection evidence.

## Production checks

| Workload | Prior 720p build p95 | Revised p95 | Revised max | Long tasks |
|---|---:|---:|---:|---:|
| Beach video + 3D idle, 8 s | 16.8 ms | 16.8 ms | 16.8 ms | 0 |
| Forest video + 3D idle, 8 s | 16.8 ms | 16.8 ms | 16.8 ms | 0 |
| Six switches, profiled repeat | 16.8 ms | 16.7 ms | 16.8 ms | 0 |
| DPR 2 idle | 16.8 / 16.7 ms | 16.8 ms | 33.3 ms | 0 |
| DPR 2 drag | 16.8 / 16.7 ms | 16.7 ms | 16.8 ms | 0 |
| Gesture fixtures + effects + Music + dragging, ~14 s | 16.8 ms | 16.8 ms | 33.4 ms | 0 |

The combined workload ran actual MediaPipe inference at 9.87/s with real MP3 playback advancing to 31 s; input was a photo-fed canvas MediaStream, **not a physical webcam**. Local pointer-to-next-rAF p95 was 1.4 ms. Prior build had 9.85 inference/s. These are observations, not a claim of performance improvement.

**Observed outlier:** the initial six-switch sample included a 333.3 ms rAF gap, three long tasks (343/84/79 ms) and local Event Timing max 560 ms. A separately CPU-profiled repeat had max 16.8 ms, zero long tasks and Event Timing max 56 ms, without an application optimization. A further cache-cleared repeat also had p95/max 16.8/16.8 ms, zero long tasks and local Event Timing max 32 ms; its switching sample began after the concurrent startup lint/type checks had completed. No cause or fix is claimed. Reproduce with the video-idle filter below, then select Studio → Beach → Forest → Beach → Studio → Forest. Retained first sample and repeat evidence are linked below.

- Nine browser scenarios passed: cold entry and laptop continuity, all 11 choices, zero-request colors, PNG and color reload, independent desktop wallpaper/note state, rapid/late loads, blocked posters/video and retry, rejected autoplay, freeze/resume/page visibility, actual loop ending, reduced motion, keyboard Home/End/Escape, touch and 320/390/800/1440 px picker layouts, repeated cleanup.
- Eight Forest → Beach → Studio cycles kept DOM nodes/listeners fixed at 304/586. Post-GC heap 11.710 → 11.998 MB (~0.289 MB). Final Studio: one background layer, zero videos, zero pending background video callbacks; retired video elements collected or paused with src removed.
- 209/209 store/geometry/readiness/regression tests; 12/12 workspace tests; lint, TypeScript and production build pass. No added application dependencies.
- The first camera harness attempt assumed a native audio clock would start within 400 ms and failed. Replaced that assumption with bounded polling for real clock advancement; subsequent full combined workload passed. No Music application change.
- Native Windows, Safari, physical camera/trackpad and real touch hardware remain untested. Narrow/touch/visibility/autoplay cases used labelled CDP fixtures. Large media and slower connections can increase preparation time; current background stays visible.
- Git diff/status could not be used because this checkout already points to the missing `/Users/Om/om-new/.git/worktrees/playful-meadow`. It was not repaired or reset.

## Evidence

- [All backgrounds contact sheet](background-options.png)
- [Picker](after-background-picker.png), [Beach](after-beach.png), [Forest](after-forest.png), [Studio](after-studio.png), [Paper](after-paper.png), [Slate](after-slate.png), [Chalk](after-chalk.png), [narrow picker](after-narrow-390.png)
- [Nine browser results, including initial outlier](after-workspace-results.json), [profiled repeat](profile-video-idle-workspace-results.json), [CPU profile](profile-travel.cpuprofile), [cache-cleared repeat](cold-video-idle-workspace-results.json), [Retina](after-retina-results.json), [camera fixture](camera/after-results.json), [camera trace](camera/after-combined.trace.json.gz)
- [Build](build.txt), [lint](lint.txt), [types](typecheck.txt), [regression tests](regression-tests.txt)

Re-run from the project root (isolated Chrome CDP on port 9230, production server on 3012):

```sh
STARTUP_TEST_URL=http://127.0.0.1:3012 CDP_URL=http://127.0.0.1:9230 WORKSPACE_OUTPUT_DIR=../docs/stage13-revision/ node tests/workspaces.browser.mjs
STARTUP_TEST_URL=http://127.0.0.1:3012 CDP_URL=http://127.0.0.1:9230 WORKSPACE_OUTPUT_DIR=../docs/stage13-revision/ WORKSPACE_FILTER=video-idle WORKSPACE_PROFILE=1 node tests/workspaces.browser.mjs
```
