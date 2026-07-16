import {
  type CreateProjectInput,
  type ProjectPublic,
  type ServiceAccount,
  type TestCredentialsResult,
  type UpdateProjectInput,
} from "@notif/contracts";
import { prisma, type Project } from "@notif/db";
import { encryptServiceAccount, maskFingerprint } from "@notif/crypto";
import { getFcmSender } from "./fcm/index.js";

/** Map a DB row to the public shape. The service-account ciphertext is dropped. */
export function toPublicProject(p: Project): ProjectPublic {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    fcmProjectId: p.fcmProjectId,
    fcmClientEmail: p.fcmClientEmail,
    credentialFingerprint: maskFingerprint(p.credentialFingerprint),
    defaultBroadcastTopic: p.defaultBroadcastTopic,
    androidChannelId: p.androidChannelId,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Validate a raw (already zod-parsed) service account by minting a token. */
export async function testServiceAccount(sa: ServiceAccount): Promise<TestCredentialsResult> {
  const sender = getFcmSender();
  const result = await sender.verifyCredentials({
    projectId: `probe-${sa.project_id}`,
    serviceAccount: sa,
  });
  return {
    ok: result.ok,
    fcmProjectId: result.fcmProjectId,
    clientEmail: result.clientEmail,
    error: result.error,
  };
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
      fcmServiceAccountJson: enc.ciphertext,
      credentialFingerprint: enc.credentialFingerprint,
      fcmProjectId: enc.fcmProjectId,
      fcmClientEmail: enc.fcmClientEmail,
      defaultBroadcastTopic: input.defaultBroadcastTopic,
      androidChannelId: input.androidChannelId ?? null,
    },
  });
  return toPublicProject(project);
}

export async function listProjects(): Promise<ProjectPublic[]> {
  const rows = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toPublicProject);
}

export async function getProjectOrThrow(id: string): Promise<Project> {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new DomainError(`Project ${id} not found`, "NOT_FOUND", 404);
  return project;
}

export async function getProjectPublic(id: string): Promise<ProjectPublic> {
  return toPublicProject(await getProjectOrThrow(id));
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<ProjectPublic> {
  await getProjectOrThrow(id);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.defaultBroadcastTopic !== undefined) data.defaultBroadcastTopic = input.defaultBroadcastTopic;
  if (input.androidChannelId !== undefined) data.androidChannelId = input.androidChannelId;
  if (input.status !== undefined) data.status = input.status;

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
  return toPublicProject(updated);
}
