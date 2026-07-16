/** Per-project brand assets (local public files). */
const PROJECT_LOGOS: Record<string, { src: string; alt: string }> = {
  cricrumble: {
    src: "/branding/cricrumble-logo-dark.png",
    alt: "CricRumble",
  },
};

export function projectLogo(slug: string | null | undefined) {
  if (!slug) return null;
  return PROJECT_LOGOS[slug] ?? null;
}

export function isCricRumble(slug: string | null | undefined): boolean {
  return slug === "cricrumble";
}
