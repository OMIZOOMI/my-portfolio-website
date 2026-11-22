import type { Metadata } from "next";
import type { ProjectData } from "./projectsData";
import { projectPublicPath } from "./publicProjects";
import { portfolioMetadata } from "./siteMetadata";
import { resolvePublicOrigin } from "./siteIdentity";
import { PORTFOLIO_PROFILE as profile } from "./portfolioProfile";

export function projectMetadata(project: ProjectData, configuredOrigin?: string): Metadata {
  const base = portfolioMetadata(configuredOrigin);
  const origin = resolvePublicOrigin(configuredOrigin);
  const path = projectPublicPath(project.id);
  const url = origin && path ? new URL(path, origin).href : undefined;
  const title = `${project.name} — ${profile.name}`;
  const description = `${project.summary} A case study by ${profile.name}. ${project.status}.`;
  const images = origin && project.preview ? [{
    url: new URL(project.preview.src, origin).href,
    width: project.preview.width, height: project.preview.height, alt: project.preview.alt,
  }] : undefined;
  return {
    ...base, title, description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: { ...base.openGraph, title, description, ...(url ? { url } : {}), ...(images ? { images } : {}) },
    twitter: { ...base.twitter, title, description, ...(images ? { images } : {}) },
  };
}

export const PROJECT_NOT_FOUND_METADATA: Metadata = {
  title: "Project not found — Om Sawkare",
  description: "This case-study address does not exist. Explore Om’s Veyra and Adobe hackathon projects or return to the interactive portfolio.",
  robots: { index: false, follow: true },
  alternates: { canonical: null }, openGraph: null, twitter: null,
};
