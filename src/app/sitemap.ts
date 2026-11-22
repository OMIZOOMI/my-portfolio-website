import type { MetadataRoute } from "next";
import { PUBLIC_PROJECTS } from "@/data/publicProjects";
import { getPortfolioPublicOrigin } from "@/data/siteIdentity";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getPortfolioPublicOrigin();
  return [{ url: origin + "/" }, ...PUBLIC_PROJECTS.map(project => ({
    url: new URL(`/projects/${project.publicSlug}`, origin).href,
  }))];
}
