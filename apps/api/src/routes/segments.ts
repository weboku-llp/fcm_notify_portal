import { CreateSegmentInput, SegmentRules, UpdateSegmentInput } from "@notif/contracts";
import { createSegment, deleteSegment, estimateSegmentSize, listSegments, updateSegment } from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const projectParams = z.object({ id: z.string().min(1) });
const segParams = z.object({ id: z.string().min(1), segmentId: z.string().min(1) });

export async function segmentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects/:id/segments", async (req) => {
    const { id } = projectParams.parse(req.params);
    return { segments: await listSegments(id) };
  });

  app.post("/projects/:id/segments", async (req, reply) => {
    const { id } = projectParams.parse(req.params);
    const input = CreateSegmentInput.parse(req.body);
    const segment = await createSegment(id, input);
    return reply.status(201).send({ segment });
  });

  app.patch("/projects/:id/segments/:segmentId", async (req) => {
    const { id, segmentId } = segParams.parse(req.params);
    const input = UpdateSegmentInput.parse(req.body);
    return { segment: await updateSegment(id, segmentId, input) };
  });

  app.delete("/projects/:id/segments/:segmentId", async (req, reply) => {
    const { id, segmentId } = segParams.parse(req.params);
    await deleteSegment(id, segmentId);
    return reply.status(204).send();
  });

  // Estimate audience size for a set of rules (used by the segment builder).
  app.post("/projects/:id/segments/estimate", async (req) => {
    const { id } = projectParams.parse(req.params);
    const rules = SegmentRules.parse((req.body as { rules?: unknown })?.rules ?? req.body);
    return { count: await estimateSegmentSize(id, rules) };
  });
}
