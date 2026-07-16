import { DeviceRegistrationInput } from "@notif/contracts";
import {
  estimateAudience,
  getProjectByKeyOrThrow,
  registerDevice,
  verifyProjectRegistrationSecret,
} from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";

const estimateBody = z.object({
  projectKey: z.string().min(1),
  mode: z.enum(["ALL_REGISTERED", "SELECTED_USERS", "SEGMENT", "BROADCAST_TOPIC", "SPECIFIC_TOKENS"]),
  segmentId: z.string().optional(),
  targetUserIds: z.array(z.string()).optional(),
  targetTokens: z.array(z.string()).optional(),
});

export async function deviceRegistrationRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Mobile apps call this after Firebase init + permission + getToken().
   * Auth: X-App-Registration-Key header (per-project secret or DEVICE_REGISTRATION_SECRET).
   */
  app.post(
    "/api/device-registrations",
    {
      config: {
        rateLimit: {
          max: env.DEVICE_REGISTRATION_RATE_LIMIT,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const input = DeviceRegistrationInput.parse(req.body);
      const appKey =
        (req.headers["x-app-registration-key"] as string | undefined) ??
        (typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
          ? req.headers.authorization.slice("Bearer ".length)
          : undefined);

      await verifyProjectRegistrationSecret(input.projectKey, appKey, env.DEVICE_REGISTRATION_SECRET);

      const result = await registerDevice(input, {
        actor: typeof req.ip === "string" ? `ip:${req.ip}` : "mobile-app",
      });

      return reply.status(201).send(result);
    },
  );

  /** Alias without /api prefix for clients that already prefix the base URL. */
  app.post(
    "/device-registrations",
    {
      config: {
        rateLimit: {
          max: env.DEVICE_REGISTRATION_RATE_LIMIT,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const input = DeviceRegistrationInput.parse(req.body);
      const appKey = req.headers["x-app-registration-key"] as string | undefined;
      await verifyProjectRegistrationSecret(input.projectKey, appKey, env.DEVICE_REGISTRATION_SECRET);
      const result = await registerDevice(input);
      return reply.status(201).send(result);
    },
  );

  app.post("/api/audience-estimate", async (req) => {
    const body = estimateBody.parse(req.body);
    const project = await getProjectByKeyOrThrow(body.projectKey);
    return estimateAudience(project.id, body);
  });
}
