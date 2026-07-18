import { z } from "zod";

/**
 * Standard contract every project API must expose so the notification portal
 * can pull FCM registration tokens.
 *
 * GET {tokenSourceApiBaseUrl}/api/internal/notif-portal/tokens
 * Header: X-Notif-Portal-Key: <shared secret>
 * Query: cursor?, limit? (default 500, max 1000), userId? (repeatable)
 */
export const ExternalDeviceToken = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["android", "ios", "web"]).default("android"),
  userId: z.string().max(200).nullable().optional(),
  lastSeenAt: z.string().datetime().optional(),
  appVersion: z.string().max(50).optional(),
});
export type ExternalDeviceToken = z.infer<typeof ExternalDeviceToken>;

export const ExternalTokensPage = z.object({
  tokens: z.array(ExternalDeviceToken),
  nextCursor: z.string().nullable(),
});
export type ExternalTokensPage = z.infer<typeof ExternalTokensPage>;

export const TokenSourceTestResult = z.object({
  ok: z.boolean(),
  httpStatus: z.number().optional(),
  tokenCountSample: z.number().optional(),
  /** True when portal flipped tokenSourceEnabled on after a successful 200. */
  enabled: z.boolean().optional(),
  error: z.string().optional(),
});
export type TokenSourceTestResult = z.infer<typeof TokenSourceTestResult>;

/** Save main API URL (+ optional key), probe tokens endpoint; enable only on HTTP 200. */
export const TestAndEnableTokenSourceInput = z.object({
  tokenSourceApiBaseUrl: z.string().url().max(500),
  /** Omit to keep the existing stored key. */
  tokenSourceApiKey: z.string().min(16).max(256).optional(),
});
export type TestAndEnableTokenSourceInput = z.infer<typeof TestAndEnableTokenSourceInput>;

export const TokenSyncResult = z.object({
  ok: z.boolean(),
  upserted: z.number(),
  deactivated: z.number(),
  pages: z.number(),
  error: z.string().optional(),
  syncedAt: z.string(),
});
export type TokenSyncResult = z.infer<typeof TokenSyncResult>;
