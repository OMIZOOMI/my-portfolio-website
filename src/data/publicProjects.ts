import { PROJECTS, getProjectById, type ProjectData } from "./projectsData";

export const PUBLIC_PROJECTS = PROJECTS.filter(project => project.publicSlug && project.caseStudy);

/** Public slugs are an explicit allowlist, never a fuzzy fallback to another project. */
export function getPublicProject(slug: string): ProjectData | null {
  return PUBLIC_PROJECTS.find(project => project.publicSlug === slug) ?? null;
}

export function projectPublicPath(reference: string): string | null {
  const project = getProjectById(reference);
  return project?.publicSlug && project.caseStudy ? `/projects/${project.publicSlug}` : null;
}

export function projectPortfolioPath(reference: string): string | null {
  const project = getProjectById(reference);
  return project && projectPublicPath(project.id) ? `/?project=${encodeURIComponent(project.id)}` : null;
}
