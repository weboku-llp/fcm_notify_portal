import { z } from "zod";

/** Queue names used across API (producer) and worker (consumer). */
export const QUEUE_NAMES = {
  send: "campaign-send",
  scheduler: "campaign-scheduler",
  tokenSync: "project-token-sync",
  liveScore: "cric-live-score",
} as const;

/** Periodic / manual sync of FCM tokens from a project API into the portal DB. */
export const TokenSyncJob = z.object({
  projectId: z.string().optional(),
});
export type TokenSyncJob = z.infer<typeof TokenSyncJob>;

/** Job that sends a single campaign. jobId convention: `campaign-<id>`. */
export const SendCampaignJob = z.object({
  campaignId: z.string(),
});
export type SendCampaignJob = z.infer<typeof SendCampaignJob>;

/** Repeatable job that promotes due SCHEDULED campaigns to QUEUED. */
export const SchedulerTickJob = z.object({
  tickAt: z.string().datetime().optional(),
});
export type SchedulerTickJob = z.infer<typeof SchedulerTickJob>;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export function sendJobId(campaignId: string): string {
  return `campaign-${campaignId}`;
}
