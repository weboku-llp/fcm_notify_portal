"use client";

import type { CampaignPublic } from "@notif/contracts";
import { History, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useProjects } from "@/components/ProjectContext";
import { api } from "@/lib/api";
import { fmtDate, STATUS_STYLES } from "@/lib/ui";

export default function CampaignHistoryPage() {
  const { selected } = useProjects();
  const [campaigns, setCampaigns] = useState<CampaignPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await api.listCampaigns(selected.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: string) {
    await api.cancelCampaign(id).catch(() => undefined);
    await load();
  }

  if (!selected) {
    return <div className="card p-8 text-center text-slate-500">Select a project to view its campaigns.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Send history</h1>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-mute">
            <History className="h-3.5 w-3.5" strokeWidth={1.75} />
            {selected.name}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <Link href="/campaigns/new" className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            Compose
          </Link>
        </div>
      </div>

      {error ? <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Est.</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Failed</th>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.title}</div>
                  {c.errorMessage ? <div className="text-xs text-red-600">{c.errorMessage}</div> : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.targetValue ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.mode}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.estimatedRecipients ?? "—"}</td>
                <td className="px-4 py-3 text-emerald-700">{c.sentCount}</td>
                <td className="px-4 py-3 text-red-600">{c.failedCount}</td>
                <td className="px-4 py-3 text-slate-500">{fmtDate(c.scheduledAt)}</td>
                <td className="px-4 py-3 text-slate-500">{fmtDate(c.completedAt)}</td>
                <td className="px-4 py-3 text-right">
                  {["DRAFT", "SCHEDULED", "QUEUED"].includes(c.status) ? (
                    <button className="text-xs font-medium text-red-600 hover:underline" onClick={() => cancel(c.id)}>
                      Cancel
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!loading && campaigns.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                  No campaigns yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
