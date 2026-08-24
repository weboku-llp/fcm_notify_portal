"use client";

import type { CampaignDeliveryPublic, CampaignPublic, DeliveryStatus } from "@notif/contracts";
import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { api } from "@/lib/api";

type StatusFilter = DeliveryStatus | "ALL";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "SENT", label: "Sent" },
  { id: "FAILED", label: "Failed" },
  { id: "STALE", label: "Stale" },
];

function reasonText(d: CampaignDeliveryPublic): string {
  if (d.status === "SENT") {
    return d.messageId ? `Delivered to FCM · ${d.messageId}` : "Accepted by FCM";
  }
  if (d.errorCode && d.error) return `${d.errorCode}: ${d.error}`;
  if (d.error) return d.error;
  if (d.errorCode) return d.errorCode;
  return d.status === "STALE" ? "Stale / unregistered token" : "Unknown failure";
}

export function CampaignDeliveriesDrawer({
  campaign,
  initialFilter,
  onClose,
}: {
  campaign: CampaignPublic;
  initialFilter: StatusFilter;
  onClose: () => void;
}) {
  const titleId = useId();
  const [status, setStatus] = useState<StatusFilter>(initialFilter);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<CampaignDeliveryPublic[]>([]);
  const [counts, setCounts] = useState({ sent: 0, failed: 0, stale: 0, total: 0 });

  useEffect(() => {
    setStatus(initialFilter);
  }, [initialFilter, campaign.id]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listCampaignDeliveries(campaign.id, {
        status: status === "ALL" ? undefined : status,
        q: debouncedQ || undefined,
      });
      setDeliveries(res.deliveries);
      setCounts(res.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliveries");
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, [campaign.id, status, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filterCounts = useMemo(
    () => ({
      ALL: counts.total,
      SENT: counts.sent,
      FAILED: counts.failed,
      STALE: counts.stale,
    }),
    [counts],
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-lg flex-col border-l border-line bg-surface-card shadow-[-16px_0_40px_-24px_rgba(11,13,18,0.45)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-[15px] font-semibold text-ink">
              Delivery details
            </h2>
            <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-mute">{campaign.title}</p>
          </div>
          <button type="button" className="btn-secondary h-8 px-2" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatus(f.id)}
                className={`rounded-md border px-2.5 py-1 text-[12px] font-medium ${
                  status === f.id
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-line bg-white text-ink-soft hover:bg-surface-raised"
                }`}
              >
                {f.label}
                <span className="ml-1 tabular-nums text-ink-faint">{filterCounts[f.id]}</span>
              </button>
            ))}
          </div>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by error, token, platform, user…"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-[13px] text-ink-mute">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading deliveries…
            </div>
          ) : error ? (
            <div className="border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</div>
          ) : deliveries.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-faint">
              No deliveries match this filter.
              {campaign.mode === "BROADCAST_TOPIC" ? (
                <span className="mt-1 block text-[12px]">
                  Topic broadcasts don’t record per-device results.
                </span>
              ) : null}
            </p>
          ) : (
            <ul className="space-y-2">
              {deliveries.map((d) => (
                <li key={d.id} className="border border-line bg-surface-raised px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`badge ${
                        d.status === "SENT"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : d.status === "STALE"
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-red-300 bg-red-50 text-red-800"
                      }`}
                    >
                      {d.status}
                    </span>
                    <span className="font-mono text-[10px] text-ink-faint">
                      {d.platform ?? "—"}
                      {d.userId ? ` · ${d.userId}` : ""}
                    </span>
                  </div>
                  <p
                    className={`mt-1.5 text-[13px] leading-snug ${
                      d.status === "SENT" ? "text-ink-soft" : "text-red-900"
                    }`}
                  >
                    {reasonText(d)}
                  </p>
                  {d.tokenPreview ? (
                    <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">{d.tokenPreview}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
