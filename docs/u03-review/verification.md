# U03 verification

Completed 1 November 2026. Final production build: `b6j3ouL69QYIDNIc1-6sn` (Next.js 16.3.1). The usual loopback preview at `http://127.0.0.1:3012` and the already-existing home-network preview on port 3013 serve this build. The temporary port 3014 test server was stopped. No commit, push, or deployment was performed.

## Baseline and result

The previous Veyra file and Browser page presented generic architecture, stack and highlights. They did not explain Om's contribution or demonstrate a finding's evidence chain. U03 attaches one typed case study to the existing catalogue entry and renders it through the existing Files and Browser project paths. Other case-study pages and intentional placeholders are unchanged.

The new content covers the problem, Om's supplied solo contribution, the evidence/reference design, an implementation-derived visual, current scope, synthetic-demo limits and repository access. Links to reviewed implementation are pinned to commit `9bafdb5df0d97668abd66e09fa342610da323ace`. The full [source-to-claim map](source-map.md) distinguishes implementation evidence from Om's authorship confirmation.

## Checks

| Check | Actual result |
| --- | --- |
| Portfolio regression suite | **285 passed, 0 failed** across seven suites. Includes catalogue identities/aliases, retained file rendering, canonical consumer agreement, existing Browser state, folders, windows, and the two new Veyra case-study checks. |
| Focused catalogue/renderer suite | **11 passed**. Covers Veyra's canonical and legacy references, labelled controlled example, source links, unavailable features, and unchanged other project pages/placeholders. The test loader now supports CSS Modules for the shared renderer. |
| Lint | `npm run lint` passed. |
| Type check | `npx tsc --noEmit` passed. The final production build also passed TypeScript checking. |
| Production compilation | `npm run build` passed, including the existing MediaPipe package/runtime checksum precheck. This does not test a camera. |
| Whitespace | `git diff --check` passed. |
| Veyra's external repository test suite | **Not run**. Relevant test source was inspected; it is not presented as a successful execution or performance result. |

## Actual browser coverage

Machine: MacBook Air with Apple M1 and 8 GB memory; macOS 27.2 (26B123). Browser: installed Chrome **156.0.8078.76**, controlled through its connected browser interface. Production build, default 1440 × 900 CSS-pixel viewport; separate narrow check at **390 × 844**. This was a functional/content review, not a performance benchmark or field accessibility certification.

Exercised:

- Open Veyra from the existing Quick overview action; its `file-veyra` identity and title remain correct.
- Read the file in laptop and Screen views, maximize/restore, close/reopen, and return to the laptop without replacing the mounted desktop. The figure becomes a horizontal flow in a sufficiently wide app and a vertical flow in smaller app containers.
- Open the same case study in the simulated Browser with the existing action. Verify `portfolio://project/veyra`, Back to favorites, toolbar Back, and retained source-disclosure state. The shared renderer does not introduce new tab/history state.
- Activate View repository: the existing external handoff displays its truthful request notice and opens the real GitHub repository. The test-created repository tab was closed afterward. Source destinations were verified through the GitHub connector against actual files at the pinned commit.
- Use keyboard Page Down to read the file and Tab to reach source links. The figure has a named ordered evidence flow and decorative arrows are hidden from assistive technology; no screen-reader certification is claimed.
- Check dark and light surfaces and the existing **145%** interface setting. At 145%, the case container measured 991 CSS pixels wide with the same scroll width; text reflowed without horizontal overflow. Theme and size were changed only in the separate port-3014 test origin.
- At 390-pixel Screen width, the maximized case container measured **388 pixels**, with **388-pixel scroll width**. Header actions wrap, prose remains one column and the evidence flow stacks vertically.
- The narrow interaction check reproduced overlap between the final source disclosure and the pre-existing floating view controls. U03 adds bottom reading space within the case study for app containers up to 740 pixels. Repeating the pointer action opened the disclosure while **Screen view remained active**. Keyboard focus reached the final Dependency lockfile link at approximately y=615–630, above the floating controls.

Native Safari was attempted but the computer-use tool reported that the Mac was locked. **No U03 native Safari visual or input pass is claimed.** Windows was not tested. To finish Safari coverage: unlock the Mac, open `http://127.0.0.1:3012`, open Veyra through Quick overview, check laptop → Screen → laptop, scroll the evidence figure, expand Implementation sources, and repeat at narrow width and with larger text.

The existing Dock still exceeds a 390-pixel viewport horizontally. That broader desktop layout is outside U03; this case study's body and source controls were checked independently. No new mobile redesign was added.

## Views

Matched comparisons use a 1440 × 900 viewport and the default 640 × 476 project frame, with the same dark appearance:

| View | Before | After |
| --- | --- | --- |
| Laptop | [Before](before-laptop.jpg) | [After](after-laptop.jpg) |
| Screen view | [Before](before-screen.jpg) | [After](after-screen.jpg) |

Additional views: [expanded case study](after-screen-expanded.jpg), [complete evidence example](evidence-diagram.jpg), [Browser renderer](after-browser.jpg), [390-pixel narrow view](after-narrow.jpg), [reachable narrow source links](after-narrow-sources.jpg), [light appearance at 145%](after-light-scaled.jpg).

All images show the local portfolio implementation. The evidence diagram is labelled as a controlled test illustration, not a Veyra product screenshot or a newly executed remote investigation.
