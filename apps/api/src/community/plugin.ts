import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createEventSchema, createGroupSchema, eventListQuerySchema, eventMessageListQuerySchema, eventMessageSchema, groupListQuerySchema } from "@sp/validation";
import { CommunityError, type CommunityStore } from "./store";

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
export interface CommunityDeps { store: CommunityStore; requireAuth: Guard }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: Record<CommunityError["code"], number> = {
  not_found: 404, forbidden: 403, full: 409, invalid: 400, onboarding_required: 403, limit_reached: 409, rate_limited: 429, daily_limit: 429,
};

function validationPayload(result: { error: { issues: { path: (string | number)[]; message: string }[] } }) {
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return { error: "validation", fields };
}

export function registerCommunity(app: FastifyInstance, deps: CommunityDeps) {
  const pre = { preHandler: deps.requireAuth };
  /** Maps typed domain errors to plain JSON; anything else falls through to the shared 500 handler. */
  const wrap = (fn: (req: any, reply: FastifyReply, me: string) => Promise<unknown>) => async (req: any, reply: FastifyReply) => {
    const me = req.auth?.user?.id as string | undefined;
    if (!me) return reply.code(401).send({ error: "unauthorized" });
    try { return await fn(req, reply, me); }
    catch (e) {
      if (e instanceof CommunityError) return reply.code(STATUS[e.code]).send({ error: e.code, message: e.message });
      throw e;
    }
  };
  const badId = (reply: FastifyReply) => reply.code(400).send({ error: "bad_request" });
  const idOk = (req: { params: { id: string } }) => UUID_RE.test(req.params.id);

  // ---- groups ----
  app.get("/activities", pre, wrap(async (_req, reply) => reply.send({ activities: await deps.store.listActivities() })));
  app.get("/groups", pre, wrap(async (req, reply, me) => {
    const p = groupListQuerySchema.safeParse(req.query);
    if (!p.success) return reply.code(400).send(validationPayload(p));
    return reply.send({ groups: await deps.store.listGroups(me, p.data) });
  }));
  app.post("/groups", pre, wrap(async (req, reply, me) => {
    const p = createGroupSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send(validationPayload(p));
    return reply.code(201).send({ group: await deps.store.createGroup(me, p.data) });
  }));
  app.get("/groups/:id", pre, wrap(async (req, reply, me) => idOk(req) ? reply.send({ group: await deps.store.getGroup(me, req.params.id) }) : badId(reply)));
  app.delete("/groups/:id", pre, wrap(async (req, reply, me) => { if (!idOk(req)) return badId(reply); await deps.store.deleteGroup(me, req.params.id); return reply.code(204).send(); }));
  app.post("/groups/:id/join", pre, wrap(async (req, reply, me) => { if (!idOk(req)) return badId(reply); await deps.store.joinGroup(me, req.params.id); return reply.code(204).send(); }));
  app.delete("/groups/:id/join", pre, wrap(async (req, reply, me) => { if (!idOk(req)) return badId(reply); await deps.store.leaveGroup(me, req.params.id); return reply.code(204).send(); }));
  app.get("/groups/:id/members", pre, wrap(async (req, reply, me) => idOk(req) ? reply.send({ members: await deps.store.listMembers(me, req.params.id) }) : badId(reply)));

  // ---- events ----
  app.get("/events", pre, wrap(async (req, reply, me) => {
    const p = eventListQuerySchema.safeParse(req.query);
    if (!p.success) return reply.code(400).send(validationPayload(p));
    return reply.send({ events: await deps.store.listEvents(me, p.data) });
  }));
  app.post("/events", pre, wrap(async (req, reply, me) => {
    const p = createEventSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send(validationPayload(p));
    return reply.code(201).send({ event: await deps.store.createEvent(me, p.data) });
  }));
  app.get("/events/:id", pre, wrap(async (req, reply, me) => idOk(req) ? reply.send({ event: await deps.store.getEvent(me, req.params.id) }) : badId(reply)));
  app.delete("/events/:id", pre, wrap(async (req, reply, me) => { if (!idOk(req)) return badId(reply); await deps.store.deleteEvent(me, req.params.id); return reply.code(204).send(); }));
  app.post("/events/:id/rsvp", pre, wrap(async (req, reply, me) => idOk(req) ? reply.send(await deps.store.rsvp(me, req.params.id)) : badId(reply)));
  app.delete("/events/:id/rsvp", pre, wrap(async (req, reply, me) => { if (!idOk(req)) return badId(reply); await deps.store.cancelRsvp(me, req.params.id); return reply.code(204).send(); }));
  app.get("/events/:id/attendees", pre, wrap(async (req, reply, me) => idOk(req) ? reply.send({ attendees: await deps.store.listAttendees(me, req.params.id) }) : badId(reply)));

  // ---- attendee-only event chat ----
  app.get("/events/:id/messages", pre, wrap(async (req, reply, me) => {
    if (!idOk(req)) return badId(reply);
    const p = eventMessageListQuerySchema.safeParse(req.query);
    if (!p.success) return reply.code(400).send(validationPayload(p));
    return reply.send(await deps.store.listEventMessages(me, req.params.id, { limit: p.data.limit, ...(p.data.before ? { before: p.data.before } : {}) }));
  }));
  app.post("/events/:id/messages", pre, wrap(async (req, reply, me) => {
    if (!idOk(req)) return badId(reply);
    const p = eventMessageSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send(validationPayload(p));
    return reply.code(201).send({ message: await deps.store.sendEventMessage(me, req.params.id, p.data.body, p.data.clientTag) });
  }));
}
