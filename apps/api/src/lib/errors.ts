import { DomainError } from "@notif/domain";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    if (error instanceof ZodError) {
      // Path + message only — never the request body — so this is safe to log
      // even for routes that accept secrets (service accounts, API keys).
      request.log.warn(
        { method: request.method, url: request.url, issues: error.issues },
        "request validation failed",
      );
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues,
      });
    }
    if (error instanceof DomainError) {
      request.log.warn(
        { method: request.method, url: request.url, code: error.code, message: error.message },
        "domain error",
      );
      return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (typeof error.statusCode === "number") {
      return reply.status(error.statusCode).send({ error: error.name, message: error.message });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Internal server error" });
  });
}
