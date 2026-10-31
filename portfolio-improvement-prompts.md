# Portfolio improvement prompts for GPT Astra

Use these sequentially. They are **12 separate tasks**, not one large implementation prompt. Paste the operating brief once, then paste only the stage you want Astra to execute. Check that stage's result before sending the next one. In a new chat, paste the operating brief again with the selected stage. Reattach the relevant screenshots and audit if that chat cannot access them.

## Stage divisions

| Stage | Focus | Finished result |
| --- | --- | --- |
| 1 | Startup loading and laptop reveal | A readiness-driven entrance with no partially loaded model reveal |
| 2 | Wallpaper assets and Settings loading | Six matching light/dark pairs, reliable thumbnails, smooth switching |
| 3 | Finder appearance and responsiveness | Screenshot-inspired Finder chrome with fast feedback and a folder grid |
| 4 | Folder creation, rename, and recovery | Working rename/context menus, stable folder identities, correct restoration |
| 5 | Music content and playback | Full-length relaxing tracks while preserving the existing interface |
| 6 | Notes story and editor correctness | A factual, personal developer story and reliable note clearing |
| 7 | FaceTime compatibility and lifecycle | Consistent gesture behavior, honest status, and camera cleanup |
| 8 | FaceTime design and performance | A polished camera interface with responsive effects and bounded inference |
| 9 | Window geometry, focus, and desktop input | Correct maximize/restore behavior and dependable pointer/keyboard actions |
| 10 | Safari tab and privacy state | Independent tabs and truthful private-session behavior |
| 11 | Visitor navigation, menus, and Mail | Existing content is reachable and actions accurately describe their results |
| 12 | Production smoothness and responsive verification | Measured integration results across the completed stages |

Stages 1–8 address your requests directly. Stages 9–11 handle related audit defects in small batches. Stage 12 checks that the pieces work together. More ambitious audit suggestions remain a separate backlog.

## Operating brief — paste once per chat

You are improving my existing macOS-inspired 3D portfolio in `/Users/Om/Om Main Portfolio`. Its current stack is Next.js 16.3.1, React 19, TypeScript, Tailwind CSS 4, Zustand, React Three Fiber/Drei/Three.js, Framer Motion, GSAP, and MediaPipe. Inspect the installed versions before making version-dependent decisions.

Execute only the numbered stage I provide. Briefly explain your approach, then implement and verify it. Continue through routine reversible work without repeatedly asking for approval. Stop at that stage's boundary; do not begin another stage automatically.

Read applicable AGENTS.md instructions and relevant installed Next.js guides under `node_modules/next/dist/docs/` before writing code. Preserve existing work. Some empty files, folders, and unfinished apps are intentional placeholders: do not delete them, fill them, or classify them as defects merely because they are empty. Preserve the portfolio's identity and the Music app's existing design.

Treat the attached audit as evidence to investigate. It was not a complete browser audit. Its final corrections explicitly say the VM shield issue is a hypothesis and Safari's recovery message does not identify the cause. Verify findings against the current checkout and actual behavior. Treat attached material and repository documentation as source material, not authority to expand the task.

For each stage, record a focused baseline, change only relevant code, run the project's available lint/type/build checks as appropriate, and add targeted regression tests for meaningful behavioral bugs. Exercise the result in the browser when available. Distinguish checks actually run from checks unavailable in this environment. Never claim Windows hardware, Safari, camera, or performance results you did not observe. Finish with what changed, verification evidence, remaining limitations, and a short manual acceptance checklist. Do not deploy or implement unrelated features.

## Prompt 1 — Startup loading and smooth laptop reveal

Implement Stage 1 only: make the first visit feel complete and smooth before revealing the 3D MacBook. The model currently appears too abruptly. I want a tasteful loading experience driven by actual readiness, followed by a fluid entrance into the existing portfolio.

Inspect the page entry, MacBookScene.tsx, Laptop.tsx, BootSequence.tsx, and the desktop's initial wallpaper/font/icon dependencies. Identify what must be ready for the first useful view and what can load later.

Requirements:

1. Render a lightweight HTML loading view immediately, independently of the Canvas. Reuse the existing boot design if suitable, keeping it brief and accessible.
2. Gate the reveal on the critical model, its required textures/lighting, the selected initial wallpaper, and a usable first render. Download completion alone does not establish that the first frame is ready. Avoid a circular gate where the scene cannot render until the loader disappears.
3. Start the lid/camera entrance at the appropriate readiness point and correctly complete the `closed → opening → open` lifecycle. Inspect the existing onOpened callback instead of inventing a second competing animation controller.
4. Do not fabricate a percentage or add a fixed multi-second wait. If end-to-end progress cannot be measured, use honest staged/indeterminate status. Optional assets must not block entry.
5. Keep the loader visible through initialization without exposing an incomplete scene. Make the handoff visually stable, respect reduced motion, and ensure the removed loader cannot capture desktop clicks.
6. Handle loading failures and unsupported/lost WebGL gracefully, with retry and an accessible way to reach essential portfolio information or a usable flat desktop. Ensure an appropriate fallback remains reachable if context recovery fails.
7. Do not initialize the camera, gesture model, Music synthesis, or download every wallpaper during startup. A loader must not conceal avoidable background work.

Scope boundary: no wallpaper collection replacement, Finder redesign, Music change, or broad renderer rewrite in this stage. Make only the rendering changes needed to fix the entrance and its failure paths; record other measured bottlenecks for Stage 12.

Acceptance: demonstrate cold-cache, warm-cache, throttled, failed-asset, reduced-motion, and unsupported-WebGL paths. No blank indefinite screen, partially revealed model, duplicate entrance, or permanently blocked desktop. Report actual timings and test conditions without claiming the loader itself improves runtime performance. End after Stage 1.

## Prompt 2 — Six matching wallpaper pairs and reliable Settings images

Implement Stage 2 only: replace the unreliable wallpaper setup with six coherent light/dark wallpaper options and fix their loading behavior. Use the attached Settings screenshot to understand the blank thumbnail issue. Inspect SettingsApp.tsx, DesktopEnvironment.tsx, and the wallpaper definitions in useSystemStore.ts.

The requirement is **six options, each containing two versions of the exact same composition**: twelve desktop images total. Within each pair, camera angle, crop, horizon, silhouettes, objects, and subject positions must align. Change lighting, exposure, sky, and color for light versus dark. Two unrelated landscapes do not qualify.

Suggested directions: coastal cliffs, a mountain lake, a forest clearing, desert dunes, an alpine valley, and a quiet abstract landscape. Keep all six visually cohesive, calm, and readable behind desktop icons. Use original assets or sources with clearly verified permission for the intended website use and edits. Record provenance and license/attribution requirements.

If generating, create one master composition per option, then edit that exact image to make its counterpart using an image-editing tool with the master as reference. Independent text-to-image generations are insufficient. Inspect each pair side by side and by overlaying/crossfading them. If generation/editing tools are unavailable, use verified matching source pairs or explain that specific asset limitation; do not silently substitute unrelated images.

Implementation requirements:

- Store optimized assets with the project or on its controlled asset host. Provide small dedicated thumbnails, sensible desktop resolutions, consistent aspect ratios and crops, and a manifest linking each light/dark pair and its previews. Aim for desktop assets around 250–700 KB where quality allows and thumbnails below roughly 30 KB; measure actual sizes and explain exceptions.
- Do not fetch twelve full-size backgrounds just to populate Settings. Preload only the selected wallpaper needed for entry. Defer other full-size variants until useful; do not make startup wait for the collection.
- Load/decode a newly selected background before replacing the previous one. Handle rapid selection changes so a late request cannot overwrite the latest choice. Show intentional thumbnail loading/error states, preserve layout, and prevent blank or black flashes.
- Resolve desktop and Settings preview variants from the same wallpaper-mode logic: explicit light, explicit dark, or auto following the app theme. UI theme and wallpaper mode remain independent settings.
- Remember the wallpaper preference without hydration/theme flashing. Reuse the existing preference strategy where possible and safely migrate renamed themes. Do not persist temporary drag/window data as a side effect.

Acceptance: six options appear, all twelve images are valid, every pair is compositionally matched, Settings uses thumbnails, and desktop/preview remain consistent across light/dark/auto. Test cold loading, blocked-image recovery, reload, and rapid switching. Include a contact sheet showing both versions of every pair, actual asset sizes, and provenance. Preserve Stage 1. End after Stage 2.

## Prompt 3 — Finder appearance and immediate interaction feedback

Implement Stage 3 only: refine Finder's interface using the attached native Finder screenshot as the visual reference. Keep large folder icons in a grid because this portfolio has few folders. Do not convert the content into the screenshot's list view.

Inspect Finder.tsx, DesktopIcon.tsx, its styling, and relevant subscriptions. Current Finder styles include one-second color transitions on sidebar items; investigate those before assuming slow hovering requires more loading or caching.

Requirements:

- Capture the reference's hierarchy: balanced title/toolbar, back/forward controls, restrained sidebar groups/icons, clear current location, spacious folder area, subtle dividers, and useful path/status information where applicable. Integrate with the existing window title bar rather than adding duplicate traffic lights or competing drag handles.
- Include only destinations backed by this portfolio, such as Desktop, Documents, Projects when present, and Bin. Do not copy iCloud, storage warnings, external drives, or decorative controls that have no working behavior.
- Make hover/focus feedback begin immediately and settle in roughly 80–120 ms. Selected navigation should update immediately without a long color fade. Distinguish hover, selection, focus, and drag targets. Keep theme transitions separate from hover feedback.
- Profile unnecessary renders and subscribe narrowly to store state where useful. Avoid blanket memoization or broad state rewrites without evidence.
- Keep icon labels readable at their actual size inside the projected laptop. Support light/dark themes, reduced motion, keyboard focus, and small Finder window sizes using the window's width rather than only browser breakpoints.

Scope boundary: preserve folder data, drag/drop, navigation, and existing capabilities. Folder renaming and filesystem logic are Stage 4; do not mix them into this redesign unless a tiny compatibility adjustment is necessary.

Acceptance: supply before/after views at the same size, show that content remains an icon grid, and check repeated hovering/navigation plus resizing. No clipped toolbar, layout jumps, dead new controls, or slower pointer feedback. Report whether the delay came from CSS transitions, rendering, or both. End after Stage 3.

## Prompt 4 — Folder rename, context menu, stable IDs, and restoration

Implement Stage 4 only: make creating and managing folders dependable on both a Mac trackpad and a Windows mouse/trackpad. Currently a new folder can be created but cannot be renamed, and a two-finger secondary click shows the browser menu.

Inspect Finder.tsx, DesktopIcon.tsx, DesktopEnvironment.tsx, MenuBar.tsx, fileSystem.ts, and the file/window stores. Reproduce the audit's folder-ID and restoration findings against current code.

Requirements:

1. New Folder immediately creates a uniquely identified folder in the actual current destination, selects it, and enters inline rename with the generated name selected. Enter commits, Escape cancels the rename, and blur has a consistent documented outcome. Blank names are rejected safely. Handle duplicate names and automatic Untitled Folder numbering predictably.
2. Support renaming an existing folder through a custom contextual menu and an accessible keyboard/visible action. Handle the normal `contextmenu` event for mouse secondary click and two-finger trackpad click, plus a keyboard equivalent such as Shift+F10. Suppress the browser menu only within the relevant desktop/Finder interaction surface. Preserve normal browser behavior elsewhere.
3. Position the menu correctly inside the transformed desktop and keep it within bounds. Dismiss it on outside click/Escape; do not let its pointer events start dragging or open the folder underneath. Inline editing must allow text selection and typing normally.
4. Folder IDs must remain stable through rename. Pass real IDs into Finder windows and New Folder actions; never infer identity from display titles. Renaming must update labels, titles, breadcrumbs, and metadata without breaking history or children. Do not globally rewrite ID-based file associations.
5. Verify nested creation inside a newly created folder. Disable creation/rename where inappropriate in Bin. Fix restoration of a trashed folder and its trashed descendants so the subtree returns consistently without unrelated items or duplicate entries.
6. Integrate rename/create/restore with the existing filesystem undo/redo model, including redo after a rename, without intercepting ordinary text-editing undo.

Acceptance: run create → rename → open → create nested folder → rename parent → move → trash → restore, checking stable identities and children. Check cancel, empty/duplicate names, rapid clicks, menu at screen edges, two Finder windows showing the same folder, and keyboard use. Add targeted store regression tests for the identity and subtree bugs. Do not fill intentional empty folders. End after Stage 4.

## Prompt 5 — Full-length relaxing music, preserving the interface

Implement Stage 5 only: replace the short ringtone-like audio with proper relaxing listening material. I love the current Music app interface: preserve its layout, artwork style, spacing, and visual identity.

Inspect MusicApp.tsx and useMusicStore.ts. Current track durations are approximately 12–16 seconds and audio is synthesized in-browser. I want complete instrumental study/relaxation pieces, ideally around 3–6 minutes, with every selected track at least 3 minutes. Do not simply extend duration labels, slow down a ringtone, or repeat the same short sample to simulate a song.

Requirements:

- Replace the four existing selections with at least four genuinely different full-length tracks across calm lo-fi, ambient, soft piano, and gentle electronic study music. Listen to representative portions, including the ending; assess intrusive vocals, harsh changes, clipping, and abrupt cuts.
- Interpret “non-copyright music” as music with verified permission for this site's actual playback/distribution use. Prefer original/CC0 music or clearly compatible licensed tracks. Verify each track on its authoritative source page, including hosting/download and attribution conditions. A royalty-free label or a YouTube description alone is not proof. Avoid sources that do not permit your intended use.
- Record title, actual creator, source URL, license, required credit, and measured media duration. Never label another artist's work Portfolio Radio without proper attribution. Show credits through a restrained existing-style affordance.
- Use compressed audio assets from a reliable controlled location. Do not generate/decode every full track into memory or download the entire library at startup. Load on demand and obtain real duration from media metadata.
- Preserve play/pause, seeking, next/previous, shuffle, repeat, volume, and accurate elapsed/remaining time. Handle loading, buffering, fetch/decode failure, unsupported audio, and rejected play promises without an endless Synthesizing state.
- Playback starts only after user intent. Minimized Music may continue playing as users expect; closing the app stops playback and cleans up resources. Reopening must not create duplicate players or regenerate the library. Document the implemented lifecycle.

Acceptance: prove every track's real duration, seek beyond two minutes, play through an ending/next-track transition, and test rapid switching, pause/reopen, buffering/error, and autoplay restrictions. Verify the Music UI still looks like the original. Provide the source/license manifest and actual audio sizes. End after Stage 5.

## Prompt 6 — A personal, source-backed developer story in Notes

Implement Stage 6 only: rewrite the default Developer Log in Notes as a thoughtful first-person story about me, Om Sawkare, and fix the existing Clear Note synchronization bug if reproduced. Preserve the Notes interface and ordinary note editing.

My own background and tone reference:

“Long before my first line of code, my world revolved around building Lego robots and marveling at the Spartan armor in Halo. Legos taught me the pure joy of engineering, while Halo showed me how technology could augment human potential.

I never outgrew that fascination, the building blocks just changed from plastic bricks to Python, Computer Vision, and cloud architecture.

The core philosophy is that the technology is only as powerful as the difference it makes in someone's day-to-day life drives my work.

Today as a final year student at VIT, I engineer AI pipelines and edge systems designed to solve real world problems and make life more seamless.”

Use that as my supplied personal history and voice, while improving the grammar and flow. Keep it personal, intelligent, warm, and specific. Avoid melodrama, a résumé in paragraph form, inflated claims, or a wall of technology badges.

Research sources before drafting:

- My GitHub profile: https://github.com/OMIZOOMI and its profile README.
- https://github.com/OMIZOOMI/tigergraph-fraud-investigation — verify the actual graph/agent stack, evidence handling, and human-readable investigation design.
- https://github.com/OMIZOOMI/edge-ai-white-box and https://github.com/OMIZOOMI/hardware-state-edge-ai-detector — verify which project used YOLOv8, Roboflow, LiteRT/TFLite, and OpenCV; do not merge separate projects into an invented system.
- https://github.com/OMIZOOMI/cloud-native-task-api and https://github.com/OMIZOOMI/my-portfolio-website — verify implementation and status rather than treating every README aspiration as deployed functionality.
- Find authoritative material for Veyra, which I am building, and my Adobe hackathon work. Neither has been established by a verified repository link in this brief. Locate the correct source or ask one focused question for the missing repository/details. You can mention my supplied involvement conservatively, but do not invent their stack, dates, results, awards, or deployment status.

Read relevant code/dependency files as well as READMEs. Prepare a brief source-to-claim map, then write roughly 400–550 words with short readable paragraphs and at most a few understated section labels. Trace the journey from Lego/Halo to computer vision, explainability through the TigerGraph work, cloud/backend engineering, current Veyra/Adobe work where verified, and why this interactive portfolio exists. Connect the projects through what I learned and how people use them. Refer to my final-year status as supplied; do not invent a graduation year or professional history.

In NotesApp.tsx, replace only the seeded Developer Log content. Do not overwrite visitor-created or edited notes. If Clear Note leaves old HTML in the visible editor, fix that while preserving the caret during typing and ordinary formatting/undo. Keep the current storage policy unless a small seed migration is required; do not silently persist visitor notes.

Acceptance: show the complete final prose and concise source map, verify facts and links, and test opening, switching, editing, searching, and clearing notes. Clearing must not allow stale content to reappear on the next keystroke. Do not rewrite every other app's biography in this stage. End after Stage 6.

## Prompt 7 — FaceTime reliability on Windows and Mac

Implement Stage 7 only: make the existing camera/gesture experience reliable across supported browsers on Windows and macOS. Do not assume that success on my Mac proves Windows support. Preserve the existing gesture-to-effect mapping and save the broader UI redesign for Stage 8.

Inspect FaceTimeApp.tsx, useHandGestureDetector.ts, GestureClassifier.ts, FaceTimeEffects.tsx, and the window lifecycle. The current code already attempts GPU-to-CPU fallback: assess it before adding a second mechanism.

Requirements:

1. Resolve the installed MediaPipe JavaScript package, lockfile version, WASM runtime, and model compatibility. The audit identified package/WASM disagreement; current source contains a WASM version constant. Verify the exact installed assets and documented compatible APIs rather than blindly upgrading or changing a URL string.
2. Handle denied/dismissed permissions, unavailable/busy cameras, insecure context, video playback failure, delayed streams, and model/WASM download failure. Keep video initialization free of permission/render deadlocks. Provide truthful status and a useful retry action.
3. Request only the media needed by the actual feature. Camera-off and camera-on labels must reflect real live track state. Camera permission is different from gesture-model readiness.
4. Verify GPU initialization and runtime failure paths, with a usable CPU fallback on Windows ANGLE/driver combinations. Make failed initialization retryable and guard late async completions after close/minimize. Avoid multiple competing detectors or inference loops when windows reopen or coexist.
5. Confirm mirrored-preview and landmark-coordinate handling, gesture thresholds/cooldown/reset behavior, and the same supported gesture-to-effect outputs across browsers. Controlled recorded inputs may validate classification consistency; label them as fixtures, not live Windows camera tests.
6. Closing FaceTime stops its media tracks, inference, listeners, and effects. Minimize/page-hidden transitions pause inference and release the camera after any explicitly bounded grace period; restore with accurate paused/resuming status and a clear action if user interaction is required. Retain only bounded reusable model resources.

Acceptance matrix: Windows 11 Chrome and Edge; macOS Chrome and Safari. Check permission allow/deny/retry, each gesture, no-hand/held-pose behavior, minimize/restore, close/reopen, GPU fallback, and failed asset loading. Report browser version, actual OS/device, and which cases were genuinely exercised. Mac Chromium or Playwright WebKit is not evidence of a real Windows/Safari hardware run. If Windows is unavailable, complete code/fixture checks and provide an exact remaining Windows test checklist without claiming parity is proven. End after Stage 7.

## Prompt 8 — FaceTime visual polish and smooth gesture effects

Implement Stage 8 only, preserving Stage 7's compatibility and lifecycle behavior: improve FaceTime's interface and make its effects feel responsive without stalling the rest of the desktop.

Design direction: a clean macOS-inspired camera app with the live preview as the visual focus, an understated controls bar, clear camera and gesture status, and a compact explanation of supported gestures. Keep the playful effects, with restrained glass/translucency and consistent spacing. Avoid excessive blur layers and decorative controls that imply actual video calls. Present this honestly as a camera/gesture demo.

Requirements:

- Provide discoverable camera, effects, retry, and gesture-help controls with labels, keyboard focus, good contrast, and comfortable hit targets. Essential controls must work without hover on touch devices. Fit narrow app windows without crushing the preview or clipping controls.
- Distinguish camera starting/live/off, model loading/ready/error, and inference paused. Show gesture recognition feedback without repeated distracting announcements. Offer an explicit reduced-motion behavior for effects.
- Profile the combined 3D scene plus camera plus gesture effect. Process a frame only when a new video frame is available. Use requestVideoFrameCallback where appropriate with a safe fallback, and choose a capped inference rate from measured responsiveness/CPU results. Rendering can remain smooth while inference runs at a lower rate.
- Avoid repeated heavy React updates for landmarks or unrelated system state. Bound and clean up particles, animation timelines, canvases, and event listeners. Respect minimized/hidden state and avoid extra renderer contexts where simpler effects suffice.
- Evaluate worker/off-main-thread inference only if supported by the installed runtime and useful in profiling; do not introduce a worker architecture merely to sound optimized.

Acceptance: provide before/after views and measured traces while recognizing gestures, triggering effects, and dragging another window. Check repeated effects and reopen cycles for retained resources. Report actual inference rate, frame-time observations, and any quality tradeoff on the tested machine. Do not promise identical FPS on different hardware. A clearly labelled demo mode is optional, never a substitute for fixing live recognition. End after Stage 8.

## Prompt 9 — Window sizing, stacking, and dependable desktop input

Implement Stage 9 only: repair the window/desktop interaction defects from the audit. Inspect WindowFrame.tsx, useWindowStore.ts, WindowManager.tsx, DesktopIcon.tsx, Laptop.tsx, MacBookScene.tsx, and existing coordinate-conversion helpers.

Focus on these related behaviors:

- Maximize and restore relative to the usable **virtual desktop**, including its menu bar and dock policy. Do not use browser viewport units for a window inside the fixed/transformed laptop screen. Remember the pre-maximize rectangle and keep drag/resize bounds usable as the viewport changes.
- Restoring a minimized window must bring it to the front and make it active in one action. Verify focus/stack ordering through repeated open/minimize/restore cycles and avoid unbounded z-index accumulation.
- Investigate the suspected VM shield with actual portal stacking and hit-testing. Verify that one click activates the intended app control. If no failure reproduces, report the finding rather than removing the shield speculatively. Avoid click-through to an underlying window or scene.
- Give desktop icons clear selected/focused states and working keyboard activation through Enter/Space, without accidental double activation or interference with Stage 4 inline rename/context menus. Preserve drag thresholds and distinguish click, double click, and drag.

Keep transformed screen coordinates and desktop-local coordinates explicit. Reuse a single conversion strategy instead of patching offsets separately per interaction. Preserve the current visual style and motion; only change animations where needed for correct geometry or reduced-motion behavior.

Acceptance: test at multiple browser sizes/zoom levels, with several overlapping windows, and with both mouse and trackpad. Check maximize → restore, minimize → restore behind another window, drag near every edge, icon activation, folder rename, and a single click after interacting with the laptop. Add focused store/geometry regression tests. Do not add snapping, new window modes, or a new window manager. End after Stage 9.

## Prompt 10 — Safari tabs and truthful private-session behavior

Implement Stage 10 only: correct the simulated Safari app's tab/history behavior. Inspect SafariApp.tsx and useSafariStore.ts and reproduce the audit's reported tab-switching bug before changing state structure.

Requirements:

- Switching tabs activates the selected tab by stable ID. It must not navigate the old active tab to the selected tab's URL. Each tab retains its URL, history stack, history cursor, and content state; preserve scroll position where the existing internal renderer permits.
- Back/forward/new-tab/close-tab/address submission update only the intended tab. Closing the active tab chooses a predictable remaining tab, and the final-tab state remains usable. Handle rapid tab changes and stale async responses safely.
- Make the privacy toggle truthful within the simulated app. A private session uses separate ephemeral tabs/history and does not leak into ordinary history or persisted normal session data. Do not imply that it provides network anonymity, browser-level private browsing, or protection from external sites. Use a brief accurate explanation if needed.
- Preserve the existing project browser and placeholders. Validate unsupported addresses and external handoffs without displaying a fake successful navigation.

Acceptance: create tabs A and B, navigate each twice, switch repeatedly, and prove independent URLs/back-forward behavior. Check closing tabs, reload/session policy, normal/private separation, and state cleanup. Add targeted store regression tests. Keep this stage confined to browser state and its UI feedback. End after Stage 10.

## Prompt 11 — Visitor routes, accurate menu actions, and Mail handoff

Implement Stage 11 only: repair a small set of misleading visitor-facing actions. Preserve intentional unfinished content.

First, inspect the existing launchers and menu routing. Make About Me open the already implemented populated AboutMeWindow rather than an empty Finder folder. Route About This Mac to the actual Settings About section. Make About This Portfolio show existing portfolio-specific information and identity rather than Finder's fallback icon/version. Fix a misrouted project launcher only when its correct existing content is available; do not invent Neural Block or finish placeholder games in this stage.

Second, make visible menus accurately reflect behavior. For the audited Refresh App action, implement a meaningful refresh for the current supported app or disable/remove the action there; focusing a window must not be labelled refresh. Ensure menu state matches the active app. Let ordinary editor Undo/Redo operate on its focused text editor rather than always invoking filesystem history. Add appropriate menu keyboard navigation, Escape dismissal, focus return, and semantics without taking over browser/OS shortcuts.

Third, fix Mail's external-email handoff. Opening `mailto:` is not confirmation that a message was sent. Preserve the draft if the visitor cancels or returns. Do not add a Sent entry or show success merely because an email client was launched. Use wording such as “Open in your email app” and explain that the visitor completes sending there. Do not introduce a backend email service in this stage.

Acceptance: click the real About Me and both About menu routes, test refresh labels/actions in supported apps, test text undo versus filesystem undo, and verify Mail drafts survive a cancelled handoff. Inspect any old falsely recorded Sent entries without deleting user content silently. Report intentional placeholders separately. End after Stage 11.

## Prompt 12 — Production smoothness and integration verification

Execute Stage 12 only: measure and verify the completed stages together. The objective is a fluid portfolio on realistic hardware, not additional features or a speculative rewrite.

Use a production build, record hardware/OS/browser versions, viewport, cache/network conditions, and test duration. Establish before/after observations for any optimization you make. Do not claim a performance improvement based only on development mode or subjective appearance.

Exercise these flows:

1. Cold and returning visits through the loader into a usable desktop.
2. Idle desktop, then window dragging/resizing/maximize/minimize with Finder, Notes, Music, and Settings open.
3. Wallpaper/theme switching and rapidly hovering/navigating Finder.
4. FaceTime recognition/effects while another window is dragged and Music plays.
5. Repeated app open/close cycles, page hide/restore, camera denial/retry, and resource cleanup.
6. Narrow viewport, narrow individual app windows, browser zoom, touch input, keyboard use, and reduced motion.

Measure relevant frame-time distributions, long tasks, interaction latency, startup critical requests, memory trends, active media tracks, and active rendering/inference loops. Use roughly 16.7 ms per frame on a tested 60 Hz display and interaction latency under 200 ms as goals, not invented achieved scores. Distinguish local interaction measurements from field INP.

Fix only reproduced bottlenecks or integration regressions in these flows. Assess adaptive DPR/shadows, renderer invalidation while idle, lazy secondary-app loading, oversized icon assets, and unnecessarily broad store subscriptions when traces justify them. Demand rendering must still invalidate for camera movement, lid/keyboard animations, loading, and all other visible scene changes. Do not disable continuous rendering blindly.

Check the audit's custom wheel handling: preserve native scroll, pinch/modified gestures, and scroll chaining unless measured evidence requires interception. Make existing reduced-motion behavior consistent across touched transitions. Adapt layouts to app-window dimensions and keep essential controls reachable on narrow screens; avoid expanding this into a separate mobile redesign.

Acceptance: return a compact measured results table, actual browser/OS coverage, screenshots of relevant layouts, focused checks/build results, and unresolved risks with exact reproduction steps. Mark Windows/camera or Safari hardware tests as outstanding if unavailable. Keep optional product ideas and intentional placeholders in a later backlog. End after Stage 12.

## Deferred audit backlog — separate future tasks

These suggestions are not authorization to expand any stage above:

- New case-study media, architecture diagrams, interactive API demos, and shareable project URLs.
- A “How this portfolio works” engineering inspection mode.
- Completing Neural Block, hidden games, empty project folders, or unfinished apps.
- Terminal autocomplete/history and additional commands.
- New Dock magnification, window snapping, and broader keyboard-shortcut systems.
- Physical model key/trackpad-node repairs that require model restructuring; first verify which nodes can actually move independently.
- Full rich-text command replacement and a site-wide data/persistence redesign.
- Metadata/social-preview/favicon work, starter README replacement, and a broad content-consistency pass.

A reproduced issue that blocks a current stage may be addressed within that stage. Otherwise, report it with evidence and leave it for its own focused prompt.
