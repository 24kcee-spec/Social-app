import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { HealthResponse, ReadyResponse } from "@sp/types";

/** A readiness check resolves if the dependency is healthy and rejects/throws if not. */
export type ReadinessCheck = () => Promise<void>;

export interface AppOptions {
  readinessChecks?: Record<string, ReadinessCheck>;
  logger?: boolean;
}

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });
  const checks = opts.readinessChecks ?? {};

  // Liveness: process is up. No dependencies touched.
  app.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: "api",
    time: new Date().toISOString(),
  }));

  // Readiness: dependencies are reachable. 503 if any check fails. Error details are never returned to callers.
  app.get("/ready", async (_req, reply): Promise<ReadyResponse> => {
    const results: Record<string, "ok" | "fail"> = {};
    for (const [name, check] of Object.entries(checks)) {
      try {
        await check();
        results[name] = "ok";
      } catch (err) {
        results[name] = "fail";
        app.log.error({ check: name, err: err instanceof Error ? err.message : "unknown" }, "readiness check failed");
      }
    }
    const ready = Object.values(results).every((r) => r === "ok");
    if (!ready) reply.code(503);
    return { status: ready ? "ready" : "not_ready", checks: results };
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: "not_found" });
  });

  // Never leak internals. Validation-style errors keep their status; everything else becomes a generic 500.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) req.log.error({ err: err.message }, "unhandled error");
    reply.code(status).send({ error: status === 500 ? "internal_error" : "bad_request" });
  });

  return app;
}
