"use client";

import type { CampaignMode, CampaignPublic, ProjectPublic, TemplatePublic } from "@notif/contracts";
import { normalizeNotificationImageUrl } from "@notif/contracts";
import { Copy, RefreshCw, Send, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { NotificationPreview } from "@/components/NotificationPreview";
import { api, ApiError } from "@/lib/api";
import { isInfluventure } from "@/lib/brand";
import { fcmImageWarning } from "@/lib/fcm-image";
import { templateVarPlaceholder } from "@/lib/template-samples";

export type CampaignReuseIntent = "resend" | "duplicate" | "send";

type FormState = {
  title: string;
  body: string;
  imageUrl: string;
  deepLink: string;
  mode: CampaignMode;
};

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

function renderTpl(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    return v != null && v !== "" ? v : `{{${k}}}`;
  });
}

/** Pull a single {{var}} value out of a rendered string when the template has one placeholder. */
function extractSingleVar(template: string | null | undefined, rendered: string | null | undefined, varName: string): string | null {
  if (!template || rendered == null || rendered === "") return null;
  const placeholders = [...template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)];
  if (placeholders.length !== 1 || placeholders[0][1] !== varName) return null;
  const full = placeholders[0][0];
  const idx = placeholders[0].index ?? 0;
  const before = template.slice(0, idx);
  const after = template.slice(idx + full.length);
  if (!rendered.startsWith(before) || !rendered.endsWith(after)) return null;
  return rendered.slice(before.length, rendered.length - after.length);
}

function seedVarsFromCampaign(tpl: TemplatePublic, c: CampaignPublic): Record<string, string> {
  const today = todayParts();
  const vars: Record<string, string> = Object.fromEntries(
    tpl.variables.map((v) => [v, v === "dateLabel" ? today.dateLabel : v === "updateId" ? today.updateId : ""]),
  );

  // Daily Update body: "{{headline}} — {{summary}}"
  if (tpl.body.includes("{{headline}}") && tpl.body.includes("{{summary}}") && c.body) {
    const sep = " — ";
    const idx = c.body.indexOf(sep);
    if (idx >= 0) {
      vars.headline = c.body.slice(0, idx);
      vars.summary = c.body.slice(idx + sep.length);
    } else {
      vars.headline = c.body;
    }
  }

  for (const key of tpl.variables) {
    if (vars[key]) continue;
    const fromTitle = extractSingleVar(tpl.title, c.title, key);
    const fromBody = extractSingleVar(tpl.body, c.body, key);
    const fromImage = extractSingleVar(tpl.imageUrl, c.imageUrl, key);
    const fromLink = extractSingleVar(tpl.deepLink, c.deepLink, key);
    vars[key] = fromTitle ?? fromBody ?? fromImage ?? fromLink ?? "";
  }

  if (tpl.variables.includes("imageUrl") && !vars.imageUrl && c.imageUrl) {
    vars.imageUrl = c.imageUrl;
  }

  // Fresh date / deep-link target for a new send.
  if (tpl.variables.includes("dateLabel")) vars.dateLabel = today.dateLabel;
  if (tpl.variables.includes("updateId")) vars.updateId = today.updateId;

  return vars;
}

function toForm(c: CampaignPublic): FormState {
  return {
    title: c.title,
    body: c.body,
    imageUrl: c.imageUrl ?? "",
    deepLink: c.deepLink ?? "",
    mode: c.mode === "BROADCAST_TOPIC" ? "BROADCAST_TOPIC" : "ALL_REGISTERED",
  };
}

function varPlaceholder(key: string, projectSlug?: string | null): string {
  return templateVarPlaceholder(key, { influventure: isInfluventure(projectSlug) });
}

export function ResendCampaignModal({
  campaign,
  project,
  intent = "resend",
  onClose,
  onDone,
}: {
  campaign: CampaignPublic;
  project: ProjectPublic;
  intent?: CampaignReuseIntent;
  onClose: () => void;
  onDone: (result: { action: "draft" | "send_now" }) => void;
}) {
  const titleId = useId();
  const [form, setForm] = useState<FormState>(() => toForm(campaign));
  const [template, setTemplate] = useState<TemplatePublic | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [tplLoading, setTplLoading] = useState(Boolean(campaign.templateId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(toForm(campaign));
    setError(null);
    setTemplate(null);
    setTemplateVars({});
    setTplLoading(true);

    let cancelled = false;
    void (async () => {
      try {
        const templates = await api.listTemplates(project.id);
        if (cancelled) return;
        // Prefer the campaign's template; fall back for older duplicates that lost templateId.
        const byId = campaign.templateId
          ? templates.find((t) => t.id === campaign.templateId)
          : undefined;
        const byDailyUpdate =
          !byId && campaign.title.startsWith("Daily Update")
            ? templates.find((t) => t.name === "Daily Update" && t.variables.includes("headline"))
            : undefined;
        const tpl = byId ?? byDailyUpdate ?? null;
        setTemplate(tpl);
        if (tpl && tpl.variables.length > 0) {
          setTemplateVars(seedVarsFromCampaign(tpl, campaign));
        }
      } catch {
        if (!cancelled) setTemplate(null);
      } finally {
        if (!cancelled) setTplLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [campaign, intent, project.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const useTemplate = Boolean(template && template.variables.length > 0);
  /** Template defines its own image (literal or {{imageUrl}}) — keep that field locked. */
  const imageFromTemplate = Boolean(template?.imageUrl?.trim());
  const imageEditable = !useTemplate || !imageFromTemplate;

  const previewTitle = useTemplate ? renderTpl(template!.title, templateVars) : form.title;
  const previewBody = useTemplate ? renderTpl(template!.body, templateVars) : form.body;
  // Prefer template image when present; otherwise allow a freeform CDN override on form.imageUrl.
  const previewImage =
    useTemplate && imageFromTemplate
      ? renderTpl(template!.imageUrl ?? "", templateVars)
      : form.imageUrl;
  const previewDeepLink = useTemplate
    ? renderTpl(template!.deepLink ?? "", templateVars)
    : form.deepLink;
  const imageUrlCheck = normalizeNotificationImageUrl(previewImage);
  const imageUrlError =
    !previewImage.trim() || /\{\{/.test(previewImage)
      ? null
      : imageUrlCheck.ok
        ? null
        : imageUrlCheck.message;

  const missingVars = useMemo(
    () => (useTemplate ? template!.variables.filter((v) => !(templateVars[v] ?? "").trim()) : []),
    [useTemplate, template, templateVars],
  );

  const canSubmit =
    (useTemplate
      ? missingVars.length === 0
      : Boolean(form.title.trim() && form.body.trim())) && !imageUrlError;
  const isDuplicate = intent === "duplicate";
  const isSendDraft = intent === "send";

  async function submit(action: "draft" | "send_now") {
    if (!canSubmit || busy) return;
    if (imageUrlError) {
      setError(imageUrlError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (useTemplate && template) {
        await api.createCampaign(project.id, {
          action,
          mode: form.mode,
          templateId: template.id,
          templateVariables: templateVars,
          // Optional rich-push override when the template has no built-in image.
          imageUrl: imageUrlCheck.ok ? (imageUrlCheck.imageUrl ?? undefined) : undefined,
          targetTopic: form.mode === "BROADCAST_TOPIC" ? project.defaultBroadcastTopic : undefined,
          refreshFromApiBeforeSend: action === "send_now" && form.mode === "ALL_REGISTERED",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } else {
        await api.createCampaign(project.id, {
          action,
          mode: form.mode,
          title: form.title.trim(),
          body: form.body.trim(),
          imageUrl: imageUrlCheck.ok ? (imageUrlCheck.imageUrl ?? undefined) : undefined,
          deepLink: form.deepLink.trim() || undefined,
          dataJson: campaign.dataJson ?? {},
          targetTopic: form.mode === "BROADCAST_TOPIC" ? project.defaultBroadcastTopic : undefined,
          refreshFromApiBeforeSend: action === "send_now" && form.mode === "ALL_REGISTERED",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }
      onDone({ action });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-line bg-surface-card shadow-[0_24px_60px_-24px_rgba(11,13,18,0.55)]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div>
            <h2 id={titleId} className="text-[16px] font-semibold tracking-tight text-ink">
              {isDuplicate ? "Duplicate update" : isSendDraft ? "Send draft" : "Resend update"}
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-mute">
              {isDuplicate
                ? `Edit a copy for ${project.name}. Save as draft or send now — the original row stays unchanged.`
                : isSendDraft
                  ? `Review this draft for ${project.name}, edit if needed, then send now.`
                  : `Edit content, preview on the right, then queue a new send for ${project.name}.`}
            </p>
          </div>
          <button type="button" className="btn-secondary h-8 px-2" onClick={onClose} disabled={busy} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3 border-b border-line p-4 sm:p-5 lg:border-b-0 lg:border-r">
            {tplLoading ? (
              <p className="text-[13px] text-ink-mute">Loading template fields…</p>
            ) : null}

            {useTemplate ? (
              <div className="space-y-3 rounded-md border border-brand-200 bg-brand-50/60 p-3">
                <div>
                  <p className="text-[13px] font-semibold text-ink">{template!.name} variables</p>
                  <p className="text-[11px] text-ink-faint">
                    Edit today’s values — title and body update from the template.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {template!.variables.map((key) => (
                    <div key={key} className={key === "summary" || key === "headline" ? "sm:col-span-2" : ""}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="label mb-0">{key}</label>
                        {key === "updateId" ? (
                          <button
                            type="button"
                            className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                            disabled={busy}
                            onClick={() =>
                              setTemplateVars((prev) => ({ ...prev, updateId: todayParts().updateId }))
                            }
                          >
                            Regenerate
                          </button>
                        ) : null}
                      </div>
                      {key === "summary" || key === "headline" || key === "message" ? (
                        <textarea
                          className="input h-20"
                          value={templateVars[key] ?? ""}
                          onChange={(e) => setTemplateVars((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={varPlaceholder(key, project.slug)}
                          disabled={busy}
                          required
                        />
                      ) : (
                        <input
                          className="input"
                          value={templateVars[key] ?? ""}
                          onChange={(e) => setTemplateVars((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={varPlaceholder(key, project.slug)}
                          disabled={busy}
                          required
                        />
                      )}
                      {key === "updateId" ? (
                        <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                          Deep link becomes{" "}
                          <code className="rounded bg-white px-1 text-[11px]">
                            /updates/{(templateVars.updateId || todayParts().updateId).trim() || "…"}
                          </code>
                        </p>
                      ) : null}
                      {key === "imageUrl" && fcmImageWarning(templateVars.imageUrl) ? (
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                          {fcmImageWarning(templateVars.imageUrl)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {missingVars.length > 0 ? (
                  <p className="text-[11px] text-amber-800">Missing: {missingVars.join(", ")}</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={useTemplate ? previewTitle : form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                disabled={busy || useTemplate}
                readOnly={useTemplate}
              />
              {useTemplate ? (
                <p className="mt-1 text-[11px] text-ink-faint">From template — uses your variables above.</p>
              ) : null}
            </div>
            <div>
              <label className="label">Body</label>
              <textarea
                className="input h-28"
                value={useTemplate ? previewBody : form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                disabled={busy || useTemplate}
                readOnly={useTemplate}
              />
            </div>
            <div>
              <label className="label">Image URL</label>
              <input
                className={`input ${imageUrlError ? "border-red-400 focus:border-red-500" : ""}`}
                type={imageEditable ? "url" : "text"}
                value={useTemplate && imageFromTemplate ? previewImage : form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://cdn.example.com/update.jpg"
                disabled={busy || !imageEditable}
                readOnly={!imageEditable}
              />
              {useTemplate && imageFromTemplate ? (
                <p className="mt-1 text-[11px] text-ink-faint">
                  From template — set the <code className="text-[11px]">imageUrl</code> variable
                  above if present.
                </p>
              ) : null}
              {imageUrlError ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-red-700">{imageUrlError}</p>
              ) : (() => {
                const warn = fcmImageWarning(previewImage);
                return warn ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800">
                    {warn} Preview can still show it in the browser even when phones cannot download
                    it.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Optional. Paste a public https URL ending in .jpg / .png / .webp. Google
                    thumbnail links will not show on devices.
                  </p>
                );
              })()}
              {previewImage.trim() && /^https?:\/\//i.test(previewImage.trim()) ? (
                <div className="mt-2 overflow-hidden rounded-md border border-line bg-surface-raised">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewImage.trim()}
                    alt="Notification preview"
                    className="max-h-32 w-full object-cover"
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
                value={useTemplate ? previewDeepLink : form.deepLink}
                onChange={(e) => setForm((f) => ({ ...f, deepLink: e.target.value }))}
                placeholder="/updates/…"
                disabled={busy || useTemplate}
                readOnly={useTemplate}
              />
            </div>
            <div>
              <label className="label">Send to</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setForm((f) => ({ ...f, mode: "ALL_REGISTERED" }))}
                  className={`rounded-md border p-2.5 text-left text-[13px] ${
                    form.mode === "ALL_REGISTERED"
                      ? "border-brand-500 bg-brand-50 text-ink"
                      : "border-line bg-white text-ink-soft hover:border-slate-300"
                  }`}
                >
                  <div className="font-medium">All users</div>
                  <div className="text-[11px] text-ink-faint">Per-device sent / failed counts</div>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setForm((f) => ({ ...f, mode: "BROADCAST_TOPIC" }))}
                  className={`rounded-md border p-2.5 text-left text-[13px] ${
                    form.mode === "BROADCAST_TOPIC"
                      ? "border-brand-500 bg-brand-50 text-ink"
                      : "border-line bg-white text-ink-soft hover:border-slate-300"
                  }`}
                >
                  <div className="font-medium">Topic broadcast</div>
                  <div className="truncate text-[11px] text-ink-faint">{project.defaultBroadcastTopic}</div>
                </button>
              </div>
            </div>

            {error ? (
              <div className="border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</div>
            ) : null}
          </div>

          <aside className="bg-surface-raised p-4 sm:p-5">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Preview</p>
            <NotificationPreview
              title={previewTitle}
              body={previewBody}
              imageUrl={previewImage}
              appName={project.name}
              appSlug={project.slug}
              logoUrl={project.logoUrl}
            />
            {previewDeepLink.trim() ? (
              <p className="mt-3 truncate font-mono text-[11px] text-ink-faint">→ {previewDeepLink.trim()}</p>
            ) : null}
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-card px-4 py-3 sm:px-5">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {isDuplicate ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || !canSubmit}
                onClick={() => void submit("draft")}
              >
                {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                {busy ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !canSubmit}
                onClick={() => void submit("send_now")}
              >
                {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {busy ? "Sending…" : "Send now"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !canSubmit}
              onClick={() => void submit("send_now")}
            >
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {busy ? "Sending…" : isSendDraft ? "Send now" : "Resend now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
