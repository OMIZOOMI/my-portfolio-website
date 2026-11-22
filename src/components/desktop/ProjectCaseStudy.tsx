"use client";

import { useId, type MouseEvent, type ReactNode } from "react";
import type { ProjectData } from "../../data/projectsData";
import styles from "./ProjectCaseStudy.module.css";
import { ProjectPublicLink } from "../portfolio/ProjectPublicLink";
import { ProjectPreview } from "./ProjectPreview";

interface ProjectCaseStudyProps {
  project: ProjectData;
  onOpenInBrowser?: () => void;
  onExternal?: (url: string) => void;
  onBack?: () => void;
  publicPage?: boolean;
}

/** The same case study is used by the existing file and Browser renderers. */
export function ProjectCaseStudy({ project, onOpenInBrowser, onExternal, onBack, publicPage = false }: ProjectCaseStudyProps) {
  const id = useId();
  const story = project.caseStudy;
  if (!story) return null;
  const example = story.evidenceExample;
  const inDevelopment = project.status === "In development";
  const external = (url: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // Preserve native modified-click behavior and the Browser app's external handoff feedback.
    if (onExternal && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      onExternal(url);
    }
  };
  const link = (url: string, children: ReactNode, className?: string) =>
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={external(url)} className={className}>{children} <span aria-hidden="true">↗</span></a>;

  return <div className={styles.surface} data-project-case-study={project.id}>
    <article className={styles.article} aria-labelledby={`${id}-title`}>
      {onBack && <button type="button" className={styles.back} onClick={onBack}>‹ Back to favorites</button>}
      <header className={styles.header}>
        <p className={styles.eyebrow}>{story.eyebrow}</p>
        <div className={styles.titleRow}>
          <h1 id={`${id}-title`}>{project.name}</h1>
          <span className={styles.status} data-in-development={inDevelopment || undefined}>{inDevelopment ? "(In Development)" : project.status}</span>
        </div>
        <p className={styles.summary}>{project.summary}</p>
        <p className={styles.role}>{story.role}</p>
        <div className={styles.actions}>
          {link(project.repositoryUrl, "View repository", styles.primary)}
          {onOpenInBrowser && <button type="button" onClick={onOpenInBrowser}>Open in Browser <span aria-hidden="true">↗</span></button>}
          {!publicPage && <ProjectPublicLink projectId={project.id} />}
        </div>
        {story.reportedResult && <aside className={styles.result} aria-label="Hackathon result reported by Om">
          <p className={styles.eyebrow}>Hackathon result · Reported by Om</p>
          <strong>{story.reportedResult.title}</strong>
          <p>{story.reportedResult.detail}</p>
          <p className={styles.note}>{story.reportedResult.attribution}</p>
        </aside>}
      </header>

      {project.preview && <div className={styles.preview}><ProjectPreview preview={project.preview} /></div>}
      <div className={styles.intro}>
        <section aria-labelledby={`${id}-problem`}>
          <h2 id={`${id}-problem`}>The problem</h2>
          <p>{story.problem}</p>
        </section>
        <section aria-labelledby={`${id}-contribution`}>
          <h2 id={`${id}-contribution`}>{story.contributionHeading}</h2>
          <p>{story.contribution}</p>
        </section>
      </div>

      <section className={styles.decision} aria-labelledby={`${id}-decision`}>
        <h2 id={`${id}-decision`}>{story.decisionHeading}</h2>
        <p>{story.decision}</p>
        <p className={styles.tools}>{story.tools}</p>
      </section>

      <figure className={styles.figure} aria-labelledby={`${id}-example`} aria-describedby={`${id}-caption`}>
        <p className={styles.eyebrow}>{example.label}</p>
        <h2 id={`${id}-example`}>{example.title}</h2>
        <ol className={styles.trace} role="list" aria-label="Evidence flow">
          {example.steps.map((step, index) => <li key={step.label}>
            {index > 0 && <span className={styles.connector} aria-hidden="true">↓</span>}
            <p className={styles.step}>{String(index + 1).padStart(2, "0")} · {step.label}</p>
            {step.badge && <span className={styles.provenance}>{step.badge}</span>}
            {step.format === "code" ? <code className={styles.code}>{step.content}</code> : <p className={styles.finding}>{step.content}</p>}
            {step.items && <ul className={styles.pillars}>{step.items.map(item => <li key={item}>{item}</li>)}</ul>}
            <p className={styles.note}>{step.note}</p>
          </li>)}
        </ol>
        <div className={styles.nextStep}><strong>{example.actionLabel}</strong><p>{example.recommendation}</p></div>
        {example.excerpt && <div className={styles.excerpt}>
          <h3>{example.excerpt.title}</h3>
          <pre><code>{example.excerpt.content}</code></pre>
          <p>{example.excerpt.caption} {link(example.excerpt.sourceUrl, example.excerpt.sourceLabel)}</p>
        </div>}
        <figcaption id={`${id}-caption`}>{example.caveat} {link(example.sourceUrl, example.sourceLabel)}</figcaption>
      </figure>

      <section className={styles.scope} aria-labelledby={`${id}-scope`}>
        <h2 id={`${id}-scope`}>Where it stands</h2>
        <p>{project.statusDetail}</p>
        <ul>{project.limitations.map(item => <li key={item}>{item}</li>)}</ul>
        <p className={styles.demo}><strong>{story.scopeNote.title}</strong> {story.scopeNote.detail}</p>
        {project.futurePlans.length > 0 && <p><strong>Next:</strong> {project.futurePlans.join(" ")}</p>}
      </section>

      <details className={styles.sources} data-detail-key={`scope-${project.id}`}>
        <summary>Implementation sources</summary>
        <p>Links point to the reviewed repository snapshot.</p>
        <ul>{project.evidence.map(item => <li key={item.url}>{link(item.url, item.label)}</li>)}</ul>
      </details>
    </article>
  </div>;
}
