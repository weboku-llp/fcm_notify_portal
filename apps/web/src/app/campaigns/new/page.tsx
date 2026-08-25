"use client";

import type { CampaignMode, TemplatePublic } from "@notif/contracts";
import { normalizeNotificationImageUrl } from "@notif/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NotificationPreview } from "@/components/NotificationPreview";
import { useProjects } from "@/components/ProjectContext";
import { api, ApiError } from "@/lib/api";
import { fcmImageWarning } from "@/lib/fcm-image";
import { isInfluventure } from "@/lib/brand";
import { templateVarPlaceholder } from "@/lib/template-samples";

type UiTarget = "ALL_REGISTERED" | "PROJECT_TOPIC" | "TEST_DEVICE";

const TARGETS: { value: UiTarget; label: string; hint: string }[] = [
  {
    value: "ALL_REGISTERED",
    label: "All users",
    hint: "Send to every active device token — shows real sent / failed counts",
  },
  {
    value: "PROJECT_TOPIC",
    label: "Topic broadcast",
    hint: "Firebase topic only — no per-device sent/failed counts",
  },
  {
    value: "TEST_DEVICE",
    label: "Test one device",
    hint: "One-off test send — not saved as a campaign",
  },
];

function uiToMode(target: UiTarget): CampaignMode {
  return target === "ALL_REGISTERED" ? "ALL_REGISTERED" : "BROADCAST_TOPIC";
}

function renderTpl(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    return v != null && v !== "" ? v : `{{${k}}}`;
  });
}

/** Local calendar date helpers for Daily Update templates. */
function todayParts(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    dateLabel: `${d.getDate()} ${months[d.getMonth()]}`,
    updateId: `upd-${yyyy}${mm}${dd}`,
  };
}

function defaultVarValue(key: string): string {
  const today = todayParts();
  if (key === "dateLabel") return today.dateLabel;
  if (key === "updateId") return today.updateId;
  return "";
}

export default function NewCampaignPage() {
  const router = useRouter();
  const { selected, refresh } = useProjects();

  const [target, setTarget] = useState<UiTarget>("ALL_REGISTERED");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [customData, setCustomData] = useState('{"type":"ANNOUNCEMENT"}');
  const [scheduledAt, setScheduledAt] = useState("");
  const [testToken, setTestToken] = useState("");
  const [templates, setTemplates] = useState<TemplatePublic[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refreshFromApiBeforeSend, setRefreshFromApiBeforeSend] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMeta = useCallback(async () => {
    if (!selected) return;
    const [tokRes, tpls] = await Promise.all([
      api.listTokens(selected.id, true).catch(() => ({ tokens: [], activeCount: 0, coverageNote: "" })),
      api.listTemplates(selected.id).catch(() => []),
    ]);
    setActiveCount(tokRes.activeCount);
    setTemplates(tpls);
  }, [selected]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const activeTemplate = useMemo(
    () => (templateId ? templates.find((t) => t.id === templateId) ?? null : null),
    [templateId, templates],
  );

  useEffect(() => {
    if (!activeTemplate) {
      setTemplateVars({});
      return;
    }
    setTitle(activeTemplate.title);
    setBody(activeTemplate.body);
    setImageUrl(activeTemplate.imageUrl ?? "");
    setDeepLink(activeTemplate.deepLink ?? "");
    setCustomData(JSON.stringify(activeTemplate.dataJson ?? {}, null, 2));
    // Auto-fill dateLabel + updateId for Daily Update-style templates.
    setTemplateVars(
      Object.fromEntries(activeTemplate.variables.map((v) => [v, defaultVarValue(v)])),
    );
  }, [activeTemplate]);

  const previewTitle = activeTemplate ? renderTpl(title, templateVars) : title;
  const previewBody = activeTemplate ? renderTpl(body, templateVars) : body;
  const previewImage = activeTemplate ? renderTpl(imageUrl, templateVars) : imageUrl;
  const previewDeepLink = activeTemplate ? renderTpl(deepLink, templateVars) : deepLink;
  // Template expressions like {{imageUrl}} are resolved via variables; only
  // validate the final preview URL (or a freeform override when the template
  // has no image of its own).
  const imageUrlCheck = normalizeNotificationImageUrl(previewImage);
  const imageUrlError =
    !previewImage.trim() || /\{\{/.test(previewImage)
      ? null
      : imageUrlCheck.ok
        ? null
        : imageUrlCheck.message;
  /** When the template defines imageUrl (literal or {{var}}), keep it locked. */
  const imageFromTemplate = Boolean(activeTemplate?.imageUrl?.trim());
  const imageEditable = !imageFromTemplate;

  const missingVars = activeTemplate
    ? activeTemplate.variables.filter((v) => !(templateVars[v] ?? "").trim())
    : [];

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

  function buildPayload(action: "draft" | "schedule" | "send_now") {
    const mode = uiToMode(target);
    return {
      action,
      mode,
      templateId: templateId || undefined,
      templateVariables: templateId ? templateVars : undefined,
      title: templateId ? undefined : title,
      body: templateId ? undefined : body,
      // Optional rich-push image: send when the operator set a concrete URL
      // (including override on templates that have no built-in image).
      imageUrl: imageUrlCheck.ok ? (imageUrlCheck.imageUrl ?? undefined) : undefined,
      deepLink: templateId ? undefined : deepLink || undefined,
      dataJson: templateId ? undefined : parseDataJson(),
      targetTopic: mode === "BROADCAST_TOPIC" ? selected!.defaultBroadcastTopic : undefined,
      refreshFromApiBeforeSend: mode === "ALL_REGISTERED" ? refreshFromApiBeforeSend : false,
      scheduledAt: action === "schedule" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  function guardImageUrl(): boolean {
    if (!imageUrlError) return true;
    setMsg({ ok: false, text: imageUrlError });
    return false;
  }

  async function submit(action: "draft" | "schedule" | "send_now") {
    if (!guardImageUrl()) return;
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
            ? `Queued. Active devices in cache: ${res.campaign.estimatedRecipients ?? activeCount ?? "n/a"}.`
            : action === "schedule"
              ? `Scheduled for ${new Date(res.campaign.scheduledAt!).toLocaleString()}.`
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
    if (!guardImageUrl()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.testSend(selected!.id, {
        token: testToken,
        title: previewTitle,
        body: previewBody,
        imageUrl: imageUrlCheck.ok ? (imageUrlCheck.imageUrl ?? undefined) : undefined,
        deepLink: previewDeepLink.trim() || undefined,
        dataJson: Object.fromEntries(
          Object.entries(parseDataJson()).map(([k, v]) => [k, renderTpl(v, templateVars)]),
        ),
      });
      setMsg({ ok: res.ok, text: res.ok ? "Test notification sent." : res.error ?? "Test send failed" });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    ((Boolean(templateId) && missingVars.length === 0) ||
      (!templateId && Boolean(title.trim() && body.trim()))) &&
    !imageUrlError;
  const apiSyncOn = Boolean(
    selected.tokenSourceEnabled && selected.tokenSourceApiBaseUrl && selected.hasTokenSourceApiKey,
  );
  const estimate = activeCount;

  async function syncTokensFromProjectApi() {
    if (!selected) return;
    setSyncBusy(true);
    setMsg(null);
    try {
      const res = await api.syncTokenSource(selected.id);
      await refresh();
      await loadMeta();
      setMsg({
        ok: res.ok,
        text: `Synced ${res.upserted} token(s)${res.deactivated ? `, deactivated ${res.deactivated}` : ""}.`,
      });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Compose</h1>
          <p className="text-sm text-slate-500">
            {selected.name} · topic{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">{selected.defaultBroadcastTopic}</code>
          </p>
        </div>

        <section
          className={`rounded-lg border p-4 text-sm ${
            apiSyncOn ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                Active devices: <span className="tabular-nums">{activeCount ?? "—"}</span>
                {apiSyncOn ? (
                  <span className="ml-2 text-xs font-normal opacity-80">
                    last sync{" "}
                    {selected.tokenSourceLastSyncAt
                      ? new Date(selected.tokenSourceLastSyncAt).toLocaleString()
                      : "never"}
                  </span>
                ) : (
                  <span className="ml-2 text-xs font-normal">API sync off</span>
                )}
              </p>
            </div>
            {apiSyncOn ? (
              <button
                type="button"
                className="btn-secondary h-9"
                disabled={syncBusy || busy}
                onClick={() => void syncTokensFromProjectApi()}
              >
                {syncBusy ? "Syncing…" : "Sync now"}
              </button>
            ) : (
              <Link
                href={`/projects/${selected.id}?tab=settings`}
                className="btn-primary h-9 inline-flex items-center justify-center px-3"
              >
                Configure API
              </Link>
            )}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Send to</h2>
          <div className="grid gap-3 sm:grid-cols-3">
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
                <div className="mt-0.5 text-xs text-slate-500">{m.hint}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {target === "ALL_REGISTERED" ? (
              <>
                <p className="text-sm text-slate-600">
                  Sends to each of the <strong>{activeCount ?? 0}</strong> active device(s). History will show exact
                  Sent / Failed counts per device.
                </p>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={refreshFromApiBeforeSend}
                    onChange={(e) => setRefreshFromApiBeforeSend(e.target.checked)}
                    disabled={!apiSyncOn}
                  />
                  <span>
                    Refresh tokens from project API before send
                    {!apiSyncOn ? (
                      <span className="block text-xs text-amber-700">Configure API sync first.</span>
                    ) : null}
                  </span>
                </label>
              </>
            ) : null}
            {target === "PROJECT_TOPIC" ? (
              <p className="text-sm text-slate-600">
                One Firebase call to topic{" "}
                <code className="rounded bg-slate-100 px-1">{selected.defaultBroadcastTopic}</code>. Firebase does
                not return per-device results for topics — prefer <strong>All users</strong> when you need Sent /
                Failed counts.
              </p>
            ) : null}
            {target === "TEST_DEVICE" ? (
              <div>
                <label className="label">Device token</label>
                <textarea
                  className="input h-20 font-mono text-xs"
                  value={testToken}
                  onChange={(e) => setTestToken(e.target.value)}
                  placeholder="Paste one FCM registration token"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Content</h2>
          {templates.length > 0 ? (
            <div className="mb-4">
              <label className="label">Template (optional)</label>
              <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Write inline</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {activeTemplate ? (
                <p className="mt-1.5 text-xs text-slate-500">
                  Fill the variables below — they replace {"{{…}}"} in the template when you send.
                </p>
              ) : null}
            </div>
          ) : null}

          {activeTemplate && activeTemplate.variables.length > 0 ? (
            <div className="mb-5 space-y-3 rounded-lg border border-brand-200 bg-brand-50/60 p-4">
              <div>
                <p className="text-sm font-semibold text-ink">Template variables</p>
                <p className="text-xs text-slate-500">You type today’s values here. Nothing is auto-fetched.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeTemplate.variables.map((key) => (
                  <div key={key} className={key === "summary" || key === "headline" ? "sm:col-span-2" : ""}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="label mb-0">{key}</label>
                      {key === "updateId" ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-600 hover:text-brand-700"
                          onClick={() =>
                            setTemplateVars((prev) => ({ ...prev, updateId: todayParts().updateId }))
                          }
                        >
                          Regenerate
                        </button>
                      ) : null}
                    </div>
                    <input
                      className="input"
                      value={templateVars[key] ?? ""}
                      onChange={(e) => setTemplateVars((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={templateVarPlaceholder(key, {
                        influventure: isInfluventure(selected.slug),
                      })}
                      required
                    />
                    {key === "campaignId" && isInfluventure(selected.slug) ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                        Deep link opens{" "}
                        <code className="rounded bg-white px-1 text-[11px]">
                          /campaigns/{(templateVars.campaignId || "…").trim() || "…"}
                        </code>{" "}
                        in the Influventure app.
                      </p>
                    ) : null}
                    {key === "updateId" ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                        Needed so the app can open the matching article when someone taps the
                        notification. It becomes the deep link{" "}
                        <code className="rounded bg-white px-1 text-[11px]">
                          /updates/{(templateVars.updateId || todayParts().updateId).trim() || "…"}
                        </code>
                        .
                      </p>
                    ) : null}
                    {key === "imageUrl" && imageUrlError ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-red-700">{imageUrlError}</p>
                    ) : null}
                    {key === "imageUrl" && !imageUrlError ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                        Must be a public <code className="text-[11px]">https://</code> URL. Invalid
                        values are blocked before send (FCM rejects them for every device).
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              {missingVars.length > 0 ? (
                <p className="text-xs text-amber-800">Missing: {missingVars.join(", ")}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={Boolean(activeTemplate)}
                readOnly={Boolean(activeTemplate)}
              />
              {activeTemplate ? (
                <p className="mt-1 text-xs text-slate-500">From template — rendered preview uses your variables.</p>
              ) : null}
            </div>
            <div>
              <label className="label">Body</label>
              <textarea
                className="input h-24"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={Boolean(activeTemplate)}
                readOnly={Boolean(activeTemplate)}
              />
            </div>
            <div>
              <label className="label">Image URL</label>
              <input
                className={`input ${imageUrlError ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""}`}
                type={imageEditable ? "url" : "text"}
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://cdn.example.com/notification-image.png"
                disabled={!imageEditable}
                readOnly={!imageEditable}
              />
              {imageFromTemplate ? (
                <p className="mt-1 text-xs text-slate-500">
                  From template — set the <code className="text-[11px]">imageUrl</code> variable above,
                  or switch to “Write inline” to paste a URL here.
                </p>
              ) : null}
              {imageUrlError ? (
                <p className="mt-1.5 text-xs leading-relaxed text-red-700">{imageUrlError}</p>
              ) : (() => {
                const warn = fcmImageWarning(previewImage);
                return warn ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
                    {warn} Browser preview can still show it even when phones cannot download it.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    Optional. Paste a public https URL ending in .jpg / .png / .webp — Google
                    thumbnail / gstatic links usually fail on devices.
                  </p>
                );
              })()}
              {previewImage.trim() && /^https?:\/\//i.test(previewImage.trim()) ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewImage.trim()}
                    alt="Notification preview"
                    className="max-h-40 w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              ) : null}
            </div>
            <div>
              <label className="label">Deep link</label>
              <input
                className="input"
                value={deepLink}
                onChange={(e) => setDeepLink(e.target.value)}
                placeholder={
                  isInfluventure(selected.slug)
                    ? "/campaigns/…"
                    : `/updates/${todayParts().updateId}`
                }
                disabled={Boolean(activeTemplate)}
                readOnly={Boolean(activeTemplate)}
              />
              {!activeTemplate ? (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Opens this path in the app when someone taps the notification.
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  From template — filled from your template variables when you send.
                </p>
              )}
            </div>
            <div>
              <label className="label">Custom data (JSON)</label>
              <textarea
                className="input h-20 font-mono text-xs"
                value={customData}
                onChange={(e) => setCustomData(e.target.value)}
                disabled={Boolean(activeTemplate)}
                readOnly={Boolean(activeTemplate)}
              />
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Schedule (optional)</h2>
          <input
            type="datetime-local"
            className="input max-w-xs"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </section>

        {msg ? (
          <div
            className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
          >
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
              <button className="btn-secondary" disabled={busy || !canSubmit} onClick={() => void submit("draft")}>
                Save draft
              </button>
              <button
                className="btn-secondary"
                disabled={busy || !canSubmit || !scheduledAt}
                onClick={() => void submit("schedule")}
              >
                Schedule
              </button>
              <button className="btn-primary" disabled={busy || !canSubmit} onClick={() => void submit("send_now")}>
                Send now
              </button>
            </>
          )}
        </div>

        {confirmOpen ? (
          <div className="card border-brand-200 bg-brand-50 p-5 text-sm">
            <p className="font-semibold">Confirm send</p>
            <ul className="mt-2 list-inside list-disc text-slate-700">
              <li>{TARGETS.find((t) => t.value === target)?.label}</li>
              {target === "PROJECT_TOPIC" ? <li>Topic: {selected.defaultBroadcastTopic}</li> : null}
              <li>Devices: {estimate ?? "—"}</li>
              {previewImage.trim() ? <li>Image: {previewImage.trim()}</li> : null}
              <li>Title: {previewTitle}</li>
            </ul>
            <div className="mt-4 flex gap-2">
              <button className="btn-primary" disabled={busy} onClick={() => void submit("send_now")}>
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
              <dt className="text-slate-500">Active devices</dt>
              <dd className="font-medium tabular-nums">{activeCount ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Estimated recipients</dt>
              <dd className="font-medium tabular-nums">{target === "TEST_DEVICE" ? "1" : (estimate ?? "—")}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Send to</dt>
              <dd className="font-medium text-right">{TARGETS.find((t) => t.value === target)?.label}</dd>
            </div>
          </dl>
          {target === "PROJECT_TOPIC" ? (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Topic broadcast cannot report per-device Sent / Failed. Use All users for those counts.
            </p>
          ) : null}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Preview</h2>
          <NotificationPreview
            title={previewTitle}
            body={previewBody}
            imageUrl={previewImage}
            appName={selected.name}
            appSlug={selected.slug}
            logoUrl={selected.logoUrl}
          />
          {previewDeepLink.trim() ? (
            <p className="mt-3 truncate font-mono text-[11px] text-slate-500">→ {previewDeepLink.trim()}</p>
          ) : null}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Quick test</h2>
          <label className="label">Device token</label>
          <input className="input font-mono text-xs" value={testToken} onChange={(e) => setTestToken(e.target.value)} />
          <button
            className="btn-secondary mt-3 w-full"
            disabled={busy || !testToken || !canSubmit}
            onClick={handleTestSend}
          >
            Send test
          </button>
        </div>
      </div>
    </div>
  );
}
