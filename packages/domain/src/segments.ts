import { SegmentRules, type CreateSegmentInput, type SegmentPublic, type UpdateSegmentInput } from "@notif/contracts";
import { prisma, type Prisma, type Segment } from "@notif/db";
import { DomainError } from "./errors.js";

export function toPublicSegment(s: Segment): SegmentPublic {
  return {
    id: s.id,
    projectId: s.projectId,
    name: s.name,
    rules: SegmentRules.parse(s.rules),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Build a Prisma `where` for DeviceToken from segment rules, always scoped to the project. */
export function tokenWhereFromRules(
  projectId: string,
  rules: SegmentRules,
): Prisma.DeviceTokenWhereInput {
  const where: Prisma.DeviceTokenWhereInput = { projectId, isActive: true };
  if (rules.platform) where.platform = rules.platform;
  if (rules.locale) where.locale = rules.locale;
  if (rules.topic) where.topics = { has: rules.topic };
  if (rules.lastSeenWithinDays) {
    const since = new Date(Date.now() - rules.lastSeenWithinDays * 24 * 60 * 60 * 1000);
    where.lastSeenAt = { gte: since };
  }
  return where;
}

export async function estimateSegmentSize(projectId: string, rules: SegmentRules): Promise<number> {
  return prisma.deviceToken.count({ where: tokenWhereFromRules(projectId, rules) });
}

export async function createSegment(projectId: string, input: CreateSegmentInput): Promise<SegmentPublic> {
  const seg = await prisma.segment.create({
    data: { projectId, name: input.name, rules: input.rules as Prisma.InputJsonValue },
  });
  return toPublicSegment(seg);
}

export async function listSegments(projectId: string): Promise<SegmentPublic[]> {
  const rows = await prisma.segment.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  return rows.map(toPublicSegment);
}

export async function updateSegment(
  projectId: string,
  id: string,
  input: UpdateSegmentInput,
): Promise<SegmentPublic> {
  const existing = await prisma.segment.findFirst({ where: { id, projectId } });
  if (!existing) throw new DomainError(`Segment ${id} not found`, "NOT_FOUND", 404);
  const seg = await prisma.segment.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.rules !== undefined ? { rules: input.rules as Prisma.InputJsonValue } : {}),
    },
  });
  return toPublicSegment(seg);
}

export async function deleteSegment(projectId: string, id: string): Promise<void> {
  const existing = await prisma.segment.findFirst({ where: { id, projectId } });
  if (!existing) throw new DomainError(`Segment ${id} not found`, "NOT_FOUND", 404);
  await prisma.segment.delete({ where: { id } });
}
