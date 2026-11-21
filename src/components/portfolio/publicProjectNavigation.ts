"use client";

import { projectPublicPath } from "../../data/publicProjects";

let navigator: ((href: string) => void) | null = null;

/** Drei's HTML has a separate React root, so it cannot consume Next's context.
 * The persistent site shell supplies its existing router without moving apps. */
export function registerPublicProjectNavigator(navigate: (href: string) => void): () => void {
  navigator = navigate;
  return () => { if (navigator === navigate) navigator = null; };
}

export function navigatePublicProject(reference: string): boolean {
  const href = projectPublicPath(reference);
  if (!href || !navigator) return false;
  navigator(href);
  return true;
}
