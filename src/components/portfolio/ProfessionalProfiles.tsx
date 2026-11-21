"use client";

import { useId } from "react";
import { Briefcase, ExternalLink, GitBranch } from "lucide-react";
import { PORTFOLIO_PROFILE as profile } from "../../data/portfolioProfile";
import styles from "./ProfessionalProfiles.module.css";

export function ProfessionalProfiles() {
  const heading = useId();
  return <section className={styles.profiles} aria-labelledby={heading} data-professional-profiles>
    <h2 id={heading} className="sr-only">Om’s professional profiles</h2>
    <div className={styles.grid} data-introduction-contact>
      <a href={profile.github} target="_blank" rel="noopener noreferrer" className={styles.card} data-profile="github" aria-label="GitHub — Om’s code and repositories (opens in a new tab)">
        <span className={styles.icon} aria-hidden="true"><GitBranch size={18} /></span>
        <span className={styles.label}><strong>GitHub</strong><small>Code and repositories</small></span>
        <ExternalLink className={styles.action} size={15} aria-hidden="true" />
      </a>
      <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className={styles.card} data-profile="linkedin" aria-label="LinkedIn — Om’s background and connections (opens in a new tab)">
        <span className={styles.icon} aria-hidden="true"><Briefcase size={18} /></span>
        <span className={styles.label}><strong>LinkedIn</strong><small>Professional profile</small></span>
        <ExternalLink className={styles.action} size={15} aria-hidden="true" />
      </a>
    </div>
    <p className={styles.note}>Profiles open in a new tab in your real browser.</p>
  </section>;
}
