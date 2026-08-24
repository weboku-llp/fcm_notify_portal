/** Built-in brand assets (local public files) — used when project.logoUrl is unset. */
const PROJECT_LOGOS: Record<string, { src: string; alt: string }> = {
  cricrumble: {
    src: "/branding/cricrumble-logo-dark.png",
    alt: "CricRumble",
  },
};

export type ProjectLogo = { src: string; alt: string };

/** Prefer DB logoUrl; fall back to known slug assets. */
export function projectLogo(
  project: { slug?: string | null; name?: string | null; logoUrl?: string | null } | string | null | undefined,
): ProjectLogo | null {
  if (project == null) return null;
  if (typeof project === "string") {
    return PROJECT_LOGOS[project] ?? null;
  }
  if (project.logoUrl?.trim()) {
    return { src: project.logoUrl.trim(), alt: project.name?.trim() || project.slug || "Project" };
  }
  if (project.slug) return PROJECT_LOGOS[project.slug] ?? null;
  return null;
}

export function isCricRumble(slug: string | null | undefined): boolean {
  return slug === "cricrumble";
}

export function isInfluventure(slug: string | null | undefined): boolean {
  return slug === "influventure";
}
