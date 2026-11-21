"use client";

import { useMemo } from "react";

/**
 * Generates a compact radial refraction displacement map (R = X displacement,
 * G = Y displacement, neutral = 128) inspired by Glisse's SVG lens refraction.
 * Computed once in memory so it adds zero network requests and no continuous
 * per-frame CPU/GPU overhead.
 */
function createRefractionMapDataUri(size = 96): string {
  const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  const defs = `<defs>
    <linearGradient id="rx" x1="0%" y1="50%" x2="100%" y2="50%">
      <stop offset="0%" stop-color="rgb(216,128,128)"/>
      <stop offset="18%" stop-color="rgb(144,128,128)"/>
      <stop offset="50%" stop-color="rgb(128,128,128)"/>
      <stop offset="82%" stop-color="rgb(112,128,128)"/>
      <stop offset="100%" stop-color="rgb(40,128,128)"/>
    </linearGradient>
    <linearGradient id="ry" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="rgb(128,216,128)"/>
      <stop offset="18%" stop-color="rgb(128,144,128)"/>
      <stop offset="50%" stop-color="rgb(128,128,128)"/>
      <stop offset="82%" stop-color="rgb(128,112,128)"/>
      <stop offset="100%" stop-color="rgb(128,40,128)"/>
    </linearGradient>
    <radialGradient id="edge" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgb(128,128,128)" stop-opacity="1"/>
      <stop offset="72%" stop-color="rgb(128,128,128)" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="rgb(128,128,128)" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
  const body = `<rect width="100%" height="100%" fill="url(#rx)"/>
    <rect width="100%" height="100%" fill="url(#ry)" style="mix-blend-mode:screen"/>
    <rect width="100%" height="100%" fill="url(#edge)"/>`;
  const svg = `${header}${defs}${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function LiquidGlassDefs() {
  const mapUri = useMemo(() => createRefractionMapDataUri(96), []);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-liquid-glass-defs
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <defs>
        <filter
          id="portfolio-liquid-lens"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={mapUri}
            result="refractionMap"
            preserveAspectRatio="none"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="refractionMap"
            scale="6"
            xChannelSelector="R"
            yChannelSelector="G"
            result="refracted"
          />
          <feSpecularLighting
            in="refractionMap"
            surfaceScale="2"
            specularConstant="0.45"
            specularExponent="28"
            lightingColor="#ffffff"
            result="rimLight"
          >
            <fePointLight x="-80" y="-120" z="160" />
          </feSpecularLighting>
          <feComposite
            in="rimLight"
            in2="SourceAlpha"
            operator="in"
            result="clippedRim"
          />
          <feMerge>
            <feMergeNode in="refracted" />
            <feMergeNode in="clippedRim" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
