"use client";

import type { ProjectPublic } from "@notif/contracts";
import { ArrowRight, Check, Link2, Loader2, Plus, Radio, Settings2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useProjects } from "@/components/ProjectContext";
import { projectLogo } from "@/lib/brand";
import { fmtDate } from "@/lib/ui";

/** Firebase SA + topic + main project API tested & turned on. */
function isProjectFullyConfigured(p: ProjectPublic): boolean {
  return Boolean(
    p.fcmProjectId &&
      p.credentialFingerprint &&
      p.defaultBroadcastTopic &&
      p.tokenSourceEnabled &&
      p.tokenSourceApiBaseUrl &&
      p.hasTokenSourceApiKey,
  );
}

export default function ProjectsPage() {
  const { projects, loading, error, selected, selectProject } = useProjects();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Projects</h1>
          <p className="mt-1 text-[13px] text-ink-mute">
            Left: navigate the CMS. Right: manage each Firebase project’s credentials, templates, and sends.
          </p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus className="h-3.5 w-3.5" />
          Add project
        </Link>
      </div>

      {error ? (
        <div className="border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-ink-mute">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : null}

      {!loading && projects.length === 0 ? (
        <div className="border border-dashed border-line bg-surface-card px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-ink">No Firebase projects linked</p>
          <Link href="/projects/new" className="btn-primary mt-5">
            <Plus className="h-3.5 w-3.5" />
            Add project
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {projects.map((p) => {
          const isSelected = selected?.id === p.id;
          const logo = projectLogo(p.slug);
          const configured = isProjectFullyConfigured(p);
          const settingsHref = `/projects/${p.id}?tab=settings`;

          return (
            <article
              key={p.id}
              className={`flex flex-col border bg-surface-card ${
                isSelected ? "border-brand-500" : "border-line"
              }`}
            >
              <div className="flex items-start gap-4 border-b border-line p-4">
                {logo ? (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-black p-1">
                    <Image src={logo.src} alt={logo.alt} width={48} height={48} className="h-12 w-12 object-contain" />
                  </div>
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-line bg-surface-raised font-mono text-sm font-semibold uppercase text-ink-mute">
                    {p.name.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px] font-semibold tracking-tight text-ink">{p.name}</h2>
                    <span
                      className={`badge ${
                        p.status === "ACTIVE"
                          ? "border-emerald-700/30 text-emerald-800"
                          : "border-amber-700/30 text-amber-900"
                      }`}
                    >
                      {p.status}
                    </span>
                    <span
                      className={`badge ${
                        configured
                          ? "border-emerald-700/30 text-emerald-800"
                          : "border-amber-700/30 text-amber-900"
                      }`}
                    >
                      {configured ? "Configured" : "Not configured"}
                    </span>
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-brand-700">
                        <Check className="h-3 w-3" />
                        selected
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                    /{p.slug} · {p.fcmProjectId}
                  </p>
                </div>
              </div>

              <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 p-4 text-[12px]">
                <div>
                  <dt className="text-ink-faint">Topic</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-mono text-ink-soft">
                    <Radio className="h-3 w-3" />
                    {p.defaultBroadcastTopic}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Devices</dt>
                  <dd className="mt-0.5 tabular-nums text-ink-soft">{p.activeDeviceCount ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-ink-faint">Main project API</dt>
                  <dd className="mt-0.5 text-ink-soft">
                    {configured ? (
                      <span className="break-all font-mono text-[11px]">{p.tokenSourceApiBaseUrl}</span>
                    ) : (
                      <Link
                        href={settingsHref}
                        onClick={() => selectProject(p.id)}
                        className="inline-flex items-center gap-1 font-medium text-brand-700 underline underline-offset-2"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Not configured — add API link
                      </Link>
                    )}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-ink-faint">Credential</dt>
                  <dd className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">{p.credentialFingerprint}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-ink-faint">Created</dt>
                  <dd className="mt-0.5 text-ink-soft">{fmtDate(p.createdAt)}</dd>
                </div>
              </dl>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-line bg-surface-raised/50 p-3">
                <button
                  type="button"
                  className="btn-secondary h-8 flex-1"
                  onClick={() => selectProject(p.id)}
                  disabled={isSelected}
                >
                  {isSelected ? "In use" : "Select"}
                </button>
                <Link
                  href={configured ? `/projects/${p.id}` : settingsHref}
                  className="btn-secondary h-8 flex-1"
                  onClick={() => selectProject(p.id)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {configured ? "Manage" : "Configure"}
                </Link>
                <Link
                  href="/campaigns/new"
                  className="btn-primary h-8 flex-1"
                  onClick={() => selectProject(p.id)}
                >
                  Compose
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
