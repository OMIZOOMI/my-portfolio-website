import type { StaticImageData } from "next/image";
import FinderIcon from "../assets/3d-mac-os-finder.png";
import TerminalIcon from "../assets/Terminal.png";
import NotesIcon from "../assets/Notes.png";
import MailIcon from "../assets/Mail.png";
import SafariIcon from "../assets/safari.png";
import MusicIcon from "../assets/Music.png";
import CameraIcon from "../assets/facetime.png";
import SettingsIcon from "../assets/System-Settings.png";
import type { PortfolioAppId } from "./portfolioApps";

export const PORTFOLIO_APP_ARTWORK: Record<PortfolioAppId, StaticImageData | string> = {
  "heat-sink": "/identity/heat-sink.svg",
  finder: FinderIcon,
  terminal: TerminalIcon,
  notes: NotesIcon,
  mail: MailIcon,
  safari: SafariIcon,
  music: MusicIcon,
  facetime: CameraIcon,
  settings: SettingsIcon,
};
