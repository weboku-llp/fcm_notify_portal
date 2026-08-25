import {
  type CampaignPublic,
  type CreateCampaignInput,
  type TestCredentialsResult,
  type TestSendInput,
  SegmentRules,
  normalizeNotificationImageUrl,
} from "@notif/contracts";
import { prisma, type Campaign, type CampaignStatus, type Prisma, type Project } from "@notif/db";
import { writeAuditLog } from "./audit.js";
import { getFcmSender, isCredentialMismatchError, isStaleTokenError, type PushMessage } from "./fcm/index.js";
import { DomainError } from "./errors.js";
import { getProjectOrThrow } from "./projects.js";
import { projectContext } from "./secrets.js";
import { tokenWhereFromRules } from "./segments.js";
import { invalidateTokens, countActiveDevices } from "./tokens.js";
import { isLikelyFcmToken } from "./fcm-token.js";
import { projectHasTokenSource, syncProjectTokens } from "./token-source.js";
import { renderTemplateStrict, TemplateVariableError } from "./templates.js";
import { createLogger } from "@notif/logger";

const log = createLogger("campaigns");

function assertNotificationImageUrl(value: string | null | undefined): string | null {
  const result = normalizeNotificationImageUrl(value);
  if (!result.ok) {
    throw new DomainError(result.message, "INVALID_IMAGE_URL", 400);
  }
  return result.imageUrl;
}

function asStringRecord(json: Prisma.JsonValue | null | undefined): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json)) out[k] = typeof v === "string" ? v : JSON.stringify(v);
  return out;
}

export function toPublicCampaign(c: Campaign): CampaignPublic {
  return {
    id: c.id,
    projectId: c.projectId,
    templateId: c.templateId,
    mode: c.mode,
    targetTopic: c.targetTopic,
    segmentId: c.segmentId,
    targetTokens: c.targetTokens,
    targetUserIds: c.targetUserIds,
    refreshFromApiBeforeSend: c.refreshFromApiBeforeSend,
    targetValue: c.targetValue,
    title: c.title,
    body: c.body,
    imageUrl: c.imageUrl,
    deepLink: c.deepLink,
    dataJson: asStringRecord(c.dataJson),
    status: c.status,
    scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
    timezone: c.timezone,
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
    estimatedRecipients: c.estimatedRecipients,
    attemptedCount: c.attemptedCount,
    sentCount: c.sentCount,
    failedCount: c.failedCount,
    completedAt: c.completedAt ? c.completedAt.toISOString() : null,
    errorMessage: c.errorMessage,
    firebaseMessageId: c.firebaseMessageId,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function messageFromCampaign(c: Campaign, project: Project): PushMessage {
  return {
    title: c.title,
    body: c.body,
    imageUrl: c.imageUrl,
    deepLink: c.deepLink,
    data: asStringRecord(c.dataJson),
    androidChannelId: project.androidChannelId,
  };
}

function targetValueFor(mode: CreateCampaignInput["mode"], input: CreateCampaignInput, project: Project): string {
  switch (mode) {
    case "BROADCAST_TOPIC":
      return `topic:${input.targetTopic ?? project.defaultBroadcastTopic}`;
    case "ALL_REGISTERED":
      return "all_registered_devices";
    case "SELECTED_USERS":
      return `users:${(input.targetUserIds ?? []).length}`;
    case "SPECIFIC_TOKENS":
      return `tokens:${(input.targetTokens ?? []).length}`;
    case "SEGMENT":
      return `segment:${input.segmentId ?? ""}`;
    default:
      return mode;
  }
}

export interface CreateCampaignResult {
  campaign: CampaignPublic;
  /** True when the campaign should be enqueued immediately for sending. */
  enqueue: boolean;
}

async function resolveContent(
  projectId: string,
  input: CreateCampaignInput,
): Promise<{
  title: string;
  body: string;
  imageUrl: string | null;
  deepLink: string | null;
  dataJson: Record<string, string>;
  templateId: string | null;
}> {
  if (input.templateId) {
    const tpl = await prisma.template.findFirst({
      where: { id: input.templateId, OR: [{ projectId }, { projectId: null }] },
    });
    if (!tpl) throw new DomainError(`Template ${input.templateId} not found`, "NOT_FOUND", 404);
    try {
      const rendered = renderTemplateStrict(
        {
          title: tpl.title,
          body: tpl.body,
          imageUrl: tpl.imageUrl,
          deepLink: tpl.deepLink,
          dataJson: asStringRecord(tpl.dataJson),
        },
        tpl.variables,
        input.templateVariables ?? {},
      );
      // Prefer an explicit compose-time image override when the template has no
      // image (or when the operator pastes a CDN URL on top of the template).
      const fromTemplate = assertNotificationImageUrl(rendered.imageUrl);
      const fromInput =
        input.imageUrl != null && String(input.imageUrl).trim()
          ? assertNotificationImageUrl(input.imageUrl)
          : null;
      return {
        title: rendered.title,
        body: rendered.body,
        imageUrl: fromInput ?? fromTemplate,
        deepLink: rendered.deepLink ?? null,
        dataJson: rendered.dataJson ?? {},
        templateId: tpl.id,
      };
    } catch (err) {
      if (err instanceof TemplateVariableError) {
        throw new DomainError(err.message, "MISSING_TEMPLATE_VARIABLES", 400);
      }
      throw err;
    }
  }

  return {
    title: input.title!,
    body: input.body!,
    imageUrl: assertNotificationImageUrl(input.imageUrl),
    deepLink: input.deepLink ?? null,
    dataJson: input.dataJson,
    templateId: null,
  };
}

async function estimateForCampaign(project: Project, input: CreateCampaignInput): Promise<number | null> {
  if (input.mode === "BROADCAST_TOPIC") {
    // Proxy: active portal-cache devices that look like real FCM tokens.
    return countActiveDevices(project.id);
  }
  if (input.mode === "ALL_REGISTERED") {
    return countActiveDevices(project.id);
  }
  if (input.mode === "SPECIFIC_TOKENS") {
    return (input.targetTokens ?? []).filter((t) => isLikelyFcmToken(t)).length;
  }
  if (input.mode === "SELECTED_USERS") {
    const ids = input.targetUserIds ?? [];
    if (ids.length === 0) return 0;
    const rows = await prisma.deviceToken.findMany({
      where: { projectId: project.id, isActive: true, userId: { in: ids } },
      select: { token: true },
    });
    return rows.filter((r) => isLikelyFcmToken(r.token)).length;
  }
  if (input.mode === "SEGMENT" && input.segmentId) {
    const seg = await prisma.segment.findFirst({ where: { id: input.segmentId, projectId: project.id } });
    if (!seg) return 0;
    const rules = SegmentRules.parse(seg.rules);
    const rows = await prisma.deviceToken.findMany({
      where: { ...tokenWhereFromRules(project.id, rules), isActive: true },
      select: { token: true },
    });
    return rows.filter((r) => isLikelyFcmToken(r.token)).length;
  }
  return null;
}

export async function createCampaign(
  projectId: string,
  input: CreateCampaignInput,
): Promise<CreateCampaignResult> {
  const project = await getProjectOrThrow(projectId);

  if (input.mode === "SEGMENT" && input.segmentId) {
    const seg = await prisma.segment.findFirst({ where: { id: input.segmentId, projectId } });
    if (!seg) throw new DomainError(`Segment ${input.segmentId} not found in project`, "NOT_FOUND", 404);
  }

  const content = await resolveContent(projectId, input);
  const estimatedRecipients = await estimateForCampaign(project, input);

  let status: CampaignStatus = "DRAFT";
  if (input.action === "schedule") status = "SCHEDULED";
  else if (input.action === "send_now") status = "QUEUED";

  const campaign = await prisma.campaign.create({
    data: {
      projectId,
      templateId: content.templateId,
      mode: input.mode,
      targetTopic: input.targetTopic ?? null,
      segmentId: input.segmentId ?? null,
      targetTokens: input.targetTokens ?? [],
      targetUserIds: input.targetUserIds ?? [],
      refreshFromApiBeforeSend: input.refreshFromApiBeforeSend ?? false,
      targetValue: targetValueFor(input.mode, input, project),
      title: content.title,
      body: content.body,
      imageUrl: content.imageUrl,
      deepLink: content.deepLink,
      dataJson: content.dataJson as Prisma.InputJsonValue,
      status,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      timezone: input.timezone ?? null,
      estimatedRecipients,
      createdBy: input.createdBy ?? null,
    },
  });

  await writeAuditLog({
    projectId,
    action: "CAMPAIGN_CREATED",
    actor: input.createdBy ?? null,
    summary: `Campaign created (${campaign.mode}) — ${campaign.title}`,
    metadata: {
      campaignId: campaign.id,
      mode: campaign.mode,
      action: input.action,
      estimatedRecipients,
      targetValue: campaign.targetValue,
    },
  });

  return { campaign: toPublicCampaign(campaign), enqueue: input.action === "send_now" };
}

export async function listCampaigns(projectId?: string): Promise<CampaignPublic[]> {
  const rows = await prisma.campaign.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(toPublicCampaign);
}

export async function getCampaignPublic(id: string): Promise<CampaignPublic> {
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) throw new DomainError(`Campaign ${id} not found`, "NOT_FOUND", 404);
  return toPublicCampaign(c);
}

export async function listCampaignDeliveries(
  campaignId: string,
  opts: { status?: "SENT" | "FAILED" | "STALE"; q?: string } = {},
): Promise<{
  campaign: CampaignPublic;
  deliveries: {
    id: string;
    campaignId: string;
    status: "SENT" | "FAILED" | "STALE";
    error: string | null;
    errorCode: string | null;
    messageId: string | null;
    createdAt: string;
    tokenId: string | null;
    tokenPreview: string | null;
    platform: "ANDROID" | "IOS" | "WEB" | null;
    userId: string | null;
    locale: string | null;
  }[];
  counts: { sent: number; failed: number; stale: number; total: number };
}> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new DomainError(`Campaign ${campaignId} not found`, "NOT_FOUND", 404);

  const rows = await prisma.campaignDelivery.findMany({
    where: {
      campaignId,
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: {
      token: { select: { token: true, platform: true, userId: true, locale: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 2000,
  });

  const q = opts.q?.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => {
        const hay = [
          r.error ?? "",
          r.errorCode ?? "",
          r.messageId ?? "",
          r.token?.token ?? "",
          r.token?.userId ?? "",
          r.token?.platform ?? "",
          r.status,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : rows;

  const allForCounts = await prisma.campaignDelivery.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  let sent = 0;
  let failed = 0;
  let stale = 0;
  for (const g of allForCounts) {
    if (g.status === "SENT") sent = g._count._all;
    else if (g.status === "FAILED") failed = g._count._all;
    else if (g.status === "STALE") stale = g._count._all;
  }

  return {
    campaign: toPublicCampaign(campaign),
    deliveries: filtered.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      status: r.status,
      error: r.error,
      errorCode: r.errorCode,
      messageId: r.messageId,
      createdAt: r.createdAt.toISOString(),
      tokenId: r.tokenId,
      tokenPreview: r.token?.token ? `${r.token.token.slice(0, 20)}…` : null,
      platform: r.token?.platform ?? null,
      userId: r.token?.userId ?? null,
      locale: r.token?.locale ?? null,
    })),
    counts: { sent, failed, stale, total: sent + failed + stale },
  };
}

export async function cancelCampaign(id: string): Promise<CampaignPublic> {
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) throw new DomainError(`Campaign ${id} not found`, "NOT_FOUND", 404);
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(c.status)) {
    throw new DomainError(`Campaign is already ${c.status}`, "INVALID_STATE", 409);
  }
  const updated = await prisma.campaign.update({ where: { id }, data: { status: "CANCELLED" } });
  return toPublicCampaign(updated);
}

async function resolveTokens(project: Project, campaign: Campaign): Promise<string[]> {
  let tokens: string[] = [];
  if (campaign.mode === "SPECIFIC_TOKENS") {
    tokens = campaign.targetTokens;
  } else if (campaign.mode === "ALL_REGISTERED") {
    const rows = await prisma.deviceToken.findMany({
      where: { projectId: project.id, isActive: true },
      select: { token: true },
    });
    tokens = rows.map((t) => t.token);
  } else if (campaign.mode === "SELECTED_USERS") {
    if (campaign.targetUserIds.length === 0) return [];
    const rows = await prisma.deviceToken.findMany({
      where: { projectId: project.id, isActive: true, userId: { in: campaign.targetUserIds } },
      select: { token: true },
    });
    tokens = rows.map((t) => t.token);
  } else if (campaign.mode === "SEGMENT") {
    if (!campaign.segmentId) return [];
    const seg = await prisma.segment.findFirst({ where: { id: campaign.segmentId, projectId: project.id } });
    if (!seg) return [];
    const rules = SegmentRules.parse(seg.rules);
    const rows = await prisma.deviceToken.findMany({
      where: { ...tokenWhereFromRules(project.id, rules), isActive: true },
      select: { token: true },
    });
    tokens = rows.map((t) => t.token);
  } else {
    return [];
  }

  const valid = tokens.filter((t) => isLikelyFcmToken(t));
  const junk = tokens.filter((t) => !isLikelyFcmToken(t));
  if (junk.length > 0 && campaign.mode !== "SPECIFIC_TOKENS") {
    await invalidateTokens(project.id, junk, "not-a-valid-fcm-registration-token");
    log.info({ projectId: project.id, pruned: junk.length }, "dropped non-FCM tokens before send");
  }
  return valid;
}

/**
 * Core sender used by the worker. Loads the campaign + its project, sends via
 * the correct named Firebase app, updates counts, invalidates stale tokens, and
 * sets a terminal status.
 */
export async function runCampaign(campaignId: string): Promise<CampaignPublic> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new DomainError(`Campaign ${campaignId} not found`, "NOT_FOUND", 404);

  if (campaign.status === "CANCELLED") {
    log.info({ campaignId }, "skip cancelled campaign");
    return toPublicCampaign(campaign);
  }
  if (["COMPLETED", "FAILED", "SENDING"].includes(campaign.status)) {
    log.warn({ campaignId, status: campaign.status }, "campaign not in a sendable state");
    return toPublicCampaign(campaign);
  }

  const project = await getProjectOrThrow(campaign.projectId);
  if (project.status !== "ACTIVE") {
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED", errorMessage: "Project is not ACTIVE", completedAt: new Date() },
    });
    return toPublicCampaign(updated);
  }

  const imageCheck = normalizeNotificationImageUrl(campaign.imageUrl);
  if (!imageCheck.ok) {
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "FAILED",
        errorMessage: imageCheck.message,
        completedAt: new Date(),
      },
    });
    await writeAuditLog({
      projectId: project.id,
      action: "CAMPAIGN_FAILED",
      summary: `Campaign blocked: ${imageCheck.message}`,
      metadata: { campaignId, code: "INVALID_IMAGE_URL" },
    });
    return toPublicCampaign(updated);
  }

  const sentAt = new Date();
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "SENDING", sentAt } });

  const sender = getFcmSender();
  const ctx = projectContext(project);
  const message = messageFromCampaign(
    { ...campaign, imageUrl: imageCheck.imageUrl },
    project,
  );

  try {
    if (campaign.mode === "BROADCAST_TOPIC") {
      const topic = campaign.targetTopic ?? project.defaultBroadcastTopic;
      const res = await sender.sendToTopic(ctx, topic, message);
      const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: res.success ? "COMPLETED" : "FAILED",
          attemptedCount: 1,
          sentCount: res.success ? 1 : 0,
          failedCount: res.success ? 0 : 1,
          errorMessage: res.error ?? null,
          firebaseMessageId: res.messageId ?? null,
          firebaseResponse: {
            success: res.success,
            messageId: res.messageId ?? null,
            error: res.error ?? null,
            topic,
          } as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      await writeAuditLog({
        projectId: project.id,
        action: res.success ? "CAMPAIGN_SENT" : "CAMPAIGN_FAILED",
        summary: `Topic send ${res.success ? "ok" : "failed"} → ${topic}`,
        metadata: { campaignId, topic, messageId: res.messageId, error: res.error },
      });
      return toPublicCampaign(updated);
    }

    // Optional live refresh from project API into portal cache before token multicast.
    if (
      campaign.refreshFromApiBeforeSend &&
      (campaign.mode === "ALL_REGISTERED" || campaign.mode === "SELECTED_USERS") &&
      projectHasTokenSource(project)
    ) {
      await syncProjectTokens(project.id, {
        userIds: campaign.mode === "SELECTED_USERS" ? campaign.targetUserIds : undefined,
        deactivateMissing: campaign.mode === "ALL_REGISTERED",
      });
    }

    const tokens = await resolveTokens(project, campaign);
    if (tokens.length === 0) {
      const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "COMPLETED",
          attemptedCount: 0,
          sentCount: 0,
          failedCount: 0,
          completedAt: new Date(),
          firebaseResponse: { note: "No active registered devices matched the target" } as Prisma.InputJsonValue,
        },
      });
      return toPublicCampaign(updated);
    }

    const result = await sender.sendToTokens(ctx, tokens, message);

    const staleTokens = result.results
      .filter((r) => !r.success && isStaleTokenError(r.errorCode, r.error))
      .map((r) => r.token);
    if (staleTokens.length > 0) {
      const pruned = await invalidateTokens(project.id, staleTokens, "registration-token-not-registered");
      log.info({ campaignId, pruned }, "invalidated stale tokens");
    }

    const mismatchTokens = result.results
      .filter((r) => !r.success && isCredentialMismatchError(r.errorCode))
      .map((r) => r.token);
    if (mismatchTokens.length > 0) {
      await invalidateTokens(project.id, mismatchTokens, "mismatched-credential");
      log.warn({ campaignId, count: mismatchTokens.length }, "mismatched-credential tokens invalidated");
    }

    await recordDeliveries(campaignId, project.id, result.results);

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "COMPLETED",
        attemptedCount: tokens.length,
        sentCount: result.successCount,
        failedCount: result.failureCount,
        completedAt: new Date(),
        firebaseResponse: {
          successCount: result.successCount,
          failureCount: result.failureCount,
          staleCount: staleTokens.length,
          mismatchCount: mismatchTokens.length,
        } as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog({
      projectId: project.id,
      action: "CAMPAIGN_SENT",
      summary: `Token send completed — ${result.successCount} ok / ${result.failureCount} failed`,
      metadata: { campaignId, attempted: tokens.length, stale: staleTokens.length },
    });

    return toPublicCampaign(updated);
  } catch (err) {
    const message2 = err instanceof Error ? err.message : String(err);
    log.error({ campaignId, err: message2 }, "campaign send failed");
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED", errorMessage: message2, completedAt: new Date() },
    });
    await writeAuditLog({
      projectId: project.id,
      action: "CAMPAIGN_FAILED",
      summary: `Campaign failed: ${message2}`,
      metadata: { campaignId },
    });
    return toPublicCampaign(updated);
  }
}

async function recordDeliveries(
  campaignId: string,
  projectId: string,
  results: { token: string; success: boolean; error?: string; errorCode?: string; messageId?: string }[],
): Promise<void> {
  const tokenRows = await prisma.deviceToken.findMany({
    where: { projectId, token: { in: results.map((r) => r.token) } },
    select: { id: true, token: true },
  });
  const idByToken = new Map(tokenRows.map((t) => [t.token, t.id]));
  const data = results.map((r) => ({
    campaignId,
    tokenId: idByToken.get(r.token) ?? null,
    status: (r.success ? "SENT" : isStaleTokenError(r.errorCode, r.error) ? "STALE" : "FAILED") as
      | "SENT"
      | "FAILED"
      | "STALE",
    error: r.error ?? null,
    errorCode: r.errorCode ?? null,
    messageId: r.messageId ?? null,
  }));
  if (data.length > 0) await prisma.campaignDelivery.createMany({ data });
}

/** Send a single test notification to one token, bypassing campaign persistence. */
export async function testSend(projectId: string, input: TestSendInput): Promise<TestCredentialsResult> {
  const project = await getProjectOrThrow(projectId);
  const imageUrl = assertNotificationImageUrl(input.imageUrl);
  const sender = getFcmSender();
  const ctx = projectContext(project);
  const res = await sender.sendToToken(ctx, input.token, {
    title: input.title,
    body: input.body,
    imageUrl,
    deepLink: input.deepLink,
    data: input.dataJson,
    androidChannelId: project.androidChannelId,
  });

  if (!res.success && isStaleTokenError(res.errorCode, res.error)) {
    await invalidateTokens(project.id, [input.token], res.errorCode ?? "invalid-registration-token");
  }
  if (!res.success && isCredentialMismatchError(res.errorCode)) {
    await invalidateTokens(project.id, [input.token], "mismatched-credential");
  }

  return { ok: res.success, error: res.error };
}
