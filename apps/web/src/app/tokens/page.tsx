"use client";

import type { DeviceTokenPublic, Platform } from "@notif/contracts";
import { useCallback, useEffect, useState } from "react";
import { useProjects } from "@/components/ProjectContext";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/ui";

export default function TokensPage() {
  const { selected } = useProjects();
  const [tokens, setTokens] = useState<DeviceTokenPublic[]>([]);
  const [token, setToken] = useState("");
  const [platform, setPlatform] = useState<Platform>("ANDROID");
  const [locale, setLocale] = useState("");
  const [topics, setTopics] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!selected) return;
    setTokens(await api.listTokens(selected.id).catch(() => []));
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await api.registerToken(selected.id, {
        token,
        platform,
        locale: locale || undefined,
        topics: topics ? topics.split(/[\s,]+/).filter(Boolean) : undefined,
      });
      setToken("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!selected) return <div className="card p-8 text-center text-slate-500">Select a project first.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Device tokens — {selected.name}</h1>

      <form onSubmit={register} className="card grid gap-4 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Token</label>
          <input className="input font-mono text-xs" value={token} onChange={(e) => setToken(e.target.value)} required />
        </div>
        <div>
          <label className="label">Platform</label>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            <option value="ANDROID">Android</option>
            <option value="IOS">iOS</option>
            <option value="WEB">Web</option>
          </select>
        </div>
        <div>
          <label className="label">Locale</label>
          <input className="input" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Topics (comma separated)</label>
          <input className="input" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="all-users, promos" />
        </div>
        <div>
          <button className="btn-primary" disabled={busy}>
            Register token
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Locale</th>
              <th className="px-4 py-3">Topics</th>
              <th className="px-4 py-3">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tokens.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">{t.token}</td>
                <td className="px-4 py-3">{t.platform}</td>
                <td className="px-4 py-3">{t.locale ?? "—"}</td>
                <td className="px-4 py-3">{t.topics.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{fmtDate(t.lastSeenAt)}</td>
              </tr>
            ))}
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  No tokens registered.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
