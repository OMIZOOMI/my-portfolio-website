"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { getProjectionViewportSize, type ProjectionSize } from "./projectionViewportSize";

/** Size the Canvas and its existing Html portal together; never remount either
 * on resize or a Screen view change, so apps keep their state and resources. */
export function ProjectionViewport({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ProjectionSize | null>(null);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const next = getProjectionViewportSize(bounds.width, bounds.height, window.devicePixelRatio);
      if (next) setSize(current => current?.width === next.width && current.height === next.height ? current : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  return <div ref={container} data-laptop-scene style={{ position: "absolute", inset: 0, zIndex: 1 }}>
    {size && <div data-projection-viewport style={{ position: "relative", width: size.width, height: size.height }}>
      {children}
    </div>}
  </div>;
}
