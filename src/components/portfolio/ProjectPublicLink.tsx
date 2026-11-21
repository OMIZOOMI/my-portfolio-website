"use client";

import { projectPublicPath } from "../../data/publicProjects";
import { navigatePublicProject } from "./publicProjectNavigation";

export function ProjectPublicLink({ projectId, name }: { projectId: string; name?: string }) {
  const href = projectPublicPath(projectId);
  return href ? <a href={href} aria-label={name ? `Read case study for ${name}` : undefined} onClick={event => {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && navigatePublicProject(projectId)) event.preventDefault();
  }}>Read case study <span aria-hidden="true">↗</span></a> : null;
}
