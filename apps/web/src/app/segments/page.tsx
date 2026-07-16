"use client";

import type { Platform, SegmentPublic } from "@notif/contracts";
import { useCallback, useEffect, useState } from "react";
import { useProjects } from "@/components/ProjectContext";
import { api } from "@/lib/api";

export default function SegmentsPage() {
  const { selected } = useProjects();
  const [segments, setSegments] = useState<SegmentPublic[]>([]);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [locale, setLocale] = useState("");
  const [topic, setTopic] = useState("");
  const [lastSeenWithinDays, setDays] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!selected) return;
    setSegments(await api.listSegments(selected.id).catch(() => []));
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  function rules() {
    return {
      ...(platform ? { platform } : {}),
      ...(locale ? { locale } : {}),
      ...(topic ? { topic } : {}),
      ...(lastSeenWithinDays ? { lastSeenWithinDays: Number(lastSeenWithinDays) } : {}),
    };
  }

  async function doEstimate() {
    if (!selected) return;
    setEstimate(await api.estimateSegment(selected.id, rules()).catch(() => null));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await api.createSegment(selected.id, { name, rules: rules() });
      setName("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!selected) return <div className="card p-8 text-center text-slate-500">Select a project first.</div>;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
      <div>
        <h1 className="mb-4 text-2xl font-semibold">Segments</h1>
        <form onSubmit={create} className="card space-y-4 p-6">
          <div>
            <label className="label">Segment name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Platform</label>
              <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "")}>
                <option value="">Any</option>
                <option value="ANDROID">Android</option>
                <option value="IOS">iOS</option>
                <option value="WEB">Web</option>
              </select>
            </div>
            <div>
              <label className="label">Locale</label>
              <input className="input" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US" />
            </div>
            <div>
              <label className="label">Topic</label>
              <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div>
              <label className="label">Seen within (days)</label>
              <input className="input" type="number" value={lastSeenWithinDays} onChange={(e) => setDays(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-secondary" onClick={doEstimate}>
              Estimate audience
            </button>
            {estimate !== null ? <span className="text-sm text-slate-600">≈ {estimate} devices</span> : null}
          </div>
          <button className="btn-primary" disabled={busy}>
            Save segment
          </button>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Existing segments</h2>
        {segments.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{s.name}</span>
              <code className="text-xs text-slate-400">{s.id}</code>
            </div>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
              {JSON.stringify(s.rules, null, 2)}
            </pre>
          </div>
        ))}
        {segments.length === 0 ? <p className="text-sm text-slate-400">No segments yet.</p> : null}
      </div>
    </div>
  );
}
