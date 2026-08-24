import {
  ExternalTokensPage,
  type ExternalDeviceToken,
  type TestAndEnableTokenSourceInput,
  type TokenSourceTestResult,
  type TokenSyncResult,
} from "@notif/contracts";
import { decryptSecret, encryptSecret, resolveEncryptionKey } from "@notif/crypto";
import { prisma, type Platform, type Project } from "@notif/db";
import { createLogger } from "@notif/logger";
import { writeAuditLog } from "./audit.js";
import { DomainError } from "./errors.js";
import { getProjectOrThrow } from "./projects.js";

const log = createLogger("token-source");

const PAGE_LIMIT = 500;
const FETCH_TIMEOUT_MS = 25_000;

function encryptionKey(): Buffer {
  const secret = process.env.PORTAL_ENCRYPTION_KEY;
  if (!secret) throw new Error("PORTAL_ENCRYPTION_KEY is not set");
  return resolveEncryptionKey(secret);
}

export function encryptTokenSourceApiKey(plaintext: string): string {
  return encryptSecret(plaintext, encryptionKey());
}

export function decryptTokenSourceApiKey(ciphertext: string): string {
  return decryptSecret(ciphertext, encryptionKey());
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function toPlatform(p: ExternalDeviceToken["platform"]): Platform {
  switch (p) {
    case "ios":
      return "IOS";
    case "web":
      return "WEB";
    default:
      return "ANDROID";
  }
}

/**
 * Skip seed / probe strings that are not real FCM registration tokens.
 * Real Android/iOS tokens are long and typically look like `…:APA91b…`.
 */
function isLikelyFcmToken(token: string): boolean {
  const t = token.trim();
  if (t.length < 80) return false;
  if (!t.includes(":")) return false;
  return true;
}

export function projectHasTokenSource(project: Project): boolean {
  return Boolean(
    project.tokenSourceEnabled &&
      project.tokenSourceApiBaseUrl?.trim() &&
      project.tokenSourceApiKeyEncrypted,
  );
}

type ProbeOk = {
  ok: true;
  httpStatus: number;
  page: { tokens: ExternalDeviceToken[]; nextCursor: string | null };
};
type ProbeFail = { ok: false; httpStatus?: number; error: string };

async function probeTokensEndpoint(
  baseUrl: string,
  apiKey: string,
  cursor: string | null = null,
  userIds?: string[],
): Promise<ProbeOk | ProbeFail> {
  const base = normalizeBaseUrl(baseUrl);
  const url = new URL(`${base}/api/internal/notif-portal/tokens`);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  if (cursor) url.searchParams.set("cursor", cursor);
  for (const id of userIds ?? []) url.searchParams.append("userId", id);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Notif-Portal-Key": apiKey,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return {
        ok: false,
        httpStatus: res.status,
        error: `Token source returned non-JSON (HTTP ${res.status})`,
      };
    }
    if (res.status !== 200) {
      const msg =
        typeof json === "object" && json && "error" in json
          ? String((json as { error?: string }).error)
          : `HTTP ${res.status}`;
      return { ok: false, httpStatus: res.status, error: `Token source error: ${msg}` };
    }
    const parsed = ExternalTokensPage.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        httpStatus: 200,
        error: "HTTP 200 but response failed schema validation",
      };
    }
    return { ok: true, httpStatus: 200, page: parsed.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Token source fetch failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTokensPage(
  project: Project,
  cursor: string | null,
  userIds?: string[],
): Promise<{ tokens: ExternalDeviceToken[]; nextCursor: string | null }> {
  if (!project.tokenSourceApiBaseUrl || !project.tokenSourceApiKeyEncrypted) {
    throw new DomainError("Token source API is not configured", "TOKEN_SOURCE_NOT_CONFIGURED", 400);
  }
  const apiKey = decryptTokenSourceApiKey(project.tokenSourceApiKeyEncrypted);
  const result = await probeTokensEndpoint(
    project.tokenSourceApiBaseUrl,
    apiKey,
    cursor,
    userIds,
  );
  if (!result.ok) {
    throw new DomainError(result.error, "TOKEN_SOURCE_HTTP_ERROR", 502);
  }
  return result.page;
}

/** Probe the stored project API (no enable flip). */
export async function testTokenSource(projectId: string): Promise<TokenSourceTestResult> {
  const project = await getProjectOrThrow(projectId);
  if (!project.tokenSourceApiBaseUrl || !project.tokenSourceApiKeyEncrypted) {
    return { ok: false, error: "Save main API URL and API key first" };
  }
  const apiKey = decryptTokenSourceApiKey(project.tokenSourceApiKeyEncrypted);
  const result = await probeTokensEndpoint(project.tokenSourceApiBaseUrl, apiKey);
  if (!result.ok) {
    return { ok: false, httpStatus: result.httpStatus, error: result.error, enabled: project.tokenSourceEnabled };
  }
  return {
    ok: true,
    httpStatus: 200,
    tokenCountSample: result.page.tokens.length,
    enabled: project.tokenSourceEnabled,
  };
}

/**
 * Save main API URL (+ optional key), require HTTP 200 from
 * GET /api/internal/notif-portal/tokens, then turn token sync ON.
 * On failure, leave/turn sync OFF.
 */
export async function testAndEnableTokenSource(
  projectId: string,
  input: TestAndEnableTokenSourceInput,
): Promise<TokenSourceTestResult> {
  const existing = await getProjectOrThrow(projectId);
  const baseUrl = normalizeBaseUrl(input.tokenSourceApiBaseUrl);

  const data: {
    tokenSourceApiBaseUrl: string;
    tokenSourceApiKeyEncrypted?: string;
    tokenSourceEnabled: boolean;
  } = {
    tokenSourceApiBaseUrl: baseUrl,
    tokenSourceEnabled: false,
  };

  if (input.tokenSourceApiKey) {
    data.tokenSourceApiKeyEncrypted = encryptTokenSourceApiKey(input.tokenSourceApiKey);
  } else if (!existing.tokenSourceApiKeyEncrypted) {
    throw new DomainError("API key is required the first time", "TOKEN_SOURCE_KEY_REQUIRED", 400);
  }

  await prisma.project.update({ where: { id: projectId }, data });

  const project = await getProjectOrThrow(projectId);
  const apiKey = decryptTokenSourceApiKey(project.tokenSourceApiKeyEncrypted!);
  const result = await probeTokensEndpoint(baseUrl, apiKey);

  if (!result.ok) {
    await prisma.project.update({
      where: { id: projectId },
      data: { tokenSourceEnabled: false },
    });
    await writeAuditLog({
      projectId,
      action: "PROJECT_UPDATED",
      summary: `Project API test failed — token sync left OFF`,
      metadata: { httpStatus: result.httpStatus, error: result.error },
    });
    return {
      ok: false,
      httpStatus: result.httpStatus,
      enabled: false,
      error: result.error,
    };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { tokenSourceEnabled: true },
  });
  await writeAuditLog({
    projectId,
    action: "PROJECT_UPDATED",
    summary: `Project API HTTP 200 — token sync ON (${baseUrl})`,
    metadata: { httpStatus: 200, tokenCountSample: result.page.tokens.length },
  });

  return {
    ok: true,
    httpStatus: 200,
    tokenCountSample: result.page.tokens.length,
    enabled: true,
  };
}

export type SyncOptions = {
  /** When set, only pull these userIds (selected-users live refresh). */
  userIds?: string[];
  /** When true, deactivate PROJECT_API tokens not seen in this full sync. */
  deactivateMissing?: boolean;
};

/**
 * Pull all (or filtered) tokens from the project API into portal DeviceToken rows.
 */
export async function syncProjectTokens(
  projectId: string,
  options: SyncOptions = {},
): Promise<TokenSyncResult> {
  const project = await getProjectOrThrow(projectId);
  if (!projectHasTokenSource(project)) {
    throw new DomainError(
      "Enable token source and set API URL + key before syncing",
      "TOKEN_SOURCE_NOT_CONFIGURED",
      400,
    );
  }

  let upserted = 0;
  let pages = 0;
  let cursor: string | null = null;
  const syncStartedAt = new Date();

  try {
    for (;;) {
      const page = await fetchTokensPage(project, cursor, options.userIds);
      pages += 1;
      for (const item of page.tokens) {
        if (!isLikelyFcmToken(item.token)) {
          log.warn(
            { projectId, tokenPreview: item.token.slice(0, 32) },
            "skipping non-FCM token from project API sync",
          );
          continue;
        }
        // Touch lastSeenAt to syncStartedAt so we can deactivate rows not seen in this full sync.
        await prisma.deviceToken.upsert({
          where: { projectKey_token: { projectKey: project.slug, token: item.token } },
          create: {
            projectId: project.id,
            projectKey: project.slug,
            firebaseProjectId: project.fcmProjectId,
            firebaseAppId: project.fcmAppId,
            token: item.token,
            platform: toPlatform(item.platform),
            userId: item.userId ?? null,
            appVersion: item.appVersion ?? null,
            source: "PROJECT_API",
            isActive: true,
            lastSeenAt: syncStartedAt,
            topics: [project.defaultBroadcastTopic],
            topicSubscriptionStatus: "UNKNOWN",
          },
          update: {
            platform: toPlatform(item.platform),
            userId: item.userId ?? null,
            appVersion: item.appVersion ?? null,
            source: "PROJECT_API",
            isActive: true,
            lastSeenAt: syncStartedAt,
            invalidatedAt: null,
            invalidationReason: null,
            firebaseProjectId: project.fcmProjectId,
          },
        });
        upserted += 1;
      }
      cursor = page.nextCursor;
      if (!cursor || page.tokens.length === 0) break;
      if (pages > 10_000) {
        throw new DomainError("Token sync exceeded page safety limit", "TOKEN_SOURCE_TOO_LARGE", 502);
      }
    }

    let deactivated = 0;
    const fullSync = !options.userIds?.length && (options.deactivateMissing ?? true);
    if (fullSync) {
      const res = await prisma.deviceToken.updateMany({
        where: {
          projectId: project.id,
          source: "PROJECT_API",
          isActive: true,
          lastSeenAt: { lt: syncStartedAt },
        },
        data: {
          isActive: false,
          invalidatedAt: new Date(),
          invalidationReason: "missing_from_project_api_sync",
        },
      });
      deactivated = res.count;
    }

    const completedAt = new Date();
    await prisma.project.update({
      where: { id: project.id },
      data: {
        tokenSourceLastSyncAt: completedAt,
        tokenSourceLastSyncOk: true,
        tokenSourceLastSyncError: null,
        tokenSourceLastSyncCount: upserted,
      },
    });

    await writeAuditLog({
      projectId: project.id,
      action: "TOKEN_SYNCED",
      summary: `Synced ${upserted} token(s) from project API (${deactivated} deactivated)`,
      metadata: { upserted, deactivated, pages, userFilter: options.userIds?.length ?? 0 },
    });

    log.info({ projectId, upserted, deactivated, pages }, "token sync ok");
    return {
      ok: true,
      upserted,
      deactivated,
      pages,
      syncedAt: completedAt.toISOString(),
    };
  } catch (err) {
    const message = err instanceof DomainError ? err.message : err instanceof Error ? err.message : String(err);
    await prisma.project.update({
      where: { id: project.id },
      data: {
        tokenSourceLastSyncAt: new Date(),
        tokenSourceLastSyncOk: false,
        tokenSourceLastSyncError: message.slice(0, 500),
      },
    });
    log.warn({ projectId, err: message }, "token sync failed");
    if (err instanceof DomainError) throw err;
    throw new DomainError(message, "TOKEN_SOURCE_SYNC_FAILED", 502);
  }
}

/** Sync every project that has token source enabled (worker tick). */
export async function syncAllEnabledProjectTokens(): Promise<{ projects: number; errors: number }> {
  const projects = await prisma.project.findMany({
    where: { tokenSourceEnabled: true, status: "ACTIVE" },
    select: { id: true },
  });
  let errors = 0;
  for (const p of projects) {
    try {
      await syncProjectTokens(p.id);
    } catch {
      errors += 1;
    }
  }
  return { projects: projects.length, errors };
}
