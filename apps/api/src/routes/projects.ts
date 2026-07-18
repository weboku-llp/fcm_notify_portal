import {
  CreateProjectInput,
  ServiceAccountInput,
  TestAndEnableTokenSourceInput,
  UpdateProjectInput,
} from "@notif/contracts";
import {
  createProject,
  getProjectPublic,
  listProjects,
  syncProjectTokens,
  testAndEnableTokenSource,
  testServiceAccount,
  testTokenSource,
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

  /** Probe stored project API (does not flip enabled). */
  app.post("/projects/:id/token-source/test", async (req) => {
    const { id } = idParams.parse(req.params);
    return await testTokenSource(id);
  });

  /**
   * Save main API URL (+ key), require HTTP 200 from project tokens endpoint,
   * then turn token sync ON. On non-200, sync stays OFF.
   */
  app.post("/projects/:id/token-source/test-and-enable", async (req) => {
    const { id } = idParams.parse(req.params);
    const input = TestAndEnableTokenSourceInput.parse(req.body);
    const result = await testAndEnableTokenSource(id, input);
    return { ...result, project: await getProjectPublic(id) };
  });

  /** Pull tokens from project API into portal cache now. */
  app.post("/projects/:id/token-source/sync", async (req) => {
    const { id } = idParams.parse(req.params);
    return await syncProjectTokens(id);
  });
}
