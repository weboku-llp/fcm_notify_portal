"use client";

import type { DeviceTokenPublic, Platform } from "@notif/contracts";
import { useCallback, useEffect, useState } from "react";
import { useProjects } from "@/components/ProjectContext";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/ui";

const MIGRATION_NOTE =
  "Portal notifications reach devices that have updated and registered with the new notification system. Use Firebase Console during the migration period to reach older app versions.";

export default function TokensPage() {
  const { selected } = useProjects();
  const [tokens, setTokens] = useState<DeviceTokenPublic[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [token, setToken] = useState("");
  const [platform, setPlatform] = useState<Platform>("ANDROID");
  const [locale, setLocale] = useState("");
  const [topics, setTopics] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingToken, setDeletingToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selected) return;
    const res = await api.listTokens(selected.id).catch(() => ({
      tokens: [] as DeviceTokenPublic[],
      activeCount: 0,
      coverageNote: MIGRATION_NOTE,
    }));
    setTokens(res.tokens);
    setActiveCount(res.activeCount);
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

  async function removeToken(t: string) {
    if (!selected) return;
    if (!window.confirm("Delete this device token permanently? This cannot be undone.")) return;
    setDeletingToken(t);
    try {
      await api.deleteToken(selected.id, t);
      await load();
    } finally {
      setDeletingToken(null);
    }
  }

  if (!selected) return <div className="card p-8 text-center text-slate-500">Select a project first.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Device registrations — {selected.name}</h1>
        <p className="text-sm text-slate-500">
          Active registered devices: <span className="font-medium text-slate-800">{activeCount}</span>
          {" · "}topic <code className="rounded bg-slate-100 px-1">{selected.defaultBroadcastTopic}</code>
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{MIGRATION_NOTE}</div>

      <form onSubmit={register} className="card grid gap-4 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Token (manual / test)</label>
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
          <input
            className="input"
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder={selected.defaultBroadcastTopic}
          />
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
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Locale</th>
              <th className="px-4 py-3">Topics</th>
              <th className="px-4 py-3">Last seen</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tokens.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">
                  <div className="max-w-[220px] truncate">{t.token}</div>
                  {!t.isActive && t.invalidationReason ? (
                    <div className="text-[10px] text-red-600">{t.invalidationReason}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">{t.platform}</td>
                <td className="px-4 py-3">{t.isActive ? "yes" : "no"}</td>
                <td className="px-4 py-3">{t.locale ?? "—"}</td>
                <td className="px-4 py-3">{t.topics.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{fmtDate(t.lastSeenAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40"
                    disabled={deletingToken === t.token}
                    onClick={() => void removeToken(t.token)}
                  >
                    {deletingToken === t.token ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No tokens registered yet. They appear after the app update registers devices.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
