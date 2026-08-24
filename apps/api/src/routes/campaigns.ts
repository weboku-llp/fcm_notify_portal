import { CreateCampaignInput, ListCampaignDeliveriesQuery, sendJobId, TestSendInput } from "@notif/contracts";
import {
  cancelCampaign,
  createCampaign,
  getCampaignPublic,
  listCampaignDeliveries,
  listCampaigns,
  testSend,
} from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enqueueSend, sendQueue } from "../queue.js";

const projectParams = z.object({ id: z.string().min(1) });
const campaignParams = z.object({ id: z.string().min(1) });

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  app.get("/campaigns", async (req) => {
    const query = z.object({ projectId: z.string().optional() }).parse(req.query);
    return { campaigns: await listCampaigns(query.projectId) };
  });

  app.get("/campaigns/:id", async (req) => {
    const { id } = campaignParams.parse(req.params);
    return { campaign: await getCampaignPublic(id) };
  });

  app.get("/campaigns/:id/deliveries", async (req) => {
    const { id } = campaignParams.parse(req.params);
    const query = ListCampaignDeliveriesQuery.parse(req.query);
    return await listCampaignDeliveries(id, query);
  });

  app.post("/projects/:id/campaigns", async (req, reply) => {
    const { id } = projectParams.parse(req.params);
    const input = CreateCampaignInput.parse(req.body);
    const { campaign, enqueue } = await createCampaign(id, input);
    if (enqueue) await enqueueSend(campaign.id);
    return reply.status(201).send({ campaign, enqueued: enqueue });
  });

  app.post("/campaigns/:id/cancel", async (req) => {
    const { id } = campaignParams.parse(req.params);
    const campaign = await cancelCampaign(id);
    await sendQueue.remove(sendJobId(id)).catch(() => undefined);
    return { campaign };
  });

  app.post("/projects/:id/campaigns/test", async (req) => {
    const { id } = projectParams.parse(req.params);
    const input = TestSendInput.parse(req.body);
    return await testSend(id, input);
  });
}
