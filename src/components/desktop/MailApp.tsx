"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Archive, ChevronLeft, Inbox, Mail, Send, SquarePen } from "lucide-react";
import { useMailStore } from "../window-manager/useMailStore";
import { PORTFOLIO_PROFILE as profile } from "../../data/portfolioProfile";
import { isPortfolioWelcome } from "../../data/mailWelcome";
import { ContactEmail } from "../portfolio/ContactEmail";
import { useSystemStore } from "../window-manager/useSystemStore";
import styles from "./MailApp.module.css";

export function MailApp() {
  const reduceMotion = useSystemStore(state => state.reduceMotion);
  const {
    inbox,
    sent,
    composing,
    draftSubject,
    draftBody,
    openComposer,
    closeComposer,
    setDraftSubject,
    setDraftBody,
    openDraftInEmailApp,
    handoffMessage,
    markRead,
  } = useMailStore();
  const [mailbox, setMailbox] = useState<"inbox" | "sent">("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const subjectInput = useRef<HTMLInputElement>(null);
  const subjectId = useId();
  const sendHintId = useId();
  const writeButton = useRef<HTMLButtonElement>(null);
  const returnToWrite = useRef(false);
  const list = mailbox === "inbox" ? inbox : sent;
  const selected = list.find(mail => mail.id === selectedId) ?? list[0];
  const unread = inbox.filter(mail => !mail.read).length;
  const mailboxName = mailbox === "inbox" ? "Inbox" : "Previous copies";

  useEffect(() => {
    if (composing) subjectInput.current?.focus({ preventScroll: true });
    else if (returnToWrite.current) {
      returnToWrite.current = false;
      writeButton.current?.focus({ preventScroll: true });
    }
  }, [composing]);

  const switchMailbox = (box: "inbox" | "sent") => {
    setMailbox(box);
    setSelectedId(null);
    closeComposer();
    const first = (box === "inbox" ? inbox : sent)[0];
    if (first) markRead(first.id);
  };

  return (
    <div data-mail-app data-composing={composing || undefined} data-reduced-motion={reduceMotion || undefined} className={styles.app}>
      <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Mailboxes">
        <span className={styles.sidebarTitle}>Mailboxes</span>
        <div className={styles.mailboxes}>
          <button type="button" aria-pressed={mailbox === "inbox" && !composing} aria-label={unread > 0 ? `Inbox, ${unread} unread` : undefined} onClick={() => switchMailbox("inbox")}>
            <Inbox size={16} aria-hidden="true" />
            <span>Inbox</span>
            {unread > 0 && <span className={styles.count} aria-hidden="true">{unread}</span>}
          </button>
          <button type="button" aria-pressed={mailbox === "sent" && !composing} aria-label="Previous copies, delivery unverified" onClick={() => switchMailbox("sent")}>
            <Archive size={16} aria-hidden="true" />
            <span>Previous copies</span>
          </button>
        </div>
        <div className={styles.messageList} role="group" aria-label={mailboxName}>
          {list.map(mail => (
            <button key={mail.id} type="button" className={styles.messageRow} aria-pressed={selected?.id === mail.id && !composing} onClick={() => {
              setSelectedId(mail.id);
              closeComposer();
              markRead(mail.id);
            }}>
              <span className={styles.avatar} aria-hidden="true">{mailbox === "inbox" ? mail.from.charAt(0).toUpperCase() : <Archive size={15} />}</span>
              <span className={styles.messageSummary}>
                <span className={styles.sender}>{mailbox === "inbox" ? mail.from : `To: ${mail.to}`}</span>
                <span className={styles.subject}>{mail.subject}</span>
              </span>
              {!mail.read && <span className={styles.unreadDot} role="img" aria-label="Unread" />}
            </button>
          ))}
          {list.length === 0 && <p className={styles.emptyList}>{mailbox === "inbox" ? "No messages" : "No previous copies"}</p>}
        </div>
      </aside>

      <section className={styles.main} aria-label={composing ? "Compose message" : mailboxName}>
        <header className={styles.toolbar}>
          {composing ? (
            <>
              <div className={styles.toolbarTitle}>
                <button type="button" className={styles.back} aria-label="Back to messages, keep draft" onClick={() => {
                  returnToWrite.current = true;
                  closeComposer();
                }}>
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <h1>New message</h1>
              </div>
              <button type="button" data-mail-handoff className={styles.primary} aria-describedby={sendHintId} onClick={openDraftInEmailApp} disabled={!draftSubject.trim() || !draftBody.trim()}>
                <Send size={15} aria-hidden="true" />
                Send
              </button>
            </>
          ) : (
            <>
              <div className={styles.toolbarTitle}>
                <h1>{mailboxName}</h1>
                <span className={styles.toolbarCount}>{list.length}</span>
              </div>
              <button ref={writeButton} type="button" className={styles.primary} onClick={openComposer}>
                <SquarePen size={16} aria-hidden="true" />
                Write to Om
              </button>
            </>
          )}
        </header>

        {composing ? (
          <div className={styles.pane}>
            <div className={styles.composer}>
              {handoffMessage && <p role="status" className={styles.handoffStatus}>{handoffMessage}</p>}
              <div className={styles.draft}>
                <div className={styles.field}>
                  <span>To</span>
                  <div className={styles.contactDetails}><ContactEmail /></div>
                </div>
                <div className={styles.field}>
                  <label htmlFor={subjectId}>Subject</label>
                  <input ref={subjectInput} id={subjectId} type="text" aria-label="Mail subject" value={draftSubject} onChange={event => setDraftSubject(event.target.value)} placeholder="What’s on your mind?" />
                </div>
                <textarea aria-label="Mail message" value={draftBody} onChange={event => setDraftBody(event.target.value)} placeholder="Hi Om…" />
              </div>
              <p id={sendHintId} className={styles.helper}>Send opens your email app with this draft. Finish sending there.</p>
            </div>
          </div>
        ) : selected && mailbox === "inbox" && isPortfolioWelcome(selected) ? (
          <div className={styles.pane}>
            <article className={styles.welcome}>
              <div className={styles.welcomeMark} aria-hidden="true"><Mail size={34} strokeWidth={1.55} /></div>
              <p className={styles.kicker}>A note from {profile.name}</p>
              <h2>Let’s get in touch.</h2>
              <p className={styles.welcomeText}>Have a project, opportunity, or question? I’d love to hear from you.</p>
              <div className={styles.contactDetails}><ContactEmail /></div>
            </article>
          </div>
        ) : selected ? (
          <div className={styles.pane}>
            <article className={styles.letter}>
              {mailbox === "sent" && <p role="note" className={styles.copyNotice}>Unverified copy from an earlier version. Opening an email app does not confirm that the message was sent.</p>}
              <h2>{selected.subject}</h2>
              <p className={styles.metadata}>From {selected.from} · To {selected.to}</p>
              <time className={styles.metadata}>
                {new Date(selected.sentAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </time>
              <p className={styles.letterBody}>{selected.body}</p>
            </article>
          </div>
        ) : (
          <div className={styles.pane}>
            <div className={styles.empty}>
              {mailbox === "inbox" ? <Inbox size={26} aria-hidden="true" /> : <Archive size={26} aria-hidden="true" />}
              <h2>{mailbox === "inbox" ? "Your inbox is empty" : "No previous copies"}</h2>
              <p>{mailbox === "inbox" ? "Choose Write to Om to get in touch." : "Copies saved by an earlier version of Mail appear here."}</p>
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
