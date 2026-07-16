import { RegisterTokenInput } from "@notif/contracts";
import { countActiveDevices, deleteToken, estimateAudience, listTokens, registerToken } from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const projectParams = z.object({ id: z.string().min(1) });

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects/:id/tokens", async (req) => {
    const { id } = projectParams.parse(req.params);
    const query = z
      .object({
        take: z.coerce.number().int().positive().max(1000).default(100),
        activeOnly: z
          .union([z.boolean(), z.string()])
          .optional()
          .transform((v) => v === true || v === "true" || v === "1"),
      })
      .parse(req.query);
    const tokens = await listTokens(id, query.take, query.activeOnly);
    const activeCount = await countActiveDevices(id);
    return {
      tokens,
      activeCount,
      coverageNote:
        "Portal notifications reach devices that have updated and registered with the new notification system. Use Firebase Console during the migration period to reach older app versions.",
    };
  });

  app.post("/projects/:id/audience-estimate", async (req) => {
    const { id } = projectParams.parse(req.params);
    const body = z
      .object({
        mode: z.enum(["ALL_REGISTERED", "SELECTED_USERS", "SEGMENT", "BROADCAST_TOPIC", "SPECIFIC_TOKENS"]),
        segmentId: z.string().optional(),
        targetUserIds: z.array(z.string()).optional(),
        targetTokens: z.array(z.string()).optional(),
      })
      .parse(req.body);
    return estimateAudience(id, body);
  });

  // Device registration endpoint called by client apps.
  app.post("/projects/:id/tokens", async (req, reply) => {
    const { id } = projectParams.parse(req.params);
    const input = RegisterTokenInput.parse(req.body);
    const token = await registerToken(id, input);
    return reply.status(201).send({ token });
  });

  app.delete("/projects/:id/tokens/:token", async (req, reply) => {
    const { id, token } = z
      .object({ id: z.string().min(1), token: z.string().min(1) })
      .parse(req.params);
    await deleteToken(id, decodeURIComponent(token));
    return reply.status(204).send();
  });
}
