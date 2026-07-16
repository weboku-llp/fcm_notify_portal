"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/components/ProjectContext";

/** Templates live inside each project — redirect there. */
export default function TemplatesPage() {
  const router = useRouter();
  const { selected } = useProjects();

  useEffect(() => {
    if (selected) router.replace(`/projects/${selected.id}?tab=templates`);
    else router.replace("/projects");
  }, [router, selected]);

  return null;
}
