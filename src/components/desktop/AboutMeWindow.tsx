"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { User, Code2, FolderGit2, Briefcase, type LucideIcon } from "lucide-react";
import type { WindowContext } from "@/components/window-manager/WindowManager";
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
export function AboutMeWindow({ context: _context }: { context: WindowContext }) {
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
      <h1 className={styles.name}>Your Name</h1>
      <p className={styles.tagline}>
        Software engineer building assistive tech, cloud-backed apps, and the occasional
        overengineered portfolio.
      </p>
      <p className={styles.body}>
        Placeholder overview copy — swap this for a couple of sentences on who you are,
        what you're focused on right now, and what kind of work you're looking for.
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
      <article className={styles.card}>
        <h3 className={styles.cardTitle}>Smart Assistive Stick</h3>
        <p className={styles.cardBody}>
          Placeholder description — a sensor-guided mobility aid project. Swap in the real
          writeup: the problem it solves, the hardware/sensors involved, and what shipped
          vs. what's still in progress.
        </p>
        <div className={styles.tagRow}>
          <span className={styles.tag}>Embedded</span>
          <span className={styles.tag}>Sensors</span>
          <span className={styles.tag}>Python</span>
        </div>
      </article>
    </section>
  );
}

function ExperienceSection() {
  return (
    <section>
      <h2 className={styles.sectionTitle}>Experience</h2>
      <article className={styles.card}>
        <h3 className={styles.cardTitle}>Dell Technologies — Technical Assessment</h3>
        <p className={styles.cardBody}>
          Placeholder description — swap in what the assessment covered and what you took
          away from it.
        </p>
      </article>
    </section>
  );
}