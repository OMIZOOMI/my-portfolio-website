export const DISPLAY_STORAGE_KEY = "portfolio-readability";
export const DISPLAY_SIZES = [1, 1.15, 1.3, 1.45] as const;
export const ICON_SIZES = [1, 1.2, 1.4] as const;
export type DefaultPortfolioView = "laptop" | "screen";

export function parseDisplayPreferences(raw: string | null) {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch { /* Malformed or restricted storage uses the readable defaults. */ }
  return {
    interfaceScale: (DISPLAY_SIZES as readonly unknown[]).includes(data.interfaceScale) ? data.interfaceScale as number : 1,
    iconScale: (ICON_SIZES as readonly unknown[]).includes(data.iconScale) ? data.iconScale as number : 1,
    // The absence of a validated choice means a new visitor starts in the
    // readable Screen view. An explicit laptop choice remains authoritative.
    defaultView: (data.defaultView === "laptop" ? "laptop" : "screen") as DefaultPortfolioView,
  };
}

/** Only a validated saved choice affects the pre-hydration page layout. No storage writes. */
export const DISPLAY_BOOTSTRAP = `(function(){var view="screen";try{var data=JSON.parse(localStorage.getItem(${JSON.stringify(DISPLAY_STORAGE_KEY)})||"null");if(data&&typeof data==="object"&&!Array.isArray(data)&&data.defaultView==="laptop")view="laptop";}catch{}document.documentElement.setAttribute("data-portfolio-boot-view",view);})();`;
