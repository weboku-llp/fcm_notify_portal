import { DomainError } from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues,
      });
    }
    if (error instanceof DomainError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (typeof error.statusCode === "number") {
      return reply.status(error.statusCode).send({ error: error.name, message: error.message });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Internal server error" });
  });
}
