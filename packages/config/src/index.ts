import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { z } from "zod";

/**
 * Walk up from cwd looking for a root `.env`. In a monorepo each app runs from
 * its own dir, but we keep a single root `.env` for local dev convenience.
 */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to default behavior (loads ./.env if present).
  loadDotenv();
}

loadRootEnv();

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
});

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

const redisSchema = z.object({
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
});

const cryptoSchema = z.object({
  PORTAL_ENCRYPTION_KEY: z
    .string()
    .min(1, "PORTAL_ENCRYPTION_KEY is required (32-byte base64 or hex string)"),
});

const apiSchema = z.object({
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  FCM_DRIVER: z.enum(["mock", "firebase"]).default("mock"),
});

const webSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
});

export const envSchemas = {
  base: baseSchema,
  database: databaseSchema,
  redis: redisSchema,
  crypto: cryptoSchema,
  api: apiSchema,
  web: webSchema,
};

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, label: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment for ${label}:\n${issues}`);
  }
  return result.data;
}

/** Env needed by the API process. */
export function loadApiEnv() {
  return parseOrThrow(
    baseSchema.merge(databaseSchema).merge(redisSchema).merge(cryptoSchema).merge(apiSchema),
    "api",
  );
}

/** Env needed by the worker process. */
export function loadWorkerEnv() {
  return parseOrThrow(
    baseSchema.merge(databaseSchema).merge(redisSchema).merge(cryptoSchema).merge(apiSchema.pick({ FCM_DRIVER: true })),
    "worker",
  );
}

/** Env needed by anything that only talks to the DB (e.g. seed, migrations helpers). */
export function loadDbEnv() {
  return parseOrThrow(baseSchema.merge(databaseSchema).merge(cryptoSchema), "db");
}

export { booleanish };

export type ApiEnv = ReturnType<typeof loadApiEnv>;
export type WorkerEnv = ReturnType<typeof loadWorkerEnv>;
export type DbEnv = ReturnType<typeof loadDbEnv>;
