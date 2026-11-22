"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { User, Code2, FolderGit2, Briefcase, type LucideIcon } from "lucide-react";
import type { WindowContext } from "@/components/window-manager/WindowManager";
import { PROJECTS, getProjectById } from "../../data/projectsData";
import { PORTFOLIO_PROFILE as profile, SKILL_GROUPS, PROJECT_EXPERIENCE } from "../../data/portfolioProfile";
import { runPortfolioAction } from "../portfolio/portfolioActions";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useDisplayStore } from "../window-manager/useDisplayStore";
import styles from "./AboutMeWindow.module.css";

type SectionId = "overview" | "skills" | "projects" | "experience";

const NAV_ITEMS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: User },
  { id: "skills", label: "Skills", icon: Code2 },
  { id: "projects", label: "Projects", icon: FolderGit2 },
  { id: "experience", label: "Experience", icon: Briefcase },
];

// `context` isn't used by this window, but every registered window content
// component takes the same props shape — see WindowManager.tsx.
export function AboutMeWindow({ context }: { context: WindowContext }) {
  void context;
  const [active, setActive] = useState<SectionId>("overview");
  const prefersReducedMotion = useReducedMotion();
  const motionSetting = useSystemStore(state => state.reduceMotion);
  const reduceMotion = prefersReducedMotion || motionSetting;
  const screenView = useDisplayStore(state => state.screenView);
  const content = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.layout} data-about-root data-reduced-motion={reduceMotion || undefined}>
      <div className={styles.panes}>
      <nav className={styles.sidebar} aria-label="About Me sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={styles.navItem}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                if (active === item.id) return;
                content.current?.scrollTo({ top: 0, behavior: "instant" });
                setActive(item.id);
              }}
            >
              <Icon size={15} strokeWidth={1.9} className={styles.navIcon} />
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div ref={content} className={styles.content} role="region" aria-label={`${NAV_ITEMS.find(item => item.id === active)?.label} — About Om`}>
        {/* mode="wait" on purpose: sections have different content/height,
            so letting outgoing/incoming overlap (like the boot sequence's
            Hello->Namaste crossfade) would read as scrambled text rather
            than a clean morph. Sequential replacement is the right call
            for tab-style content specifically. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={reduceMotion ? false : { transform: "translateY(6px)", opacity: 0 }}
            animate={{ transform: "translateY(0px)", opacity: 1 }}
            exit={reduceMotion ? undefined : { transform: "translateY(-6px)", opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.23, 1, 0.32, 1] }}
          >
            {active === "overview" && <OverviewSection />}
            {active === "skills" && <SkillsSection />}
            {active === "projects" && <ProjectsSection />}
            {active === "experience" && <ExperienceSection />}
          </motion.div>
        </AnimatePresence>
        {!screenView && <div className={styles.readingTools} aria-label="Reading options">
          <button type="button" data-laptop-setting onClick={() => runPortfolioAction("screen")}>Read in Screen view</button>
        </div>}
      </div>
      </div>
    </div>
  );
}

function ProjectLinks({ projectKeys }: { projectKeys: readonly string[] }) {
  return <div className={styles.projectLinks}>
    {projectKeys.map(key => {
      const project = getProjectById(key);
      return project && <button key={project.id} type="button" onClick={() => runPortfolioAction({ projectId: project.id })}>{project.name} ↗</button>;
    })}
  </div>;
}

function OverviewSection() {
  return <section>
    <div className={styles.avatar} aria-hidden="true">Om</div>
    <p className={styles.eyebrow}>The person behind the desktop</p>
    <h1 className={styles.name}>{profile.name}</h1>
    <p className={styles.tagline}>{profile.role}</p>
    <p className={styles.body}>{profile.education} {profile.introduction}</p>
    <p className={styles.body}>Lego robots and Halo sparked my curiosity about what technology could help people do. The building blocks have changed; I still care most about making something useful.</p>
    <h2 className={styles.sectionTitle}>Start with my current work</h2>
    <ProjectLinks projectKeys={PROJECTS.filter(project => project.featured).map(project => project.key)} />
  </section>;
}

function SkillsSection() {
  return <section>
    <h2 className={styles.sectionTitle}>Skills, through the things I build</h2>
    <p className={styles.body}>A toolkit makes more sense beside the problems it helps solve. These projects show where I’ve put it to work.</p>
    <div className={styles.skillList}>
      {SKILL_GROUPS.map(group => <article key={group.title} className={styles.card}>
        <h3 className={styles.cardTitle}>{group.title}</h3>
        <p className={styles.cardBody}>{group.detail}</p>
        <p className={styles.tools}>{[...new Set(group.projects.flatMap(key => getProjectById(key)?.stack ?? []))].join(" · ")}</p>
        <ProjectLinks projectKeys={group.projects} />
      </article>)}
    </div>
    <p className={styles.body}>AWS and cloud architecture are part of my continued learning. Each project describes what is implemented today.</p>
  </section>;
}

function ProjectsSection() {
  return <section>
    <h2 className={styles.sectionTitle}>Projects</h2>
    <div className={styles.skillList}>
      {PROJECTS.map(project => <article key={project.id} className={styles.card}>
        <p className={styles.eyebrow}>{project.featured ? "Featured work" : "Supporting work"} · {project.status}</p>
        <h3 className={styles.cardTitle}>{project.name}</h3>
        <p className={styles.cardBody}>{project.summary}</p>
        <div className={styles.tagRow}>{project.stack.map(technology => <span key={technology} className={styles.tag}>{technology}</span>)}</div>
        <ProjectLinks projectKeys={[project.key]} />
      </article>)}
    </div>
  </section>;
}

function ExperienceSection() {
  return <section>
    <h2 className={styles.sectionTitle}>Experience, through building</h2>
    <p className={styles.body}>{profile.education} These projects show what I’ve learned by building on my own and with a team.</p>
    <div className={styles.skillList}>
      {PROJECT_EXPERIENCE.map(item => <article key={item.title} className={styles.card}>
        <h3 className={styles.cardTitle}>{item.title}</h3>
        <p className={styles.cardBody}>{item.detail}</p>
        <ProjectLinks projectKeys={item.projects} />
      </article>)}
    </div>
  </section>;
}
