"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProjects } from "./ProjectContext";

const NAV = [
  { href: "/projects", label: "Projects", icon: "🗂️" },
  { href: "/campaigns/new", label: "New Campaign", icon: "✏️" },
  { href: "/campaigns", label: "Campaign History", icon: "📈" },
  { href: "/templates", label: "Templates", icon: "🧩" },
  { href: "/segments", label: "Segments", icon: "🎯" },
  { href: "/tokens", label: "Device Tokens", icon: "📱" },
];

function ProjectSwitcher() {
  const { projects, selected, selectProject } = useProjects();
  if (projects.length === 0) {
    return <span className="text-sm text-slate-400">No projects yet</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-400">Project</span>
      <select
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm"
        value={selected?.id ?? ""}
        onChange={(e) => selectProject(e.target.value)}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {selected ? (
        <span className="badge bg-slate-100 text-slate-500" title={`FCM project: ${selected.fcmProjectId}`}>
          {selected.fcmProjectId}
        </span>
      ) : null}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
          <span className="text-xl">🔔</span>
          <span className="text-lg font-semibold">Notif Portal</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/projects" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-4 text-xs text-slate-400">
          Multi-project FCM control plane
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <ProjectSwitcher />
          <Link href="/projects/new" className="btn-primary">
            + Add project
          </Link>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
