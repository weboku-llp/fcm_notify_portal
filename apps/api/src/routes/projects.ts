import { CreateProjectInput, ServiceAccountInput, UpdateProjectInput } from "@notif/contracts";
import {
  createProject,
  getProjectPublic,
  listProjects,
  testServiceAccount,
  updateProject,
} from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const idParams = z.object({ id: z.string().min(1) });

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects", async () => {
    return { projects: await listProjects() };
  });

  app.post("/projects", async (req, reply) => {
    const input = CreateProjectInput.parse(req.body);
    const project = await createProject(input);
    return reply.status(201).send({ project });
  });

  app.get("/projects/:id", async (req) => {
    const { id } = idParams.parse(req.params);
    return { project: await getProjectPublic(id) };
  });

  app.patch("/projects/:id", async (req) => {
    const { id } = idParams.parse(req.params);
    const input = UpdateProjectInput.parse(req.body);
    return { project: await updateProject(id, input) };
  });

  // Validate a pasted service account WITHOUT saving it.
  app.post("/projects/:id/test-credentials", async (req) => {
    const body = z.object({ fcmServiceAccountJson: ServiceAccountInput }).parse(req.body);
    return await testServiceAccount(body.fcmServiceAccountJson);
  });

  // Stateless credential check used by the "Add project" form (no id yet).
  app.post("/projects/test-credentials", async (req) => {
    const body = z.object({ fcmServiceAccountJson: ServiceAccountInput }).parse(req.body);
    return await testServiceAccount(body.fcmServiceAccountJson);
  });
}
