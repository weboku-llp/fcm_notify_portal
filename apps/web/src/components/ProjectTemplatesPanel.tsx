"use client";

import type { TemplatePublic } from "@notif/contracts";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`);
}

function extractVars(...parts: string[]): string[] {
  const set = new Set<string>();
  for (const str of parts) {
    for (const m of str.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) set.add(m[1]!);
  }
  return [...set];
}

function emptyForm() {
  return {
    name: "",
    title: "",
    body: "",
    imageUrl: "",
    deepLink: "",
    dataJson: '{\n  "type": "ANNOUNCEMENT"\n}',
  };
}

export function ProjectTemplatesPanel({ projectId }: { projectId: string }) {
  const [templates, setTemplates] = useState<TemplatePublic[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    // Project-owned templates only (management view).
    setTemplates(await api.listTemplates(projectId, false).catch(() => []));
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const vars = useMemo(
    () => extractVars(form.title, form.body, form.imageUrl, form.deepLink, form.dataJson),
    [form],
  );
  const sampleVars = useMemo(() => Object.fromEntries(vars.map((v) => [v, `<${v}>`])), [vars]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setError(null);
  }

  function startEdit(t: TemplatePublic) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      title: t.title,
      body: t.body,
      imageUrl: t.imageUrl ?? "",
      deepLink: t.deepLink ?? "",
      dataJson: JSON.stringify(t.dataJson ?? {}, null, 2),
    });
    setShowForm(true);
    setError(null);
  }

  function parseDataJson(): Record<string, string> {
    try {
      const parsed = JSON.parse(form.dataJson || "{}") as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) out[k] = typeof v === "string" ? v : JSON.stringify(v);
      return out;
    } catch {
      throw new Error("Custom data must be valid JSON");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const dataJson = parseDataJson();
      const payload = {
        name: form.name,
        title: form.title,
        body: form.body,
        imageUrl: form.imageUrl.trim() || null,
        deepLink: form.deepLink.trim() || null,
        dataJson,
        variables: vars,
      };
      if (editingId) {
        await api.updateTemplate(editingId, payload);
      } else {
        await api.createTemplate({ ...payload, projectId });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">Templates</h2>
          <p className="mt-0.5 text-[13px] text-ink-mute">
            Owned by this project. Use {"{{variables}}"} in title, body, image, deep link, and data.
          </p>
        </div>
        {!showForm ? (
          <button type="button" className="btn-primary" onClick={startCreate}>
            <Plus className="h-3.5 w-3.5" />
            New template
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form onSubmit={save} className="space-y-4 border border-line bg-surface-card p-4 md:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-ink">
              {editingId ? "Edit template" : "New template"}
            </h3>
            <button
              type="button"
              className="btn-secondary h-8 px-2"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setError(null);
              }}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                placeholder="Match Starting"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Title</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                placeholder="{{teamA}} vs {{teamB}}"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Body</label>
              <textarea
                className="input h-24"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                required
                placeholder="Live action starts at {{matchTime}}."
              />
            </div>
            <div>
              <label className="label">Image URL</label>
              <input
                className="input"
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="{{imageUrl}} or https://..."
              />
            </div>
            <div>
              <label className="label">Deep link</label>
              <input
                className="input"
                value={form.deepLink}
                onChange={(e) => setForm((f) => ({ ...f, deepLink: e.target.value }))}
                placeholder="/matches/{{matchId}}"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Custom data (JSON string map)</label>
              <textarea
                className="input h-28 font-mono text-[12px]"
                value={form.dataJson}
                onChange={(e) => setForm((f) => ({ ...f, dataJson: e.target.value }))}
              />
            </div>
          </div>

          {vars.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {vars.map((v) => (
                <span key={v} className="badge">
                  {v}
                </span>
              ))}
            </div>
          ) : null}

          <div className="border border-line bg-surface-raised p-3">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Preview</p>
            <p className="text-[13px] font-semibold text-ink">{render(form.title || "Title", sampleVars)}</p>
            <p className="text-[13px] text-ink-mute">{render(form.body || "Body", sampleVars)}</p>
          </div>

          {error ? <div className="border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</div> : null}

          <button className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : editingId ? "Update template" : "Save template"}
          </button>
        </form>
      ) : null}

      <div className="overflow-hidden border border-line bg-surface-card">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-line bg-surface-raised text-[11px] uppercase tracking-[0.06em] text-ink-mute">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Variables</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                <td className="px-4 py-3 text-ink-soft">
                  <div className="max-w-[280px] truncate">{t.title}</div>
                  <div className="max-w-[280px] truncate text-[12px] text-ink-faint">{t.body}</div>
                </td>
                <td className="hidden px-4 py-3 font-mono text-[11px] text-ink-faint md:table-cell">
                  {t.variables.join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" className="btn-secondary h-8 px-2" onClick={() => startEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-secondary h-8 px-2 text-red-700"
                      onClick={async () => {
                        if (!confirm(`Delete template “${t.name}”?`)) return;
                        await api.deleteTemplate(t.id).catch(() => undefined);
                        await load();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-faint">
                  No templates for this project yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
