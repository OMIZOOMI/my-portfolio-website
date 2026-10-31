"use client";

import type { WindowState } from "../window-manager/useWindowStore";
import { Finder } from "./Finder";

/** Bin shares Finder's ID-based navigation, interaction guards and root-only trash list. */
export function BinWindow({ window }: { window: WindowState }) {
  return <Finder window={window} />;
}
