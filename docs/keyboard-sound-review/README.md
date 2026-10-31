# Creamy ASMR keyboard profile — 31 October 2026

The user selected **Creamy, rounded clicks**. The previous short Brown switch tap was replaced by recorded NovelKeys Cream press and release sounds from Thomas Lai’s [kbsim audio assets](https://github.com/tplai/kbsim/tree/ba103f3b0afa9dab80447aa2e7e2ed80b6bd80e4/src/assets/audio/cream). The original repository is pinned to commit `ba103f3b0afa9dab80447aa2e7e2ed80b6bd80e4` and distributed under its [MIT license](https://github.com/tplai/kbsim/blob/ba103f3b0afa9dab80447aa2e7e2ed80b6bd80e4/LICENSE.md). The Thock registry’s Cream-specific config independently identifies these recordings as tplai/MIT; final assets came directly from the pinned original, not a third-party recording.

## Sound and playback

Five original generic row variants alternate between key presses. Space, Enter and Backspace have their own recordings. A subdued return follows the actual key release, rather than a fixed delayed double click. The switch body is retained; no synthetic oscillator, exaggerated bass or reverb was added. The user’s creamy/rounded preference informed this selection; subjective listening acceptance is still for the user, not claimed by the agent.

Recordings were converted to mono 24 kHz PCM, lightly filtered (90 Hz high-pass and 6.5 kHz low-pass), cropped around the sound with padding and short edge fades. Each is approximately 65–78 ms. Press peak is at most 0.48, wide-key press peak 0.44. Release level preserves its source relationship with an extra 0.30 attenuation. Runtime master gain is 0.16: the loudest single press peaks at at most 0.0768 (−22.3 dBFS), with the normal return below 0.023 (−32.8 dBFS). Perceived level depends on speaker/headphone volume; these digital bounds are not a loudness comfort guarantee.

All twelve derived WAVs total **41,740 bytes**, containing **41,212 PCM bytes**. Their equivalent PCM is inline in the client module for immediate first-key response. There is no per-key network request, asynchronous media decode or background full-library audio load. Source PCM cache is bounded at twelve entries; the player caches twelve resampled buffers, keeps at most eight short voices and disposes audio when the workspace toggle is disabled. Entry does not initialize an AudioContext; a trusted keypress unlocks it.

Keydown and keyup are paired using physical codes only. Repeats, duplicate downs, stray returns, synthetic events and hidden-page input are filtered. Blur/hide clears held state, as does Command release for shortcut letters when macOS omits their keyup. The code does not cancel shortcuts, generate text or retain typed content. The existing default-on preference and workspace toggle remain unchanged. Camera and other app behavior were not changed.

## Permission

The full Thomas Lai copyright/permission notice is shipped at [LICENSE.txt](../../public/sounds/keyboard/LICENSE.txt), included in the PCM source module, and accessible through **Workspace credits → MIT license**. The per-file [manifest](../../public/sounds/keyboard/manifest.json) records original source URLs, hashes, crops, derived file sizes and hashes. MIT permits modification and redistribution with its notice retained. No ownership of the source recording is implied.

## Verification

Production build **jGX00QwcMXqPLBwfRnEbp** at http://127.0.0.1:3012. [Build/TypeScript](asmr-build.txt) and [lint](asmr-lint.txt) pass. All **259 regression checks** pass ([full output](asmr-full-tests.txt)), including **16 focused checks** ([output](asmr-tests.txt)) covering both sound phases, cache/voice bounds, lazy unlock, exact asset-to-inline PCM identity, hashes, release ordering, repeated/stray input, lost Command keyup, blur/hide and toggle cleanup. No subjective listening or new Windows/Safari hardware result is claimed in these checks.

The [eight-second ASMR audition](cream-asmr-preview.mp3) uses the actual runtime generator/master gain with forty generated presses, genuine release samples and natural gaps. It is a preview, not captured user typing. Previous [Brown tap notes](previous-soft-tap.md), [manifest](previous-soft-tap-manifest.json) and [sample](previous-soft-tap.wav) are retained only as history.
