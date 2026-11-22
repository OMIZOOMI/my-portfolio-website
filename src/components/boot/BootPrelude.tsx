import styles from "./Bootsequence.module.css";

export function BootPrelude() {
  return <div className={styles.root} data-startup-overlay data-state="loading">
    <div className={styles.overlay}>
      <div className={styles.stage}>
        <div className={styles.greeting} aria-hidden="true"><span className={styles.greetingText}>Hello</span></div>
        <div className={styles.loading} role="status">
          <div className={styles.progress} aria-hidden="true" />
          <p className={styles.status}>Loading the desktop controls…</p>
        </div>
      </div>
    </div>
  </div>;
}
