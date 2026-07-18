"use client";

import type { CampaignMode, TemplatePublic } from "@notif/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjects } from "@/components/ProjectContext";
import { api, ApiError } from "@/lib/api";

type UiTarget =
  | "TEST_DEVICE"
  | "INDIVIDUAL_TOKEN"
  | "SELECTED_USERS"
  | "ALL_REGISTERED"
  | "PROJECT_TOPIC"
  | "CUSTOM_TOPIC"
  | "SEGMENT";

const TARGETS: { value: UiTarget; label: string; hint: string }[] = [
  { value: "TEST_DEVICE", label: "Test device token", hint: "Send a one-off test (not a campaign)" },
  { value: "INDIVIDUAL_TOKEN", label: "Individual device token", hint: "One or more exact FCM tokens" },
  {
    value: "SELECTED_USERS",
    label: "Selected users",
    hint: "By userId — tokens synced from the project API (or local register)",
  },
  {
    value: "ALL_REGISTERED",
    label: "All devices (token cache)",
    hint: "Every active token in portal cache (synced from project API)",
  },
  {
    value: "PROJECT_TOPIC",
    label: "Project-wide topic",
    hint: "Firebase topic broadcast (devices must subscribeToTopic)",
  },
  { value: "CUSTOM_TOPIC", label: "Custom topic", hint: "Any FCM topic name" },
  { value: "SEGMENT", label: "Filtered segment", hint: "Devices matching a saved segment" },
];

function uiToMode(target: UiTarget): CampaignMode {
  switch (target) {
    case "ALL_REGISTERED":
      return "ALL_REGISTERED";
    case "SELECTED_USERS":
      return "SELECTED_USERS";
    case "INDIVIDUAL_TOKEN":
      return "SPECIFIC_TOKENS";
    case "SEGMENT":
      return "SEGMENT";
    case "PROJECT_TOPIC":
    case "CUSTOM_TOPIC":
    case "TEST_DEVICE":
    default:
      return "BROADCAST_TOPIC";
  }
}

const MIGRATION_NOTE =
  "Portal notifications reach devices that have updated and registered with the new notification system. Use Firebase Console during the migration period to reach older app versions.";

export default function NewCampaignPage() {
  const router = useRouter();
  const { selected } = useProjects();

  const [target, setTarget] = useState<UiTarget>("PROJECT_TOPIC");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [customData, setCustomData] = useState('{"type":"ANNOUNCEMENT"}');
  const [targetTopic, setTargetTopic] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [tokensText, setTokensText] = useState("");
  const [userIdsText, setUserIdsText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [testToken, setTestToken] = useState("");
  const [templates, setTemplates] = useState<TemplatePublic[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateVarsText, setTemplateVarsText] = useState("{}");
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refreshFromApiBeforeSend, setRefreshFromApiBeforeSend] = useState(true);

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const tokens = useMemo(
    () => tokensText.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean),
    [tokensText],
  );
  const userIds = useMemo(
    () => userIdsText.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean),
    [userIdsText],
  );

  const loadMeta = useCallback(async () => {
    if (!selected) return;
    const [tokRes, tpls] = await Promise.all([
      api.listTokens(selected.id, true).catch(() => ({ tokens: [], activeCount: 0, coverageNote: MIGRATION_NOTE })),
      api.listTemplates(selected.id).catch(() => []),
    ]);
    setActiveCount(tokRes.activeCount);
    setTemplates(tpls);
    setTargetTopic(selected.defaultBroadcastTopic);
  }, [selected]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!selected || target === "TEST_DEVICE") {
      setEstimate(null);
      return;
    }
    const mode = uiToMode(target);
    void api
      .estimateAudience(selected.id, {
        mode,
        segmentId: target === "SEGMENT" ? segmentId || undefined : undefined,
        targetUserIds: target === "SELECTED_USERS" ? userIds : undefined,
        targetTokens: target === "INDIVIDUAL_TOKEN" ? tokens : undefined,
      })
      .then((r) => setEstimate(r.estimatedRecipients))
      .catch(() => setEstimate(null));
  }, [selected, target, segmentId, userIds, tokens]);

  useEffect(() => {
    if (!templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setTitle(tpl.title);
    setBody(tpl.body);
    setImageUrl(tpl.imageUrl ?? "");
    setDeepLink(tpl.deepLink ?? "");
    setCustomData(JSON.stringify(tpl.dataJson ?? {}, null, 2));
  }, [templateId, templates]);

  if (!selected) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card p-8 text-center">
          <p className="text-lg font-medium">No project selected</p>
          <p className="mt-1 text-sm text-slate-500">Add or select a project first.</p>
        </div>
      </div>
    );
  }

  function parseDataJson(): Record<string, string> {
    try {
      const parsed = JSON.parse(customData || "{}") as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) out[k] = typeof v === "string" ? v : JSON.stringify(v);
      return out;
    } catch {
      return {};
    }
  }

  function parseTemplateVars(): Record<string, string> {
    try {
      return JSON.parse(templateVarsText || "{}") as Record<string, string>;
    } catch {
      return {};
    }
  }

  function buildPayload(action: "draft" | "schedule" | "send_now") {
    const mode = uiToMode(target);
    const topic =
      target === "PROJECT_TOPIC"
        ? selected!.defaultBroadcastTopic
        : target === "CUSTOM_TOPIC"
          ? targetTopic
          : undefined;

    return {
      action,
      mode,
      templateId: templateId || undefined,
      templateVariables: templateId ? parseTemplateVars() : undefined,
      title: templateId ? undefined : title,
      body: templateId ? undefined : body,
      imageUrl: imageUrl || undefined,
      deepLink: deepLink || undefined,
      dataJson: parseDataJson(),
      targetTopic: mode === "BROADCAST_TOPIC" ? topic || selected!.defaultBroadcastTopic : undefined,
      segmentId: mode === "SEGMENT" ? segmentId || undefined : undefined,
      targetTokens: mode === "SPECIFIC_TOKENS" ? tokens : undefined,
      targetUserIds: mode === "SELECTED_USERS" ? userIds : undefined,
      refreshFromApiBeforeSend:
        mode === "ALL_REGISTERED" || mode === "SELECTED_USERS" ? refreshFromApiBeforeSend : false,
      scheduledAt: action === "schedule" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  async function submit(action: "draft" | "schedule" | "send_now") {
    if (action === "send_now" && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    setConfirmOpen(false);
    try {
      const res = await api.createCampaign(selected!.id, buildPayload(action));
      setMsg({
        ok: true,
        text:
          action === "send_now"
            ? `Campaign queued (${res.campaign.id}). Estimated recipients: ${res.campaign.estimatedRecipients ?? "n/a"}.`
            : action === "schedule"
              ? `Campaign scheduled for ${new Date(res.campaign.scheduledAt!).toLocaleString()}.`
              : "Draft saved.",
      });
      setTimeout(() => router.push("/campaigns"), 900);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestSend() {
    if (!testToken) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.testSend(selected!.id, {
        token: testToken,
        title,
        body,
        imageUrl: imageUrl || undefined,
        deepLink: deepLink || undefined,
        dataJson: parseDataJson(),
      });
      setMsg({ ok: res.ok, text: res.ok ? "Test notification sent." : res.error ?? "Test send failed" });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(templateId) || (title.trim() && body.trim());
  const topicLabel =
    target === "PROJECT_TOPIC" ? selected.defaultBroadcastTopic : targetTopic || selected.defaultBroadcastTopic;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">New campaign</h1>
          <p className="text-sm text-slate-500">
            Project <span className="font-medium">{selected.name}</span> ({selected.projectKey ?? selected.slug}) ·
            Firebase <span className="font-mono text-xs">{selected.fcmProjectId}</span>
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {MIGRATION_NOTE}
          {activeCount !== null ? (
            <p className="mt-2 font-medium">Registered portal devices (active): {activeCount}</p>
          ) : null}
        </div>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Target type</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {TARGETS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setTarget(m.value)}
                className={`rounded-lg border p-3 text-left text-sm transition ${
                  target === m.value ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="font-medium">{m.label}</div>
                <div className="text-xs text-slate-500">{m.hint}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {target === "PROJECT_TOPIC" ? (
              <p className="text-sm text-slate-600">
                Will send to topic <code className="rounded bg-slate-100 px-1">{selected.defaultBroadcastTopic}</code>
                {selected.slug === "cricrumble" || selected.defaultBroadcastTopic === "cricrumble_all"
                  ? " (All CricRumble Users — registered + subscribed devices only)."
                  : "."}
              </p>
            ) : null}
            {target === "CUSTOM_TOPIC" ? (
              <div>
                <label className="label">Custom topic</label>
                <input className="input" value={targetTopic} onChange={(e) => setTargetTopic(e.target.value)} />
              </div>
            ) : null}
            {target === "SEGMENT" ? (
              <div>
                <label className="label">Segment ID</label>
                <input className="input" value={segmentId} onChange={(e) => setSegmentId(e.target.value)} />
              </div>
            ) : null}
            {target === "INDIVIDUAL_TOKEN" || target === "TEST_DEVICE" ? (
              <div>
                <label className="label">Device token(s)</label>
                <textarea
                  className="input h-24 font-mono text-xs"
                  value={target === "TEST_DEVICE" ? testToken : tokensText}
                  onChange={(e) =>
                    target === "TEST_DEVICE" ? setTestToken(e.target.value) : setTokensText(e.target.value)
                  }
                  placeholder="FCM registration token"
                />
              </div>
            ) : null}
            {target === "SELECTED_USERS" ? (
              <div>
                <label className="label">User IDs</label>
                <textarea
                  className="input h-24 font-mono text-xs"
                  value={userIdsText}
                  onChange={(e) => setUserIdsText(e.target.value)}
                  placeholder="One userId per line"
                />
              </div>
            ) : null}
            {target === "ALL_REGISTERED" ? (
              <p className="text-sm text-slate-600">
                Multicast to every <strong>active</strong> token in the portal cache for this project
                (usually synced from the project API).
              </p>
            ) : null}
            {target === "ALL_REGISTERED" || target === "SELECTED_USERS" ? (
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={refreshFromApiBeforeSend}
                  onChange={(e) => setRefreshFromApiBeforeSend(e.target.checked)}
                  disabled={!selected.tokenSourceEnabled}
                />
                <span>
                  Live refresh from project API before send
                  {!selected.tokenSourceEnabled ? (
                    <span className="block text-xs text-amber-700">
                      Enable Project token API in project settings first.
                    </span>
                  ) : (
                    <span className="block text-xs text-slate-500">
                      Pulls latest tokens into cache, then sends via Firebase.
                    </span>
                  )}
                </span>
              </label>
            ) : null}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Template</h2>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Inline content (no template)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {templateId ? (
            <div className="mt-3">
              <label className="label">Template variables (JSON)</label>
              <textarea
                className="input h-28 font-mono text-xs"
                value={templateVarsText}
                onChange={(e) => setTemplateVarsText(e.target.value)}
                placeholder='{"teamA":"India","teamB":"Australia","matchId":"m1","matchTime":"7:30 PM","imageUrl":"https://..."}'
              />
            </div>
          ) : null}
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Content</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Body</label>
              <textarea className="input h-24" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Image URL</label>
                <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              </div>
              <div>
                <label className="label">Deep link</label>
                <input className="input" value={deepLink} onChange={(e) => setDeepLink(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Custom data (JSON string map)</label>
              <textarea className="input h-24 font-mono text-xs" value={customData} onChange={(e) => setCustomData(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 text-sm text-slate-500">
              <p>Android channel: {selected.androidChannelId ?? "project default / none"}</p>
              <p>iOS: APNs via Firebase project credentials on the worker</p>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Schedule</h2>
          <input type="datetime-local" className="input max-w-xs" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </section>

        {msg ? (
          <div className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {msg.text}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {target === "TEST_DEVICE" ? (
            <button className="btn-primary" disabled={busy || !testToken || !canSubmit} onClick={handleTestSend}>
              Send test
            </button>
          ) : (
            <>
              <button className="btn-secondary" disabled={busy || !canSubmit} onClick={() => submit("draft")}>
                Save draft
              </button>
              <button className="btn-secondary" disabled={busy || !canSubmit || !scheduledAt} onClick={() => submit("schedule")}>
                Schedule
              </button>
              <button className="btn-primary" disabled={busy || !canSubmit} onClick={() => submit("send_now")}>
                Send now
              </button>
            </>
          )}
        </div>

        {confirmOpen ? (
          <div className="card border-brand-200 bg-brand-50 p-5 text-sm">
            <p className="font-semibold">Confirm send</p>
            <ul className="mt-2 list-inside list-disc text-slate-700">
              <li>Project: {selected.name}</li>
              <li>Target: {TARGETS.find((t) => t.value === target)?.label}</li>
              <li>Topic / value: {target.includes("TOPIC") ? topicLabel : target}</li>
              <li>Estimated recipients: {estimate ?? "n/a"}</li>
              <li>Title: {title}</li>
            </ul>
            <p className="mt-3 text-amber-800">{MIGRATION_NOTE}</p>
            <div className="mt-4 flex gap-2">
              <button className="btn-primary" disabled={busy} onClick={() => submit("send_now")}>
                Confirm &amp; queue
              </button>
              <button className="btn-secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Registered devices</dt>
              <dd className="font-medium">{activeCount ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Estimated recipients</dt>
              <dd className="font-medium">{estimate ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Target type</dt>
              <dd className="font-medium">{TARGETS.find((t) => t.value === target)?.label}</dd>
            </div>
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Template preview</h2>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="truncate text-sm font-semibold">{title || "Notification title"}</p>
            <p className="text-sm text-slate-600">{body || "Notification body text will appear here."}</p>
            {imageUrl ? <p className="mt-1 truncate text-xs text-brand-600">{imageUrl}</p> : null}
            {deepLink ? <p className="truncate text-xs text-slate-500">Deep link: {deepLink}</p> : null}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Test send</h2>
          <label className="label">Test device token</label>
          <input className="input" value={testToken} onChange={(e) => setTestToken(e.target.value)} />
          <button className="btn-secondary mt-3 w-full" disabled={busy || !testToken || !canSubmit} onClick={handleTestSend}>
            Send test
          </button>
        </div>
      </div>
    </div>
  );
}
