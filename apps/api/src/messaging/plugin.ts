import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { messageListQuerySchema, notificationSettingsSchema, openConversationSchema, pushTokenSchema, sendMessageSchema } from "@sp/validation";
import { MessagingError, type MessagingStore } from "./store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: Record<MessagingError["code"], number> = {
  not_found: 404, not_member: 404, not_connected: 403, onboarding_required: 403, rate_limited: 429, daily_limit: 429,
};

function validationPayload(result: { error: { issues: { path: (string | number)[]; message: string }[] } }) {
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return { error: "validation", fields };
}

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
export interface MessagingDeps { store: MessagingStore; requireAuth: Guard }

export function registerMessaging(app: FastifyInstance, deps: MessagingDeps) {
  /** Maps typed domain errors to plain JSON; anything else falls through to the shared 500 handler. */
  function wrap<T extends FastifyRequest>(handler: (req: T, reply: FastifyReply, userId: string) => Promise<unknown>) {
    return async (req: T, reply: FastifyReply) => {
      const auth = req.auth;
      if (!auth) return reply.code(401).send({ error: "unauthorized" });
      try {
        return await handler(req, reply, auth.user.id);
      } catch (err) {
        if (err instanceof MessagingError) return reply.code(STATUS[err.code]).send({ error: err.code, message: err.message });
        throw err;
      }
    };
  }
  const pre = { preHandler: deps.requireAuth };

  app.post<{ Body: unknown }>("/conversations", pre, wrap(async (req, reply, me) => {
    const parsed = openConversationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    return reply.code(201).send({ conversation: await deps.store.openConversation(me, parsed.data.userId) });
  }));

  app.get("/conversations", pre, wrap(async (_req, reply, me) => reply.send({ conversations: await deps.store.listConversations(me) })));

  app.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>("/conversations/:id/messages", pre, wrap(async (req, reply, me) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
    const parsed = messageListQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    return reply.send(await deps.store.listMessages(me, req.params.id, { limit: parsed.data.limit, before: parsed.data.before }));
  }));

  app.post<{ Params: { id: string }; Body: unknown }>("/conversations/:id/messages", pre, wrap(async (req, reply, me) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    return reply.code(201).send({ message: await deps.store.sendMessage(me, req.params.id, parsed.data.body, parsed.data.clientTag) });
  }));

  app.post<{ Params: { id: string } }>("/conversations/:id/read", pre, wrap(async (req, reply, me) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
    await deps.store.markRead(me, req.params.id);
    return reply.code(204).send();
  }));

  app.get("/me/notification-settings", pre, wrap(async (_req, reply, me) => reply.send(await deps.store.getSettings(me))));
  app.put<{ Body: unknown }>("/me/notification-settings", pre, wrap(async (req, reply, me) => {
    const parsed = notificationSettingsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    return reply.send(await deps.store.updateSettings(me, parsed.data));
  }));

  app.post<{ Body: unknown }>("/me/push-tokens", pre, wrap(async (req, reply, me) => {
    const parsed = pushTokenSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    await deps.store.registerPushToken(me, parsed.data.platform, parsed.data.token);
    return reply.code(201).send({ registered: true });
  }));

  app.delete<{ Body: unknown }>("/me/push-tokens", pre, wrap(async (req, reply, me) => {
    const parsed = pushTokenSchema.pick({ token: true }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    await deps.store.removePushToken(me, parsed.data.token);
    return reply.code(204).send();
  }));
}
