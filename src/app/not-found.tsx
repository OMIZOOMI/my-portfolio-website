import Link from "next/link";
import { PUBLIC_PROJECTS, projectPublicPath } from "@/data/publicProjects";
import styles from "@/components/portfolio/PublicProjectPage.module.css";

export default function NotFound() {
  return <main className={styles.page} data-project-not-found>
    <section className={styles.notFound}>
      <p>Om Sawkare’s portfolio</p>
      <h1>This page could not be found.</h1>
      <p>The address may be incomplete or out of date. Read a case study or return to the interactive portfolio.</p>
      <nav aria-label="Available portfolio pages">
        {PUBLIC_PROJECTS.map(project => <Link key={project.id} href={projectPublicPath(project.id)!}>{project.key === "adobe" ? "Adobe hackathon case study" : `${project.name} case study`}</Link>)}
        <Link href="/">Interactive portfolio</Link>
      </nav>
    </section>
  </main>;
}
