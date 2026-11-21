import { OmMark } from "./OmMark";
import { PORTFOLIO_PROFILE as profile } from "../../data/portfolioProfile";
import { SITE_IDENTITY as site } from "../../data/siteIdentity";

export function PortfolioIdentity() {
  return <section data-portfolio-about className="flex flex-col items-center gap-3 text-center">
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[#252a32] text-[#f7f5ef]"><OmMark size={64} /></div>
    <h1 className="text-xl font-semibold tracking-tight">{site.name}</h1>
    <p className="text-sm font-semibold">{profile.name}</p>
    <p className="max-w-sm text-sm leading-6 text-gray-600 dark:text-gray-300">{profile.role}</p>
    <p className="max-w-sm text-xs leading-5 text-gray-600 dark:text-gray-300">An interactive website inspired by desktop apps. Explore my projects, the ideas behind them, and ways to get in touch.</p>
    <p className="text-xs leading-5 text-gray-600 dark:text-gray-300">Built with Next.js, React, Three.js, and Zustand.</p>
    <a className="rounded-md px-3 py-2 text-sm text-blue-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-blue-300" href={site.repository} target="_blank" rel="noopener noreferrer">View portfolio source ↗</a>
  </section>;
}
