import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { interestSelectionsRequestSchema, onboardingSchema, profileMediaRegistrationSchema, profileUpdateSchema, promptAnswersRequestSchema } from "@sp/validation";
import { ProfileMediaLimitError, ProfileValidationError, type ProfileStore } from "./store";

function validationPayload(result: { error: { issues: { path: (string | number)[]; message: string }[] } }) {
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return { error: "validation", fields };
}

function withStoreError(reply: FastifyReply, err: unknown) {
  if (err instanceof ProfileValidationError) return reply.code(400).send({ error: "validation", message: err.message });
  if (err instanceof ProfileMediaLimitError) return reply.code(409).send({ error: "media_limit", message: err.message });
  throw err;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProfileDeps { store: ProfileStore; requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; }

export function registerProfile(app: FastifyInstance, deps: ProfileDeps) {
  app.get("/interests", { preHandler: deps.requireAuth }, async (_req, reply) => reply.send({ interests: await deps.store.listInterests() }));
  app.get("/prompts", { preHandler: deps.requireAuth }, async (_req, reply) => reply.send({ prompts: await deps.store.listPrompts() }));

  app.get("/me/profile", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    return reply.send(await deps.store.getProfile(auth.user.id));
  });

  app.put<{ Body: unknown }>("/me/profile", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    try { return reply.send(await deps.store.updateProfile(auth.user.id, parsed.data)); } catch (err) { return withStoreError(reply, err); }
  });

  app.put<{ Body: unknown }>("/me/interests", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = interestSelectionsRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    try { return reply.send(await deps.store.updateInterests(auth.user.id, parsed.data)); } catch (err) { return withStoreError(reply, err); }
  });

  app.put<{ Body: unknown }>("/me/prompts", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = promptAnswersRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    try { return reply.send(await deps.store.updatePrompts(auth.user.id, parsed.data)); } catch (err) { return withStoreError(reply, err); }
  });

  app.put<{ Body: unknown }>("/me/onboarding", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    try { return reply.send(await deps.store.completeOnboarding(auth.user.id, parsed.data)); } catch (err) { return withStoreError(reply, err); }
  });

  app.post<{ Body: unknown }>("/me/profile/media", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = profileMediaRegistrationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(validationPayload(parsed));
    try { return reply.code(201).send(await deps.store.addMedia(auth.user.id, parsed.data)); } catch (err) { return withStoreError(reply, err); }
  });

  app.delete<{ Params: { id: string } }>("/me/profile/media/:id", { preHandler: deps.requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: "unauthorized" });
    if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
    return (await deps.store.deleteMedia(auth.user.id, req.params.id)) ? reply.code(204).send() : reply.code(404).send({ error: "not_found" });
  });
}
