import type { DeviceTokenPublic, RegisterTokenInput } from "@notif/contracts";
import { prisma, type DeviceToken } from "@notif/db";
import { DomainError } from "./projects.js";

export function toPublicToken(t: DeviceToken): DeviceTokenPublic {
  return {
    id: t.id,
    projectId: t.projectId,
    token: t.token,
    platform: t.platform,
    userId: t.userId,
    locale: t.locale,
    appVersion: t.appVersion,
    topics: t.topics,
    lastSeenAt: t.lastSeenAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
  };
}

/** Upsert a device token for a project (idempotent on [projectId, token]). */
export async function registerToken(projectId: string, input: RegisterTokenInput): Promise<DeviceTokenPublic> {
  const token = await prisma.deviceToken.upsert({
    where: { projectId_token: { projectId, token: input.token } },
    create: {
      projectId,
      token: input.token,
      platform: input.platform,
      userId: input.userId ?? null,
      locale: input.locale ?? null,
      appVersion: input.appVersion ?? null,
      topics: input.topics ?? [],
      lastSeenAt: new Date(),
    },
    update: {
      platform: input.platform,
      userId: input.userId ?? null,
      locale: input.locale ?? null,
      appVersion: input.appVersion ?? null,
      ...(input.topics ? { topics: input.topics } : {}),
      lastSeenAt: new Date(),
    },
  });
  return toPublicToken(token);
}

export async function deleteToken(projectId: string, token: string): Promise<void> {
  const existing = await prisma.deviceToken.findUnique({
    where: { projectId_token: { projectId, token } },
  });
  if (!existing) throw new DomainError("Token not found", "NOT_FOUND", 404);
  await prisma.deviceToken.delete({ where: { projectId_token: { projectId, token } } });
}

export async function listTokens(projectId: string, take = 100): Promise<DeviceTokenPublic[]> {
  const rows = await prisma.deviceToken.findMany({
    where: { projectId },
    orderBy: { lastSeenAt: "desc" },
    take,
  });
  return rows.map(toPublicToken);
}

/** Remove stale tokens surfaced during a send. */
export async function pruneStaleTokens(projectId: string, tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const res = await prisma.deviceToken.deleteMany({
    where: { projectId, token: { in: tokens } },
  });
  return res.count;
}
