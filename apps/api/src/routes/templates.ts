import { CreateTemplateInput, UpdateTemplateInput } from "@notif/contracts";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const idParams = z.object({ id: z.string().min(1) });

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/templates", async (req) => {
    const query = z
      .object({
        projectId: z.string().optional(),
        includeGlobal: z
          .union([z.boolean(), z.string()])
          .optional()
          .transform((v) => v !== false && v !== "false" && v !== "0"),
      })
      .parse(req.query);
    return {
      templates: await listTemplates(query.projectId, { includeGlobal: query.includeGlobal ?? true }),
    };
  });

  app.post("/templates", async (req, reply) => {
    const input = CreateTemplateInput.parse(req.body);
    const template = await createTemplate(input);
    return reply.status(201).send({ template });
  });

  app.patch("/templates/:id", async (req) => {
    const { id } = idParams.parse(req.params);
    const input = UpdateTemplateInput.parse(req.body);
    return { template: await updateTemplate(id, input) };
  });

  app.delete("/templates/:id", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    await deleteTemplate(id);
    return reply.status(204).send();
  });
}
