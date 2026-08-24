import {
  type CreateProjectInput,
  type ProjectPublic,
  type ServiceAccount,
  type TestCredentialsResult,
  type UpdateProjectInput,
} from "@notif/contracts";
import { prisma, type Project } from "@notif/db";
import { decryptServiceAccount, encryptServiceAccount, maskFingerprint } from "@notif/crypto";
import { writeAuditLog } from "./audit.js";
import { DomainError } from "./errors.js";
import { getFcmSender } from "./fcm/index.js";
import { evictApp } from "./fcm/firebase.js";
import { countActiveDevices, hashRegistrationSecret } from "./tokens.js";
import { encryptTokenSourceApiKey } from "./token-source.js";

export { DomainError };

/** Map a DB row to the public shape. The service-account ciphertext is dropped. */
export function toPublicProject(p: Project, activeDeviceCount?: number): ProjectPublic {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    projectKey: p.slug,
    logoUrl: p.logoUrl ?? null,
    fcmProjectId: p.fcmProjectId,
    fcmAppId: p.fcmAppId,
    fcmClientEmail: p.fcmClientEmail,
    credentialFingerprint: maskFingerprint(p.credentialFingerprint),
    defaultBroadcastTopic: p.defaultBroadcastTopic,
    androidChannelId: p.androidChannelId,
    status: p.status,
    hasRegistrationSecret: Boolean(p.registrationSecretHash),
    tokenSourceApiBaseUrl: p.tokenSourceApiBaseUrl,
    tokenSourceEnabled: p.tokenSourceEnabled,
    hasTokenSourceApiKey: Boolean(p.tokenSourceApiKeyEncrypted),
    tokenSourceLastSyncAt: p.tokenSourceLastSyncAt ? p.tokenSourceLastSyncAt.toISOString() : null,
    tokenSourceLastSyncOk: p.tokenSourceLastSyncOk,
    tokenSourceLastSyncError: p.tokenSourceLastSyncError,
    tokenSourceLastSyncCount: p.tokenSourceLastSyncCount,
    activeDeviceCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Validate a raw (already zod-parsed) service account by minting a token. */
export async function testServiceAccount(sa: ServiceAccount): Promise<TestCredentialsResult> {
  const sender = getFcmSender();
  const result = await sender.verifyCredentials({
    projectId: `probe-${sa.project_id}`,
    serviceAccount: sa,
  });
  let error = result.error;
  if (error && /DECODER routines::unsupported|Failed to parse private key/i.test(error)) {
    error =
      "Private key could not be parsed. Re-download the JSON from Firebase Console → Service accounts → Generate new private key, then upload the file (don’t re-type the key).";
  }
  return {
    ok: result.ok,
    fcmProjectId: result.fcmProjectId,
    clientEmail: result.clientEmail,
    error,
  };
}

/**
 * Re-verify the credentials already stored for a project (no re-upload needed) —
 * decrypts the saved service account and mints a fresh Firebase access token.
 * Used to show "Configured — connection established" without asking the user
 * to paste the JSON again.
 */
export async function verifyProjectCredentials(id: string): Promise<TestCredentialsResult> {
  const project = await getProjectOrThrow(id);
  const sa = decryptServiceAccount(project.fcmServiceAccountJson);
  return testServiceAccount(sa);
}

export async function createProject(input: CreateProjectInput): Promise<ProjectPublic> {
  const existing = await prisma.project.findUnique({ where: { slug: input.slug } });
  if (existing) throw new DomainError(`Slug "${input.slug}" is already in use`, "SLUG_TAKEN", 409);

  const check = await testServiceAccount(input.fcmServiceAccountJson);
  if (!check.ok) {
    throw new DomainError(check.error ?? "Invalid service account", "INVALID_CREDENTIALS", 400);
  }

  const enc = encryptServiceAccount(input.fcmServiceAccountJson);
  const project = await prisma.project.create({
    data: {
      name: input.name,
      slug: input.slug,
      logoUrl: input.logoUrl ?? null,
      fcmServiceAccountJson: enc.ciphertext,
      credentialFingerprint: enc.credentialFingerprint,
      fcmProjectId: enc.fcmProjectId,
      fcmAppId: input.fcmAppId ?? null,
      fcmClientEmail: enc.fcmClientEmail,
      defaultBroadcastTopic: input.defaultBroadcastTopic,
      androidChannelId: input.androidChannelId ?? null,
      registrationSecretHash: input.registrationSecret
        ? hashRegistrationSecret(input.registrationSecret)
        : null,
      tokenSourceApiBaseUrl: input.tokenSourceApiBaseUrl ?? null,
      tokenSourceApiKeyEncrypted: input.tokenSourceApiKey
        ? encryptTokenSourceApiKey(input.tokenSourceApiKey)
        : null,
      tokenSourceEnabled: input.tokenSourceEnabled ?? false,
    },
  });

  await writeAuditLog({
    projectId: project.id,
    action: "PROJECT_CREATED",
    summary: `Created project ${project.name} (${project.slug})`,
    metadata: { fcmProjectId: project.fcmProjectId, defaultBroadcastTopic: project.defaultBroadcastTopic },
  });

  return toPublicProject(project, 0);
}

export async function listProjects(): Promise<ProjectPublic[]> {
  const rows = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  const counts = await Promise.all(rows.map((p) => countActiveDevices(p.id)));
  return rows.map((p, i) => toPublicProject(p, counts[i]));
}

export async function getProjectOrThrow(id: string): Promise<Project> {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new DomainError(`Project ${id} not found`, "NOT_FOUND", 404);
  return project;
}

export async function getProjectByKeyOrThrow(projectKey: string): Promise<Project> {
  const project = await prisma.project.findUnique({ where: { slug: projectKey } });
  if (!project) throw new DomainError(`Project key ${projectKey} not found`, "NOT_FOUND", 404);
  return project;
}

export async function getProjectPublic(id: string): Promise<ProjectPublic> {
  const project = await getProjectOrThrow(id);
  return toPublicProject(project, await countActiveDevices(project.id));
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<ProjectPublic> {
  await getProjectOrThrow(id);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
  if (input.defaultBroadcastTopic !== undefined) data.defaultBroadcastTopic = input.defaultBroadcastTopic;
  if (input.androidChannelId !== undefined) data.androidChannelId = input.androidChannelId;
  if (input.fcmAppId !== undefined) data.fcmAppId = input.fcmAppId;
  if (input.status !== undefined) data.status = input.status;
  if (input.registrationSecret !== undefined) {
    data.registrationSecretHash = input.registrationSecret
      ? hashRegistrationSecret(input.registrationSecret)
      : null;
  }
  if (input.tokenSourceApiBaseUrl !== undefined) {
    data.tokenSourceApiBaseUrl = input.tokenSourceApiBaseUrl;
  }
  if (input.tokenSourceApiKey !== undefined) {
    data.tokenSourceApiKeyEncrypted = input.tokenSourceApiKey
      ? encryptTokenSourceApiKey(input.tokenSourceApiKey)
      : null;
  }
  if (input.tokenSourceEnabled !== undefined) {
    data.tokenSourceEnabled = input.tokenSourceEnabled;
  }

  if (input.fcmServiceAccountJson !== undefined) {
    const check = await testServiceAccount(input.fcmServiceAccountJson);
    if (!check.ok) {
      throw new DomainError(check.error ?? "Invalid service account", "INVALID_CREDENTIALS", 400);
    }
    const enc = encryptServiceAccount(input.fcmServiceAccountJson);
    data.fcmServiceAccountJson = enc.ciphertext;
    data.credentialFingerprint = enc.credentialFingerprint;
    data.fcmProjectId = enc.fcmProjectId;
    data.fcmClientEmail = enc.fcmClientEmail;
  }

  const updated = await prisma.project.update({ where: { id }, data });
  if (input.fcmServiceAccountJson !== undefined) {
    await evictApp(id).catch(() => undefined);
  }
  await writeAuditLog({
    projectId: updated.id,
    action: "PROJECT_UPDATED",
    summary: `Updated project ${updated.name}`,
    metadata: { fields: Object.keys(data) },
  });
  return toPublicProject(updated, await countActiveDevices(updated.id));
}
