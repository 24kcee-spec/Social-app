import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@sp/types";
import { buildApp } from "../src/app";
import { registerSafety } from "../src/safety/plugin";
import { SafetyError, type SafetyStore } from "../src/safety/store";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const h = { authorization: "Bearer t" };

function makeStore(over: Partial<SafetyStore> = {}): SafetyStore {
  return {
    createReport: vi.fn(async () => ({ id: ID, status: "pending" as const })),
    listReports: vi.fn(async () => []),
    getReport: vi.fn(async () => ({
      id: ID,
      reporterId: ME,
      targetType: "profile" as const,
      targetId: ID,
      reason: "harassment" as const,
      details: null,
      status: "pending" as const,
      actionTaken: null,
      reviewedBy: null,
      reviewedAt: null,
      resolutionNotes: null,
      createdAt: "2026-10-12T12:00:00.000Z",
    })),
    resolveReport: vi.fn(async () => ({
      id: ID,
      reporterId: ME,
      targetType: "profile" as const,
      targetId: ID,
      reason: "harassment" as const,
      details: null,
      status: "resolved" as const,
      actionTaken: "warning_issued" as const,
      reviewedBy: ME,
      reviewedAt: "2026-10-12T12:00:00.000Z",
      resolutionNotes: "Warned",
      createdAt: "2026-10-12T12:00:00.000Z",
    })),
    deleteAccount: vi.fn(async () => undefined),
    ...over,
  };
}

function makeApp(store = makeStore(), roles: UserRole[] = ["user"]) {
  const app = buildApp();
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers.authorization !== "Bearer t") return reply.code(401).send({ error: "unauthorized" });
    req.auth = {
      user: { id: ME, email: "me@example.com", phone: null, status: "active", roles, createdAt: new Date(), lastActiveAt: null },
      sessionId: "s",
    };
  };
  const requireRole = (...allowed: UserRole[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!allowed.some((r) => (req.auth!.user.roles).includes(r))) {
      return reply.code(403).send({ error: "forbidden" });
    }
  };
  registerSafety(app, { store, requireAuth, requireRole });
  return { app, store };
}

describe("safety routes", () => {
  it("requires authentication everywhere", async () => {
    const { app } = makeApp();
    const routes: { method: "GET" | "POST"; url: string }[] = [
      { method: "POST", url: "/reports" },
      { method: "GET", url: "/admin/reports" },
      { method: "GET", url: `/admin/reports/${ID}` },
      { method: "POST", url: `/admin/reports/${ID}/resolve` },
      { method: "POST", url: "/me/delete-account" },
    ];
    for (const r of routes) {
      const res = await app.inject({ method: r.method, url: r.url });
      expect(res.statusCode, r.url).toBe(401);
    }
  });

  it("restricts admin report endpoints to admin or moderator roles", async () => {
    const { app: userApp } = makeApp(makeStore(), ["user"]);
    const res1 = await userApp.inject({ method: "GET", url: "/admin/reports", headers: h });
    expect(res1.statusCode).toBe(403);

    const { app: modApp } = makeApp(makeStore(), ["moderator"]);
    const res2 = await modApp.inject({ method: "GET", url: "/admin/reports", headers: h });
    expect(res2.statusCode).toBe(200);

    const { app: adminApp } = makeApp(makeStore(), ["admin"]);
    const res3 = await adminApp.inject({ method: "GET", url: "/admin/reports", headers: h });
    expect(res3.statusCode).toBe(200);
  });

  it("validates report payload and returns field errors", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/reports",
      headers: h,
      payload: { targetType: "invalid", targetId: "not-a-uuid" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "validation" });
  });

  it("submits a valid report and calls store with signed-in user id", async () => {
    const store = makeStore();
    const { app } = makeApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/reports",
      headers: h,
      payload: { targetType: "profile", targetId: ID, reason: "harassment", details: "Harassing message" },
    });
    expect(res.statusCode).toBe(201);
    expect(store.createReport).toHaveBeenCalledWith(ME, {
      targetType: "profile",
      targetId: ID,
      reason: "harassment",
      details: "Harassing message",
    });
  });

  it("maps SafetyError codes to HTTP statuses", async () => {
    const cases: [SafetyError["code"], number][] = [
      ["not_found", 404],
      ["forbidden", 403],
      ["invalid", 400],
      ["rate_limited", 429],
    ];
    for (const [code, status] of cases) {
      const store = makeStore({
        createReport: vi.fn(async () => {
          throw new SafetyError(code, "err");
        }),
      });
      const { app } = makeApp(store);
      const res = await app.inject({
        method: "POST",
        url: "/reports",
        headers: h,
        payload: { targetType: "profile", targetId: ID, reason: "spam" },
      });
      expect(res.statusCode, code).toBe(status);
    }
  });

  it("calls deleteAccount on POST /me/delete-account", async () => {
    const store = makeStore();
    const { app } = makeApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/me/delete-account",
      headers: h,
    });
    expect(res.statusCode).toBe(204);
    expect(store.deleteAccount).toHaveBeenCalledWith(ME);
  });
});
