"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProjects } from "@/components/ProjectContext";
import { api, ApiError } from "@/lib/api";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function NewProjectPage() {
  const router = useRouter();
  const { refresh, selectProject } = useProjects();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [defaultBroadcastTopic, setTopic] = useState("broadcast");
  const [androidChannelId, setChannel] = useState("");
  const [fcmAppId, setFcmAppId] = useState("");
  const [registrationSecret, setRegistrationSecret] = useState("");
  const [json, setJson] = useState("");

  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await api.testCredentials(json);
      setTestResult(
        res.ok
          ? { ok: true, msg: `Valid — project ${res.fcmProjectId}, ${res.clientEmail}` }
          : { ok: false, msg: res.error ?? "Invalid credentials" },
      );
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : "Validation failed" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const project = await api.createProject({
        name,
        slug: effectiveSlug,
        fcmServiceAccountJson: json,
        defaultBroadcastTopic,
        androidChannelId: androidChannelId || undefined,
        fcmAppId: fcmAppId || undefined,
        registrationSecret: registrationSecret || undefined,
      });
      await refresh();
      selectProject(project.id);
      router.push("/projects");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add Firebase project</h1>
        <p className="text-sm text-slate-500">
          Paste the service-account JSON. It is validated, then stored encrypted at rest — never returned by the API.
        </p>
      </div>

      <form onSubmit={handleSave} className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Acme Sports" />
          </div>
          <div>
            <label className="label">Slug</label>
            <input
              className="input"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
              placeholder="acme-sports"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Default broadcast topic</label>
            <input
              className="input"
              value={defaultBroadcastTopic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="cricrumble_all"
            />
          </div>
          <div>
            <label className="label">Android channel ID (optional)</label>
            <input className="input" value={androidChannelId} onChange={(e) => setChannel(e.target.value)} placeholder="default_channel" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Firebase App ID (optional)</label>
            <input
              className="input font-mono text-xs"
              value={fcmAppId}
              onChange={(e) => setFcmAppId(e.target.value)}
              placeholder="1:123:android:abc"
            />
          </div>
          <div>
            <label className="label">Mobile registration secret</label>
            <input
              className="input font-mono text-xs"
              type="password"
              value={registrationSecret}
              onChange={(e) => setRegistrationSecret(e.target.value)}
              placeholder="min 16 chars — hashed at rest, never returned"
              minLength={16}
            />
            <p className="mt-1 text-xs text-slate-400">
              Used by the app as X-App-Registration-Key. Not a Firebase credential.
            </p>
          </div>
        </div>

        <div>
          <label className="label">Service-account JSON</label>
          <textarea
            className="input h-56 font-mono text-xs"
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              setTestResult(null);
            }}
            placeholder='{ "type": "service_account", "project_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----..." }'
            required
          />
        </div>

        {testResult ? (
          <div
            className={`rounded-lg p-3 text-sm ${
              testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {testResult.msg}
          </div>
        ) : null}
        {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="flex gap-3">
          <button type="button" className="btn-secondary" onClick={handleTest} disabled={testing || !json}>
            {testing ? "Testing…" : "Test credentials"}
          </button>
          <button type="submit" className="btn-primary" disabled={saving || !json || !name}>
            {saving ? "Saving…" : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}
