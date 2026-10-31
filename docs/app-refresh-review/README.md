# App fixes — 31 October 2026

**Keyboard follow-up:** the original synthetic click was replaced with a softer recorded mechanical tap. See [current sound and provenance](../keyboard-sound-review/README.md).

**Follow-up:** the Safari first-frame freeze was corrected and the user confirmed live video and gesture effects. See [the freeze correction and updated checks](camera-freeze-fix.md). The build/coverage table below records the earlier pass.

Implemented keyboard click audio, recoverable Notes deletion, the nine-track Music library with distinct views/queues, and a camera preview compatibility repair. Preview: http://127.0.0.1:3012.

## Changes

- **Keyboard:** original 65 ms damped mechanical clicks with subtle key variations and a heavier Space/Enter/Backspace sound. Default enabled; AudioContext is created only on a trusted first keystroke. No entry autoplay. Repeated held keys and modified shortcuts are quiet. Eight-voice maximum, cached tiny buffers, cleanup on disabling/unmount. Workspace has an accessible Key sounds toggle with an independent saved preference; no window/drag data is persisted.
- **Notes:** toolbar trash and a secondary-click menu on sidebar notes, including Shift+F10/ContextMenu. Menu uses the existing perspective coordinate helper, clamps within Notes, dismisses on outside click/Escape, and supports keyboard navigation. Deletion targets stable note IDs, picks an adjacent active note, permits an empty list, and offers one bounded Undo delete. Rich text and ordinary editor undo remain unchanged; notes still live only in session memory. Rapid creation now uses a sequence in addition to timestamps.
- **Music:** Listen Now features four picks, Browse searches all nine, and three playlists each contain three different instrumental recordings. Radio and the previous four served audio files were removed. Existing calm gradient artwork and transport remain. Playback queues are view-specific, while browsing alone leaves the active queue alone. Full [sources, credits, measured durations and sizes](../music-provenance.md), plus [machine-readable manifest](../../public/music/manifest.json). Total audio is 40,103,054 bytes, loaded one selection at a time. New assets are 3:10–3:55, 3.82–4.71 decimal MB each. Source metadata identifies instrumentals; subjective listening approval is **not** claimed because audio perception was unavailable.
- **Camera:** same always-mounted capture video and Stage 7 session/detector lifecycle. An ordinary 2D canvas presents the mirrored preview inside the transformed laptop, avoiding dependence on native video compositing in that surface. Backing resolution capped at 960×540; at most 30 new video frames/second, no new WebGL context and no React landmark/frame updates. Gesture inference remains capped at 10 Hz. The preview clears its pixels, callback and resize observer on cleanup. First-draw failure/8-second deadline produces a Retry message instead of indefinite blank space. A render error boundary supplies a visible reopen action. GPU/CPU fallback, gesture mapping, close/minimize/hidden behavior and media constraints are unchanged.

## Verification

Production build **9lwR3xMUe7xDs7x3iOsEJ**, Next.js 16.3.1. Tested on an Apple M1 MacBook Air, 8 GB, macOS 27.2; Chrome 156.0.8078.76, page viewport 1440×722. Local production server, ordinary local network and cache; these were functional checks, not a new performance benchmark.

| Check | Actual result |
| --- | --- |
| Full Node regression suite | 246 passed, 0 failed |
| Focused new camera/audio/Notes/Music tests | 40 passed |
| Lint, TypeScript, production build | Passed |
| MediaPipe package/runtime/model check | 1.0.1 and seven local asset sizes/checksums verified |
| All nine final MP3s | Fully decoded; measured sizes/hashes match manifest; durations >180 s; 0 samples at/above full scale |
| Actual Chrome playback | All nine start, readyState 4, real native duration matches manifest |
| Seek/end | Study And Relax sought to 156.392 s; Night in Venice sought to its ending and automatically advanced to Study And Relax |
| Music UI | Four top picks; nine Browse entries; multiword search/empty search; three jazz entries; rapid switches; pause; close/reopen stays paused with no source; credits present |
| Notes UI | Typed disposable note, secondary-click Delete, Undo, Shift+F10, Escape, toolbar delete; original Developer Log retained |
| Workspace audio | On by default, switch off, reload retains off, switched back on; trusted typing exercised. Subjective sound quality is for user audition |
| Live camera before preview change | User-authorized Chrome capture reached live/gestures-ready; 1280×720, readyState 4, video time 14.828 s. Switched off afterward |
| Final build camera | Browser permission remained pending after reload, then visible timeout/Retry; no attached stream. Closed app afterward |
| New preview logic | Fixture checks: frame delivery, single mirror, cover crop, 30 Hz cap, resize bounds, failed canvas/draw, no frames, late completion and cleanup |

[Browser media metadata](browser-audio-metadata.json), [final full-decode media audit](final-audio-audit.json), [test results](tests.txt), [build](build.txt), [lint](lint.txt), [typecheck](typecheck.txt).

## Camera coverage and remaining check

Chrome live capture was observed before the presentation change; it is **not** proof of final-build camera display or Safari support. The exact Safari blank screen was not reproduced in an accessible hardware session. A plausible transformed-video presentation issue was addressed; the original root cause is not conclusively established. No camera photos or recordings were saved. The camera was closed after testing. Screenshots include only the permission-error cover, never live camera pixels.

Automatic approval review rejected inspection of the existing native Safari window because it contained unrelated private tabs. That route was abandoned; a separate local Chrome tab was used. Native Safari 27.2 retest has been requested from the user and is still pending. Windows was not tested.

Remaining Safari procedure: refresh 3012; open FaceTime and allow camera; verify Camera live plus Gestures ready and a visible mirrored preview. Try peace/thumbs up, turn off/on, minimize/restore and close/reopen. If blocked, read the displayed status and select Retry/Resume as appropriate. The latest Chrome reload also needs its own browser permission prompt answered before final live-preview verification can be completed. These are outstanding hardware checks, not claimed successes.

## Views

- [Music before](music-before.jpg)
- [Listen Now expanded](music-listen-now-expanded.jpg)
- [Browse expanded](music-browse-expanded.jpg)
- [Workspace sound toggle](workspace-sounds.jpg)
- [Notes secondary-click delete](notes-delete.jpg)
- [Camera permission recovery, no camera pixels](camera-permission-recovery.jpg)

The repository’s pre-existing .git pointer targets a missing worktree location, so no Git diff/status verification is claimed. Earlier Stage 5 source records are retained as history. Its old four audio assets were moved to a temporary recovery directory, rather than destructively deleted.
