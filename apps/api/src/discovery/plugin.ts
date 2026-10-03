import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { blockRequestSchema, discoveryEventsRequestSchema, discoveryQuerySchema } from "@sp/validation";
import { OnboardingRequiredError, RateLimitedError, SelfActionError, UnknownUserError, type DiscoveryStore } from "./store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validationPayload(result: { error: { issues: { path: (string | number)[]; message: string }[] } }) {
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return { error: "validation", fields };
}

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
export interface DiscoveryDeps { store: DiscoveryStore; requireAuth: Guard; requireRole: (...roles: ("user" | "moderator" | "admin" | "business")[]) => Guard }

export function registerDiscovery(app: FastifyInstance, deps: DiscoveryDeps) {
  /** Ranked, explained people. Private by default: only discoverable, onboarded, active, unblocked people appear. */
  app.get<{ Querystring: Record<string, unknown> }>("/discovery/people", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = discoveryQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    try {
      return reply.send(await deps.store.getFeed(auth.user.id, parsed.data.limit, parsed.data.offset));
    } catch (err) {
      if (err instanceof OnboardingRequiredError) return reply.code(403).send({ error: "onboarding_required", message: err.message });
      throw err;
    }
  });

  app.post<{ Body: unknown }>("/discovery/events", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = discoveryEventsRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    try {
      return reply.code(202).send({ recorded: await deps.store.recordEvents(auth.user.id, parsed.data.events) });
    } catch (err) {
      if (err instanceof RateLimitedError) return reply.code(429).send({ error: "rate_limited", message: "Slow down a little and try again shortly." });
      throw err;
    }
  });

  app.get("/blocks", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    return reply.send({ blocks: await deps.store.listBlocks(auth.user.id) });
  });

  app.post<{ Body: unknown }>("/blocks", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = blockRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    try {
      await deps.store.block(auth.user.id, parsed.data.userId);
      return reply.code(201).send({ blocked: true });
    } catch (err) {
      if (err instanceof SelfActionError) return reply.code(400).send({ error: "validation", message: err.message });
      if (err instanceof UnknownUserError) return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  app.delete<{ Params: { userId: string } }>("/blocks/:userId", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    if (!UUID_RE.test(req.params.userId)) return reply.code(400).send({ error: "bad_request" });
    await deps.store.unblock(auth.user.id, req.params.userId);
    return reply.code(204).send();
  });

  /** Admin-only: inspect exactly why a viewer does or does not see a candidate. */
  app.get<{ Querystring: { viewerId?: string; candidateId?: string } }>("/admin/discovery/explain", { preHandler: [deps.requireAuth, deps.requireRole("admin")] }, async (req, reply) => {
    const { viewerId, candidateId } = req.query;
    if (!viewerId || !candidateId || !UUID_RE.test(viewerId) || !UUID_RE.test(candidateId)) return reply.code(400).send({ error: "bad_request" });
    return reply.send(await deps.store.explain(viewerId, candidateId));
  });
}
