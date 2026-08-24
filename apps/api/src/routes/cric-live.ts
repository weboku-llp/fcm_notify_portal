import { UpdateCricLiveMatchAlertInput } from "@notif/contracts";
import { listCricLiveMatches, updateCricLiveMatchAlert } from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const projectParams = z.object({ id: z.string().min(1) });
const matchParams = z.object({ id: z.string().min(1), fixtureId: z.string().min(1) });

export async function cricLiveRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects/:id/cric-live/matches", async (req) => {
    const { id } = projectParams.parse(req.params);
    const matches = await listCricLiveMatches(id);
    return { matches };
  });

  app.patch("/projects/:id/cric-live/matches/:fixtureId", async (req) => {
    const { id, fixtureId } = matchParams.parse(req.params);
    const input = UpdateCricLiveMatchAlertInput.parse(req.body);
    // Domain runs FCM send inline for match-alerts-on (no BullMQ wait).
    const { match, campaign } = await updateCricLiveMatchAlert(id, fixtureId, input);
    return {
      match,
      campaign: campaign ?? null,
      enqueued: false,
      sent: Boolean(campaign && (campaign.status === "COMPLETED" || campaign.status === "FAILED")),
    };
  });
}
