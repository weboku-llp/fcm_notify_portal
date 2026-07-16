"use client";

import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  FolderKanban,
  History,
  Megaphone,
  Menu,
  Plus,
  Smartphone,
  Target,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { projectLogo } from "@/lib/brand";
import { useProjects } from "./ProjectContext";

const NAV: { href: string; label: string; icon: LucideIcon; group: string }[] = [
  { href: "/projects", label: "Projects", icon: FolderKanban, group: "Workspace" },
  { href: "/campaigns/new", label: "Compose", icon: Megaphone, group: "Messaging" },
  { href: "/campaigns", label: "History", icon: History, group: "Messaging" },
  { href: "/segments", label: "Segments", icon: Target, group: "Audience" },
  { href: "/tokens", label: "Devices", icon: Smartphone, group: "Audience" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/campaigns") return pathname === "/campaigns";
  if (href === "/campaigns/new") return pathname.startsWith("/campaigns/new");
  if (href === "/projects") return pathname === "/projects" || pathname.startsWith("/projects/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  cric,
  onNavigate,
}: {
  pathname: string;
  cric: boolean;
  onNavigate?: () => void;
}) {
  const groups = ["Workspace", "Messaging", "Audience"];
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group}>
          <p
            className={`mb-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
              cric ? "text-white/35" : "text-ink-faint"
            }`}
          >
            {group}
          </p>
          <div className="space-y-0.5">
            {NAV.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition ${
                    cric
                      ? active
                        ? "bg-brand-600 text-white"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                      : active
                        ? "bg-ink text-white"
                        : "text-ink-soft hover:bg-black/[0.04] hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { projects, selected, selectProject } = useProjects();
  const logo = projectLogo(selected?.slug);
  const cric = selected?.slug === "cricrumble";
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <>
      <div className={`border-b px-4 py-4 ${cric ? "border-white/10" : "border-line"}`}>
        <Link href="/projects" className="block" onClick={() => setMobileOpen(false)}>
          {logo ? (
            <Image
              src={logo.src}
              alt={logo.alt}
              width={160}
              height={48}
              className="mx-auto h-12 w-auto object-contain"
              priority
            />
          ) : (
            <div>
              <div className={`text-[15px] font-semibold tracking-tight ${cric ? "text-white" : "text-ink"}`}>
                Notif Portal
              </div>
              <div className={`font-mono text-[10px] uppercase tracking-[0.12em] ${cric ? "text-white/40" : "text-ink-faint"}`}>
                FCM CMS
              </div>
            </div>
          )}
        </Link>
      </div>

      <NavLinks pathname={pathname} cric={cric} onNavigate={() => setMobileOpen(false)} />

      <div className={`space-y-2 border-t p-3 ${cric ? "border-white/10" : "border-line"}`}>
        <label className={`px-1 font-mono text-[10px] uppercase tracking-[0.12em] ${cric ? "text-white/35" : "text-ink-faint"}`}>
          Active project
        </label>
        <div className="relative">
          <select
            aria-label="Active project"
            className={`h-9 w-full appearance-none rounded-md border py-0 pl-2.5 pr-8 text-[13px] font-medium outline-none ${
              cric
                ? "border-white/15 bg-white/5 text-white focus:border-brand-400"
                : "border-line bg-white text-ink focus:border-ink"
            }`}
            value={selected?.id ?? ""}
            onChange={(e) => selectProject(e.target.value)}
            disabled={projects.length === 0}
          >
            {projects.length === 0 ? <option value="">No projects</option> : null}
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="text-ink">
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
              cric ? "text-white/45" : "text-ink-faint"
            }`}
          />
        </div>
        {selected ? (
          <p className={`truncate px-1 font-mono text-[10px] ${cric ? "text-white/35" : "text-ink-faint"}`}>
            {selected.fcmProjectId}
          </p>
        ) : null}
        <Link
          href="/projects/new"
          onClick={() => setMobileOpen(false)}
          className={`flex h-9 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium ${
            cric ? "bg-brand-600 text-white hover:bg-brand-500" : "bg-ink text-white hover:bg-ink-soft"
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          Add project
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop left rail */}
      <aside
        className={`hidden w-[248px] shrink-0 flex-col border-r md:flex ${
          cric ? "border-black bg-black text-white" : "border-line bg-surface-card text-ink"
        }`}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={`absolute inset-y-0 left-0 flex w-[280px] flex-col shadow-xl ${
              cric ? "bg-black text-white" : "bg-surface-card text-ink"
            }`}
          >
            <button
              type="button"
              className={`absolute right-3 top-3 rounded-md p-1 ${cric ? "text-white/70" : "text-ink-mute"}`}
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      {/* Right workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface-card/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="btn-secondary h-9 px-2 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">
                {selected?.name ?? "Notif Portal"}
              </p>
              <p className="truncate font-mono text-[11px] text-ink-faint">
                {selected ? `${selected.slug} · ${selected.fcmProjectId}` : "Select a project to begin"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selected ? (
              <Link href={`/projects/${selected.id}`} className="btn-secondary hidden sm:inline-flex">
                Manage
              </Link>
            ) : null}
            <Link href="/campaigns/new" className="btn-primary">
              <Megaphone className="h-3.5 w-3.5" />
              Compose
            </Link>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
