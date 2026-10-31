# Stage 9 portal and shield investigation

No VM shield failure reproduced in the current implementation. No shield was removed.

Source inspection found that `Laptop.tsx` writes `isVMLocked` in a pointer-down capture handler, but no current component reads the flag or renders a VM activation shield. That handler does not cancel or stop the event. The actual Drei HTML portal appears above the WebGL canvas. Its outer positioning wrappers have `pointer-events: none`, and the inner transformed screen has `pointer-events: auto`; descendants remain clickable.

The production preview at `http://127.0.0.1:3001` passed four checks in isolated Chrome 156.0.8078.48 on macOS 26.6.1 at a 1440 × 1000 browser size:

1. Click the laptop body/canvas, then click Notes in the dock once: Notes opens.
2. Click the Notes “Create a new note” control once: exactly one note is added.
3. Open Settings over Notes and click Maximize once: one click reaches Settings; the underlying Notes rectangle and maximize state stay unchanged.
4. Return to the laptop body/canvas, then click Notes Minimize once: Notes minimizes.

The test records the actual `elementFromPoint`/`elementsFromPoint` results, ancestor transforms and pointer-event settings, and trusted input event targets in [portal-hit-testing.json](./portal-hit-testing.json). The input came from Chrome DevTools Protocol. It is synthetic mouse input, not a physical mouse or trackpad hardware run.

The geometry probes did expose a separate coordinate issue. The 1400 × 900 desktop projects to a trapezoid, not an axis-aligned rectangle. Mapping the screen bounding box back with one horizontal and vertical scale introduces up to **25.23 virtual pixels** of error at a lower corner and **8.25 pixels** at the center in this view. Stage 9's shared perspective conversion should address this independently of shield behavior.

Reproduce with an isolated Chrome debugging endpoint:

```sh
CDP_URL=http://127.0.0.1:9226 STARTUP_TEST_URL=http://127.0.0.1:3001 node tests/stage9-shield.browser.mjs
```

The harness creates and disposes its own browser context; it does not stop the preview or close unrelated browser tabs.
