import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { ServiceAccountSchema, type ServiceAccount } from "@notif/contracts";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard nonce size
const KEY_LENGTH = 32; // 256-bit
const VERSION = "v1";

/**
 * Resolve a 32-byte key from the portal secret. Accepts base64, hex, or raw
 * strings; anything that isn't exactly 32 bytes is hashed with SHA-256 to
 * derive a stable 32-byte key.
 */
export function resolveEncryptionKey(secret: string): Buffer {
  const candidates: Buffer[] = [];
  try {
    candidates.push(Buffer.from(secret, "base64"));
  } catch {
    /* ignore */
  }
  if (/^[0-9a-fA-F]+$/.test(secret)) candidates.push(Buffer.from(secret, "hex"));
  for (const buf of candidates) {
    if (buf.length === KEY_LENGTH) return buf;
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Encrypt plaintext with AES-256-GCM. Output format:
 *   v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(payload: string, key: Buffer): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Malformed encrypted payload");
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64!, "base64");
  const authTag = Buffer.from(tagB64!, "base64");
  const ciphertext = Buffer.from(dataB64!, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Stable non-reversible fingerprint of a secret, safe to store/display. */
export function fingerprint(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** Human-friendly masked fingerprint, e.g. "a1b2c3d4…f9e8". */
export function maskFingerprint(fp: string): string {
  if (fp.length <= 12) return fp;
  return `${fp.slice(0, 8)}…${fp.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Service-account helpers (bound to the PORTAL_ENCRYPTION_KEY env var)
// ---------------------------------------------------------------------------

let keyCache: { secret: string; key: Buffer } | undefined;

function getKey(): Buffer {
  const secret = process.env.PORTAL_ENCRYPTION_KEY;
  if (!secret) throw new Error("PORTAL_ENCRYPTION_KEY is not set — cannot encrypt/decrypt service accounts");
  if (keyCache && keyCache.secret === secret) return keyCache.key;
  const key = resolveEncryptionKey(secret);
  keyCache = { secret, key };
  return key;
}

export interface EncryptedServiceAccount {
  ciphertext: string;
  credentialFingerprint: string;
  fcmProjectId: string;
  fcmClientEmail: string;
}

/** Encrypt a validated service account for storage, plus derived safe metadata. */
export function encryptServiceAccount(sa: ServiceAccount): EncryptedServiceAccount {
  const plaintext = JSON.stringify(sa);
  return {
    ciphertext: encryptSecret(plaintext, getKey()),
    credentialFingerprint: fingerprint(plaintext),
    fcmProjectId: sa.project_id,
    fcmClientEmail: sa.client_email,
  };
}

/** Decrypt and re-validate a stored service account. */
export function decryptServiceAccount(ciphertext: string): ServiceAccount {
  const plaintext = decryptSecret(ciphertext, getKey());
  return ServiceAccountSchema.parse(JSON.parse(plaintext));
}
