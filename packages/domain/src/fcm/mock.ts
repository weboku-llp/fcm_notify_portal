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

const log = createLogger("fcm:mock");

/** A token prefix that simulates a stale/unregistered token for testing pruning. */
export const MOCK_STALE_PREFIX = "stale-";
/** A token prefix that simulates a generic send failure. */
export const MOCK_FAIL_PREFIX = "fail-";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `mock-msg-${Date.now()}-${counter}`;
}

/**
 * In-memory sender that mimics FCM behavior deterministically so the entire
 * campaign flow works without real credentials. Sends are logged, not delivered.
 */
export class MockFcmSender implements FcmSender {
  readonly driver = "mock" as const;

  async verifyCredentials(ctx: FcmProjectContext): Promise<CredentialCheckResult> {
    // The service account was already structurally validated by zod upstream.
    return {
      ok: true,
      fcmProjectId: ctx.serviceAccount.project_id,
      clientEmail: ctx.serviceAccount.client_email,
    };
  }

  async sendToTopic(ctx: FcmProjectContext, topic: string, message: PushMessage): Promise<SendToTopicResult> {
    log.info(
      { fcmProjectId: ctx.serviceAccount.project_id, topic, title: message.title },
      "[mock] send to topic",
    );
    return { success: true, messageId: nextId() };
  }

  async sendToTokens(ctx: FcmProjectContext, tokens: string[], message: PushMessage): Promise<MulticastResult> {
    const results: TokenSendResult[] = tokens.map((token) => {
      if (token.startsWith(MOCK_STALE_PREFIX)) {
        return {
          token,
          success: false,
          error: "Requested entity was not found.",
          errorCode: "messaging/registration-token-not-registered",
        };
      }
      if (token.startsWith(MOCK_FAIL_PREFIX)) {
        return { token, success: false, error: "Simulated failure", errorCode: "messaging/internal-error" };
      }
      return { token, success: true, messageId: nextId() };
    });
    const successCount = results.filter((r) => r.success).length;
    log.info(
      { fcmProjectId: ctx.serviceAccount.project_id, total: tokens.length, successCount },
      "[mock] multicast send",
    );
    return { successCount, failureCount: results.length - successCount, results };
  }

  async sendToToken(ctx: FcmProjectContext, token: string, message: PushMessage): Promise<TokenSendResult> {
    const [result] = (await this.sendToTokens(ctx, [token], message)).results;
    return result!;
  }
}
