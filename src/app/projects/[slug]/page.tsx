import { notFound } from "next/navigation";
import { PUBLIC_PROJECTS, getPublicProject } from "@/data/publicProjects";
import { projectMetadata, PROJECT_NOT_FOUND_METADATA } from "@/data/projectMetadata";
import { PublicProjectPage } from "@/components/portfolio/PublicProjectPage";

// This finite catalogue is built together. Unknown slugs use the complete
// pre-rendered 404, including its useful links before JavaScript is available.
export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLIC_PROJECTS.map(project => ({ slug: project.publicSlug! }));
}

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">) {
  const project = getPublicProject((await params).slug);
  return project ? projectMetadata(project, process.env.PORTFOLIO_PUBLIC_ORIGIN) : PROJECT_NOT_FOUND_METADATA;
}

export default async function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  const project = getPublicProject((await params).slug);
  if (!project) notFound();
  return <PublicProjectPage project={project} />;
}
