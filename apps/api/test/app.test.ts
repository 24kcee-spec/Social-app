import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("GET /health", () => {
  it("returns ok without touching dependencies", async () => {
    const app = buildApp({ readinessChecks: { database: async () => { throw new Error("db down"); } } });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", service: "api" });
  });
});

describe("GET /ready", () => {
  it("is ready with no checks configured", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready", checks: {} });
  });
  it("is ready when every check passes", async () => {
    const app = buildApp({ readinessChecks: { database: async () => {} } });
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks).toEqual({ database: "ok" });
  });
  it("returns 503 and hides error details when a check fails", async () => {
    const app = buildApp({ readinessChecks: { database: async () => { throw new Error("password=hunter2 refused"); } } });
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "not_ready", checks: { database: "fail" } });
    expect(res.body).not.toContain("hunter2");
  });
});

describe("unknown routes and bad requests", () => {
  it("returns a JSON 404", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });
  it("does not leak internal errors", async () => {
    const app = buildApp();
    app.get("/boom", async () => { throw new Error("secret stack detail"); });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal_error" });
    expect(res.body).not.toContain("secret stack detail");
  });
});
