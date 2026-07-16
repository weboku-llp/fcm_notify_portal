"use client";

import type { ProjectPublic } from "@notif/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

interface ProjectCtx {
  projects: ProjectPublic[];
  selected: ProjectPublic | null;
  selectProject: (id: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const Ctx = createContext<ProjectCtx | null>(null);
const STORAGE_KEY = "notif.selectedProjectId";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectPublic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listProjects();
      setProjects(list);
      setSelectedId((current) => {
        if (current && list.some((p) => p.id === current)) return current;
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (stored && list.some((p) => p.id === stored)) return stored;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectProject = useCallback((id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const value = useMemo<ProjectCtx>(
    () => ({
      projects,
      selected: projects.find((p) => p.id === selectedId) ?? null,
      selectProject,
      refresh,
      loading,
      error,
    }),
    [projects, selectedId, selectProject, refresh, loading, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjects(): ProjectCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
}
