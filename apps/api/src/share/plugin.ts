import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ShareError, type ShareStore } from "./store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ShareDeps {
  store: ShareStore;
  defaultOrigin?: string;
}

export function registerShare(app: FastifyInstance, deps: ShareDeps) {
  function getOrigin(req: FastifyRequest): string {
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost:4000";
    return `${proto}://${host}`;
  }

  function handleShareError(e: unknown, reply: FastifyReply) {
    if (e instanceof ShareError) {
      if (e.code === "not_found") return reply.code(404).send({ error: "not_found", message: e.message });
      if (e.code === "private") return reply.code(403).send({ error: "private", message: e.message });
      if (e.code === "inactive") return reply.code(410).send({ error: "inactive", message: e.message });
    }
    throw e;
  }

  app.get("/share/groups/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
    try {
      const preview = await deps.store.getGroupPreview(req.params.id, deps.defaultOrigin || getOrigin(req));
      return reply.header("Cache-Control", "public, max-age=60, s-maxage=300").send({ preview });
    } catch (e) {
      return handleShareError(e, reply);
    }
  });

  app.get("/share/events/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
    try {
      const preview = await deps.store.getEventPreview(req.params.id, deps.defaultOrigin || getOrigin(req));
      return reply.header("Cache-Control", "public, max-age=60, s-maxage=300").send({ preview });
    } catch (e) {
      return handleShareError(e, reply);
    }
  });

  app.get("/share/profiles/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
    try {
      const preview = await deps.store.getProfilePreview(req.params.id, deps.defaultOrigin || getOrigin(req));
      return reply.header("Cache-Control", "public, max-age=120, s-maxage=600").send({ preview });
    } catch (e) {
      return handleShareError(e, reply);
    }
  });
}
