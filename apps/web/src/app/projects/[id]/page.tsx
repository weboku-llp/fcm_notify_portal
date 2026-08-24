"use client";

import type { ProjectPublic } from "@notif/contracts";
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  KeyRound,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Settings2,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectTemplatesPanel } from "@/components/ProjectTemplatesPanel";
import { ProjectIcon, ProjectIconPlaceholder } from "@/components/ProjectIcon";
import { useProjects } from "@/components/ProjectContext";
import { api, ApiError } from "@/lib/api";
import { projectLogo } from "@/lib/brand";

type Tab = "settings" | "credentials" | "templates";

/** Prefer the specific field-level Zod issue over the generic "Request validation failed" wrapper. */
function friendlyApiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const details = err.details;
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0] as { message?: string; path?: unknown[] } | undefined;
      if (first?.message) {
        const field = Array.isArray(first.path) && first.path.length > 0 ? `${first.path.join(".")}: ` : "";
        return `${field}${first.message}`;
      }
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Request failed";
}

function parseTab(value: string | null): Tab {
  if (value === "credentials" || value === "templates" || value === "settings") return value;
  return "settings";
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const router = useRouter();
  const { refresh, selectProject } = useProjects();

  const [project, setProject] = useState<ProjectPublic | null>(null);
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get("tab")));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  // Settings form
  const [name, setName] = useState("");
  const [defaultBroadcastTopic, setTopic] = useState("");
  const [androidChannelId, setChannel] = useState("");
  const [fcmAppId, setFcmAppId] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED">("ACTIVE");
  const [registrationSecret, setRegistrationSecret] = useState("");
  const [tokenSourceApiBaseUrl, setTokenSourceApiBaseUrl] = useState("");
  const [tokenSourceApiKey, setTokenSourceApiKey] = useState("");
  const [tokenSourceEnabled, setTokenSourceEnabled] = useState(false);
  const [tokenSourceBusy, setTokenSourceBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** Pending logo override: string = set, null = clear, undefined = unchanged */
  const [logoDraft, setLogoDraft] = useState<string | null | undefined>(undefined);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);

  // Credentials form
  const [json, setJson] = useState("");
  const [credFileName, setCredFileName] = useState<string | null>(null);
  const [lastSavedFileName, setLastSavedFileName] = useState<string | null>(null);
  const [credBusy, setCredBusy] = useState(false);
  const [credTest, setCredTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [credMsg, setCredMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const credFileRef = useRef<HTMLInputElement>(null);

  // Live check of the credentials already stored for this project (no re-upload needed).
  const [verify, setVerify] = useState<{ loading: boolean; ok: boolean | null; text: string }>({
    loading: false,
    ok: null,
    text: "",
  });

  const verifyConnection = useCallback(async () => {
    setVerify({ loading: true, ok: null, text: "" });
    try {
      const res = await api.verifyCredentials(id);
      setVerify({
        loading: false,
        ok: res.ok,
        text: res.ok
          ? `${res.fcmProjectId} / ${res.clientEmail}`
          : res.error ?? "Connection failed",
      });
    } catch (err) {
      setVerify({
        loading: false,
        ok: false,
        text: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Connection failed",
      });
    }
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await api.getProject(id);
      setProject(p);
      setName(p.name);
      setTopic(p.defaultBroadcastTopic);
      setChannel(p.androidChannelId ?? "");
      setFcmAppId(p.fcmAppId ?? "");
      setStatus(p.status);
      setTokenSourceApiBaseUrl(p.tokenSourceApiBaseUrl ?? "");
      setTokenSourceEnabled(p.tokenSourceEnabled);
      setLogoDraft(undefined);
      selectProject(p.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [id, selectProject]);

  useEffect(() => {
    void load();
  }, [load]);

  // Check the stored credentials still work as soon as the project loads, so the
  // Credentials tab can show "Configured — connection established" without the
  // user having to paste the JSON again or click a button first.
  useEffect(() => {
    void verifyConnection();
  }, [verifyConnection]);

  const settingsDirty = useMemo(() => {
    if (!project) return false;
    return (
      name !== project.name ||
      defaultBroadcastTopic !== project.defaultBroadcastTopic ||
      (androidChannelId || "") !== (project.androidChannelId ?? "") ||
      (fcmAppId || "") !== (project.fcmAppId ?? "") ||
      status !== project.status ||
      registrationSecret.trim().length > 0 ||
      logoDraft !== undefined ||
      tokenSourceApiBaseUrl.trim() !== (project.tokenSourceApiBaseUrl ?? "") ||
      tokenSourceApiKey.trim().length >= 16
    );
  }, [
    project,
    name,
    defaultBroadcastTopic,
    androidChannelId,
    fcmAppId,
    status,
    registrationSecret,
    logoDraft,
    tokenSourceApiBaseUrl,
    tokenSourceApiKey,
  ]);

  const credentialsDirty = json.trim().length > 0;

  const draftCredSummary = useMemo(() => {
    const raw = json.trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const projectId = typeof parsed.project_id === "string" ? parsed.project_id : null;
      const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email : null;
      const privateKeyId = typeof parsed.private_key_id === "string" ? parsed.private_key_id : null;
      const hasPrivateKey =
        typeof parsed.private_key === "string" && parsed.private_key.includes("PRIVATE KEY");
      if (!projectId && !clientEmail) return null;
      return { projectId, clientEmail, privateKeyId, hasPrivateKey };
    } catch {
      return { error: "JSON is not valid yet" as const };
    }
  }, [json]);

  const displayLogo = useMemo(() => {
    if (!project) return null;
    if (logoDraft === null) return projectLogo({ ...project, logoUrl: null });
    if (typeof logoDraft === "string") return projectLogo({ ...project, logoUrl: logoDraft });
    return projectLogo(project);
  }, [project, logoDraft]);

  async function onLogoFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSettingsMsg({ ok: false, text: "Choose an image file (PNG, JPG, WebP, or SVG)." });
      return;
    }
    if (file.size > 512_000) {
      setSettingsMsg({ ok: false, text: "Icon must be 512 KB or smaller." });
      return;
    }
    setLogoBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      setLogoDraft(dataUrl);
      setSettingsMsg(null);
    } catch (err) {
      setSettingsMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to read image" });
    } finally {
      setLogoBusy(false);
      if (logoFileRef.current) logoFileRef.current.value = "";
    }
  }

  async function saveSettings(e: React.FormEvent) {
    if (!settingsDirty) return;
    e.preventDefault();
    setSettingsBusy(true);
    setSettingsMsg(null);
    try {
      const baseUrl = tokenSourceApiBaseUrl.trim();
      const apiKeyChanged = tokenSourceApiKey.trim().length >= 16;
      const urlChanged = baseUrl !== (project?.tokenSourceApiBaseUrl ?? "");
      const updated = await api.updateProject(id, {
        name,
        defaultBroadcastTopic,
        androidChannelId: androidChannelId || null,
        fcmAppId: fcmAppId || null,
        status,
        ...(registrationSecret.trim().length >= 16
          ? { registrationSecret: registrationSecret.trim() }
          : {}),
        ...(logoDraft !== undefined ? { logoUrl: logoDraft } : {}),
        tokenSourceApiBaseUrl: baseUrl || null,
        ...(apiKeyChanged ? { tokenSourceApiKey: tokenSourceApiKey.trim() } : {}),
        // Saving credentials does not enable sync — use Test & turn on for that.
        ...(urlChanged || apiKeyChanged ? { tokenSourceEnabled: false } : {}),
      });
      setProject(updated);
      setRegistrationSecret("");
      setTokenSourceApiKey("");
      setTokenSourceApiBaseUrl(updated.tokenSourceApiBaseUrl ?? "");
      setTokenSourceEnabled(updated.tokenSourceEnabled);
      setLogoDraft(undefined);
      await refresh();
      setSettingsMsg({
        ok: true,
        text: updated.tokenSourceApiBaseUrl
          ? "Settings saved (including Main API URL/key). Sync stays OFF until Test & turn on succeeds."
          : "Settings saved.",
      });
    } catch (err) {
      setSettingsMsg({ ok: false, text: friendlyApiErrorMessage(err) });
    } finally {
      setSettingsBusy(false);
    }
  }

  async function testCredentials() {
    setCredBusy(true);
    setCredTest(null);
    try {
      const res = await api.testProjectCredentials(id, json);
      setCredTest({
        ok: res.ok,
        text: res.ok
          ? `Valid — ${res.fcmProjectId} / ${res.clientEmail}`
          : res.error ?? "Invalid credentials",
      });
    } catch (err) {
      setCredTest({ ok: false, text: friendlyApiErrorMessage(err) });
    } finally {
      setCredBusy(false);
    }
  }

  async function rotateCredentials(e: React.FormEvent) {
    e.preventDefault();
    setCredBusy(true);
    setCredMsg(null);
    setCredTest(null);
    try {
      const updated = await api.updateProject(id, { fcmServiceAccountJson: json });
      setProject(updated);
      if (credFileName) setLastSavedFileName(credFileName);
      setJson("");
      setCredFileName(null);
      if (credFileRef.current) credFileRef.current.value = "";
      await refresh();
      await verifyConnection();
      setCredMsg({
        ok: true,
        text: `Saved for ${updated.fcmProjectId}. Private key is encrypted in the database — the paste box is cleared on purpose.`,
      });
    } catch (err) {
      setCredMsg({ ok: false, text: friendlyApiErrorMessage(err) });
    } finally {
      setCredBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-ink-mute">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading project…
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-3">
        <div className="border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {error ?? "Project not found"}
        </div>
        <Link href="/projects" className="btn-secondary">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to projects
        </Link>
      </div>
    );
  }

  function renderConnectionStatus() {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-[13px] ${
          verify.ok === true
            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
            : verify.ok === false
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-line bg-surface-raised text-ink-mute"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {verify.loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : verify.ok === true ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : verify.ok === false ? (
            <XCircle className="h-4 w-4 shrink-0" />
          ) : (
            <KeyRound className="h-4 w-4 shrink-0" />
          )}
          <span className="min-w-0">
            <span className="font-medium">
              {verify.loading
                ? "Checking connection…"
                : verify.ok === true
                  ? "Configured — connection established"
                  : verify.ok === false
                    ? "Connection failed"
                    : "Not verified yet"}
            </span>
            {!verify.loading && verify.text ? (
              <span className="ml-1.5 break-all font-mono text-[11px] opacity-80">{verify.text}</span>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          className="btn-secondary h-7 shrink-0 px-2 text-[12px]"
          disabled={verify.loading}
          onClick={() => void verifyConnection()}
        >
          <RefreshCw className={`h-3 w-3 ${verify.loading ? "animate-spin" : ""}`} />
          Recheck
        </button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof Settings2 }[] = [
    { id: "settings", label: "Settings", icon: Settings2 },
    { id: "credentials", label: "Firebase credentials", icon: KeyRound },
    { id: "templates", label: "Templates", icon: LayoutTemplate },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button type="button" className="btn-secondary h-9 px-2.5" onClick={() => router.push("/projects")}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          {displayLogo ? (
            <ProjectIcon src={displayLogo.src} alt={displayLogo.alt} boxClassName="h-14 w-14" darkBox />
          ) : (
            <ProjectIconPlaceholder name={project.name} />
          )}
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-ink">{project.name}</h1>
            <p className="mt-0.5 font-mono text-[12px] text-ink-mute">
              /{project.slug} · {project.fcmProjectId}
            </p>
          </div>
        </div>
        <span
          className={`badge ${
            project.status === "ACTIVE"
              ? "border-emerald-700/30 text-emerald-800"
              : "border-amber-700/30 text-amber-900"
          }`}
        >
          {project.status}
        </span>
      </div>

      <div className="flex gap-0 overflow-x-auto border-b border-line">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                router.replace(`/projects/${id}?tab=${t.id}`, { scroll: false });
              }}
              className={`relative flex shrink-0 items-center gap-2 px-4 py-2.5 text-[13px] font-medium ${
                active ? "text-ink" : "text-ink-mute hover:text-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {t.label}
              {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 bg-brand-500" /> : null}
            </button>
          );
        })}
      </div>

      {tab === "settings" ? (
        <form onSubmit={saveSettings} className="max-w-3xl space-y-4 border border-line bg-surface-card p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Project settings</h2>
            <p className="mt-0.5 text-[13px] text-ink-mute">Name, icon, topic, app id, and registration secret.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 border border-line bg-surface-raised p-4">
            {displayLogo ? (
              <ProjectIcon src={displayLogo.src} alt={displayLogo.alt} boxClassName="h-16 w-16" darkBox />
            ) : (
              <ProjectIconPlaceholder name={name || project.name} boxClassName="h-16 w-16" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[13px] font-medium text-ink">Project icon</p>
              <p className="text-[12px] text-ink-mute">
                PNG, JPG, WebP, or SVG · max 512 KB. Shown on the projects list and sidebar.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => void onLogoFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="btn-secondary h-8 px-2.5 text-[12px]"
                  disabled={logoBusy || settingsBusy}
                  onClick={() => logoFileRef.current?.click()}
                >
                  {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {displayLogo ? "Change icon" : "Add icon"}
                </button>
                {displayLogo || project.logoUrl ? (
                  <button
                    type="button"
                    className="btn-secondary h-8 px-2.5 text-[12px]"
                    disabled={settingsBusy}
                    onClick={() => setLogoDraft(null)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Display name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Default broadcast topic</label>
              <input className="input font-mono" value={defaultBroadcastTopic} onChange={(e) => setTopic(e.target.value)} required />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as "ACTIVE" | "PAUSED")}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
              </select>
            </div>
            <div>
              <label className="label">Firebase App ID</label>
              <input
                className="input font-mono text-[12px]"
                value={fcmAppId}
                onChange={(e) => setFcmAppId(e.target.value)}
                placeholder="1:123:android:abc"
              />
            </div>
            <div>
              <label className="label">Android channel ID</label>
              <input className="input" value={androidChannelId} onChange={(e) => setChannel(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Mobile registration secret</label>
              <input
                className="input font-mono text-[12px]"
                type="password"
                value={registrationSecret}
                onChange={(e) => setRegistrationSecret(e.target.value)}
                placeholder={
                  project.hasRegistrationSecret
                    ? "••••••••••••••••  (saved — type a new value only to replace)"
                    : "min 16 chars — hashed at rest"
                }
                autoComplete="new-password"
                minLength={registrationSecret ? 16 : undefined}
              />
              {project.hasRegistrationSecret && !registrationSecret ? (
                <p className="mt-1 text-[11px] text-emerald-700">Saved in database. Field stays empty on purpose — secrets are never shown again.</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 border border-line bg-surface-raised p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-semibold text-ink">Main project API</h3>
                <p className="mt-0.5 text-[12px] text-ink-mute">
                  Use the <span className="font-medium">CricRumble backend</span> URL (not this portal).{" "}
                  <span className="font-medium">Save settings</span> stores URL/key with sync OFF.{" "}
                  <span className="font-medium">Test &amp; turn on</span> enables sync only on{" "}
                  <span className="font-mono">HTTP 200</span>.
                </p>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  project.tokenSourceEnabled
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {project.tokenSourceEnabled ? "ON" : "OFF"}
              </span>
            </div>
            <div>
              <label className="label">Main API base URL</label>
              <input
                className="input font-mono text-[12px]"
                value={tokenSourceApiBaseUrl}
                onChange={(e) => {
                  setTokenSourceApiBaseUrl(e.target.value);
                  setTokenSourceEnabled(false);
                }}
                placeholder="http://localhost:3001 or https://api.cricrumble.com"
              />
              <p className="mt-1 text-[11px] text-ink-faint">
                Probes <span className="font-mono">GET {"{url}"}/api/internal/notif-portal/tokens</span>
              </p>
            </div>
            <div>
              <label className="label">API key</label>
              <input
                className="input font-mono text-[12px]"
                type="password"
                value={tokenSourceApiKey}
                onChange={(e) => setTokenSourceApiKey(e.target.value)}
                placeholder={
                  project.hasTokenSourceApiKey
                    ? "••••••••••••••••  (saved — type a new value only to replace)"
                    : "same as NOTIF_PORTAL_TOKEN_EXPORT_KEY on project API"
                }
                autoComplete="new-password"
                minLength={tokenSourceApiKey ? 16 : undefined}
              />
              {project.hasTokenSourceApiKey && !tokenSourceApiKey ? (
                <p className="mt-1 text-[11px] text-emerald-700">Saved in database. Field stays empty on purpose — secrets are never shown again.</p>
              ) : !project.hasTokenSourceApiKey ? (
                <p className="mt-1 text-[11px] text-amber-700">Required the first time before Test &amp; turn on.</p>
              ) : null}
            </div>
            {project.tokenSourceLastSyncAt ? (
              <p className="text-[12px] text-ink-soft">
                Last sync: {new Date(project.tokenSourceLastSyncAt).toLocaleString()} ·{" "}
                {project.tokenSourceLastSyncOk ? (
                  <span className="text-emerald-700">{project.tokenSourceLastSyncCount ?? 0} tokens</span>
                ) : (
                  <span className="text-red-700">{project.tokenSourceLastSyncError ?? "failed"}</span>
                )}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={
                  tokenSourceBusy ||
                  !tokenSourceApiBaseUrl.trim() ||
                  (!project.hasTokenSourceApiKey && tokenSourceApiKey.trim().length < 16)
                }
                onClick={async () => {
                  setTokenSourceBusy(true);
                  setSettingsMsg(null);
                  try {
                    const res = await api.testAndEnableTokenSource(id, {
                      tokenSourceApiBaseUrl: tokenSourceApiBaseUrl.trim(),
                      ...(tokenSourceApiKey.trim().length >= 16
                        ? { tokenSourceApiKey: tokenSourceApiKey.trim() }
                        : {}),
                    });
                    setProject(res.project);
                    setTokenSourceEnabled(res.project.tokenSourceEnabled);
                    setTokenSourceApiBaseUrl(res.project.tokenSourceApiBaseUrl ?? "");
                    setTokenSourceApiKey("");
                    await refresh();
                    setSettingsMsg({
                      ok: res.ok,
                      text: res.ok
                        ? `HTTP ${res.httpStatus ?? 200} — token sync ON. Sample: ${res.tokenCountSample ?? 0} token(s).`
                        : `URL/key saved. HTTP ${res.httpStatus ?? "—"} — sync left OFF. ${res.error ?? "Test failed"}. Point Main API at the CricRumble backend (not portal :4000).`,
                    });
                  } catch (err) {
                    setTokenSourceEnabled(false);
                    setSettingsMsg({
                      ok: false,
                      text: err instanceof ApiError ? err.message : String(err),
                    });
                  } finally {
                    setTokenSourceBusy(false);
                  }
                }}
              >
                {tokenSourceBusy ? "Testing…" : "Test & turn on"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={tokenSourceBusy || !project.tokenSourceEnabled}
                onClick={async () => {
                  setTokenSourceBusy(true);
                  setSettingsMsg(null);
                  try {
                    const res = await api.syncTokenSource(id);
                    await load();
                    await refresh();
                    setSettingsMsg({
                      ok: res.ok,
                      text: `Synced ${res.upserted} token(s), deactivated ${res.deactivated}.`,
                    });
                  } catch (err) {
                    setSettingsMsg({
                      ok: false,
                      text: err instanceof ApiError ? err.message : String(err),
                    });
                  } finally {
                    setTokenSourceBusy(false);
                  }
                }}
              >
                Sync now
              </button>
              {project.tokenSourceEnabled ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={tokenSourceBusy}
                  onClick={async () => {
                    setTokenSourceBusy(true);
                    try {
                      const updated = await api.updateProject(id, { tokenSourceEnabled: false });
                      setProject(updated);
                      setTokenSourceEnabled(false);
                      await refresh();
                      setSettingsMsg({ ok: true, text: "Token sync turned OFF." });
                    } catch (err) {
                      setSettingsMsg({
                        ok: false,
                        text: err instanceof ApiError ? err.message : String(err),
                      });
                    } finally {
                      setTokenSourceBusy(false);
                    }
                  }}
                >
                  Turn off
                </button>
              ) : null}
            </div>
          </div>

          {settingsMsg ? (
            <div
              className={`border px-3 py-2 text-[13px] ${
                settingsMsg.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"
              }`}
            >
              {settingsMsg.text}
            </div>
          ) : null}

          <button className="btn-primary" disabled={settingsBusy || !settingsDirty}>
            {settingsBusy ? "Saving…" : "Save settings"}
          </button>
        </form>
      ) : null}

      {tab === "credentials" ? (
        <form onSubmit={rotateCredentials} className="max-w-3xl space-y-4 border border-line bg-surface-card p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Firebase Admin SDK credentials</h2>
            <p className="mt-0.5 text-[13px] text-ink-mute">
              Same private key JSON Firebase Console generates under Project settings → Service accounts.
              Stored encrypted on the server — the paste box is cleared after a successful save (that means it worked).
            </p>
            {project.fcmProjectId === "cricrumble-fcm" || project.fcmClientEmail.includes("cricrumble-fcm") ? (
              <p className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                Still using seed/demo credentials. Upload your real Firebase JSON below and click{" "}
                <span className="font-medium">Update credentials</span> — the red “Connection failed” banner is from the old demo key.
              </p>
            ) : null}
          </div>

          {renderConnectionStatus()}

          <ol className="list-decimal space-y-1.5 border border-line bg-surface-raised px-4 py-3 pl-8 text-[12px] text-ink-soft">
            <li>
              Open{" "}
              <a
                className="font-medium text-brand-700 underline"
                href="https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk"
                target="_blank"
                rel="noreferrer"
              >
                Firebase Console → Project settings → Service accounts
              </a>
            </li>
            <li>Select <span className="font-medium text-ink">Node.js</span>, then click <span className="font-medium text-ink">Generate new private key</span></li>
            <li>Upload the downloaded <span className="font-mono">.json</span> file below (or paste its contents)</li>
            <li>Test, then Update — set <span className="font-mono">FCM_DRIVER=firebase</span> on API/worker for live sends</li>
          </ol>

          <div className="space-y-2 border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-emerald-900">Stored credentials</p>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                Encrypted at rest
              </span>
            </div>
            <dl className="grid gap-2 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-emerald-800/70">FCM project</dt>
                <dd className="font-mono text-emerald-950">{project.fcmProjectId}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-emerald-800/70">Service account</dt>
                <dd className="truncate font-mono text-emerald-950">{project.fcmClientEmail}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-emerald-800/70">Fingerprint</dt>
                <dd className="font-mono text-emerald-950">{project.credentialFingerprint}</dd>
              </div>
              {lastSavedFileName ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-emerald-800/70">Last uploaded file</dt>
                  <dd className="truncate font-mono text-emerald-950">{lastSavedFileName}</dd>
                </div>
              ) : null}
            </dl>
            <p className="text-[11px] text-emerald-800/80">
              The private key itself is never shown again after save. Use Recheck above to confirm Firebase accepts it.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">Private key JSON file</label>
              <input
                ref={credFileRef}
                type="file"
                accept="application/json,.json"
                className="block w-full text-[12px] text-ink-mute file:mr-3 file:rounded file:border file:border-line file:bg-surface-raised file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-ink"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    setCredFileName(null);
                    return;
                  }
                  const text = await file.text();
                  setCredFileName(file.name);
                  setJson(text);
                  setCredTest(null);
                  setCredMsg(null);
                }}
              />
              {credFileName ? (
                <p className="mt-1.5 text-[12px] text-ink">
                  Chosen file: <span className="font-mono font-medium">{credFileName}</span>
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-ink-faint">No file chosen yet</p>
              )}
            </div>

            <div>
              <label className="label">Or paste JSON</label>
              <textarea
                className="input h-48 font-mono text-[12px]"
                value={json}
                onChange={(e) => {
                  setJson(e.target.value);
                  setCredFileName(null);
                  setCredTest(null);
                }}
                placeholder='{ "type": "service_account", "project_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----..." }'
              />
            </div>

            {draftCredSummary && "error" in draftCredSummary ? (
              <p className="text-[12px] text-amber-800">{draftCredSummary.error}</p>
            ) : draftCredSummary ? (
              <div className="border border-line bg-surface-raised p-3 text-[12px]">
                <p className="mb-2 font-medium text-ink">Ready to save (from file / paste)</p>
                <dl className="space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">project_id</dt>
                    <dd className="font-mono text-ink">{draftCredSummary.projectId ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">client_email</dt>
                    <dd className="truncate font-mono text-ink">{draftCredSummary.clientEmail ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">private_key_id</dt>
                    <dd className="font-mono text-ink">{draftCredSummary.privateKeyId ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">private_key</dt>
                    <dd className="font-mono text-ink">
                      {draftCredSummary.hasPrivateKey ? "•••••••• (hidden — will be encrypted on save)" : "missing"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>

          {credTest ? (
            <div
              className={`border px-3 py-2 text-[13px] ${
                credTest.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"
              }`}
            >
              {credTest.text}
            </div>
          ) : null}
          {credMsg ? (
            <div
              className={`border px-3 py-2 text-[13px] ${
                credMsg.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"
              }`}
            >
              {credMsg.text}
            </div>
          ) : null}

          {renderConnectionStatus()}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={credBusy || !credentialsDirty}
              onClick={testCredentials}
            >
              {credBusy ? "Working…" : "Test credentials"}
            </button>
            <button type="submit" className="btn-primary" disabled={credBusy || !credentialsDirty}>
              {credBusy ? "Saving…" : "Update credentials"}
            </button>
          </div>
        </form>
      ) : null}

      {tab === "templates" ? <ProjectTemplatesPanel projectId={project.id} /> : null}
    </div>
  );
}
