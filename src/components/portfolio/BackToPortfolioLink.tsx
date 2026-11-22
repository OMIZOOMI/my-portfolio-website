"use client";

import Link from "next/link";

export function BackToPortfolioLink({ className }: { className?: string }) {
  return <Link className={className} href="/" scroll={false} onNavigate={event => {
    try {
      const opener = window.opener as Window | null;
      if (!opener || opener.closed || opener.location.origin !== window.location.origin || opener.location.pathname !== "/") return;
      opener.focus();
      window.close();
      if (window.closed) event.preventDefault();
    } catch {
      // An opener that navigated off-site is inaccessible. Follow the link.
    }
  }}>← Back to Portfolio</Link>;
}
