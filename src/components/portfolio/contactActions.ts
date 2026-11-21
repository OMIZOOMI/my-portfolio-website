import { PORTFOLIO_PROFILE as profile } from "../../data/portfolioProfile";

export async function copyContactEmail(clipboard?: { writeText?: (text: string) => Promise<void> }) {
  try {
    if (typeof clipboard?.writeText !== "function") return { copied: false, message: "Copy is unavailable here. Select the address and copy it manually." };
    await clipboard.writeText(profile.email);
    return { copied: true, message: "Email copied." };
  } catch {
    return { copied: false, message: "Copy was blocked. Select the address and copy it manually." };
  }
}
