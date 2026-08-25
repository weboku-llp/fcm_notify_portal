import type { ServiceAccount } from "@notif/contracts";

/** Minimal credential context the sender needs, per Firebase project. */
export interface FcmProjectContext {
  /** Portal project id — used as the firebase-admin named app key. */
  projectId: string;
  serviceAccount: ServiceAccount;
  androidChannelId?: string | null;
}

/** Normalized push content, independent of transport. */
export interface PushMessage {
  title: string;
  body: string;
  imageUrl?: string | null;
  deepLink?: string | null;
  data?: Record<string, string>;
  androidChannelId?: string | null;
}

export interface SendToTopicResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Per-token outcome; `errorCode` drives stale-token pruning. */
export interface TokenSendResult {
  token: string;
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

export interface MulticastResult {
  successCount: number;
  failureCount: number;
  results: TokenSendResult[];
}

export interface CredentialCheckResult {
  ok: boolean;
  fcmProjectId?: string;
  clientEmail?: string;
  error?: string;
}

/** Error codes that mean a token should be marked inactive (never permanently retry). */
export const STALE_TOKEN_ERROR_CODES = new Set<string>([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export const CREDENTIAL_MISMATCH_ERROR_CODES = new Set<string>([
  "messaging/mismatched-credential",
  "messaging/third-party-auth-error",
]);

/**
 * True when FCM says this registration token should be dropped from the audience.
 * `messaging/invalid-argument` is included only when the message is about the token
 * itself (not e.g. a bad payload that would fail for every device).
 */
export function isStaleTokenError(code?: string, message?: string): boolean {
  if (code !== undefined && STALE_TOKEN_ERROR_CODES.has(code)) return true;
  if (code === "messaging/invalid-argument") {
    const msg = (message ?? "").toLowerCase();
    return (
      msg.includes("registration token") ||
      msg.includes("not a valid fcm") ||
      msg.includes("invalid registration")
    );
  }
  return false;
}

export function isCredentialMismatchError(code?: string): boolean {
  return code !== undefined && CREDENTIAL_MISMATCH_ERROR_CODES.has(code);
}

/**
 * Transport abstraction. `firebase` and `mock` both implement this so the whole
 * campaign flow is testable without real credentials.
 */
export interface FcmSender {
  readonly driver: "firebase" | "mock";
  /** Validate a service account by initializing (and tearing down) an app. */
  verifyCredentials(ctx: FcmProjectContext): Promise<CredentialCheckResult>;
  sendToTopic(ctx: FcmProjectContext, topic: string, message: PushMessage): Promise<SendToTopicResult>;
  sendToTokens(ctx: FcmProjectContext, tokens: string[], message: PushMessage): Promise<MulticastResult>;
  sendToToken(ctx: FcmProjectContext, token: string, message: PushMessage): Promise<TokenSendResult>;
}
