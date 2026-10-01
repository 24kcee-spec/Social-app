import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@sp/types";
import { AccountConflictError, type AuthStore, type DbUser } from "./store";
import { AuthError, type AuthClaims } from "./verify";

export interface AuthContext {
  user: DbUser;
  sessionId: string; // our user_sessions.id
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthDeps {
  verify: (token: string) => Promise<AuthClaims>;
  store: AuthStore;
}

export function registerAuth(app: FastifyInstance, deps: AuthDeps) {
  /** Authentication: valid token -> active account -> non-revoked session. Sets req.auth. */
  async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    if (!m) return reply.code(401).send({ error: "unauthorized" });
    let claims: AuthClaims;
    try {
      claims = await deps.verify(m[1]!);
    } catch (err) {
      if (err instanceof AuthError && err.code === "auth_unavailable") return reply.code(503).send({ error: "auth_unavailable" });
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (claims.isAnonymous) return reply.code(403).send({ error: "anonymous_not_allowed" });
    let user: DbUser;
    try {
      user = await deps.store.upsertUser(claims);
    } catch (err) {
      if (err instanceof AccountConflictError) return reply.code(409).send({ error: "account_conflict" });
      throw err;
    }
    if (user.status !== "active") return reply.code(403).send({ error: "account_unavailable" });
    const session = await deps.store.touchSession(user.id, claims.sessionId, req.headers["user-agent"]);
    if (session.revoked) return reply.code(401).send({ error: "session_revoked" });
    req.auth = { user, sessionId: session.id };
  }

  /** Authorization: use AFTER requireAuth, e.g. { preHandler: [requireAuth, requireRole("admin")] }. */
  function requireRole(...roles: UserRole[]) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      if (!roles.some((r) => req.auth!.user.roles.includes(r))) return reply.code(403).send({ error: "forbidden" });
    };
  }

  app.get("/me", { preHandler: requireAuth }, async (req) => {
    const u = req.auth!.user;
    return { id: u.id, email: u.email, phone: u.phone, status: u.status, roles: u.roles, createdAt: u.createdAt, lastActiveAt: u.lastActiveAt };
  });

  app.get("/me/sessions", { preHandler: requireAuth }, async (req) => {
    const rows = await deps.store.listSessions(req.auth!.user.id);
    return { sessions: rows.map((s) => ({ ...s, current: s.id === req.auth!.sessionId })) };
  });

  app.delete<{ Params: { id: string } }>("/me/sessions/:id", { preHandler: requireAuth }, async (req, reply) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(400).send({ error: "bad_request" });
    const ok = await deps.store.revokeSession(req.auth!.user.id, req.params.id);
    return ok ? reply.code(204).send() : reply.code(404).send({ error: "not_found" });
  });

  return { requireAuth, requireRole };
}
