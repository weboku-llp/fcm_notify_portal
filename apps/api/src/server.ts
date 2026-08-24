import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { createLogger } from "@notif/logger";
import { prisma } from "@notif/db";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { env } from "./env.js";
import { registerErrorHandler } from "./lib/errors.js";
import { closeQueue } from "./queue.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { cricLiveRoutes } from "./routes/cric-live.js";
import { deviceRegistrationRoutes } from "./routes/device-registrations.js";
import { projectRoutes } from "./routes/projects.js";
import { segmentRoutes } from "./routes/segments.js";
import { templateRoutes } from "./routes/templates.js";
import { tokenRoutes } from "./routes/tokens.js";

const log = createLogger("api");

async function buildServer() {
  const app = Fastify({
    loggerInstance: log as unknown as FastifyBaseLogger,
    bodyLimit: 8 * 1024 * 1024,
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(rateLimit, {
    global: false,
    max: 1000,
    timeWindow: "1 minute",
  });

  registerErrorHandler(app);

  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      driver: env.FCM_DRIVER,
      time: new Date().toISOString(),
      // Never expose DEVICE_REGISTRATION_SECRET or encryption keys here.
      registrationAuthConfigured: Boolean(env.DEVICE_REGISTRATION_SECRET),
    };
  });

  await app.register(projectRoutes);
  await app.register(tokenRoutes);
  await app.register(deviceRegistrationRoutes);
  await app.register(segmentRoutes);
  await app.register(templateRoutes);
  await app.register(campaignRoutes);
  await app.register(cricLiveRoutes);

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    await app.close();
    await closeQueue().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: env.API_HOST, port: env.API_PORT });
    log.info({ port: env.API_PORT, driver: env.FCM_DRIVER }, "API listening");
  } catch (err) {
    log.error({ err }, "failed to start API");
    process.exit(1);
  }
}

void main();

export { buildServer };
