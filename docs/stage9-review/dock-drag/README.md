# Dragging behind the dock

Normal windows use the laptop screen bounds, including the area behind the dock. At the default 1400 × 900 screen size, the bottom edge is 900, not the dock's top at 810. The menu bar remains protected so title-bar controls stay reachable. Maximize continues to reserve the dock's footprint.

Restore preserves a normal window placed behind the dock, and changing dock size no longer pushes that window upward. The visible dock stays above windows; its empty full-width positioning strip lets clicks reach windows beside it. File drops also respect the actual visible dock panel.

Verification: production build/TypeScript, lint, all 166 unit tests, and all six browser scenarios pass on build `uB7d5hHz8DDT0L157dSuG`. Store regressions cover dragging to the real bottom, maximize/restore at that position and dock-size changes. Browser checks cover the actual bottom boundary, dock/window hit testing, and restore, alongside the other Stage 9 interactions. [Browser results](browser-results.json) · [Window behind the dock](drag-bounded-bottom-edge.png) · [Unit output](unit-tests.txt).

```sh
STAGE9_OUTPUT_DIR=../docs/stage9-review/dock-drag/ CDP_URL=http://127.0.0.1:9226 node tests/stage9-interactions.browser.mjs
```

The browser input is automated mouse/key input on macOS Chrome. No physical trackpad run is claimed.
