"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { User, Code2, FolderGit2, Briefcase, type LucideIcon } from "lucide-react";
import type { WindowContext } from "@/components/window-manager/WindowManager";
import { PROJECTS } from "../../data/projectsData";
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

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar} aria-label="About Me sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={styles.navItem}
              onClick={() => setActive(item.id)}
            >
              {isActive && (
                <motion.div
                  className={styles.navActivePill}
                  layoutId="about-me-nav-pill"
                  transition={{ type: "spring", duration: 0.35, bounce: 0 }}
                />
              )}
              <Icon size={15} strokeWidth={1.9} className={styles.navIcon} />
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={styles.content}>
        {/* mode="wait" on purpose: sections have different content/height,
            so letting outgoing/incoming overlap (like the boot sequence's
            Hello->Namaste crossfade) would read as scrambled text rather
            than a clean morph. Sequential replacement is the right call
            for tab-style content specifically. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ transform: "translateY(6px)", opacity: 0 }}
            animate={{ transform: "translateY(0px)", opacity: 1 }}
            exit={{ transform: "translateY(-6px)", opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            {active === "overview" && <OverviewSection />}
            {active === "skills" && <SkillsSection />}
            {active === "projects" && <ProjectsSection />}
            {active === "experience" && <ExperienceSection />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <section>
      <div className={styles.avatar} aria-hidden="true" />
       <h1 className={styles.name}>Om Nilesh Sawkare</h1>
      <p className={styles.tagline}>
         Computer Science Engineering student building assistive technology, edge AI systems, cloud-backed APIs, and the occasional overengineered portfolio.
      </p>
      <p className={styles.body}>
         I enjoy taking an idea from a webcam frame or a hardware sensor all the way to a reliable product surface. My current focus is practical AI, reproducible cloud architecture, and thoughtful interfaces.
      </p>
    </section>
  );
}

function SkillsSection() {
  const skills = [
    { name: "Python", detail: "Backend services, data tooling, ML prototyping." },
    { name: "Java", detail: "Object-oriented systems, coursework and applied projects." },
    { name: "AWS", detail: "Cloud architecture — EC2, Lambda, S3, and related services." },
  ];

  return (
    <section>
      <h2 className={styles.sectionTitle}>Skills</h2>
      <div className={styles.skillList}>
        {skills.map((skill) => (
          <div key={skill.name} className={styles.skillRow}>
            <span className={styles.skillName}>{skill.name}</span>
            <span className={styles.skillDetail}>{skill.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectsSection() {
  return (
    <section>
      <h2 className={styles.sectionTitle}>Projects</h2>
      <div className={styles.skillList}>
        {PROJECTS.map((project) => (
          <article key={project.id} className={styles.card}>
            <h3 className={styles.cardTitle}>{project.name}</h3>
            <p className={styles.cardBody}>{project.summary}</p>
            <div className={styles.tagRow}>
              {project.stack.slice(0, 3).map((technology) => (
                <span key={technology} className={styles.tag}>{technology}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExperienceSection() {
  return (
    <section>
      <h2 className={styles.sectionTitle}>Experience</h2>
      <article className={styles.card}>
        <h3 className={styles.cardTitle}>Applied engineering and technical projects</h3>
        <p className={styles.cardBody}>
          Building across Python, Java, AWS architecture, React, and computer vision while preparing production-minded systems for real users.
        </p>
      </article>
    </section>
  );
}
