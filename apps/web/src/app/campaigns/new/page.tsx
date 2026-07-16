"use client";

import type { CampaignMode } from "@notif/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProjects } from "@/components/ProjectContext";
import { api, ApiError } from "@/lib/api";

const MODES: { value: CampaignMode; label: string; hint: string }[] = [
  { value: "BROADCAST_TOPIC", label: "Topic broadcast", hint: "Send to everyone subscribed to a topic" },
  { value: "SEGMENT", label: "Segment", hint: "Send to devices matching a saved segment" },
  { value: "SPECIFIC_TOKENS", label: "Specific tokens", hint: "Paste a list of device tokens" },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const { selected } = useProjects();

  const [mode, setMode] = useState<CampaignMode>("BROADCAST_TOPIC");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [targetTopic, setTargetTopic] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [tokensText, setTokensText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [testToken, setTestToken] = useState("");

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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

  const tokens = tokensText.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

  function buildPayload(action: "draft" | "schedule" | "send_now") {
    return {
      action,
      mode,
      title,
      body,
      imageUrl: imageUrl || undefined,
      deepLink: deepLink || undefined,
      dataJson: {},
      targetTopic: mode === "BROADCAST_TOPIC" ? targetTopic || selected!.defaultBroadcastTopic : undefined,
      segmentId: mode === "SEGMENT" ? segmentId || undefined : undefined,
      targetTokens: mode === "SPECIFIC_TOKENS" ? tokens : undefined,
      scheduledAt: action === "schedule" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  async function submit(action: "draft" | "schedule" | "send_now") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.createCampaign(selected!.id, buildPayload(action));
      setMsg({
        ok: true,
        text:
          action === "send_now"
            ? `Campaign queued (${res.campaign.id}). It will be delivered by the worker.`
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
        dataJson: {},
      });
      setMsg({ ok: res.ok, text: res.ok ? "Test notification sent." : res.error ?? "Test send failed" });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = title.trim() && body.trim();

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">New campaign</h1>
          <p className="text-sm text-slate-500">
            Sending as <span className="font-medium">{selected.name}</span> ({selected.fcmProjectId})
          </p>
        </div>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Audience</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`rounded-lg border p-3 text-left text-sm transition ${
                  mode === m.value ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="font-medium">{m.label}</div>
                <div className="text-xs text-slate-500">{m.hint}</div>
              </button>
            ))}
          </div>

          <div className="mt-4">
            {mode === "BROADCAST_TOPIC" ? (
              <div>
                <label className="label">Topic</label>
                <input
                  className="input"
                  value={targetTopic}
                  onChange={(e) => setTargetTopic(e.target.value)}
                  placeholder={selected.defaultBroadcastTopic}
                />
              </div>
            ) : null}
            {mode === "SEGMENT" ? (
              <div>
                <label className="label">Segment ID</label>
                <input className="input" value={segmentId} onChange={(e) => setSegmentId(e.target.value)} placeholder="seg_..." />
                <p className="mt-1 text-xs text-slate-400">Create segments on the Segments page and paste the ID here.</p>
              </div>
            ) : null}
            {mode === "SPECIFIC_TOKENS" ? (
              <div>
                <label className="label">Device tokens ({tokens.length})</label>
                <textarea
                  className="input h-24 font-mono text-xs"
                  value={tokensText}
                  onChange={(e) => setTokensText(e.target.value)}
                  placeholder="One token per line or comma-separated"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Content</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Big news!" />
            </div>
            <div>
              <label className="label">Body</label>
              <textarea className="input h-24" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your message…" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Image URL (optional)</label>
                <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              </div>
              <div>
                <label className="label">Deep link (optional)</label>
                <input className="input" value={deepLink} onChange={(e) => setDeepLink(e.target.value)} placeholder="app://screen/home" />
              </div>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Schedule</h2>
          <label className="label">Deliver at (optional — local time)</label>
          <input type="datetime-local" className="input max-w-xs" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </section>

        {msg ? (
          <div className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {msg.text}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" disabled={busy || !canSubmit} onClick={() => submit("draft")}>
            Save draft
          </button>
          <button className="btn-secondary" disabled={busy || !canSubmit || !scheduledAt} onClick={() => submit("schedule")}>
            Schedule
          </button>
          <button className="btn-primary" disabled={busy || !canSubmit} onClick={() => submit("send_now")}>
            Send now
          </button>
        </div>
      </div>

      {/* Preview + test send */}
      <div className="space-y-6">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Preview</h2>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-brand-600 text-center text-lg leading-8">🔔</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{title || "Notification title"}</p>
                <p className="text-sm text-slate-600">{body || "Notification body text will appear here."}</p>
                {imageUrl ? <p className="mt-1 truncate text-xs text-brand-600">🖼️ {imageUrl}</p> : null}
                {deepLink ? <p className="truncate text-xs text-slate-400">↪ {deepLink}</p> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Test send</h2>
          <label className="label">Test device token</label>
          <input className="input" value={testToken} onChange={(e) => setTestToken(e.target.value)} placeholder="tok-…" />
          <button className="btn-secondary mt-3 w-full" disabled={busy || !testToken || !canSubmit} onClick={handleTestSend}>
            Send test
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Uses the mock sender unless the API runs with FCM_DRIVER=firebase.
          </p>
        </div>
      </div>
    </div>
  );
}
