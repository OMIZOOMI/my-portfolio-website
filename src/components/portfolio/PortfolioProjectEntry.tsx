"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getProjectById } from "../../data/projectsData";

export function PortfolioProjectEntry({ active, available, open }: {
  active: boolean;
  available: boolean;
  open: (action: { projectId: string }) => void;
}) {
  const search = useSearchParams();
  const reference = search.get("project");
  const project = reference ? getProjectById(reference) : null;
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !reference) { handled.current = null; return; }
    if (!available || !project || handled.current === reference) return;
    handled.current = reference;
    open({ projectId: project.id });
  }, [active, available, open, project, reference]);
  return active && reference && !project ? <p role="status">That project could not be found. Use Projects above to explore Om’s work.</p> : null;
}
