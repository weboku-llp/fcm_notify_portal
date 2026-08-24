import { z } from "zod";

/**
 * Shape of a Firebase service-account JSON. We only strictly require the fields
 * `firebase-admin` needs to build credentials; extra keys are allowed.
 */

/** Fix common paste/export issues that make OpenSSL reject the PEM. */
export function normalizePrivateKey(key: string): string {
  let k = key.trim().replace(/^\uFEFF/, "");
  // Double-escaped newlines (\\n) → real newlines. Safe if already real \n.
  if (k.includes("\\n")) {
    k = k.replace(/\\n/g, "\n");
  }
  k = k.replace(/\\r\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Some editors wrap the PEM with extra quotes
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1);
    if (k.includes("\\n")) k = k.replace(/\\n/g, "\n");
  }
  return k.trim();
}

export const ServiceAccountSchema = z
  .object({
    type: z.literal("service_account"),
    project_id: z.string().min(1),
    private_key_id: z.string().optional(),
    private_key: z.string().min(1).includes("PRIVATE KEY", {
      message: "private_key does not look like a PEM key",
    }),
    client_email: z.string().email(),
    client_id: z.string().optional(),
    auth_uri: z.string().url().optional(),
    token_uri: z.string().url().optional(),
    auth_provider_x509_cert_url: z.string().url().optional(),
    client_x509_cert_url: z.string().url().optional(),
    universe_domain: z.string().optional(),
  })
  .passthrough()
  .transform((sa) => ({
    ...sa,
    private_key: normalizePrivateKey(sa.private_key),
  }));

export type ServiceAccount = z.infer<typeof ServiceAccountSchema>;

/**
 * Accepts either a JSON string or an already-parsed object and validates it.
 */
export const ServiceAccountInput = z
  .union([z.string(), z.record(z.unknown())])
  .transform((val, ctx) => {
    let parsed: unknown = val;
    if (typeof val === "string") {
      try {
        parsed = JSON.parse(val);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Service account is not valid JSON" });
        return z.NEVER;
      }
    }
    const result = ServiceAccountSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) ctx.addIssue(issue);
      return z.NEVER;
    }
    return result.data;
  });
