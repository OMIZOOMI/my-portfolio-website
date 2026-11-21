import type { ProjectData } from "../../data/projectsData";

/** Shared factual notes inside the existing project layouts, without a new page design. */
export function ProjectScope({ project }: { project: ProjectData }) {
  return (
    <div className="mt-3 text-xs leading-5 text-gray-600 dark:text-gray-300">
      <p><strong>{project.status}</strong> · {project.statusDetail}</p>
      <details data-detail-key={`scope-${project.id}`} className="mt-2">
        <summary className="cursor-pointer font-semibold">Scope &amp; evidence</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {project.limitations.map(note => <li key={note}>{note}</li>)}
        </ul>
        {project.futurePlans.length > 0 && <div className="mt-2">
          <p className="font-semibold">Future work</p>
          <ul className="list-disc space-y-1 pl-4">
            {project.futurePlans.map(plan => <li key={plan}>{plan}</li>)}
          </ul>
        </div>}
        <ul className="mt-2 space-y-1" aria-label="Project sources">
          {project.evidence.map(source => <li key={source.url}>
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              {source.label} ↗
            </a>
            {source.basis === "project-notes" && <span> · author&apos;s notes</span>}
          </li>)}
        </ul>
      </details>
    </div>
  );
}
