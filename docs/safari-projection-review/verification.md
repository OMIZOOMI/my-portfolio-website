# Safari projection correction

The reported failure was reproduced in native Safari 27.2 on an arm64 Mac running macOS 27.2 (26B123). The interactive desktop visibly covered the lower display and keyboard while the model's original screen texture remained visible above it. Native window captures were 2880 × 1800.

## Cause and change

Changing the header offset alone and adding an ancestor transform did not fix the failure; those experiments were removed. Safari's existing page zoom was 85% (measured devicePixelRatio 1.7000000476837158). Resetting browser zoom to 100% aligned the screen, reproducing the size-sensitive behavior documented in [drei #720](https://github.com/pmndrs/drei/issues/720) and [Three.js #26950](https://github.com/mrdoob/three.js/issues/26950).

The installed Drei version is 10.7.8 and Fiber is 9.7.0. Their local source was inspected; this version does not expose the newer force-even renderer option mentioned upstream. `ProjectionViewport` now constrains the existing Canvas and Html portal to shared even dimensions in CSS and device pixels. Common zoom ratios use the smallest compatible even step (20 CSS pixels at 85% Retina zoom). Fiber's installed `resize.offsetSize` option prevents fractional bounding rectangles from reintroducing fractional scene dimensions. The viewport observer and resize listener are cleaned up. The Canvas/Html identity is retained across subsequent resizes and view changes.

There are no user-agent offsets, dependency upgrades, alternate desktop roots, or changes to entrance, media, scrolling, window geometry, or application data. The original header reservation and page layout remain in place.

## Verification

| Check | Observation |
| --- | --- |
| Native Safari, original 85% zoom | Desktop aligned inside model after the correction; zoom selected through Safari's visible page menu. |
| Native Safari, explicit refresh | Loader completed and desktop aligned on port 3012 at 85%. Background execution paused startup; completion was verified after the page resumed. Cache was not explicitly cleared. |
| Native Safari, Screen view / return | Screen view filled the page; Notes opened normally and remained open with unchanged content after returning to the aligned laptop. Verified at the usual port 3012 after unlocking. |
| Native Safari, 75% and 100% | Alignment observed; changing zoom isolated the pixel-size trigger. |
| Chrome production, 1281 × 901 | Canvas 1280 × 722 beneath the 178px header reservation. |
| Chrome production, 391 × 845 Screen view | Settled desktop at (0,0), approximately 390.99 × 845; Canvas 390 × 844. |
| View/resize continuity | Test-only DOM observer reported desktopMounts=1, desktops=1, errors=[] after repeated view changes and resizing. An edited temporary note retained its text. |
| Regression suite | 283/283 passed, including two new pixel-ratio/viewport regression cases. |
| Lint / TypeScript / production build | Passed. Build ID: 7WnfmKrpXmEgW-7b57F8R. |

Continuity instrumentation ran through the existing loopback-only fixture proxy; it is not part of production and was stopped after testing. Screenshot `before-safari.jpg` records the native failure. `after-safari-laptop.jpg`, `after-safari-screen.jpg`, `after-safari-returned-notes.jpg`, and `after-safari-refresh.jpg` capture the corrected native Safari views. The Chrome images record the desktop and narrow-layout checks. The temporary test origin on port 3014 had a Paper workspace selection from UI inspection; that server is now stopped. The normal portfolio on port 3012 still uses Beach. No production preference default was changed. Safari page zoom was restored to its original 85% through the native menu.

## Limits

No Windows or iOS hardware tests were performed. This is a projection correction, not a measured performance claim. Pixel-ratio normalization covers common rational browser/display ratios (denominators up to 20); unusual ratios fall back to even CSS dimensions and need separate hardware verification. Safari's initial load, explicit refresh, and native Screen-view round trip passed at port 3012. Native Safari continuity was checked by observing the open Notes window and its content; the single-mount observer checks were performed in Chrome.
