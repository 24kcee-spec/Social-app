import type { ReportItem, ReportSummary } from "@sp/types";
import type { CreateReportInput, ReportListQuery, ResolveReportInput } from "@sp/validation";
import { ProfileApiError, describeFailure, type ProfileClientConfig } from "./index";

const FRIENDLY: Record<string, string> = {
  not_found: "That record was not found.",
  forbidden: "You do not have permission for that action.",
  invalid: "Invalid report details.",
  rate_limited: "You have submitted several reports recently. Please wait a short while.",
  already_reported: "You have already reported this item recently.",
};

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0);
  return entries.length ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";
}

export function createSafetyClient(config: ProfileClientConfig) {
  const doFetch = config.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const api = config.apiUrl.replace(/\/+$/, "");

  async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
    const token = await config.getAccessToken();
    let response: Response;
    try {
      response = await doFetch(`${api}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ProfileApiError(503, "service_unavailable", "The service is not reachable right now. Please try again shortly.");
    }
    if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
    let payload: { error?: string; message?: string; fields?: Record<string, string> } = {};
    try { payload = (await response.json()) as typeof payload; } catch { /* generic */ }
    const code = payload.error ?? (response.status === 401 ? "unauthorized" : "request_failed");
    throw new ProfileApiError(response.status, code, FRIENDLY[code] ?? payload.message ?? describeFailure(response.status, payload.fields), payload.fields ?? {});
  }

  return {
    report: async (input: CreateReportInput): Promise<ReportSummary> =>
      call<ReportSummary>("/reports", "POST", input),

    listReports: async (query: ReportListQuery = {}): Promise<ReportItem[]> =>
      (await call<{ reports: ReportItem[] }>(`/admin/reports${qs({
        status: query.status,
        targetType: query.targetType,
        limit: query.limit?.toString(),
        before: query.before,
      })}`, "GET")).reports,

    getReport: async (id: string): Promise<ReportItem> =>
      (await call<{ report: ReportItem }>(`/admin/reports/${encodeURIComponent(id)}`, "GET")).report,

    resolveReport: async (id: string, input: ResolveReportInput): Promise<ReportItem> =>
      (await call<{ report: ReportItem }>(`/admin/reports/${encodeURIComponent(id)}/resolve`, "POST", input)).report,

    deleteAccount: (): Promise<void> =>
      call<void>("/me/delete-account", "POST"),
  };
}

export type SafetyClient = ReturnType<typeof createSafetyClient>;
