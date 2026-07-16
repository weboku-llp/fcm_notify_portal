import { RegisterTokenInput } from "@notif/contracts";
import { deleteToken, listTokens, registerToken } from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const projectParams = z.object({ id: z.string().min(1) });

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects/:id/tokens", async (req) => {
    const { id } = projectParams.parse(req.params);
    const query = z.object({ take: z.coerce.number().int().positive().max(1000).default(100) }).parse(req.query);
    return { tokens: await listTokens(id, query.take) };
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
