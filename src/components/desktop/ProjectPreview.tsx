import Image from "next/image";
import type { ProjectData } from "../../data/projectsData";

export function ProjectPreview({ preview }: { preview: NonNullable<ProjectData["preview"]> }) {
  return <figure className="space-y-2">
    <Image src={preview.src} width={preview.width} height={preview.height} alt={preview.alt}
      unoptimized className="h-auto w-full rounded-xl border border-current/15" />
    <figcaption className="text-sm leading-5 opacity-80">{preview.caption}</figcaption>
  </figure>;
}
