"use client";

import type { ReactNode } from "react";
import { ProjectProvider } from "@/components/ProjectContext";
import { Shell } from "@/components/Shell";

/** Client boundary for providers + chrome. Keeps RootLayout a server component. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ProjectProvider>
      <Shell>{children}</Shell>
    </ProjectProvider>
  );
}
