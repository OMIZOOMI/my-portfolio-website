# Om portfolio identity artwork

The outlined Om monogram and the composition of the share card were created specifically for Om Sawkare's portfolio during U07. They use original circle/path geometry and a restrained typographic layout, with no stock imagery, Apple mark, product screenshot, or third-party logo in the new artwork.

- Vector master: `src/app/icon.svg`; matching UI drawing: `src/components/portfolio/OmMark.tsx`.
- Generated assets: `src/app/favicon.ico` (16/32/48 px), `src/app/apple-icon.png` (180 px), and `public/identity/share.png` (1200 × 630 px).
- Reproduce locally: `node scripts/generate-portfolio-identity.mjs`, using the installed Next.js ImageResponse renderer and Sharp. No image service or external asset host is used.
- Share-card typeface: the unmodified Geist Regular font bundled with installed Next.js 16.3.1. Upstream source: [vercel/geist-font](https://github.com/vercel/geist-font). License: [SIL Open Font License 1.1](https://github.com/vercel/geist-font/blob/main/OFL.txt), copied alongside this file as `Geist-OFL.txt`. The generated card is a raster image; no additional font file is redistributed here.
- Original composition/monogram: created for this project; no external attribution is required for those original elements.

The existing Dock/app icons, 3D model, music, keyboard recordings and workspace imagery were retained. Their existing licenses and attribution still apply. UI renaming is an identity change, not a legal-clearance claim.

The `apple-icon.png` filename and `apple-touch-icon` relation are web-platform conventions for home-screen icons; their image is the original Om monogram.

This site is currently local-only, as confirmed by Om. `PORTFOLIO_PUBLIC_ORIGIN` is deliberately empty. Set it to the real public HTTPS origin and rebuild when published; canonical and absolute social image URLs will then use that origin. Until then, title/description/site identity/icon metadata are present and the local share artwork is available, without fabricated public URLs.
