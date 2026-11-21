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
  return {
    ...base, title, description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: { ...base.openGraph, title, description, ...(url ? { url } : {}) },
    twitter: { ...base.twitter, title, description },
  };
}

export const PROJECT_NOT_FOUND_METADATA: Metadata = {
  title: "Project not found — Om Sawkare",
  description: "This case-study address does not exist. Explore Om’s Veyra and Adobe hackathon projects or return to the interactive portfolio.",
  robots: { index: false, follow: true },
  alternates: { canonical: null }, openGraph: null, twitter: null,
};
