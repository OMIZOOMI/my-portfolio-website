# Stage 5 music sources and delivery

Verified on 28 October 2026. The Music app uses four complete recordings hosted in this project's `public/music` directory. It preserves each creator's real name and track title. The colorful app artwork is the portfolio's existing abstract design, not a copy of an artist's album cover.

| Track | Creator | Listening category | Measured duration | MP3 bytes | Decimal MB |
| --- | --- | --- | ---: | ---: | ---: |
| Kids | HoliznaCC0 | Calm lo-fi | 194.617 s (3:14) | 3,893,857 | 3.89 |
| Cylinder Two | Chris Zabriskie | Ambient | 227.833 s (3:47) | 4,557,889 | 4.56 |
| Gymnopedie No. 1 | Kevin MacLeod; composition by Erik Satie | Soft piano | 187.089 s (3:07) | 3,742,869 | 3.74 |
| Floating Cities | Kevin MacLeod | Gentle electronic | 184.059 s (3:04) | 3,682,265 | 3.68 |

Total: **15,876,880 bytes (15.88 MB)**. All recordings exceed three minutes. These are full recordings, not repeated previews, slowed samples, synthesized ringtones, or padded duration labels. The 3:47 versus the creator's rounded 3:48 for Cylinder Two reflects exact decoded frame count rather than rounding up a displayed time.

The machine-readable [source and license manifest](../public/music/manifest.json) records source/download URLs, license evidence, credits, exact byte counts, SHA-256 hashes, source measurements, constant gain changes, final decoded duration, and endpoint measurements. The catalog's measured durations are an initial display value; runtime playback uses the browser's real media metadata.

## Permission and attribution

### Kids — HoliznaCC0

- [Author-managed FMA track page](https://freemusicarchive.org/music/holiznacc0/spring-at-last-lofi-tape/kids/) explicitly identifies this recording as **CC0 1.0 Universal**, instrumental, and not AI generated. Its own page supplies the direct FMA audio URL used to obtain the file.
- [FMA album page](https://freemusicarchive.org/music/holiznacc0/spring-at-last-lofi-tape) describes the album as lo-fi hip-hop and explicitly permits use under CC0.
- [Creator's Bandcamp album/profile](https://holiznacc0.bandcamp.com/album/spring-at-last) also states that HoliznaCC0's archive is dedicated through CC0. The Bandcamp track offers CC BY 4.0 as an alternative license; this implementation relies on the explicit **FMA recording's CC0 grant**, not on a paid download or an unrelated Patreon release.
- [Official CC0 terms](https://creativecommons.org/publicdomain/zero/1.0/) permit copying, redistribution, modification and performance, including commercial use. Attribution is not mandatory under that dedication; the app nevertheless credits HoliznaCC0 and links the source and terms.

Credit used: **“Kids” by HoliznaCC0, from Spring at last (LOFI TAPE). CC0 1.0. Re-encoded and gain adjusted for web playback; the complete composition is unchanged.**

### Cylinder Two — Chris Zabriskie

- [Creator's Cylinders page](https://chriszabriskie.com/cylinders/) names the composer/performer, track, album, duration, publisher, copyright notice, and Creative Commons permission.
- [Creator's use page](https://chriszabriskie.com/use/) explicitly supplies **Creative Commons Attribution 4.0** for the music and permits commercial use with credit.
- The [creator's own player](https://chriszabriskie.com/assets/player.js) resolves this track to `https://audio.chriszabriskie.com/cylinders/cylinders-02.m4a`; that authorized recording was downloaded and transcoded for self-hosted playback.

Credit used: **“Cylinder Two” by Chris Zabriskie, from Cylinders. © 2014 Chris Zabriskie. Published by You've Been a Wonderful Laugh Track (ASCAP). Licensed under Creative Commons Attribution 4.0. chriszabriskie.com. Re-encoded and gain adjusted for web playback; the complete composition is unchanged.**

### Gymnopedie No. 1 and Floating Cities — Kevin MacLeod

- Track-specific creator pages: [Gymnopedie No. 1, ISRC USUAN1100787](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100787) and [Floating Cities, ISRC USUAN1600018](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1600018).
- The current pages obtain metadata from the creator's [pieces.json catalog](https://incompetech.com/music/royalty-free/pieces.json). The page explicitly generates **CC BY 4.0 attribution** and links MP3 listen/download actions for each filename. The supplied filenames and full-length durations were checked against that primary catalog.
- [Creator FAQ](https://incompetech.com/music/royalty-free/faq.html) confirms streaming use with credit, describes discoverable credits, and permits modification/compression. These recordings remain copyrighted; the public-domain status of Satie's underlying composition does not make MacLeod's recording public domain.
- Gymnopedie No. 1's source collection is **Famous Classics**; Floating Cities' collection is **Wonders of Other Worlds**. The app does not invent album or artist attribution.

Credits used:

- **“Gymnopedie No. 1” Kevin MacLeod (incompetech.com). Composition by Erik Satie; recording/performance by Kevin MacLeod. Licensed under Creative Commons: By Attribution 4.0. Re-encoded and gain adjusted for web playback; the complete composition is unchanged.**
- **“Floating Cities” Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0. Re-encoded and gain adjusted for web playback; the complete composition is unchanged.**

[Official CC BY 4.0 terms](https://creativecommons.org/licenses/by/4.0/) allow redistribution and adaptation in any medium, including commercially, while requiring credit, a license link and disclosure of changes. Self-hosted website playback falls within those permitted uses. Credits are exposed by the app's visible Music credits control. Audio files carry no DRM or additional license restriction.

Scott Buckley's library was considered and excluded: his [current usage page](https://www.scottbuckley.com.au/library/using-this-music/) requires synchronization with other media and restricts music-platform redistribution, creating uncertainty for a standalone in-app music player. A generic “royalty-free” label was not used as permission.

## Compression and objective audio checks

All files are 44.1 kHz stereo MP3, constant 160 kbps, with a Xing seek header. Each was transcoded once from the complete authorized source. Only a **constant whole-track gain** changed: Kids −5.80 dB, Cylinder Two −2.73 dB, Gymnopedie No. 1 −1.40 dB, Floating Cities +0.82 dB. No time stretching, new looping, trims, new fades, or dynamic compression was added.

The gain choices reduce the loud lo-fi source and leave headroom for the piano and ambient peaks. The unadjusted Kids source had an intersample true peak of +0.57 dBTP; the delivered recording was attenuated. Decode analysis measured these final sample peaks:

| Track | Peak dBFS | Samples at/above digital full scale | Last-second RMS dBFS | Last 100 ms RMS dBFS |
| --- | ---: | ---: | ---: | ---: |
| Kids | −4.57 | 0 | −69.43 | −94.86 |
| Cylinder Two | −3.40 | 0 | −45.33 | −47.04 |
| Gymnopedie No. 1 | −1.93 | 0 | −75.39 | −80.54 |
| Floating Cities | −5.06 | 0 | −79.94 | −89.10 |

Every entire file decoded successfully. Durations above are decoded PCM frame count divided by 44,100 Hz. All endings were included, the final samples are close to zero, and the files preserve the creators' endings. Endpoint energy checks cannot establish whether a musical ending is tasteful or whether there are intrusive vocals or harsh changes.

## Listening limitation

**Subjective listening was not available in this tool environment.** Intro, middle and ending WAV excerpts were prepared from every delivered recording; forwarding an excerpt to the audio output returned an omitted-audio response without a listening result. Therefore no claim is made that an agent heard these passages or approved the absence of vocals, abrupt musical changes, audible distortion, or an abrupt artistic ending. Creator-provided instrumental/category metadata and the objective checks above support the selection, but do not substitute for a human audition.

The exact review windows are retained in the manifest: first 20 seconds, 20 seconds centered around the middle, and final 25 seconds of each full recording. The full recordings remain available in the Music app and in `public/music` for that audition. This is a specific unverified acceptance item, not a hidden substitution with generated loops or a source-license assumption.
