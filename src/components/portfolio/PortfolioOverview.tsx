import { PROJECTS } from "../../data/projectsData";
import { PORTFOLIO_PROFILE as profile } from "../../data/portfolioProfile";
import { PortfolioDesktopAction } from "./PortfolioDesktopAction";
import styles from "./PortfolioEntry.module.css";
import { ProjectPublicLink } from "./ProjectPublicLink";
import pageStyles from "./PortfolioReading.module.css";
import { OmMark } from "./OmMark";
import { ReadingGuide } from "./ReadingGuide";

/** Server-rendered core content remains available independently of WebGL and scene assets. */
export function PortfolioOverview({ page = false }: { page?: boolean } = {}) {
  const featured = PROJECTS.filter(project => project.featured);
  if (page) return <main className={pageStyles.page} data-portfolio-reading aria-labelledby="reading-title">
    <div className={pageStyles.inner}>
      <header className={pageStyles.header}>
        <a href="#reading-title" className={pageStyles.wordmark} aria-label={`${profile.name}, top of portfolio`}><OmMark size={22} /></a>
        <nav className={pageStyles.nav} aria-label="Portfolio sections">
          <a href="#reading-projects">Projects</a>
          <a href="#reading-contact">Contact</a>
        </nav>
      </header>
      <section className={pageStyles.intro} aria-labelledby="reading-title">
        <h1 id="reading-title" tabIndex={-1}>{profile.name}</h1>
        <p className={pageStyles.role}>{profile.role}</p>
        <p>{profile.education} <span className={pageStyles.longIntro}>{profile.introduction}</span></p>
        <div className={pageStyles.actions}>
          <a className={pageStyles.primary} href="#reading-projects">See my work <ArrowDownRight size={18} aria-hidden="true" /></a>
          <Link className={pageStyles.secondary} href="/?view=desktop" prefetch={false} scroll={false}><Monitor size={18} aria-hidden="true" /> Open interactive desktop</Link>
        </div>
      </section>
      <ReadingGuide />
      <section className={pageStyles.section} id="reading-projects" tabIndex={-1} aria-labelledby="reading-projects-title">
        <h2 id="reading-projects-title">Selected work</h2>
        <div className={pageStyles.projects}>
          {featured.map(project => <article key={project.id} className={pageStyles.project}>
            <p className={pageStyles.status}>{project.status}</p>
            <h3>{project.name}</h3>
            <p>{project.summary}</p>
            <div className={pageStyles.projectLinks}>
              <ProjectPublicLink projectId={project.id} name={project.name} />
              <a href={project.repositoryUrl} aria-label={`View source for ${project.name} on GitHub`}>View source <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
          </article>)}
        </div>
      </section>
      <section className={`${pageStyles.section} ${pageStyles.contact}`} id="reading-contact" tabIndex={-1} aria-labelledby="reading-contact-title">
        <h2 id="reading-contact-title">Get in touch</h2>
        <div className={pageStyles.actions}>
          <a className={pageStyles.primary} href={`mailto:${profile.email}`}>{profile.email}</a>
          <a className={pageStyles.secondary} href={profile.github}>GitHub <ArrowUpRight size={17} aria-hidden="true" /></a>
          <a className={pageStyles.secondary} href={profile.linkedin}>LinkedIn <ArrowUpRight size={17} aria-hidden="true" /></a>
        </div>
      </section>
    </div>
  </main>;
  return <div className={styles.overviewContent}>
    <section id="portfolio-about" tabIndex={-1} aria-labelledby="portfolio-overview-title">
      <p className={styles.eyebrow}>The person behind the desktop</p>
      <h2 id="portfolio-overview-title">Hi, I’m {profile.name}.</h2>
      <p className={styles.lead}>{profile.role}</p>
      <p>{profile.education} {profile.introduction}</p>
      <p className={styles.smallPrint}>{profile.purpose}</p>
      <div className={styles.actionRow}>
        <PortfolioDesktopAction action="about">More about me</PortfolioDesktopAction>
        <Link href="/?view=reading" prefetch={false} scroll={false}>Read as a page</Link>
      </div>
    </section>
    <section id="portfolio-projects" tabIndex={-1} aria-labelledby="portfolio-projects-title">
      <p className={styles.eyebrow}>Selected work</p>
      <h2 id="portfolio-projects-title">Two projects to start with</h2>
      <div className={styles.featuredProjects}>
        {featured.map(project => <article key={project.id}>
          <p className={styles.projectStatus}>{project.status}</p>
          <h3>{project.name}</h3>
          <p>{project.summary}</p>
          <div className={styles.actionRow}>
            <ProjectPublicLink projectId={project.id} />
            <a href={project.repositoryUrl} target="_blank" rel="noopener noreferrer">View source ↗</a>
            <PortfolioDesktopAction projectId={project.id}>Open in desktop</PortfolioDesktopAction>
          </div>
        </article>)}
      </div>
      <PortfolioDesktopAction action="projects">Explore all projects</PortfolioDesktopAction>
    </section>
    <section id="portfolio-contact" tabIndex={-1} aria-labelledby="portfolio-contact-title">
      <p className={styles.eyebrow}>Get in touch</p>
      <h2 id="portfolio-contact-title">Let’s make something useful.</h2>
      <p><a href={`mailto:${profile.email}`}>{profile.email}</a></p>
      <div className={styles.actionRow}>
        <a href={profile.github} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
        <a href={profile.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>
        <PortfolioDesktopAction action="contact">Write to Om in Mail</PortfolioDesktopAction>
      </div>
      <p className={styles.smallPrint}>The email link opens your email app. You complete sending there.</p>
    </section>
  </div>;
}
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Monitor } from "lucide-react";
