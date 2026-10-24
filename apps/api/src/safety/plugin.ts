import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@sp/types";
import { createReportSchema, reportListQuerySchema, resolveReportSchema } from "@sp/validation";
import { SafetyError, type SafetyStore } from "./store";

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export interface SafetyDeps {
  store: SafetyStore;
  requireAuth: Guard;
  requireRole: (...roles: UserRole[]) => Guard;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS: Record<SafetyError["code"], number> = {
  not_found: 404,
  forbidden: 403,
  invalid: 400,
  rate_limited: 429,
  already_reported: 200,
  conflict: 409,
  unavailable: 503,
};

function validationPayload(result: { error: { issues: { path: (string | number)[]; message: string }[] } }) {
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return { error: "validation", fields };
}

export function registerSafety(app: FastifyInstance, deps: SafetyDeps) {
  const preAuth = { preHandler: deps.requireAuth };
  const preAdmin = { preHandler: [deps.requireAuth, deps.requireRole("admin", "moderator")] };

  const wrap = (fn: (req: any, reply: FastifyReply, me: string) => Promise<unknown>) => async (req: any, reply: FastifyReply) => {
    const me = req.auth?.user?.id as string | undefined;
    if (!me) return reply.code(401).send({ error: "unauthorized" });
    try {
      return await fn(req, reply, me);
    } catch (e) {
      if (e instanceof SafetyError) {
        return reply.code(STATUS[e.code] ?? 400).send({ error: e.code, message: e.message });
      }
      throw e;
    }
  };

  const badId = (reply: FastifyReply) => reply.code(400).send({ error: "bad_request" });
  const idOk = (req: { params: { id: string } }) => UUID_RE.test(req.params.id);

  // POST /reports - Report content or a person
  app.post("/reports", preAuth, wrap(async (req, reply, me) => {
    const p = createReportSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send(validationPayload(p));
    const result = await deps.store.createReport(me, p.data);
    return reply.code(201).send(result);
  }));

  // GET /admin/reports - Queue of reports for moderators & admins
  app.get("/admin/reports", preAdmin, wrap(async (req, reply) => {
    const p = reportListQuerySchema.safeParse(req.query);
    if (!p.success) return reply.code(400).send(validationPayload(p));
    const reports = await deps.store.listReports(p.data);
    return reply.send({ reports });
  }));

  // GET /admin/reports/:id - Single report details
  app.get("/admin/reports/:id", preAdmin, wrap(async (req, reply) => {
    if (!idOk(req)) return badId(reply);
    const report = await deps.store.getReport(req.params.id);
    return reply.send({ report });
  }));

  // POST /admin/reports/:id/resolve - Resolve report with action
  app.post("/admin/reports/:id/resolve", preAdmin, wrap(async (req, reply, me) => {
    if (!idOk(req)) return badId(reply);
    const p = resolveReportSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send(validationPayload(p));
    const report = await deps.store.resolveReport(me, req.params.id, p.data);
    return reply.send({ report });
  }));

  // POST /me/delete-account - GDPR / Privacy user account deletion
  app.post("/me/delete-account", preAuth, wrap(async (_req, reply, me) => {
    await deps.store.deleteAccount(me);
    return reply.code(204).send();
  }));
}
