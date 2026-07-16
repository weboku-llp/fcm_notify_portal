"use client";

import Link from "next/link";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate } from "@/lib/ui";

export default function ProjectsPage() {
  const { projects, loading, error, selected, selectProject } = useProjects();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-slate-500">
            Each project maps to one Firebase project with its own encrypted service account.
          </p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          + Add project
        </Link>
      </div>

      {error ? <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loading && projects.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-lg font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add your first Firebase project by pasting its service-account JSON.
          </p>
          <Link href="/projects/new" className="btn-primary mt-4">
            + Add project
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => (
          <div key={p.id} className={`card p-5 ${selected?.id === p.id ? "ring-2 ring-brand-300" : ""}`}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <p className="text-xs text-slate-500">/{p.slug}</p>
              </div>
              <span
                className={`badge ${p.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
              >
                {p.status}
              </span>
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">FCM project</dt>
                <dd className="font-medium">{p.fcmProjectId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Service account</dt>
                <dd className="font-mono text-xs text-slate-600">{p.credentialFingerprint}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Default topic</dt>
                <dd className="font-medium">{p.defaultBroadcastTopic}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Created</dt>
                <dd>{fmtDate(p.createdAt)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2">
              <button
                className="btn-secondary flex-1"
                onClick={() => selectProject(p.id)}
                disabled={selected?.id === p.id}
              >
                {selected?.id === p.id ? "Selected" : "Select"}
              </button>
              <Link href="/campaigns/new" className="btn-primary flex-1" onClick={() => selectProject(p.id)}>
                New campaign
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
