"use client";

import Image from "next/image";
import { AppWindow } from "lucide-react";
import { appWindowTitle } from "../../data/appIdentity";
import { PortfolioIdentity } from "../portfolio/PortfolioIdentity";
import FinderIcon from "../../assets/3d-mac-os-finder.png";
import TerminalIcon from "../../assets/Terminal.png";
import NotesIcon from "../../assets/Notes.png";
import MailIcon from "../../assets/Mail.png";
import SafariIcon from "../../assets/safari.png";
import MusicIcon from "../../assets/Music.png";
import FaceTimeIcon from "../../assets/facetime.png";
import SettingsIcon from "../../assets/System-Settings.png";

const APP_DATA: Record<string, { icon: string; description: string }> = {
  Files: { icon: FinderIcon.src, description: "Browse this portfolio’s folders, projects and files." },
  Terminal: { icon: TerminalIcon.src, description: "Explore Om’s skills and projects through portfolio commands." },
  Notes: { icon: NotesIcon.src, description: "Read the Developer Log and write session notes." },
  Mail: { icon: MailIcon.src, description: "Prepare a message to Om, then finish sending in your email app." },
  Browser: { icon: SafariIcon.src, description: "Explore portfolio pages. External sites open in your real browser." },
  Music: { icon: MusicIcon.src, description: "Instrumental listening, with creator and license credits in the app." },
  Camera: { icon: FaceTimeIcon.src, description: "A local camera and gesture demo. Camera access starts when you choose." },
  Settings: { icon: SettingsIcon.src, description: "Display, appearance, workspace and sound preferences for this website." },
};

export function AboutAppWindow({ window }: { window: { id: string; title: string } }) {
  const title = appWindowTitle({ ...window, kind: "about-app" });
  const name = title.replace(/^About /, "");
  const data = APP_DATA[name];
  return <div className="flex h-full w-full flex-col items-center overflow-y-auto bg-[#f6f6f8] p-6 text-center font-sans text-gray-800 dark:bg-[#282828] dark:text-gray-200">
    {name === "This Portfolio" || name === "Portfolio" ? <PortfolioIdentity /> : <>
      {data ? <Image src={data.icon} alt="" aria-hidden="true" width={80} height={80} unoptimized loading="eager" className="mb-4 h-20 w-20 shrink-0 object-contain" /> : <AppWindow size={64} className="mb-4 shrink-0" aria-hidden="true" />}
      <h1 className="text-xl font-semibold">{name}</h1>
      <p className="mt-3 max-w-xs text-sm leading-6 text-gray-600 dark:text-gray-300">{data?.description ?? "An app demonstration inside Om’s interactive portfolio."}</p>
      <p className="mt-auto pt-6 text-xs text-gray-600 dark:text-gray-300">Part of Om Sawkare’s portfolio.</p>
    </>}
  </div>;
}
