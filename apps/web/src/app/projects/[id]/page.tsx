"use client";

import type { ProjectPublic } from "@notif/contracts";
import {
  ArrowLeft,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Settings2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectTemplatesPanel } from "@/components/ProjectTemplatesPanel";
import { useProjects } from "@/components/ProjectContext";
import { api, ApiError } from "@/lib/api";
import { projectLogo } from "@/lib/brand";

type Tab = "settings" | "credentials" | "templates";

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
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Credentials form
  const [json, setJson] = useState("");
  const [credBusy, setCredBusy] = useState(false);
  const [credTest, setCredTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [credMsg, setCredMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const settingsDirty = useMemo(() => {
    if (!project) return false;
    return (
      name !== project.name ||
      defaultBroadcastTopic !== project.defaultBroadcastTopic ||
      (androidChannelId || "") !== (project.androidChannelId ?? "") ||
      (fcmAppId || "") !== (project.fcmAppId ?? "") ||
      status !== project.status ||
      registrationSecret.trim().length > 0
    );
  }, [project, name, defaultBroadcastTopic, androidChannelId, fcmAppId, status, registrationSecret]);

  const credentialsDirty = json.trim().length > 0;

  async function saveSettings(e: React.FormEvent) {
    if (!settingsDirty) return;
    e.preventDefault();
    setSettingsBusy(true);
    setSettingsMsg(null);
    try {
      const updated = await api.updateProject(id, {
        name,
        defaultBroadcastTopic,
        androidChannelId: androidChannelId || null,
        fcmAppId: fcmAppId || null,
        status,
        ...(registrationSecret.trim().length >= 16
          ? { registrationSecret: registrationSecret.trim() }
          : {}),
      });
      setProject(updated);
      setRegistrationSecret("");
      await refresh();
      setSettingsMsg({ ok: true, text: "Settings saved." });
    } catch (err) {
      setSettingsMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed",
      });
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
      setCredTest({ ok: false, text: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setCredBusy(false);
    }
  }

  async function rotateCredentials(e: React.FormEvent) {
    e.preventDefault();
    setCredBusy(true);
    setCredMsg(null);
    try {
      const updated = await api.updateProject(id, { fcmServiceAccountJson: json });
      setProject(updated);
      setJson("");
      await refresh();
      setCredMsg({
        ok: true,
        text: `Credentials updated. Fingerprint ${updated.credentialFingerprint}. Raw JSON is never stored in the browser after save.`,
      });
    } catch (err) {
      setCredMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Update failed",
      });
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

  const logo = projectLogo(project.slug);
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
          {logo ? (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-black p-1">
              <Image src={logo.src} alt={logo.alt} width={48} height={48} className="h-12 w-12 object-contain" />
            </div>
          ) : null}
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
            <p className="mt-0.5 text-[13px] text-ink-mute">Name, topic, app id, and registration secret.</p>
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
              <label className="label">
                Mobile registration secret {project.hasRegistrationSecret ? "(set — leave blank to keep)" : ""}
              </label>
              <input
                className="input font-mono text-[12px]"
                type="password"
                value={registrationSecret}
                onChange={(e) => setRegistrationSecret(e.target.value)}
                placeholder="min 16 chars — hashed at rest"
                minLength={registrationSecret ? 16 : undefined}
              />
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
              Stored encrypted on the server — never shown again in this portal.
            </p>
          </div>

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

          <dl className="grid gap-2 border border-line bg-surface-raised p-3 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Linked FCM project</dt>
              <dd className="font-mono text-ink-soft">{project.fcmProjectId}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Service account</dt>
              <dd className="truncate font-mono text-ink-soft">{project.fcmClientEmail}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Fingerprint</dt>
              <dd className="font-mono text-ink-soft">{project.credentialFingerprint}</dd>
            </div>
          </dl>

          <div>
            <label className="label">Private key JSON file</label>
            <input
              type="file"
              accept="application/json,.json"
              className="mb-2 block w-full text-[12px] text-ink-mute file:mr-3 file:rounded file:border file:border-line file:bg-surface-raised file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-ink"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setJson(text);
                setCredTest(null);
                setCredMsg(null);
              }}
            />
            <label className="label">Or paste JSON</label>
            <textarea
              className="input h-48 font-mono text-[12px]"
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                setCredTest(null);
              }}
              placeholder='{ "type": "service_account", "project_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----..." }'
              required
            />
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
