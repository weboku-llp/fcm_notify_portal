import pino, { type Logger, type LoggerOptions } from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const isDev = (process.env.NODE_ENV ?? "development") !== "production";

/**
 * Keys that must never appear in logs. Service-account material and secrets are
 * redacted defensively even though the code paths avoid logging them.
 */
const redactPaths = [
  "fcmServiceAccountJson",
  "*.fcmServiceAccountJson",
  "serviceAccount",
  "*.serviceAccount",
  "private_key",
  "*.private_key",
  "PORTAL_ENCRYPTION_KEY",
  "*.PORTAL_ENCRYPTION_KEY",
  "authorization",
  "*.authorization",
  "req.headers.authorization",
  "req.headers['x-app-registration-key']",
  "req.headers['x-notif-portal-key']",
  "registrationSecret",
  "*.registrationSecret",
  "tokenSourceApiKey",
  "*.tokenSourceApiKey",
];

const options: LoggerOptions = {
  level,
  redact: { paths: redactPaths, censor: "[REDACTED]" },
  base: undefined,
};

if (isDev) {
  options.transport = {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" },
  };
}

export const logger: Logger = pino(options);

export function createLogger(name: string, bindings: Record<string, unknown> = {}): Logger {
  return logger.child({ name, ...bindings });
}

export type { Logger };
