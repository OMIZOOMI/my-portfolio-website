# U01 verification

31 October 2026. Production build: `kNIwoBtaoMd9XULqhGBmq`.

## Environment and scope

- macOS 27.2 (26B123), arm64; native Google Chrome 156.0.8078.76.
- Browser screenshots are 1440 × 778, with matched before/after viewport and app-window sizes for Projects and the Task API. Existing default appearance and laptop projection were used; Screen view was also checked.
- Baseline: existing production site at `http://127.0.0.1:3012`. Updated build tested at temporary loopback port 3014; existing local port 3012 and home-network port 3013 were then restarted with the tested build. Temporary port 3014 was stopped.
- No camera permission, microphone access, Music playback, document upload, mail handoff, commit, push, or deployment was performed for this stage.

## Checks

| Check | Result |
| --- | --- |
| Focused catalogue/readability/Browser/folder/action tests | 62 passed |
| Complete native Node regression suite | 274 passed, 0 failed; includes 9 new catalogue tests |
| Lint | Passed with no warnings in the final run |
| TypeScript | Passed; production build type checking also passed |
| Production compilation | Passed; compiler reported 6.4 seconds. This is a build observation, not a website performance improvement |
| MediaPipe asset integrity prebuild check | Passed, installed package/runtime/lockfile plus seven asset sizes/checksums verified |
| Whitespace/diff check | Passed |
| Existing file and placeholder compatibility | Legacy IDs, opaque folder identity, move/trash/restore/undo and Neural Block preserved in regression checks |

The initial sandboxed build stalled and a sandboxed server start was denied local process access. That identified build was stopped and rerun with the necessary process access; the final production build and test server succeeded. No application workaround for the environment restriction was introduced.

## Browser observations

- Projects changed from three outdated entries to seven catalogue entries, ordered Veyra, Adobe, White Box, TigerGraph, Task API, SkyWatch, and Portfolio. The existing icon grid remains.
- The Task API's original file ID opens a correctly titled detail window. Its architecture and stack show SQLite, SQLAlchemy, FastAPI and Pydantic rather than implemented PostgreSQL/Docker/AWS claims.
- The scope disclosure opens and exposes implementation limitations, separately labelled PostgreSQL future work, and actual source links.
- “Open in Safari” retains `portfolio://project/cloud-native-asset-management-api` and renders the same corrected data. Entering `portfolio://project/white-box` resolves White Box Detection, with matching stack and scope.
- Browser favorites show seven projects in the same order, with only Veyra and Adobe marked featured.
- About's Projects section shows the same seven titles, statuses and complete catalogue stack arrays. Its unrelated biography/skills presentation remains unchanged for U02.
- Terminal `projects` outputs matching names, statuses, stacks and seven actual repository links. Escape still completes streaming output.
- Entering and leaving Screen view preserves the Projects window/content. No projection or geometry implementation was changed.

## Views

| Surface | Before | After |
| --- | --- | --- |
| Projects in laptop view | [Before](before-projects.jpg) | [After](after-projects.jpg) |
| Projects in Screen view | [Before](before-projects-screen.jpg) | [After](after-projects-screen.jpg) |
| Task API detail | [Before](before-task-api.jpg) | [After](after-task-api.jpg) |
| Browser Task API | — | [After](after-browser-task-api.jpg) |
| Browser favorites | — | [After](after-browser-favorites.jpg) |
| About project catalogue | — | [After](after-about-projects.jpg) |
| Terminal projects | — | [After](after-terminal-projects.jpg) |

## Limits and remaining work

- Repository reading establishes code structure and supported claims; external projects were not executed or benchmarked during U01.
- Actual Windows and native Safari hardware runs were not performed for this content/catalogue stage. Node fixtures and Chrome checks are not evidence of that coverage.
- Existing case-study layouts are retained. Dedicated Veyra/Adobe case studies, general About readability, branding, certificates, résumé, routing and onboarding belong to their later prompts.
- The local public repository can lag this checkout. Source notes explicitly distinguish local portfolio capabilities from what its public revision establishes.

U01 ends here; no later prompt has been implemented.
