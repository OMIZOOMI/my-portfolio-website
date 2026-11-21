import { PORTFOLIO_PROFILE as profile } from "./portfolioProfile";

export const SITE_IDENTITY = {
  name: "Om’s Portfolio",
  title: `${profile.name} — Interactive Portfolio`,
  description: "Explore Om Sawkare’s work in computer vision, AI workflows, and backend development through an interactive portfolio.",
  repository: "https://github.com/OMIZOOMI/my-portfolio-website",
  shareImage: "/identity/share.png",
  shareAlt: "Om Sawkare — computer vision, AI workflows, and backend development. An interactive portfolio.",
} as const;

/** Only an explicitly configured public HTTPS origin can become a canonical/share URL. */
export function resolvePublicOrigin(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || !host.includes(".") || host.endsWith(".local") || host.endsWith(".localhost")
      || host === "localhost" || host.includes(":") || /^\d+(\.\d+){3}$/.test(host)) return undefined;
    return url.origin;
  } catch { return undefined; }
}
