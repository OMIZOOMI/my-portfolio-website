# Portfolio wallpaper collection

Created 28 October 2026. Six original compositions, each with a light master and a dark counterpart created by editing that exact master. The collection contains twelve desktop WebP images and twelve dedicated WebP thumbnails.

## Review artifacts

- [Contact sheet — light and dark for all six options](../public/wallpapers/contact-sheet.webp)
- [50% overlays — composition alignment review](../public/wallpapers/alignment-overlays.webp)
- [Public asset manifest](../public/wallpapers/manifest.json)
- [Exact generation and edit prompts](./wallpapers-prompts.json)

## Provenance and permission

All six light compositions were generated for this portfolio with the built-in OpenAI image generation tool from original text prompts. Each dark image was produced through a lighting-weather edit with its corresponding light master supplied as the reference image. No independent text-to-image generation was used for the dark counterparts, and no third-party stock images or reference photographs were used.

No external stock-license attribution is required by these asset sources. Use remains subject to the [OpenAI terms applicable to the generating account](https://openai.com/policies/terms-of-use/) (reviewed 28 October 2026). Those terms address rights in generated output to the extent permitted by applicable law; output may be similar to other output. This documentation does not assert CC0 status, exclusive copyright, or uniqueness. Prompts and method are retained as AI provenance.

## Dimensions and optimization

All desktop images use a consistent 1600×1000 (16:10) crop; each preview is a separate 320×200 export. The tool returned native sources around 1586×992 (1585×992 for two dark edits), despite the requested 2560×1600. The final assets use only slight centered dimension normalization. They are not represented as native 2560px images. Only resize/crop, WebP compression and review compositing were performed with image-processing code; semantic relighting was performed by the image-editing tool.

The requested 250–700 KB desktop range was an aim, not a padding target. The actual files are 44–334 KB. Smooth dunes/abstract hills, large sky/water areas and dark low-contrast detail compress below 250 KB at good quality, so those files are intentionally kept compact. Every dedicated thumbnail is below 30 KB. Sizes below use decimal KB (1 KB = 1,000 bytes).

| Option | Variant | Desktop bytes | Desktop KB | Thumbnail bytes | Native source |
|---|---|---:|---:|---:|---|
| Coast | light | 247,580 | 247.6 | 11,090 | 1586×992 |
| Coast | dark | 159,880 | 159.9 | 7,804 | 1586×992 |
| Mountain Lake | light | 176,324 | 176.3 | 10,350 | 1586×992 |
| Mountain Lake | dark | 135,814 | 135.8 | 8,192 | 1586×992 |
| Forest | light | 333,656 | 333.7 | 15,464 | 1586×992 |
| Forest | dark | 204,994 | 205.0 | 9,914 | 1585×992 |
| Dunes | light | 59,740 | 59.7 | 3,414 | 1586×992 |
| Dunes | dark | 54,642 | 54.6 | 2,708 | 1586×992 |
| Alpine | light | 281,216 | 281.2 | 12,590 | 1586×992 |
| Alpine | dark | 192,938 | 192.9 | 9,496 | 1585×992 |
| Drift | light | 44,884 | 44.9 | 3,050 | 1586×992 |
| Drift | dark | 44,400 | 44.4 | 3,004 | 1586×992 |

Desktop collection total: 1,936,068 bytes. Thumbnail collection total: 97,076 bytes. Contact sheets are review artifacts and are not required for Settings or startup.

## Composition review

Each pair was inspected side by side and through a 50% opacity overlay at the same crop. Camera angle, horizon, primary silhouettes, subject positions and foreground geometry align at the visual review scale. The edits change light, exposure and color; generated texture/sky rendering may vary slightly, and visual matching is not a mathematical pixel-identity guarantee.

- **Coast:** Matched camera/crop/horizon and subject positions; no visible doubled mountain/cliff/tree/rock/shoreline edges in overlay. Lighting and color changed. No added moon/stars or objects.
- **Mountain Lake:** Matched camera/crop/horizon and subject positions; no visible doubled mountain/cliff/tree/rock/shoreline edges in overlay. Lighting and color changed. No added moon/stars or objects.
- **Forest:** Matching camera, crop, foreground trunks/branches/boulders, distant mountain ridge, clearing and tree silhouettes. Overlay shows no conspicuous doubled hard edges. Texture and light/sky treatment vary slightly as expected from an AI relight; not a mathematical pixel-identity guarantee.
- **Dunes:** Matching foreground sweep, central peak, ridge crest positions, distant mountain-like dune horizon and sand ripple direction. Overlay shows no conspicuous doubled ridge edges. Exposure and hue shift from warm daylight to cool blue hour; no added celestial objects.
- **Alpine:** Reviewed light and referenced-edit dark side by side and as a 50% opacity overlay. Same camera, crop, distant peak/horizon silhouettes, meadow contours, foreground rocks and tree clusters remain aligned. No visible doubled terrain edges in the overlay at inspection scale. Lighting/sky colors change; not claiming mathematically identical pixels.
- **Drift:** Reviewed light and referenced-edit dark side by side and as a 50% opacity overlay. Same camera, horizon, rolling foreground slopes and background hill crests remain aligned. No visible doubled silhouettes in overlay at inspection scale. Only light/color/exposure change; not claiming mathematically identical pixels.

## Asset paths

Desktop URLs follow `/wallpapers/{id}-{light|dark}.webp`; previews follow `/wallpapers/thumbs/{id}-{light|dark}.webp`. The six stable IDs are `coast`, `lake`, `forest`, `dunes`, `alpine` and `drift`. The manifest records project-relative files, public URLs, dimensions, actual byte counts and native source dimensions without machine-local file paths.

## Runtime behavior

The catalog and shared light/dark/auto resolver live in `src/data/wallpapers.ts`. Settings eagerly loads its six dedicated 320px thumbnail URLs when the picker mounts; they are not requested during startup. Native image loading avoids lazy-loading visibility decisions inside the transformed desktop and does not hide a downloaded preview behind an additional `decode()` promise. Cached previews are recognized on mount. Failed or stalled requests (eight-second deadline) have an independent retry control and preserve the card's dimensions. Opening Settings does not download the other full-size wallpapers.

Full background requests are shared with startup and decoded before presentation. The current background remains while the requested image loads; an out-of-date response cannot replace a newer selection. An image failure retains the current background and offers Retry.

Appearance is stored under `portfolio-appearance` as a versioned JSON envelope containing only `theme`, `wallpaper` and `wallpaperMode`. No filesystem, drag, window or visitor note state is included. Preferences are restored before the Canvas and initial wallpaper request start, behind the boot overlay. Legacy names map as follows: Big Sur → Coast, Monterey → Mountain Lake, Ventura → Alpine, Sonoma → Forest, Sequoia → Dunes. Unknown/corrupt values safely use the default Coast/light wallpaper. Wallpaper mode is independent of the interface theme; Auto follows that theme.

The boot screen uses the platform system UI font (`-apple-system` on macOS), “Loading Om’s portfolio”, and a five-step preparation bar. Its fill counts actual renderer/model/environment/wallpaper/frame readiness milestones; it is not a download percentage or an elapsed-time animation. Reduced motion and Stage 1's loader removal, failure recovery and flat desktop remain supported.

## Repeating the checks

`node --experimental-strip-types --test tests/wallpapers.test.mjs src/components/webcam/sceneReadiness.test.ts` checks all assets, mode resolution, migration, the persistence boundary, decode/caching/retry behavior and real preparation progress.

The dependency-free browser suites require Node 24, a production server and a separate Chrome profile with remote debugging enabled. Set `STARTUP_TEST_URL` to the local production URL and `CDP_URL` to that test browser's debugging endpoint, then run `node tests/wallpapers.browser.mjs` and `node tests/startup.browser.mjs`. The tests create/dispose their own isolated contexts. Screenshots are saved under `.next/wallpaper-verification/` and `.next/startup-verification/`. Browser results establish functional coverage on that tested engine; they are not cross-platform performance measurements.

Preview checks assert ready status, computed opacity, dimensions and correct source, rather than download completion alone. Coverage includes cold loading without scrolling, a deliberately unresolved thumbnail `decode()` promise, cached Settings reopening, blocked requests and stalled-request retry. The unresolved-decode case reproduced invisible previews before the native-image fix; it simulates that failure path without claiming a Safari-specific diagnosis.
