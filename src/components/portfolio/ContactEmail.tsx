"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { PORTFOLIO_PROFILE as profile } from "../../data/portfolioProfile";
import { copyContactEmail } from "./contactActions";
import styles from "./ContactEmail.module.css";

export function ContactEmail() {
  const [message, setMessage] = useState("");
  const [copying, setCopying] = useState(false);
  const address = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const statusId = useId();
  useEffect(() => () => { request.current++; }, []);
  const copy = async () => {
    const token = ++request.current;
    setCopying(true); setMessage("");
    let clipboard: Clipboard | undefined;
    try { clipboard = navigator.clipboard; } catch { /* Manual selection remains available. */ }
    const result = await copyContactEmail(clipboard);
    if (token !== request.current) return;
    setCopying(false); setMessage(result.message);
    if (!result.copied) { address.current?.focus({ preventScroll: true }); address.current?.select(); }
  };
  return <div className={styles.contact}>
    <div className={styles.controls}>
      <input ref={address} readOnly type="text" aria-label="Om’s email address" aria-describedby={message ? statusId : undefined} value={profile.email}
        onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} className={styles.address} />
      <button type="button" onClick={copy} disabled={copying} aria-busy={copying} className={styles.copy}><Copy size={15} aria-hidden="true" />Copy email</button>
    </div>
    <p id={statusId} role="status" className={styles.status}>{message}</p>
  </div>;
}
