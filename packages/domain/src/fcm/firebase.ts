import admin from "firebase-admin";
import { createLogger } from "@notif/logger";
import {
  type CredentialCheckResult,
  type FcmProjectContext,
  type FcmSender,
  type MulticastResult,
  type PushMessage,
  type SendToTopicResult,
  type TokenSendResult,
} from "./types.js";

const log = createLogger("fcm:firebase");

const MULTICAST_BATCH = 500;

/**
 * Cache of firebase-admin apps keyed by portal project id. `firebase-admin`
 * REQUIRES a distinct named app per Firebase project to run many projects in a
 * single process.
 */
const apps = new Map<string, admin.app.App>();

function appForProject(ctx: FcmProjectContext): admin.app.App {
  let app = apps.get(ctx.projectId);
  if (!app) {
    app = admin.initializeApp(
      {
        credential: admin.credential.cert(
          ctx.serviceAccount as unknown as admin.ServiceAccount,
        ),
        projectId: ctx.serviceAccount.project_id,
      },
      ctx.projectId, // named app — REQUIRED for multi-project isolation
    );
    apps.set(ctx.projectId, app);
    log.debug({ projectId: ctx.projectId, fcmProjectId: ctx.serviceAccount.project_id }, "initialized named app");
  }
  return app;
}

/** Drop a cached app (e.g. after credentials are rotated). */
export async function evictApp(projectId: string): Promise<void> {
  const app = apps.get(projectId);
  if (app) {
    apps.delete(projectId);
    await app.delete().catch(() => undefined);
  }
}

function buildMessage(message: PushMessage, ctx: FcmProjectContext) {
  const data: Record<string, string> = { ...(message.data ?? {}) };
  if (message.deepLink) data.deepLink = message.deepLink;
  const channelId = message.androidChannelId ?? ctx.androidChannelId ?? undefined;

  return {
    notification: {
      title: message.title,
      body: message.body,
      ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
    },
    data,
    android: {
      notification: {
        ...(channelId ? { channelId } : {}),
        ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
      },
    },
    webpush: message.deepLink ? { fcmOptions: { link: message.deepLink } } : undefined,
  };
}

export class FirebaseFcmSender implements FcmSender {
  readonly driver = "firebase" as const;

  async verifyCredentials(ctx: FcmProjectContext): Promise<CredentialCheckResult> {
    const tempName = `verify-${ctx.projectId}-${Date.now()}`;
    let app: admin.app.App | undefined;
    try {
      app = admin.initializeApp(
        {
          credential: admin.credential.cert(ctx.serviceAccount as unknown as admin.ServiceAccount),
          projectId: ctx.serviceAccount.project_id,
        },
        tempName,
      );
      // Force the credential to actually mint an access token.
      await app.options.credential!.getAccessToken();
      return {
        ok: true,
        fcmProjectId: ctx.serviceAccount.project_id,
        clientEmail: ctx.serviceAccount.client_email,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (app) await app.delete().catch(() => undefined);
    }
  }

  async sendToTopic(ctx: FcmProjectContext, topic: string, message: PushMessage): Promise<SendToTopicResult> {
    try {
      const app = appForProject(ctx);
      const messageId = await admin.messaging(app).send({
        topic,
        ...buildMessage(message, ctx),
      });
      return { success: true, messageId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async sendToTokens(ctx: FcmProjectContext, tokens: string[], message: PushMessage): Promise<MulticastResult> {
    const app = appForProject(ctx);
    const messaging = admin.messaging(app);
    const results: TokenSendResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += MULTICAST_BATCH) {
      const batch = tokens.slice(i, i + MULTICAST_BATCH);
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        ...buildMessage(message, ctx),
      });
      response.responses.forEach((r, idx) => {
        const token = batch[idx]!;
        if (r.success) {
          successCount++;
          results.push({ token, success: true, messageId: r.messageId });
        } else {
          failureCount++;
          results.push({
            token,
            success: false,
            error: r.error?.message,
            errorCode: r.error?.code,
          });
        }
      });
    }

    return { successCount, failureCount, results };
  }

  async sendToToken(ctx: FcmProjectContext, token: string, message: PushMessage): Promise<TokenSendResult> {
    try {
      const app = appForProject(ctx);
      const messageId = await admin.messaging(app).send({ token, ...buildMessage(message, ctx) });
      return { token, success: true, messageId };
    } catch (err) {
      const anyErr = err as { code?: string; message?: string };
      return { token, success: false, error: anyErr.message ?? String(err), errorCode: anyErr.code };
    }
  }
}
