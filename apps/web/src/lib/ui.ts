import type { CampaignStatus } from "@notif/contracts";

export const STATUS_STYLES: Record<CampaignStatus, string> = {
  DRAFT: "border-line text-ink-mute",
  SCHEDULED: "border-amber-700/30 text-amber-900",
  QUEUED: "border-ink/20 text-ink-soft",
  SENDING: "border-sky-800/30 text-sky-900",
  COMPLETED: "border-emerald-700/30 text-emerald-800",
  FAILED: "border-red-700/30 text-red-800",
  CANCELLED: "border-line text-ink-faint",
};

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}
