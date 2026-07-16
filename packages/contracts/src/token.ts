import { z } from "zod";
import { Platform } from "./enums.js";

export const RegisterTokenInput = z.object({
  token: z.string().min(1).max(4096),
  platform: Platform,
  userId: z.string().max(200).nullable().optional(),
  locale: z.string().max(35).nullable().optional(),
  appVersion: z.string().max(50).nullable().optional(),
  topics: z.array(z.string().min(1).max(200)).max(100).optional(),
});
export type RegisterTokenInput = z.infer<typeof RegisterTokenInput>;

export const DeviceTokenPublic = z.object({
  id: z.string(),
  projectId: z.string(),
  token: z.string(),
  platform: Platform,
  userId: z.string().nullable(),
  locale: z.string().nullable(),
  appVersion: z.string().nullable(),
  topics: z.array(z.string()),
  lastSeenAt: z.string(),
  createdAt: z.string(),
});
export type DeviceTokenPublic = z.infer<typeof DeviceTokenPublic>;
