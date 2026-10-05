import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { activationQuerySchema, interactionSettingsSchema, requestBoxSchema, sendRequestSchema } from "@sp/validation";
import { ConnectionError, type ConnectionsStore } from "./store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: Record<ConnectionError["code"], number> = {
  onboarding_required: 403, not_found: 404, not_accepting: 403, already_connected: 409, already_pending: 409, cooldown: 409, rate_limited: 429, daily_limit: 429, pending_limit: 429,
  custom_not_allowed: 400, invalid_intro: 400, not_pending: 409, forbidden: 403,
};

function validationPayload(result: { error: { issues: { path: (string | number)[]; message: string }[] } }) {
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return { error: "validation", fields };
}

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
export interface ConnectionsDeps { store: ConnectionsStore; requireAuth: Guard; requireRole: (...roles: ("user" | "moderator" | "admin" | "business")[]) => Guard }

export function registerConnections(app: FastifyInstance, deps: ConnectionsDeps) {
  /** Maps typed domain errors to plain JSON; anything else falls through to the shared 500 handler. */
  function wrap<T extends FastifyRequest>(handler: (req: T, reply: FastifyReply, userId: string) => Promise<unknown>) {
    return async (req: T, reply: FastifyReply) => {
      const auth = req.auth;
      if (!auth) return reply.code(401).send({ error: "unauthorized" });
      try {
        return await handler(req, reply, auth.user.id);
      } catch (err) {
        if (err instanceof ConnectionError) return reply.code(STATUS[err.code]).send({ error: err.code, message: err.message });
        throw err;
      }
    };
  }
  const pre = { preHandler: deps.requireAuth };

  app.get<{ Params: { userId: string } }>("/people/:userId/starters", pre, wrap(async (req, reply, me) => {
    if (!UUID_RE.test(req.params.userId)) return reply.code(400).send({ error: "bad_request" });
    return reply.send(await deps.store.getStarters(me, req.params.userId));
  }));

  app.post<{ Body: unknown }>("/connections/requests", pre, wrap(async (req, reply, me) => {
    const parsed = sendRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    return reply.code(201).send(await deps.store.sendRequest(me, parsed.data.recipientId, parsed.data.intro));
  }));

  app.get<{ Querystring: Record<string, unknown> }>("/connections/requests", pre, wrap(async (req, reply, me) => {
    const parsed = requestBoxSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    return reply.send({ requests: await deps.store.listRequests(me, parsed.data.box) });
  }));

  for (const action of ["accept", "decline"] as const) {
    app.post<{ Params: { id: string } }>(`/connections/requests/:id/${action}`, pre, wrap(async (req, reply, me) => {
      if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
      await deps.store.respond(me, req.params.id, action);
      return reply.code(204).send();
    }));
  }

  app.delete<{ Params: { id: string } }>("/connections/requests/:id", pre, wrap(async (req, reply, me) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
    await deps.store.withdraw(me, req.params.id);
    return reply.code(204).send();
  }));

  app.get("/connections", pre, wrap(async (_req, reply, me) => reply.send({ connections: await deps.store.listConnections(me) })));

  app.delete<{ Params: { userId: string } }>("/connections/:userId", pre, wrap(async (req, reply, me) => {
    if (!UUID_RE.test(req.params.userId)) return reply.code(400).send({ error: "bad_request" });
    await deps.store.removeConnection(me, req.params.userId);
    return reply.code(204).send();
  }));

  app.get("/me/interaction-settings", pre, wrap(async (_req, reply, me) => reply.send(await deps.store.getSettings(me))));
  app.put<{ Body: unknown }>("/me/interaction-settings", pre, wrap(async (req, reply, me) => {
    const parsed = interactionSettingsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    return reply.send(await deps.store.updateSettings(me, parsed.data));
  }));

  app.get<{ Querystring: Record<string, unknown> }>("/admin/activation/summary", { preHandler: [deps.requireAuth, deps.requireRole("admin")] }, async (req, reply) => {
    const parsed = activationQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    return reply.send(await deps.store.activationSummary(parsed.data.sinceDays));
  });
}
