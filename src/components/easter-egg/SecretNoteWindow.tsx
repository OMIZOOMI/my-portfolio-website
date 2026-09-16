"use client";

import { HiddenGameTrigger } from "./GameMenu";
import type { WindowContext } from "@/components/window-manager/WindowManager";
import styles from "./SecretNoteWindow.module.css";

export function SecretNoteWindow({ context }: { context: WindowContext }) {
  return (
    <div className={styles.note}>
      <p>
        If you're reading this, you found the secret file. Not much to see here — just
        notes to self: finish the assistive stick writeup, polish the sign language
        translator demo, and maybe take a break to play a round of something
        <HiddenGameTrigger onActivate={context.onActivateGameMenu} />
        once in a whil
      </p>
    </div>
  );
}
