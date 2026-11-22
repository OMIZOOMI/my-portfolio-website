import { Geist, Geist_Mono } from "next/font/google";
import "glisse/styles.css";
import "./globals.css";
import { APPEARANCE_BOOTSTRAP } from "@/data/appearanceBootstrap";
import { DISPLAY_BOOTSTRAP } from "@/data/displayPreferences";
import { portfolioMetadata } from "@/data/siteMetadata";
import { getPortfolioPublicOrigin } from "@/data/siteIdentity";
import { PortfolioSiteShell } from "@/components/portfolio/PortfolioSiteShell";
import { PortfolioOverview } from "@/components/portfolio/PortfolioOverview";
import { Suspense } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = portfolioMetadata(getPortfolioPublicOrigin());

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
      suppressHydrationWarning
    >
      <head><script id="portfolio-appearance-bootstrap" dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }} /><script id="portfolio-display-bootstrap" dangerouslySetInnerHTML={{ __html: DISPLAY_BOOTSTRAP }} /></head>
      {/* FIX: Locked dimensions to viewport and disabled global scrolling */}
      <body className="w-screen h-screen overflow-hidden flex flex-col bg-black">
        <Suspense fallback={null}>
          <PortfolioSiteShell overview={<PortfolioOverview />} reading={<PortfolioOverview page />} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
