import { z } from "zod";
import {
  NotificationPermission,
  NotificationPermissionDb,
  Platform,
  TopicSubscriptionStatus,
} from "./enums.js";

export const RegisterTokenInput = z.object({
  token: z.string().min(1).max(4096),
  platform: Platform,
  userId: z.string().max(200).nullable().optional(),
  locale: z.string().max(35).nullable().optional(),
  appVersion: z.string().max(50).nullable().optional(),
  topics: z.array(z.string().min(1).max(200)).max(100).optional(),
});
export type RegisterTokenInput = z.infer<typeof RegisterTokenInput>;

/**
 * Mobile app device registration payload (POST /api/device-registrations).
 * Platform and permission are accepted in lowercase client form.
 */
export const DeviceRegistrationInput = z.object({
  projectKey: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "projectKey must be lowercase alphanumeric with dashes"),
  firebaseProjectId: z.string().min(1).max(200),
  firebaseAppId: z.string().min(1).max(200),
  token: z.string().min(1).max(4096),
  platform: z.enum(["android", "ios", "web"]),
  userId: z.string().max(200).nullable().optional(),
  appVersion: z.string().max(50).optional(),
  appBuildNumber: z.string().max(50).optional(),
  notificationPermission: NotificationPermission.default("unknown"),
  deviceLocale: z.string().max(35).optional(),
  timezone: z.string().max(64).optional(),
  /** Previous FCM token when refreshed — used to mark the old registration inactive. */
  previousToken: z.string().min(1).max(4096).optional(),
  topicSubscriptionStatus: TopicSubscriptionStatus.optional(),
});
export type DeviceRegistrationInput = z.infer<typeof DeviceRegistrationInput>;

export const DeviceTokenPublic = z.object({
  id: z.string(),
  projectId: z.string(),
  projectKey: z.string(),
  firebaseProjectId: z.string(),
  firebaseAppId: z.string().nullable(),
  token: z.string(),
  platform: Platform,
  userId: z.string().nullable(),
  locale: z.string().nullable(),
  timezone: z.string().nullable(),
  appVersion: z.string().nullable(),
  appBuildNumber: z.string().nullable(),
  notificationPermission: NotificationPermissionDb,
  topics: z.array(z.string()),
  topicSubscriptionStatus: TopicSubscriptionStatus,
  isActive: z.boolean(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  invalidatedAt: z.string().nullable(),
  invalidationReason: z.string().nullable(),
});
export type DeviceTokenPublic = z.infer<typeof DeviceTokenPublic>;

export const DeviceRegistrationResponse = z.object({
  registration: DeviceTokenPublic,
  defaultBroadcastTopic: z.string(),
  subscribedTopic: z.string(),
});
export type DeviceRegistrationResponse = z.infer<typeof DeviceRegistrationResponse>;

export const AudienceEstimateQuery = z.object({
  mode: z.enum(["ALL_REGISTERED", "SELECTED_USERS", "SEGMENT", "BROADCAST_TOPIC", "SPECIFIC_TOKENS"]),
  segmentId: z.string().optional(),
  targetUserIds: z.array(z.string()).max(100_000).optional(),
  targetTokens: z.array(z.string()).max(100_000).optional(),
  targetTopic: z.string().optional(),
});
export type AudienceEstimateQuery = z.infer<typeof AudienceEstimateQuery>;
