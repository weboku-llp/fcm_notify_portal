"use client";

import type { TemplatePublic } from "@notif/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjects } from "@/components/ProjectContext";
import { api } from "@/lib/api";

function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`);
}

function extractVars(...s: string[]): string[] {
  const set = new Set<string>();
  for (const str of s) for (const m of str.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) set.add(m[1]!);
  return [...set];
}

export default function TemplatesPage() {
  const { selected } = useProjects();
  const [templates, setTemplates] = useState<TemplatePublic[]>([]);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [global, setGlobal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTemplates(await api.listTemplates(selected?.id).catch(() => []));
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  const vars = useMemo(() => extractVars(title, body), [title, body]);
  const sampleVars = useMemo(() => Object.fromEntries(vars.map((v) => [v, `<${v}>`])), [vars]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createTemplate({
        projectId: global ? null : selected?.id,
        name,
        title,
        body,
        dataJson: {},
        variables: vars,
      });
      setName("");
      setTitle("");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <form onSubmit={create} className="card space-y-4 p-6">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Title (supports {"{{variables}}"})</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Hi {{firstName}}" />
          </div>
          <div>
            <label className="label">Body</label>
            <textarea className="input h-24" value={body} onChange={(e) => setBody(e.target.value)} required placeholder="Welcome to {{appName}}!" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />
            Global template (available to all projects)
          </label>
          {vars.length > 0 ? (
            <div className="text-xs text-slate-500">
              Variables: {vars.map((v) => (
                <span key={v} className="badge mr-1 bg-brand-50 text-brand-700">
                  {v}
                </span>
              ))}
            </div>
          ) : null}
          {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          <button className="btn-primary" disabled={busy}>
            Save template
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live preview</p>
          <p className="text-sm font-semibold">{render(title || "Title", sampleVars)}</p>
          <p className="text-sm text-slate-600">{render(body || "Body", sampleVars)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Existing templates</h2>
        {templates.map((t) => (
          <div key={t.id} className="card flex items-start justify-between p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                {t.projectId === null ? <span className="badge bg-purple-100 text-purple-700">global</span> : null}
              </div>
              <p className="text-sm font-medium">{t.title}</p>
              <p className="text-sm text-slate-500">{t.body}</p>
            </div>
            <button
              className="text-xs font-medium text-red-600 hover:underline"
              onClick={async () => {
                await api.deleteTemplate(t.id).catch(() => undefined);
                await load();
              }}
            >
              Delete
            </button>
          </div>
        ))}
        {templates.length === 0 ? <p className="text-sm text-slate-400">No templates yet.</p> : null}
      </div>
    </div>
  );
}
