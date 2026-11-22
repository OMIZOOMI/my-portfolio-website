import { projectPublicPath } from "../../data/publicProjects";

export function ProjectPublicLink({ projectId, name }: { projectId: string; name?: string }) {
  const href = projectPublicPath(projectId);
  // Public case-study paths are same-origin. Keep their opener so the
  // case study can return to the exact portfolio tab that launched it.
  return href ? <a href={href} target="_blank" rel="opener" referrerPolicy="no-referrer"
    aria-label={`Read case study${name ? ` for ${name}` : ""} (opens in a new tab)`}>
    Read case study <span aria-hidden="true">↗</span>
  </a> : null;
}
