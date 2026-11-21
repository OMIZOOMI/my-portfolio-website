import { PORTFOLIO_PROFILE as profile } from "./portfolioProfile";

const legacyWelcome = {
  id: "welcome-1", from: "You", to: "Om Sawkare", subject: "Welcome to my portfolio!",
  body: "Hi there! Welcome to my portfolio's mail client.\n\nTo get in touch, choose Compose, then Open in your email app. You complete sending in your own email app; this portfolio cannot confirm delivery. Your draft stays here while the portfolio remains open.\n\nLooking forward to hearing from you!",
};
export const MAIL_WELCOME = {
  id: "welcome-1", from: profile.name, to: "Portfolio visitor", subject: "Write to Om",
  body: `Have a project, opportunity, or question? I’d love to hear from you.\n\nMy email is ${profile.email}. Choose Write to Om to prepare a message, or copy the address and use your usual mail app or website.\n\nOpen in your email app passes your draft to an email handler. You finish sending there; this portfolio cannot confirm delivery. Your draft stays here while this page remains open.`,
};
type WelcomeCandidate = { id: string; from: string; to: string; subject: string; body: string };
function matches(email: WelcomeCandidate, template: WelcomeCandidate) {
  return (Object.keys(template) as (keyof WelcomeCandidate)[]).every(key => email[key] === template[key]);
}
export const isPortfolioWelcome = (email: WelcomeCandidate) => matches(email, MAIL_WELCOME) || matches(email, legacyWelcome);

/** Change only a byte-matching built-in welcome; edited and visitor messages remain untouched. */
export function migrateMailWelcome<T extends WelcomeCandidate>(inbox: T[]): T[] {
  let changed = false;
  const next = inbox.map(email => {
    if (!matches(email, legacyWelcome)) return email;
    changed = true;
    return { ...email, ...MAIL_WELCOME };
  });
  return changed ? next : inbox;
}
