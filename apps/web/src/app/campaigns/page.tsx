"use client";

import type { CampaignPublic, DeliveryStatus } from "@notif/contracts";
import { Copy, History, Plus, RefreshCw, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CampaignDeliveriesDrawer } from "@/components/CampaignDeliveriesDrawer";
import {
  ResendCampaignModal,
  type CampaignReuseIntent,
} from "@/components/ResendCampaignModal";
import { useProjects } from "@/components/ProjectContext";
import { api } from "@/lib/api";
import { fmtDate, STATUS_STYLES } from "@/lib/ui";

function targetLabel(c: CampaignPublic): string {
  if (c.mode === "ALL_REGISTERED") return "All users";
  if (c.mode === "BROADCAST_TOPIC") return c.targetValue ? `Topic · ${c.targetValue}` : "Topic";
  if (c.mode === "SPECIFIC_TOKENS") return "Specific tokens";
  if (c.mode === "SELECTED_USERS") return "Selected users";
  if (c.mode === "SEGMENT") return c.targetValue ? `Segment · ${c.targetValue}` : "Segment";
  return c.targetValue ?? c.mode;
}

export default function CampaignHistoryPage() {
  const { selected } = useProjects();
  const [campaigns, setCampaigns] = useState<CampaignPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resend, setResend] = useState<{ campaign: CampaignPublic; intent: CampaignReuseIntent } | null>(
    null,
  );
  const [drawer, setDrawer] = useState<{
    campaign: CampaignPublic;
    filter: DeliveryStatus | "ALL";
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
            {!loading ? (
              <span className="text-ink-faint">
                · {campaigns.length} send{campaigns.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link href="/campaigns/new" className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            Compose
          </Link>
        </div>
      </div>

      {error ? <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {toast ? (
        <div className="card border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{toast}</div>
      ) : null}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1020px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Update</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Devices</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Failed</th>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {campaigns.map((c) => {
              const isTopic = c.mode === "BROADCAST_TOPIC";
              return (
                <tr key={c.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex max-w-md items-start gap-3">
                      {c.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.imageUrl}
                          alt=""
                          className="mt-0.5 h-12 w-12 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          No img
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium leading-snug text-ink">{c.title}</div>
                        <p className="mt-0.5 line-clamp-3 text-[13px] leading-snug text-slate-600">{c.body}</p>
                        {c.errorMessage ? (
                          <div className="mt-1 text-xs text-red-600">{c.errorMessage}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-600">{targetLabel(c)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">
                    {c.estimatedRecipients ?? c.attemptedCount ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium text-emerald-700">
                    {isTopic && c.status === "COMPLETED" && c.sentCount === 1 ? (
                      <span title="Topic accepted by Firebase — not a per-device count">1 (topic)</span>
                    ) : (
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline disabled:no-underline"
                        disabled={c.sentCount === 0 && c.failedCount === 0 && c.attemptedCount === 0}
                        onClick={() => setDrawer({ campaign: c, filter: "SENT" })}
                        title="View sent deliveries"
                      >
                        {c.sentCount}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium text-red-600">
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline disabled:cursor-default disabled:no-underline"
                      disabled={c.sentCount === 0 && c.failedCount === 0 && c.attemptedCount === 0}
                      onClick={() => setDrawer({ campaign: c, filter: "FAILED" })}
                      title="View failed deliveries"
                    >
                      {c.failedCount}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500">
                    <div>{fmtDate(c.completedAt ?? c.scheduledAt ?? c.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        className="btn-secondary h-8 px-2 text-[12px]"
                        onClick={() => setResend({ campaign: c, intent: "duplicate" })}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="btn-secondary h-8 px-2 text-[12px]"
                        onClick={() => setResend({ campaign: c, intent: "resend" })}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Resend
                      </button>
                      {["DRAFT", "SCHEDULED", "QUEUED"].includes(c.status) ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-red-600 hover:underline"
                          onClick={() => void cancel(c.id)}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && campaigns.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  No campaigns yet. Compose a Daily Update to see it here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {campaigns.some((c) => c.status === "QUEUED" || c.status === "SENDING") ? (
        <p className="text-[12px] text-amber-800">
          Some sends are still <span className="font-medium">QUEUED</span> /{" "}
          <span className="font-medium">SENDING</span>. Make sure the worker is running (
          <span className="font-mono">npm run dev:worker</span>), then hit Refresh.
        </p>
      ) : null}

      {drawer ? (
        <CampaignDeliveriesDrawer
          campaign={drawer.campaign}
          initialFilter={drawer.filter}
          onClose={() => setDrawer(null)}
        />
      ) : null}

      {resend ? (
        <ResendCampaignModal
          campaign={resend.campaign}
          project={selected}
          intent={resend.intent}
          onClose={() => setResend(null)}
          onDone={({ action }) => {
            setToast(
              action === "draft"
                ? "Draft saved. You’ll see a DRAFT row in history."
                : resend.intent === "duplicate"
                  ? "Duplicate queued for send."
                  : "Resend queued. Refresh in a moment to see the new row.",
            );
            void load();
            window.setTimeout(() => setToast(null), 4000);
          }}
        />
      ) : null}
    </div>
  );
}
