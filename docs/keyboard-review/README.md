# Model keyboard response

Production preview: http://127.0.0.1:3012. Build: `tA6U2ZNmenSlNL77I-aOc`.

## What changed

The previous controller expected separately named `Key_A`/`Key_Enter` meshes that do not exist in the supplied model. It also mutated the cached GLTF nodes rather than the meshes actually rendered by `Macbook.tsx`. It consequently animated no keys.

The actual model contains 78 keycaps combined into `Object_73`, their legends in `Object_75`, and the Touch ID details in `Object_67`/`Object_71`. Measured XY bounds now assign every vertex to its physical key, including the separate F/J tactile bumps. Standard browser `KeyboardEvent.code` positions map to those indices, including punctuation, arrows, left/right modifiers, function keys and Enter/Space/Backspace. Fn and Power are represented in the model, but browsers/operating systems often do not deliver those hardware events to a webpage. They cannot be promised as controllable OS keys.

The four original keyboard draw calls are retained. A static vertex attribute and shared 78-float uniform translate each keycap and its lettering together by up to 0.075 original model units (0.75mm). The existing model rotation turns that movement down into the keyboard. UVs, textures, lighting and surrounding geometry remain intact. No per-key rendered objects, extra renderer, React state update per press, geometry upload per frame or sound effect was added.

Keys respond to real keyboard events while the page has focus; this is physical typing feedback, not a clickable virtual keyboard that sends commands to other apps or the operating system. Held keys/chords remain down. Brief taps are latched for 80ms so a keydown/keyup between display frames still produces visible feedback. Normal motion presses quickly and returns slightly more gently; reduced motion changes the pressed state immediately. Capture listeners observe events without canceling typing, editor commands or browser shortcuts. Blur/page hiding clears held state, and Command release handles macOS's potentially omitted letter keyup. Unmount removes listeners and disposes cloned GPU resources. The controller also requests invalidation through a press/release so it remains compatible with future demand rendering; it does not create another animation loop.

The vertex/material mechanism uses the installed Three.js WebGL renderer's supported [custom vertex attributes](https://threejs.org/docs/pages/BufferAttribute.html) and [material compilation hook/cache key](https://threejs.org/docs/pages/Material.html). A WebGPU/TSL migration is not needed for this change.

## Verification

Agent-executed browser checks: macOS 27.2 on Apple M1 MacBook Air, 8GB; Chrome 156.0.8078.76; viewport 1440×900, DPR 2; production build. These are browser keyboard inputs on the actual rendered scene, not a Windows hardware test.

| Check | Result |
| --- | --- |
| Original model, held A versus rest | Keyboard image unchanged: mean difference 0 |
| Updated model, held A versus rest | Movement localized to A: 236 pixels changed by >20 levels; Space unchanged |
| Release | Entire keyboard matched its resting image exactly: mean difference 0 |
| Reduced motion, held Space | Space moved; A and S unchanged; released image returned to rest |
| Shift+A, b, Space, 1, Backspace, Left | Terminal retained `Ab ` with caret at 2 |
| Enter | Terminal `help` command executed normally |
| Notes contenteditable | Typed `Keyboard test`, Enter, `123`; text remained on two lines |
| Graphics console | No warnings/errors during rendering/typing/reduced-motion checks |
| Targeted tests | 7 passed: every real vertex/triangle mapped, shader axis, UV/source preservation, bounded/frame-independent travel, fast taps/chords, focus cleanup and end-to-end input-to-uniform behavior |
| Combined tests | 229 passed |
| Lint, TypeScript, production build | Passed |

The pixel checks establish that the correct key moves and releases. They are not an FPS benchmark. See [visual-comparison.json](./visual-comparison.json), [regression-tests.txt](./regression-tests.txt) and [build.txt](./build.txt).

Views: [before rest](./before-rest.jpg), [before held A](./before-held-a.jpg), [after rest](./after-rest.jpg), [after held A](./after-held-a.jpg), [after release](./after-release.jpg), [reduced-motion held Space](./reduced-motion-held-space.jpg), [reduced-motion released](./reduced-motion-released.jpg).

Safari feedback was requested from the user. Agent-controlled native Safari gesture/key automation remains unavailable in this environment; Chrome is not being presented as Safari/Windows hardware coverage. A remaining physical check is to refresh Safari, type in Notes/Terminal, hold and release a modifier plus letter, and switch away while holding a key.

Git diff checks remain unavailable because this checkout has a pre-existing pointer to a missing worktree. Repository metadata was not changed.
