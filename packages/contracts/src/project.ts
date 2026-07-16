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
  fcmAppId: z.string().max(200).nullable().optional(),
  defaultBroadcastTopic: z.string().min(1).max(200).default("broadcast"),
  androidChannelId: z.string().max(200).optional(),
  /** Plaintext registration secret for mobile apps. Stored as a SHA-256 hash only. */
  registrationSecret: z.string().min(16).max(256).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = z.object({
  name: z.string().min(1).max(120).optional(),
  fcmServiceAccountJson: ServiceAccountInput.optional(),
  fcmAppId: z.string().max(200).nullable().optional(),
  defaultBroadcastTopic: z.string().min(1).max(200).optional(),
  androidChannelId: z.string().max(200).nullable().optional(),
  status: ProjectStatus.optional(),
  registrationSecret: z.string().min(16).max(256).nullable().optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;

/**
 * Public representation of a project. The service-account JSON and registration
 * secret are NEVER included — only a masked fingerprint.
 */
export const ProjectPublic = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  projectKey: z.string(),
  fcmProjectId: z.string(),
  fcmAppId: z.string().nullable(),
  fcmClientEmail: z.string(),
  credentialFingerprint: z.string(),
  defaultBroadcastTopic: z.string(),
  androidChannelId: z.string().nullable(),
  status: ProjectStatus,
  hasRegistrationSecret: z.boolean(),
  activeDeviceCount: z.number().optional(),
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
