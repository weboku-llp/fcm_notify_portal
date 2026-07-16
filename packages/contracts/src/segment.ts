import { z } from "zod";
import { Platform } from "./enums.js";

export const SegmentRules = z.object({
  platform: Platform.optional(),
  locale: z.string().max(35).optional(),
  topic: z.string().max(200).optional(),
  lastSeenWithinDays: z.number().int().positive().max(3650).optional(),
  customAttrs: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type SegmentRules = z.infer<typeof SegmentRules>;

export const CreateSegmentInput = z.object({
  name: z.string().min(1).max(120),
  rules: SegmentRules,
});
export type CreateSegmentInput = z.infer<typeof CreateSegmentInput>;

export const UpdateSegmentInput = z.object({
  name: z.string().min(1).max(120).optional(),
  rules: SegmentRules.optional(),
});
export type UpdateSegmentInput = z.infer<typeof UpdateSegmentInput>;

export const SegmentPublic = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  rules: SegmentRules,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SegmentPublic = z.infer<typeof SegmentPublic>;
