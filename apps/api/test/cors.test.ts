import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { resolveCorsOrigins } from "../src/cors";

const ORIGIN = "https://app.example.com";

describe("resolveCorsOrigins", () => {
  it("allows only the local web dev server by default in local", () => {
    expect(resolveCorsOrigins({ APP_ENV: "local" })).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
  });
  it("fails closed outside local when nothing is configured", () => {
    expect(resolveCorsOrigins({ APP_ENV: "production" })).toEqual([]);
  });
  it("parses a comma list, trims, drops trailing slashes and duplicates, and ignores wildcards", () => {
    expect(resolveCorsOrigins({ APP_ENV: "production", CORS_ORIGINS: ` ${ORIGIN}/ , https://b.example.com,*,${ORIGIN}` })).toEqual([
      ORIGIN,
      "https://b.example.com",
    ]);
  });
});

describe("CORS on the API", () => {
  it("adds CORS headers for an allowed origin", async () => {
    const res = await buildApp({ corsOrigins: [ORIGIN] }).inject({ method: "GET", url: "/health", headers: { origin: ORIGIN } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
  });
  it("adds no CORS headers for an unknown origin", async () => {
    const res = await buildApp({ corsOrigins: [ORIGIN] }).inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
  it("answers preflight requests that send an Authorization header", async () => {
    const res = await buildApp({ corsOrigins: [ORIGIN] }).inject({
      method: "OPTIONS",
      url: "/me",
      headers: { origin: ORIGIN, "access-control-request-method": "GET", "access-control-request-headers": "authorization" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(String(res.headers["access-control-allow-headers"]).toLowerCase()).toContain("authorization");
  });
  it("sends no CORS headers at all when no origins are configured", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/health", headers: { origin: ORIGIN } });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
