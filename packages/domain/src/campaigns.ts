import {
  type CampaignPublic,
  type CreateCampaignInput,
  type TestCredentialsResult,
  type TestSendInput,
} from "@notif/contracts";
import { prisma, type Campaign, type CampaignStatus, type Prisma, type Project } from "@notif/db";
import { getFcmSender, type PushMessage } from "./fcm/index.js";
import { DomainError, getProjectOrThrow } from "./projects.js";
import { projectContext } from "./secrets.js";
import { tokenWhereFromRules } from "./segments.js";
import { pruneStaleTokens } from "./tokens.js";
import { SegmentRules } from "@notif/contracts";
import { createLogger } from "@notif/logger";

const log = createLogger("campaigns");

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
    title: c.title,
    body: c.body,
    imageUrl: c.imageUrl,
    deepLink: c.deepLink,
    dataJson: asStringRecord(c.dataJson),
    status: c.status,
    scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
    timezone: c.timezone,
    sentCount: c.sentCount,
    failedCount: c.failedCount,
    completedAt: c.completedAt ? c.completedAt.toISOString() : null,
    errorMessage: c.errorMessage,
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

export interface CreateCampaignResult {
  campaign: CampaignPublic;
  /** True when the campaign should be enqueued immediately for sending. */
  enqueue: boolean;
}

export async function createCampaign(
  projectId: string,
  input: CreateCampaignInput,
): Promise<CreateCampaignResult> {
  await getProjectOrThrow(projectId);

  if (input.mode === "SEGMENT" && input.segmentId) {
    const seg = await prisma.segment.findFirst({ where: { id: input.segmentId, projectId } });
    if (!seg) throw new DomainError(`Segment ${input.segmentId} not found in project`, "NOT_FOUND", 404);
  }

  let status: CampaignStatus = "DRAFT";
  if (input.action === "schedule") status = "SCHEDULED";
  else if (input.action === "send_now") status = "QUEUED";

  const campaign = await prisma.campaign.create({
    data: {
      projectId,
      templateId: input.templateId ?? null,
      mode: input.mode,
      targetTopic: input.targetTopic ?? null,
      segmentId: input.segmentId ?? null,
      targetTokens: input.targetTokens ?? [],
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl ?? null,
      deepLink: input.deepLink ?? null,
      dataJson: input.dataJson as Prisma.InputJsonValue,
      status,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      timezone: input.timezone ?? null,
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
  if (campaign.mode === "SPECIFIC_TOKENS") return campaign.targetTokens;
  if (campaign.mode === "SEGMENT") {
    if (!campaign.segmentId) return [];
    const seg = await prisma.segment.findFirst({ where: { id: campaign.segmentId, projectId: project.id } });
    if (!seg) return [];
    const rules = SegmentRules.parse(seg.rules);
    const tokens = await prisma.deviceToken.findMany({
      where: tokenWhereFromRules(project.id, rules),
      select: { token: true },
    });
    return tokens.map((t) => t.token);
  }
  return [];
}

/**
 * Core sender used by the worker. Loads the campaign + its project, sends via
 * the correct named Firebase app, updates counts, prunes stale tokens, and sets
 * a terminal status. Safe to call for BROADCAST_TOPIC / SEGMENT / SPECIFIC_TOKENS.
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

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });

  const sender = getFcmSender();
  const ctx = projectContext(project);
  const message = messageFromCampaign(campaign, project);

  try {
    if (campaign.mode === "BROADCAST_TOPIC") {
      const topic = campaign.targetTopic ?? project.defaultBroadcastTopic;
      const res = await sender.sendToTopic(ctx, topic, message);
      const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: res.success ? "COMPLETED" : "FAILED",
          sentCount: res.success ? 1 : 0,
          failedCount: res.success ? 0 : 1,
          errorMessage: res.error ?? null,
          completedAt: new Date(),
        },
      });
      return toPublicCampaign(updated);
    }

    // Token-based sends (SEGMENT / SPECIFIC_TOKENS).
    const tokens = await resolveTokens(project, campaign);
    if (tokens.length === 0) {
      const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "COMPLETED", sentCount: 0, failedCount: 0, completedAt: new Date() },
      });
      return toPublicCampaign(updated);
    }

    const result = await sender.sendToTokens(ctx, tokens, message);

    const staleTokens = result.results.filter((r) => !r.success && isStale(r.errorCode)).map((r) => r.token);
    if (staleTokens.length > 0) {
      const pruned = await pruneStaleTokens(project.id, staleTokens);
      log.info({ campaignId, pruned }, "pruned stale tokens");
    }

    // Best-effort delivery analytics.
    await recordDeliveries(campaignId, project.id, result.results);

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "COMPLETED",
        sentCount: result.successCount,
        failedCount: result.failureCount,
        completedAt: new Date(),
      },
    });
    return toPublicCampaign(updated);
  } catch (err) {
    const message2 = err instanceof Error ? err.message : String(err);
    log.error({ campaignId, err: message2 }, "campaign send failed");
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED", errorMessage: message2, completedAt: new Date() },
    });
    return toPublicCampaign(updated);
  }
}

function isStale(code?: string): boolean {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token"
  );
}

async function recordDeliveries(
  campaignId: string,
  projectId: string,
  results: { token: string; success: boolean; error?: string; errorCode?: string }[],
): Promise<void> {
  const tokenRows = await prisma.deviceToken.findMany({
    where: { projectId, token: { in: results.map((r) => r.token) } },
    select: { id: true, token: true },
  });
  const idByToken = new Map(tokenRows.map((t) => [t.token, t.id]));
  const data = results.map((r) => ({
    campaignId,
    tokenId: idByToken.get(r.token) ?? null,
    status: (r.success ? "SENT" : isStale(r.errorCode) ? "STALE" : "FAILED") as "SENT" | "FAILED" | "STALE",
    error: r.error ?? null,
  }));
  if (data.length > 0) await prisma.campaignDelivery.createMany({ data });
}

/** Send a single test notification to one token, bypassing campaign persistence. */
export async function testSend(projectId: string, input: TestSendInput): Promise<TestCredentialsResult> {
  const project = await getProjectOrThrow(projectId);
  const sender = getFcmSender();
  const ctx = projectContext(project);
  const res = await sender.sendToToken(ctx, input.token, {
    title: input.title,
    body: input.body,
    imageUrl: input.imageUrl,
    deepLink: input.deepLink,
    data: input.dataJson,
    androidChannelId: project.androidChannelId,
  });
  return { ok: res.success, error: res.error };
}
