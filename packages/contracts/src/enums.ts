import { z } from "zod";

export const ProjectStatus = z.enum(["ACTIVE", "PAUSED"]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const Platform = z.enum(["ANDROID", "IOS", "WEB"]);
export type Platform = z.infer<typeof Platform>;

export const CampaignMode = z.enum(["BROADCAST_TOPIC", "SEGMENT", "SPECIFIC_TOKENS"]);
export type CampaignMode = z.infer<typeof CampaignMode>;

export const CampaignStatus = z.enum([
  "DRAFT",
  "SCHEDULED",
  "QUEUED",
  "SENDING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

export const DeliveryStatus = z.enum(["SENT", "FAILED", "STALE"]);
export type DeliveryStatus = z.infer<typeof DeliveryStatus>;
