import { z } from "zod";
import { ProjectStatus } from "./enums.js";
import { ServiceAccountInput } from "./service-account.js";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CreateProjectInput = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(slugRegex, "slug must be lowercase alphanumeric with dashes"),
  fcmServiceAccountJson: ServiceAccountInput,
  defaultBroadcastTopic: z.string().min(1).max(200).default("broadcast"),
  androidChannelId: z.string().max(200).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = z.object({
  name: z.string().min(1).max(120).optional(),
  fcmServiceAccountJson: ServiceAccountInput.optional(),
  defaultBroadcastTopic: z.string().min(1).max(200).optional(),
  androidChannelId: z.string().max(200).nullable().optional(),
  status: ProjectStatus.optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;

/**
 * Public representation of a project. The service-account JSON is NEVER
 * included — only a masked fingerprint derived from it.
 */
export const ProjectPublic = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  fcmProjectId: z.string(),
  fcmClientEmail: z.string(),
  credentialFingerprint: z.string(),
  defaultBroadcastTopic: z.string(),
  androidChannelId: z.string().nullable(),
  status: ProjectStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectPublic = z.infer<typeof ProjectPublic>;

export const TestCredentialsResult = z.object({
  ok: z.boolean(),
  fcmProjectId: z.string().optional(),
  clientEmail: z.string().optional(),
  error: z.string().optional(),
});
export type TestCredentialsResult = z.infer<typeof TestCredentialsResult>;
