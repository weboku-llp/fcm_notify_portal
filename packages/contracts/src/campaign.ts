import { z } from "zod";
import { CampaignMode, CampaignStatus, DeliveryStatus, Platform } from "./enums.js";
import { OptionalHttpsImageUrl } from "./notification-image.js";

/** The notification payload fields shared by templates and campaigns. */
export const NotificationContent = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(4000),
  imageUrl: OptionalHttpsImageUrl,
  deepLink: z.string().max(2000).nullable().optional(),
  dataJson: z.record(z.string()).default({}),
});
export type NotificationContent = z.infer<typeof NotificationContent>;

/**
 * Create a campaign. `action` decides whether it is stored as a draft,
 * scheduled for later, or sent immediately.
 */
export const CreateCampaignInput = z
  .object({
    action: z.enum(["draft", "schedule", "send_now"]).default("draft"),
    mode: CampaignMode,
    templateId: z.string().nullable().optional(),
    /** Variable values used when rendering from a template. */
    templateVariables: z.record(z.string()).optional(),
    // Content can be provided inline or resolved from a template.
    title: z.string().min(1).max(500).optional(),
    body: z.string().min(1).max(4000).optional(),
    imageUrl: OptionalHttpsImageUrl,
    deepLink: z.string().max(2000).nullable().optional(),
    dataJson: z.record(z.string()).default({}),
    // Targeting
    targetTopic: z.string().min(1).max(200).nullable().optional(),
    segmentId: z.string().nullable().optional(),
    targetTokens: z.array(z.string().min(1)).max(100_000).optional(),
    targetUserIds: z.array(z.string().min(1)).max(100_000).optional(),
    /** Pull latest tokens from the project API into portal cache immediately before send. */
    refreshFromApiBeforeSend: z.boolean().optional().default(false),
    // Scheduling
    scheduledAt: z.string().datetime().nullable().optional(),
    timezone: z.string().max(64).nullable().optional(),
    createdBy: z.string().max(200).nullable().optional(),
    /// Android / iOS extras stored in dataJson or ignored by sender defaults.
    androidChannelId: z.string().max(200).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.templateId && (!val.title || !val.body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "title and body are required when templateId is not provided",
      });
    }
    if (val.mode === "BROADCAST_TOPIC" && !val.targetTopic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetTopic"],
        message: "targetTopic is required for BROADCAST_TOPIC",
      });
    }
    if (val.mode === "SEGMENT" && !val.segmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["segmentId"],
        message: "segmentId is required for SEGMENT",
      });
    }
    if (val.mode === "SPECIFIC_TOKENS" && (!val.targetTokens || val.targetTokens.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetTokens"],
        message: "targetTokens is required for SPECIFIC_TOKENS",
      });
    }
    if (val.mode === "SELECTED_USERS" && (!val.targetUserIds || val.targetUserIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetUserIds"],
        message: "targetUserIds is required for SELECTED_USERS",
      });
    }
    if (val.action === "schedule" && !val.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: "scheduledAt is required when action=schedule",
      });
    }
  });
export type CreateCampaignInput = z.infer<typeof CreateCampaignInput>;

export const TestSendInput = z.object({
  token: z.string().min(1),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(4000),
  imageUrl: OptionalHttpsImageUrl,
  deepLink: z.string().max(2000).nullable().optional(),
  dataJson: z.record(z.string()).default({}),
});
export type TestSendInput = z.infer<typeof TestSendInput>;

export const CampaignPublic = z.object({
  id: z.string(),
  projectId: z.string(),
  templateId: z.string().nullable(),
  mode: CampaignMode,
  targetTopic: z.string().nullable(),
  segmentId: z.string().nullable(),
  targetTokens: z.array(z.string()),
  targetUserIds: z.array(z.string()),
  refreshFromApiBeforeSend: z.boolean(),
  targetValue: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  deepLink: z.string().nullable(),
  dataJson: z.record(z.string()),
  status: CampaignStatus,
  scheduledAt: z.string().nullable(),
  timezone: z.string().nullable(),
  sentAt: z.string().nullable(),
  estimatedRecipients: z.number().nullable(),
  attemptedCount: z.number(),
  sentCount: z.number(),
  failedCount: z.number(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  firebaseMessageId: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CampaignPublic = z.infer<typeof CampaignPublic>;

/** Per-device delivery outcome for a campaign (history drawer). */
export const CampaignDeliveryPublic = z.object({
  id: z.string(),
  campaignId: z.string(),
  status: DeliveryStatus,
  error: z.string().nullable(),
  errorCode: z.string().nullable(),
  messageId: z.string().nullable(),
  createdAt: z.string(),
  tokenId: z.string().nullable(),
  tokenPreview: z.string().nullable(),
  platform: Platform.nullable(),
  userId: z.string().nullable(),
  locale: z.string().nullable(),
});
export type CampaignDeliveryPublic = z.infer<typeof CampaignDeliveryPublic>;

export const ListCampaignDeliveriesQuery = z.object({
  status: DeliveryStatus.optional(),
  q: z.string().max(200).optional(),
});
export type ListCampaignDeliveriesQuery = z.infer<typeof ListCampaignDeliveriesQuery>;

