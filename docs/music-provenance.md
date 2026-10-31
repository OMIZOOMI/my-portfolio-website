# Music sources and delivery — 31 October 2026

The current library contains nine complete instrumental recordings, three per requested mood. Listen Now contains four curated picks; Browse searches all nine. Radio and the old four selections were removed. Earlier Stage 5 records are historical, including [the former provenance](music-review/stage5-provenance.md).

| Track | Creator | Playlist | Real duration | Bytes | License |
| --- | --- | --- | ---: | ---: | --- |
| [Roof Tops](https://freemusicarchive.org/music/holiznacc0/summer-air-lo-fi/roof-tops/) | HoliznaCC0 | lofi | 3:34 (214.440998 s) | 4,290,395 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Summer Felt Longer Then](https://freemusicarchive.org/music/holiznacc0/summer-air-lo-fi/summer-felt-longer-then/) | HoliznaCC0 | lofi | 3:47 (227.952993 s) | 4,560,501 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Transformations 2](https://freemusicarchive.org/music/holiznacc0/transformations/transformations-2/) | HoliznaCC0 | lofi | 3:55 (235.104014 s) | 4,703,652 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Cipher](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100844) | Kevin MacLeod | upbeat | 3:51 (231.262041 s) | 4,626,329 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Electro Cabello](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1400048) | Kevin MacLeod | upbeat | 3:10 (190.824490 s) | 3,817,578 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Life of Riley](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1400054) | Kevin MacLeod | upbeat | 3:55 (235.363265 s) | 4,708,354 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Night in Venice](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1900056) | Kevin MacLeod | jazz | 3:38 (218.148571 s) | 4,364,060 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Study And Relax](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1900030) | Kevin MacLeod | jazz | 3:43 (223.399184 s) | 4,469,072 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Just As Soon](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100185) | Kevin MacLeod | jazz | 3:48 (228.101224 s) | 4,563,113 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Total compressed audio: **40,103,054 bytes**. Each recording is 44.1 kHz stereo, 160 kbps MP3, with embedded source artwork removed. Files are controlled, same-origin project assets. They load one at a time after playback intent; opening Music assigns no media URL.

## Permission and credits

HoliznaCC0’s three FMA source pages explicitly identify these recordings as CC0 1.0 and instrumental. Those pages supply the original download links. CC0 permits reuse, modification and redistribution; attribution is voluntary and is nevertheless shown. Source-page snapshots were verified before download.

The six Kevin MacLeod tracks were matched by title and ISRC in the [composer’s official catalog](https://incompetech.com/music/royalty-free/pieces.json). The [artist’s license page](https://incompetech.com/music/royalty-free/licenses/) and [FAQ](https://incompetech.com/music/royalty-free/faq.html) supply the CC BY 4.0 permission and credit requirements. The grant permits self-hosted distribution and adaptations with attribution, a license link and disclosure of changes. Every track has those credits under Music’s **Credits & licenses**, with the actual artist identity. The jazz catalog entries explicitly list saxophone instruments. No generic royalty-free claim or YouTube description was used as permission.

The [machine-readable manifest](../public/music/manifest.json) records each authoritative source, direct download, license, credit, duration, byte count and SHA-256 hash. License grants do not remove the applicable attribution obligations.

## Encoding and review

Complete recordings were preserved at original speed. No short samples were repeated, slowed or padded. Only constant gain adjustment and MP3 re-encoding were applied. The lo-fi playlist name follows the requested label; it does not claim newly applied time stretching or reverb. Original gradient artwork avoids reproducing third-party cover art.

All final files decoded fully. Decoded frame counts match browser metadata, every track exceeds 180 seconds, none has PCM samples at or above full scale, and endpoint energy is low. [Final media audit](app-refresh-review/final-audio-audit.json). Source descriptions support instrumental classification. **Subjective listening was unavailable**, so intrusive vocals, artistic transitions and personal taste have not been approved by ear. Objective ending checks do not replace listening.

## Playback lifecycle

One native audio element is mounted for Music. Browsing/searching does not start playback or replace the current queue. Selecting a track establishes the queue for Listen Now, Browse or the selected mood. Next, Previous, shuffle and natural endings stay within that queue; repeat restarts the complete track. Browse search starts the full Browse queue. Buffering/errors and rejected play promises stay actionable. Minimize permits continuing playback. Close pauses and releases the source/controller; reopening retains position in session memory, requests nothing and requires Play. No full-library decode or library preload occurs.
