import Link from "next/link";
import type { ProjectData } from "../../data/projectsData";
import { PUBLIC_PROJECTS, projectPortfolioPath, projectPublicPath } from "../../data/publicProjects";
import { ProjectCaseStudy } from "../desktop/ProjectCaseStudy";
import styles from "./PublicProjectPage.module.css";

export function PublicProjectPage({ project }: { project: ProjectData }) {
  return <main className={styles.page} data-public-project={project.id}>
    <nav className={styles.nav} aria-label="Case-study navigation">
      <Link className={styles.identity} href="/" scroll={false}>Om Sawkare<span>Interactive portfolio</span></Link>
      <div>{PUBLIC_PROJECTS.map(item => <Link key={item.id} href={projectPublicPath(item.id)!} scroll={false}
        aria-current={item.id === project.id ? "page" : undefined}>{item.key === "adobe" ? "Adobe hackathon" : item.name}</Link>)}</div>
    </nav>
    <div className={styles.entry}>
      <Link className={styles.back} href="/" scroll={false}>← Back to Portfolio</Link>
      <p className="touch-portfolio-only">For the full 3D experience, open the portfolio on a laptop or desktop.</p>
      <Link href={projectPortfolioPath(project.id)!} scroll={false}>Explore this project in the portfolio <span aria-hidden="true">↗</span></Link>
    </div>
    <ProjectCaseStudy project={project} publicPage />
    <footer className={styles.footer}>
      <p>Explore more of Om’s work.</p>
      <div>{PUBLIC_PROJECTS.filter(item => item.id !== project.id).map(item => <Link key={item.id} href={projectPublicPath(item.id)!} scroll={false}>{item.name} →</Link>)}</div>
      <Link href={projectPortfolioPath(project.id)!} scroll={false}>Enter the interactive portfolio</Link>
    </footer>
  </main>;
}
