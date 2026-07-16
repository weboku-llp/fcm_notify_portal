import type { CreateTemplateInput, TemplatePublic, UpdateTemplateInput } from "@notif/contracts";
import { prisma, type Prisma, type Template } from "@notif/db";
import { DomainError } from "./errors.js";

function asStringRecord(json: Prisma.JsonValue | null | undefined): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json)) out[k] = typeof v === "string" ? v : JSON.stringify(v);
  return out;
}

export function toPublicTemplate(t: Template): TemplatePublic {
  return {
    id: t.id,
    projectId: t.projectId,
    name: t.name,
    title: t.title,
    body: t.body,
    imageUrl: t.imageUrl,
    deepLink: t.deepLink,
    dataJson: asStringRecord(t.dataJson),
    variables: t.variables,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function createTemplate(input: CreateTemplateInput): Promise<TemplatePublic> {
  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new DomainError(`Project ${input.projectId} not found`, "NOT_FOUND", 404);
  }
  const tpl = await prisma.template.create({
    data: {
      projectId: input.projectId ?? null,
      name: input.name,
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl ?? null,
      deepLink: input.deepLink ?? null,
      dataJson: input.dataJson as Prisma.InputJsonValue,
      variables: input.variables,
    },
  });
  return toPublicTemplate(tpl);
}

/**
 * List templates.
 * - no projectId: all templates
 * - projectId + includeGlobal: project's own + global (default for compose)
 * - projectId + includeGlobal=false: only templates owned by that project
 */
export async function listTemplates(
  projectId?: string,
  opts?: { includeGlobal?: boolean },
): Promise<TemplatePublic[]> {
  const includeGlobal = opts?.includeGlobal !== false;
  const rows = await prisma.template.findMany({
    where: projectId
      ? includeGlobal
        ? { OR: [{ projectId }, { projectId: null }] }
        : { projectId }
      : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toPublicTemplate);
}

export async function updateTemplate(id: string, input: UpdateTemplateInput): Promise<TemplatePublic> {
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) throw new DomainError(`Template ${id} not found`, "NOT_FOUND", 404);
  const data: Prisma.TemplateUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) data.body = input.body;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.deepLink !== undefined) data.deepLink = input.deepLink;
  if (input.dataJson !== undefined) data.dataJson = input.dataJson as Prisma.InputJsonValue;
  if (input.variables !== undefined) data.variables = input.variables;
  const tpl = await prisma.template.update({ where: { id }, data });
  return toPublicTemplate(tpl);
}

export async function deleteTemplate(id: string): Promise<void> {
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) throw new DomainError(`Template ${id} not found`, "NOT_FOUND", 404);
  await prisma.template.delete({ where: { id } });
}
