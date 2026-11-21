import type { Metadata } from "next";
import { PORTFOLIO_PROFILE as profile } from "./portfolioProfile";
import { resolvePublicOrigin, SITE_IDENTITY as site } from "./siteIdentity";

export function portfolioMetadata(configuredOrigin?: string): Metadata {
  const origin = resolvePublicOrigin(configuredOrigin);
  const images = origin ? [{ url: new URL(site.shareImage, origin).href, width: 1200, height: 630, alt: site.shareAlt }] : undefined;
  return {
    title: site.title, description: site.description, applicationName: site.name,
    authors: [{ name: profile.name, url: profile.github }], creator: profile.name,
    ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: origin } } : {}),
    openGraph: { title: site.title, description: site.description, siteName: site.name, type: "website", ...(origin ? { url: origin, images } : {}) },
    twitter: { card: origin ? "summary_large_image" : "summary", title: site.title, description: site.description, ...(images ? { images } : {}) },
  };
}
