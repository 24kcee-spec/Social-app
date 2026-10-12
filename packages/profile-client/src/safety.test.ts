import { describe, expect, it, vi } from "vitest";
import { createSafetyClient } from "./safety";

describe("safety client", () => {
  const token = async () => "fake-token";
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("submits a report with bearer token and payload", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)?.authorization).toBe("Bearer fake-token");
      const body = JSON.parse(init?.body as string);
      expect(body.targetType).toBe("profile");
      expect(body.reason).toBe("harassment");
      return new Response(JSON.stringify({ id: "rep-1", status: "pending" }), { status: 201 });
    });

    const client = createSafetyClient({ apiUrl: "http://api.test", getAccessToken: token, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await client.report({ targetType: "profile", targetId: id, reason: "harassment" });
    expect(res).toEqual({ id: "rep-1", status: "pending" });
  });

  it("lists reports with query params", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain("/admin/reports?status=pending");
      return new Response(JSON.stringify({ reports: [{ id: "rep-1", status: "pending" }] }), { status: 200 });
    });

    const client = createSafetyClient({ apiUrl: "http://api.test", getAccessToken: token, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await client.listReports({ status: "pending" });
    expect(res).toHaveLength(1);
    expect(res[0]!.id).toBe("rep-1");
  });

  it("resolves a report with action", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain(`/admin/reports/${id}/resolve`);
      const body = JSON.parse(init?.body as string);
      expect(body.actionTaken).toBe("content_removed");
      return new Response(JSON.stringify({ report: { id, status: "resolved", actionTaken: "content_removed" } }), { status: 200 });
    });

    const client = createSafetyClient({ apiUrl: "http://api.test", getAccessToken: token, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await client.resolveReport(id, { actionTaken: "content_removed" });
    expect(res.status).toBe("resolved");
    expect(res.actionTaken).toBe("content_removed");
  });

  it("calls account deletion endpoint", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/me/delete-account");
      expect(init?.method).toBe("POST");
      return new Response(null, { status: 204 });
    });

    const client = createSafetyClient({ apiUrl: "http://api.test", getAccessToken: token, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.deleteAccount()).resolves.toBeUndefined();
  });
});
