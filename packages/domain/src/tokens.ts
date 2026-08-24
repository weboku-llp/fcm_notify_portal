import type {
  DeviceRegistrationInput,
  DeviceRegistrationResponse,
  DeviceTokenPublic,
  RegisterTokenInput,
} from "@notif/contracts";
import { prisma, type DeviceToken, type NotificationPermission, type Platform, type Prisma } from "@notif/db";
import { createHash } from "node:crypto";
import { writeAuditLog } from "./audit.js";
import { DomainError } from "./errors.js";

export function hashRegistrationSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function toPublicToken(t: DeviceToken): DeviceTokenPublic {
  return {
    id: t.id,
    projectId: t.projectId,
    projectKey: t.projectKey,
    firebaseProjectId: t.firebaseProjectId,
    firebaseAppId: t.firebaseAppId,
    token: t.token,
    platform: t.platform,
    userId: t.userId,
    locale: t.locale,
    timezone: t.timezone,
    appVersion: t.appVersion,
    appBuildNumber: t.appBuildNumber,
    notificationPermission: t.notificationPermission,
    topics: t.topics,
    topicSubscriptionStatus: t.topicSubscriptionStatus,
    isActive: t.isActive,
    lastSeenAt: t.lastSeenAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    invalidatedAt: t.invalidatedAt ? t.invalidatedAt.toISOString() : null,
    invalidationReason: t.invalidationReason,
  };
}

function clientPlatformToDb(platform: "android" | "ios" | "web"): Platform {
  return platform.toUpperCase() as Platform;
}

function clientPermissionToDb(
  permission: "granted" | "denied" | "provisional" | "unknown",
): NotificationPermission {
  return permission.toUpperCase() as NotificationPermission;
}

/** Legacy portal upsert (project-scoped). Kept for dashboard manual registration. */
export async function registerToken(projectId: string, input: RegisterTokenInput): Promise<DeviceTokenPublic> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new DomainError(`Project ${projectId} not found`, "NOT_FOUND", 404);

  const token = await prisma.deviceToken.upsert({
    where: { projectKey_token: { projectKey: project.slug, token: input.token } },
    create: {
      projectId: project.id,
      projectKey: project.slug,
      firebaseProjectId: project.fcmProjectId,
      firebaseAppId: project.fcmAppId,
      token: input.token,
      platform: input.platform,
      userId: input.userId ?? null,
      locale: input.locale ?? null,
      appVersion: input.appVersion ?? null,
      topics: input.topics ?? [],
      topicSubscriptionStatus: (input.topics?.length ?? 0) > 0 ? "SUBSCRIBED" : "UNKNOWN",
      isActive: true,
      lastSeenAt: new Date(),
      invalidatedAt: null,
      invalidationReason: null,
    },
    update: {
      platform: input.platform,
      userId: input.userId ?? null,
      locale: input.locale ?? null,
      appVersion: input.appVersion ?? null,
      ...(input.topics ? { topics: input.topics } : {}),
      isActive: true,
      lastSeenAt: new Date(),
      invalidatedAt: null,
      invalidationReason: null,
    },
  });
  return toPublicToken(token);
}

/**
 * Mobile registration: upsert by [projectKey, token], validate Firebase project
 * isolation, mark previous token inactive on refresh.
 */
export async function registerDevice(
  input: DeviceRegistrationInput,
  opts?: { actor?: string },
): Promise<DeviceRegistrationResponse> {
  const project = await prisma.project.findUnique({ where: { slug: input.projectKey } });
  if (!project) {
    throw new DomainError(`Unknown projectKey "${input.projectKey}"`, "UNKNOWN_PROJECT", 404);
  }
  if (project.status !== "ACTIVE") {
    throw new DomainError(`Project "${input.projectKey}" is not ACTIVE`, "PROJECT_INACTIVE", 403);
  }
  if (project.fcmProjectId !== input.firebaseProjectId) {
    throw new DomainError(
      "firebaseProjectId does not match the configured project — tokens must never cross Firebase projects",
      "FIREBASE_PROJECT_MISMATCH",
      400,
    );
  }
  if (project.fcmAppId && input.firebaseAppId && project.fcmAppId !== input.firebaseAppId) {
    throw new DomainError(
      "firebaseAppId does not match the configured project app id",
      "FIREBASE_APP_MISMATCH",
      400,
    );
  }

  const topic = project.defaultBroadcastTopic;
  const topics = [topic];
  const now = new Date();

  if (input.previousToken && input.previousToken !== input.token) {
    await invalidateTokens(project.id, [input.previousToken], "replaced_by_refresh");
  }

  const registration = await prisma.deviceToken.upsert({
    where: { projectKey_token: { projectKey: project.slug, token: input.token } },
    create: {
      projectId: project.id,
      projectKey: project.slug,
      firebaseProjectId: input.firebaseProjectId,
      firebaseAppId: input.firebaseAppId,
      token: input.token,
      platform: clientPlatformToDb(input.platform),
      userId: input.userId ?? null,
      appVersion: input.appVersion ?? null,
      appBuildNumber: input.appBuildNumber ?? null,
      notificationPermission: clientPermissionToDb(input.notificationPermission),
      locale: input.deviceLocale ?? null,
      timezone: input.timezone ?? null,
      topics,
      topicSubscriptionStatus: input.topicSubscriptionStatus ?? "SUBSCRIBED",
      isActive: true,
      lastSeenAt: now,
      invalidatedAt: null,
      invalidationReason: null,
    },
    update: {
      firebaseProjectId: input.firebaseProjectId,
      firebaseAppId: input.firebaseAppId,
      platform: clientPlatformToDb(input.platform),
      userId: input.userId ?? null,
      appVersion: input.appVersion ?? null,
      appBuildNumber: input.appBuildNumber ?? null,
      notificationPermission: clientPermissionToDb(input.notificationPermission),
      locale: input.deviceLocale ?? null,
      timezone: input.timezone ?? null,
      topics,
      topicSubscriptionStatus: input.topicSubscriptionStatus ?? "SUBSCRIBED",
      isActive: true,
      lastSeenAt: now,
      invalidatedAt: null,
      invalidationReason: null,
    },
  });

  await writeAuditLog({
    projectId: project.id,
    action: "DEVICE_REGISTERED",
    actor: opts?.actor ?? input.userId ?? "mobile-app",
    summary: `Device registered for ${project.slug} (${registration.platform})`,
    metadata: {
      tokenId: registration.id,
      platform: registration.platform,
      appVersion: registration.appVersion,
      topic,
    },
  });

  return {
    registration: toPublicToken(registration),
    defaultBroadcastTopic: topic,
    subscribedTopic: topic,
  };
}

export async function deleteToken(projectId: string, token: string): Promise<void> {
  const existing = await prisma.deviceToken.findFirst({
    where: { projectId, token },
  });
  if (!existing) throw new DomainError("Token not found", "NOT_FOUND", 404);
  await prisma.deviceToken.delete({ where: { id: existing.id } });
}

export async function listTokens(
  projectId: string,
  take = 100,
  activeOnly = false,
): Promise<DeviceTokenPublic[]> {
  const rows = await prisma.deviceToken.findMany({
    where: { projectId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: { lastSeenAt: "desc" },
    take,
  });
  return rows.map(toPublicToken);
}

export async function countActiveDevices(projectId: string): Promise<number> {
  return prisma.deviceToken.count({ where: { projectId, isActive: true } });
}

/** Mark permanently invalid / refreshed tokens inactive (do not hard-delete). */
export async function invalidateTokens(
  projectId: string,
  tokens: string[],
  reason: string,
): Promise<number> {
  if (tokens.length === 0) return 0;
  const now = new Date();
  const res = await prisma.deviceToken.updateMany({
    where: { projectId, token: { in: tokens }, isActive: true },
    data: {
      isActive: false,
      invalidatedAt: now,
      invalidationReason: reason,
    },
  });
  if (res.count > 0) {
    await writeAuditLog({
      projectId,
      action: "DEVICE_INVALIDATED",
      summary: `Invalidated ${res.count} device token(s): ${reason}`,
      metadata: { count: res.count, reason, sampleTokens: tokens.slice(0, 5) },
    });
  }
  return res.count;
}

/** @deprecated Prefer invalidateTokens — kept as an alias for campaign sender. */
export async function pruneStaleTokens(projectId: string, tokens: string[]): Promise<number> {
  return invalidateTokens(projectId, tokens, "registration-token-not-registered");
}

export async function verifyProjectRegistrationSecret(
  projectKey: string,
  providedSecret: string | undefined,
  fallbackEnvSecret?: string,
): Promise<void> {
  const project = await prisma.project.findUnique({ where: { slug: projectKey } });
  if (!project) throw new DomainError(`Unknown projectKey "${projectKey}"`, "UNKNOWN_PROJECT", 404);

  if (!providedSecret) {
    throw new DomainError("Missing X-App-Registration-Key header", "UNAUTHORIZED", 401);
  }

  const providedHash = hashRegistrationSecret(providedSecret);

  if (project.registrationSecretHash) {
    if (project.registrationSecretHash !== providedHash) {
      throw new DomainError("Invalid registration key", "UNAUTHORIZED", 401);
    }
    return;
  }

  // Dev / shared fallback when project has no dedicated secret configured.
  if (fallbackEnvSecret && hashRegistrationSecret(fallbackEnvSecret) === providedHash) {
    return;
  }

  throw new DomainError(
    "Project has no registration secret configured and env fallback did not match",
    "UNAUTHORIZED",
    401,
  );
}

export async function estimateAudience(
  projectId: string,
  query: {
    mode: string;
    segmentId?: string;
    targetUserIds?: string[];
    targetTokens?: string[];
  },
): Promise<{ estimatedRecipients: number | null; coverageNote: string }> {
  const coverageNote =
    "Portal notifications reach devices that have updated and registered with the new notification system. Use Firebase Console during the migration period to reach older app versions.";

  if (query.mode === "BROADCAST_TOPIC") {
    // Best available proxy: active devices in portal cache (Firebase does not
    // expose live topic subscriber counts).
    return {
      estimatedRecipients: await countActiveDevices(projectId),
      coverageNote:
        "EST is active devices in the portal cache. Topic send still reaches every device subscribed via subscribeToTopic (may be more or fewer than cache).",
    };
  }
  if (query.mode === "ALL_REGISTERED") {
    return { estimatedRecipients: await countActiveDevices(projectId), coverageNote };
  }
  if (query.mode === "SPECIFIC_TOKENS") {
    return { estimatedRecipients: query.targetTokens?.length ?? 0, coverageNote };
  }
  if (query.mode === "SELECTED_USERS") {
    const ids = query.targetUserIds ?? [];
    if (ids.length === 0) return { estimatedRecipients: 0, coverageNote };
    const count = await prisma.deviceToken.count({
      where: { projectId, isActive: true, userId: { in: ids } },
    });
    return { estimatedRecipients: count, coverageNote };
  }
  if (query.mode === "SEGMENT" && query.segmentId) {
    const seg = await prisma.segment.findFirst({ where: { id: query.segmentId, projectId } });
    if (!seg) return { estimatedRecipients: 0, coverageNote };
    const { tokenWhereFromRules } = await import("./segments.js");
    const { SegmentRules } = await import("@notif/contracts");
    const rules = SegmentRules.parse(seg.rules);
    const count = await prisma.deviceToken.count({
      where: { ...tokenWhereFromRules(projectId, rules), isActive: true },
    });
    return { estimatedRecipients: count, coverageNote };
  }
  return { estimatedRecipients: 0, coverageNote };
}

export type { Prisma };
