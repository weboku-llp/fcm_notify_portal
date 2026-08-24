"use client";

import type { CricLiveMatchRow, CricNotifPhase } from "@notif/contracts";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CricNotificationPreview as NotificationPreview } from "@/components/CricNotificationPreview";
import { useProjects } from "@/components/ProjectContext";
import { api } from "@/lib/api";
import { isCricRumble } from "@/lib/brand";

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } ${checked ? "bg-brand-600" : "bg-black/15"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function fmtKickoff(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function matchLabel(m: CricLiveMatchRow): string {
  if (m.shortHome && m.shortAway) return `${m.shortHome} vs ${m.shortAway}`;
  return `${m.teamHome} vs ${m.teamAway}`;
}

function TeamFlag({
  src,
  label,
  size = "md",
}: {
  src: string | null | undefined;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const dim = size === "lg" ? "h-11 w-11" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const initials = label.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?";

  if (!src || failed) {
    return (
      <div
        className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700 ring-1 ring-brand-200`}
        title={label}
        aria-label={label}
      >
        {initials}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      title={label}
      className={`${dim} shrink-0 rounded-full bg-white object-contain p-0.5 ring-1 ring-line`}
      onError={() => setFailed(true)}
    />
  );
}

function MatchFlags({
  match,
  size = "md",
}: {
  match: Pick<CricLiveMatchRow, "flagHomeUrl" | "flagAwayUrl" | "teamHome" | "teamAway" | "shortHome" | "shortAway">;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex items-center">
      <TeamFlag src={match.flagHomeUrl} label={match.shortHome || match.teamHome} size={size} />
      <span className="-mx-1 relative z-[1] flex h-5 w-5 items-center justify-center rounded-full bg-white text-[9px] font-semibold text-ink-faint ring-1 ring-line">
        vs
      </span>
      <TeamFlag src={match.flagAwayUrl} label={match.shortAway || match.teamAway} size={size} />
    </div>
  );
}

const PHASE_TABS: { id: CricNotifPhase; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "toss", label: "Toss day" },
  { id: "start", label: "Match start" },
  { id: "live", label: "Live score" },
  { id: "result", label: "Result" },
];

export default function LiveScoresPage() {
  const { selected } = useProjects();
  const [matches, setMatches] = useState<CricLiveMatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Fixture currently creating/sending a campaign after Match alerts ON. */
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewPhase, setPreviewPhase] = useState<CricNotifPhase>("upcoming");

  const cric = isCricRumble(selected?.slug);

  const load = useCallback(async () => {
    if (!selected || !isCricRumble(selected.slug)) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listCricLiveMatches(selected.id);
      setMatches(rows);
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.fixtureId === prev)) return prev;
        const liveFirst = rows.find((r) => r.kind === "live");
        return liveFirst?.fixtureId ?? rows[0]?.fixtureId ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live matches");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(
    match: CricLiveMatchRow,
    patchBody: { alertsEnabled?: boolean; autoOnScoreUpdate?: boolean },
  ) {
    if (!selected) return;
    const turningAlertsOn = patchBody.alertsEnabled === true && !match.alertsEnabled;
    setBusyId(match.fixtureId);
    if (turningAlertsOn) setProcessingId(match.fixtureId);
    setError(null);
    setToast(null);

    // Optimistic: show alerts on immediately while campaign queues.
    if (turningAlertsOn) {
      setMatches((prev) =>
        prev.map((m) => (m.fixtureId === match.fixtureId ? { ...m, alertsEnabled: true } : m)),
      );
    } else if (patchBody.alertsEnabled === false) {
      setMatches((prev) =>
        prev.map((m) =>
          m.fixtureId === match.fixtureId
            ? { ...m, alertsEnabled: false, autoOnScoreUpdate: false }
            : m,
        ),
      );
    }

    try {
      const res = await api.updateCricLiveMatchAlert(selected.id, match.fixtureId, {
        ...patchBody,
        teamHome: match.teamHome,
        teamAway: match.teamAway,
        shortHome: match.shortHome,
        shortAway: match.shortAway,
        scoreLine: match.scoreLine,
        venue: match.venue,
        startingAt: match.startingAt,
        kickoffLabel: match.kickoffLabel,
        toss: match.toss,
        kind: match.kind,
        status: match.status,
        phase: match.phase,
      });
      if (res.campaign) {
        const status = res.campaign.status;
        if (status === "COMPLETED") {
          setToast(
            `Sent to all devices (${selected.defaultBroadcastTopic}) — “${res.campaign.title}” · ${res.campaign.sentCount} delivered`,
          );
        } else if (status === "FAILED") {
          setToast(`Campaign failed — ${res.campaign.errorMessage ?? "see History"}`);
        } else {
          setToast(`Campaign ${status.toLowerCase()} — “${res.campaign.title}”`);
        }
        setMatches((prev) =>
          prev.map((m) =>
            m.fixtureId === match.fixtureId
              ? {
                  ...m,
                  ...res.match,
                  alertsEnabled: true,
                  lastNotifiedScore: res.campaign!.title,
                  lastNotifiedAt: new Date().toISOString(),
                  flagHomeUrl: m.flagHomeUrl,
                  flagAwayUrl: m.flagAwayUrl,
                  flagHomeEmoji: m.flagHomeEmoji,
                  flagAwayEmoji: m.flagAwayEmoji,
                  shortHome: m.shortHome,
                  shortAway: m.shortAway,
                  startingAt: m.startingAt,
                  kickoffLabel: m.kickoffLabel,
                  leagueName: m.leagueName,
                  roundLabel: m.roundLabel,
                  venue: m.venue,
                  toss: m.toss,
                  templates: m.templates,
                  phase: m.phase,
                }
              : m,
          ),
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update match alerts");
      await load();
    } finally {
      setBusyId(null);
      setProcessingId(null);
    }
  }

  const selectedMatch = useMemo(
    () => matches.find((m) => m.fixtureId === selectedId) ?? null,
    [matches, selectedId],
  );

  useEffect(() => {
    if (selectedMatch?.phase) setPreviewPhase(selectedMatch.phase);
  }, [selectedMatch?.fixtureId, selectedMatch?.phase]);

  const previewTpl = useMemo(() => {
    if (!selectedMatch?.templates?.length) return null;
    const raw =
      selectedMatch.templates.find((t) => t.phase === previewPhase) ?? selectedMatch.templates[0]!;
    // Harden older payloads missing flag meta after template schema change.
    return {
      ...raw,
      shortHome: raw.shortHome || selectedMatch.shortHome || selectedMatch.teamHome || "TBC",
      shortAway: raw.shortAway || selectedMatch.shortAway || selectedMatch.teamAway || "TBC",
      flagHomeUrl: raw.flagHomeUrl ?? selectedMatch.flagHomeUrl ?? null,
      flagAwayUrl: raw.flagAwayUrl ?? selectedMatch.flagAwayUrl ?? null,
    };
  }, [selectedMatch, previewPhase]);

  if (!selected) {
    return (
      <div className="card p-8 text-center text-ink-mute">Select CricRumble to manage live score alerts.</div>
    );
  }

  if (!cric) {
    return (
      <div className="card space-y-2 p-8 text-center">
        <p className="text-[15px] font-medium text-ink">CricRumble only</p>
        <p className="text-[13px] text-ink-mute">
          Live score alerts are available when the active project is CricRumble. Switch projects in the sidebar.
        </p>
      </div>
    );
  }

  const live = matches.filter((m) => m.kind === "live");
  const upcoming = matches.filter((m) => m.kind !== "live");
  const armed = matches.filter((m) => m.alertsEnabled).length;
  const autoArmed = matches.filter((m) => m.autoOnScoreUpdate).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Live scores</h1>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-mute">
            <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />
            CricRumble · auto: toss → start → live → result
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-ink hover:bg-black/[0.03] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={1.75} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-[12px]">
        <span className="rounded border border-line bg-white px-2.5 py-1 text-ink-mute">
          {matches.length} fixtures
        </span>
        <span className="rounded border border-brand-200 bg-brand-50 px-2.5 py-1 text-brand-800">
          {armed} match alert{armed === 1 ? "" : "s"} on
        </span>
        <span className="rounded border border-line bg-white px-2.5 py-1 text-ink-mute">
          {autoArmed} auto phase{autoArmed === 1 ? "" : "s"}
        </span>
      </div>

      {error ? (
        <div className="rounded-md border border-red-700/20 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {error}
        </div>
      ) : null}

      {toast ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-[13px] text-brand-900">
          <span>{toast}</span>
          <Link href="/campaigns" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            View history
          </Link>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:items-start">
        <div className="space-y-6 min-w-0">
          {loading && matches.length === 0 ? (
            <div className="rounded-lg border border-line bg-white p-8 text-center text-ink-mute">
              Loading matches…
            </div>
          ) : null}

          {!loading && matches.length === 0 ? (
            <div className="rounded-lg border border-line bg-white p-8 text-center text-ink-mute">
              No live or upcoming matches returned.
            </div>
          ) : null}

          {live.length > 0 ? (
            <MatchSection title="Live now">
              {live.map((m) => (
                <MatchCard
                  key={m.fixtureId}
                  match={m}
                  selected={m.fixtureId === selectedId}
                  busy={busyId === m.fixtureId}
                  processing={processingId === m.fixtureId}
                  onSelect={() => setSelectedId(m.fixtureId)}
                  onAlerts={(v) => void patch(m, { alertsEnabled: v })}
                  onAuto={(v) => void patch(m, { autoOnScoreUpdate: v })}
                />
              ))}
            </MatchSection>
          ) : null}

          {upcoming.length > 0 ? (
            <MatchSection title="Next matches">
              {upcoming.map((m) => (
                <MatchCard
                  key={m.fixtureId}
                  match={m}
                  selected={m.fixtureId === selectedId}
                  busy={busyId === m.fixtureId}
                  processing={processingId === m.fixtureId}
                  onSelect={() => setSelectedId(m.fixtureId)}
                  onAlerts={(v) => void patch(m, { alertsEnabled: v })}
                  onAuto={(v) => void patch(m, { autoOnScoreUpdate: v })}
                />
              ))}
            </MatchSection>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="border-b border-line px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                Notification preview
              </p>
              <div className="mt-2 flex items-center gap-3">
                {selectedMatch ? <MatchFlags match={selectedMatch} size="sm" /> : null}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">
                    {selectedMatch ? matchLabel(selectedMatch) : "Sample"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-mute">
                    {previewTpl?.description ?? "Select a match to preview templates"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {PHASE_TABS.map((tab) => {
                  const active = previewPhase === tab.id;
                  const isCurrent = selectedMatch?.phase === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPreviewPhase(tab.id)}
                      className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-800"
                          : "border-line bg-white text-ink-faint hover:border-brand-300"
                      }`}
                    >
                      {tab.label}
                      {isCurrent ? " · now" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-surface px-3 py-5">
              {previewTpl ? (
                <NotificationPreview
                  key={`${selectedMatch?.fixtureId ?? "sample"}-${previewTpl.phase}`}
                  template={previewTpl}
                  appName={selected.name}
                  appSlug={selected.slug}
                  logoUrl={selected.logoUrl}
                />
              ) : (
                <p className="text-center text-[13px] text-ink-mute">No template</p>
              )}
            </div>

            <div className="space-y-2 border-t border-line px-4 py-3 text-[12px] text-ink-mute">
              <div className="flex justify-between gap-2">
                <span>Phase</span>
                <span className="font-mono text-ink">{previewTpl?.phase ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Title</span>
                <span className="max-w-[65%] text-right font-mono text-ink">{previewTpl?.title ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Body</span>
                <span className="max-w-[65%] text-right font-mono text-ink">{previewTpl?.body ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Deep link</span>
                <span className="font-mono text-ink-faint">
                  /match/{selectedMatch?.fixtureId ?? "…"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Topic</span>
                <span className="font-mono text-ink">{selected.defaultBroadcastTopic}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MatchSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MatchCard({
  match,
  selected,
  busy,
  processing,
  onSelect,
  onAlerts,
  onAuto,
}: {
  match: CricLiveMatchRow;
  selected: boolean;
  busy: boolean;
  processing: boolean;
  onSelect: () => void;
  onAlerts: (v: boolean) => void;
  onAuto: (v: boolean) => void;
}) {
  const title = matchLabel(match);
  const isLive = match.kind === "live";
  const campaignOn = match.alertsEnabled && Boolean(match.lastNotifiedAt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`cursor-pointer rounded-lg border bg-white px-4 py-3.5 transition ${
        processing
          ? "border-brand-400 ring-1 ring-brand-400/40"
          : selected
            ? "border-brand-500 ring-1 ring-brand-500/30 shadow-[0_0_0_3px_rgba(26,107,232,0.08)]"
            : "border-line hover:border-brand-300"
      }`}
    >
      {processing ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-[13px] text-brand-900">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2} />
          <span>Processing notification… queuing campaign to all devices</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <MatchFlags match={match} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold tracking-tight text-ink">{title}</p>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  isLive ? "border-red-700/25 bg-red-50 text-red-800" : "border-line text-ink-faint"
                }`}
              >
                {isLive ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
                    live
                  </span>
                ) : (
                  match.kind
                )}
              </span>
              {campaignOn && !processing ? (
                <span className="rounded border border-emerald-700/25 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-800">
                  campaign on
                </span>
              ) : null}
              {match.alertsEnabled && !campaignOn && !processing ? (
                <span className="rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-brand-800">
                  alerts on
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-[13px] text-ink-mute">
              {[match.leagueName, match.roundLabel, match.startingAt ? fmtKickoff(match.startingAt) : null]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div
              className={`mt-2.5 inline-block rounded-md px-2.5 py-1.5 font-mono text-[13px] ${
                match.scoreLine
                  ? "bg-ink text-white"
                  : "bg-surface text-ink-faint ring-1 ring-inset ring-line"
              }`}
            >
              {match.scoreLine ?? "Score not available yet"}
            </div>

            {campaignOn && match.lastNotifiedScore ? (
              <p className="mt-2 text-[12px] text-emerald-800">
                Campaign on · sent “{match.lastNotifiedScore}” to all devices
              </p>
            ) : match.lastNotifiedScore ? (
              <p className="mt-2 text-[12px] text-ink-faint">Last notified · {match.lastNotifiedScore}</p>
            ) : null}
            {match.lastPollError ? (
              <p className="mt-1 text-[12px] text-red-700">{match.lastPollError}</p>
            ) : null}
          </div>
        </div>

        <div
          className="flex min-w-[180px] flex-col gap-3 rounded-md border border-line bg-surface-raised px-3 py-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex items-center justify-between gap-3 text-[13px] text-ink-soft">
            <span>Match alerts</span>
            <Toggle
              label={`Match alerts for ${title}`}
              checked={match.alertsEnabled || processing}
              disabled={busy || processing}
              onChange={onAlerts}
            />
          </label>
          <div className="h-px bg-line" />
          <label className="flex items-center justify-between gap-3 text-[13px] text-ink-soft">
            <span>Auto (toss / start / live / result)</span>
            <Toggle
              label={`Auto phase alerts for ${title}`}
              checked={match.autoOnScoreUpdate}
              disabled={busy || processing || !match.alertsEnabled}
              onChange={onAuto}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
