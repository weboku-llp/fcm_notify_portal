import { z } from "zod";

export const ProjectStatus = z.enum(["ACTIVE", "PAUSED"]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const Platform = z.enum(["ANDROID", "IOS", "WEB"]);
export type Platform = z.infer<typeof Platform>;

/** Client-facing platform strings accepted by the device-registration API. */
export const PlatformClient = z.enum(["android", "ios", "web", "ANDROID", "IOS", "WEB"]);
export type PlatformClient = z.infer<typeof PlatformClient>;

export const CampaignMode = z.enum([
  "BROADCAST_TOPIC",
  "SEGMENT",
  "SPECIFIC_TOKENS",
  "ALL_REGISTERED",
  "SELECTED_USERS",
]);
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

export const TopicSubscriptionStatus = z.enum(["PENDING", "SUBSCRIBED", "FAILED", "UNKNOWN"]);
export type TopicSubscriptionStatus = z.infer<typeof TopicSubscriptionStatus>;

export const NotificationPermission = z.enum(["granted", "denied", "provisional", "unknown"]);
export type NotificationPermission = z.infer<typeof NotificationPermission>;

export const NotificationPermissionDb = z.enum(["GRANTED", "DENIED", "PROVISIONAL", "UNKNOWN"]);
export type NotificationPermissionDb = z.infer<typeof NotificationPermissionDb>;

export const AuditAction = z.enum([
  "DEVICE_REGISTERED",
  "DEVICE_INVALIDATED",
  "CAMPAIGN_CREATED",
  "CAMPAIGN_SENT",
  "CAMPAIGN_FAILED",
  "CREDENTIALS_TESTED",
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
]);
export type AuditAction = z.infer<typeof AuditAction>;
