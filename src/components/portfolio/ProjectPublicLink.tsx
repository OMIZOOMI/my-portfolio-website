import { projectPublicPath } from "../../data/publicProjects";

export function ProjectPublicLink({ projectId, name }: { projectId: string; name?: string }) {
  const href = projectPublicPath(projectId);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer"
    aria-label={`Read case study${name ? ` for ${name}` : ""} (opens in a new tab)`}>
    Read case study <span aria-hidden="true">↗</span>
  </a> : null;
}
