import type { AuditAction } from "@notif/contracts";
import { prisma, type Prisma } from "@notif/db";

export async function writeAuditLog(input: {
  projectId?: string | null;
  action: AuditAction;
  actor?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      projectId: input.projectId ?? null,
      action: input.action,
      actor: input.actor ?? null,
      summary: input.summary,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
