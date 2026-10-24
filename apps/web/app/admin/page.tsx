"use client";

import type { ActivationSummary, ReportAction, ReportItem, ReportStatus } from "@sp/types";
import { REPORT_ACTIONS } from "@sp/types";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, getAuth } from "../../lib/auth";
import { getConnectionsClient } from "../../lib/connections";
import { getSafetyClient } from "../../lib/safety";

type Draft = { actionTaken: ReportAction; resolutionNotes: string };

const STATUS_OPTIONS: { value: "all" | ReportStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "reviewed", label: "Reviewed" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

const ACTION_LABELS: Record<ReportAction, string> = {
  none: "No enforcement action",
  warning_issued: "Warning issued",
  content_removed: "Content removed",
  user_suspended: "User suspended",
  user_banned: "User banned",
};

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<ActivationSummary | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [status, setStatus] = useState<"all" | ReportStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    document.title = "Moderation & product health · Sidle";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await getAuth().fetchMe();
      const isAdmin = me.roles.includes("admin");
      setAllowed(isAdmin);
      if (!isAdmin) return;

      const [activation, reportList] = await Promise.all([
        getConnectionsClient().getActivationSummary(30),
        getSafetyClient().listReports({ status: status === "all" ? undefined : status, limit: 50 }),
      ]);
      setSummary(activation);
      setReports(reportList);
      setDrafts((current) => {
        const next = { ...current };
        for (const report of reportList) {
          next[report.id] ??= { actionTaken: report.actionTaken ?? "none", resolutionNotes: report.resolutionNotes ?? "" };
        }
        return next;
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(report: ReportItem) {
    const draft = drafts[report.id] ?? { actionTaken: "none" as const, resolutionNotes: "" };
    if (!window.confirm(`Resolve this ${report.reason.replaceAll("_", " ")} report with: ${ACTION_LABELS[draft.actionTaken]}?`)) return;
    setBusyId(report.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await getSafetyClient().resolveReport(report.id, {
        actionTaken: draft.actionTaken,
        resolutionNotes: draft.resolutionNotes.trim() || undefined,
      });
      setReports((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice("Report resolution saved. The API audit fields remain the source of truth.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (allowed === false) {
    return (
      <main id="main" tabIndex={-1} className="sidle-public-page">
        <section className="empty-state-card" style={{ maxWidth: 680, margin: "10vh auto 0" }}>
          <div className="empty-state-icon" aria-hidden="true">◇</div>
          <h1>Admin access only</h1>
          <p className="muted">Moderation data is protected by the API role check. This screen does not grant permissions by being reachable.</p>
          <a className="secondary" href="/discover">Back to Sidle</a>
        </section>
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="sidle-public-page sidle-admin-page">
      <div className="sidle-page-topline">
        <div>
          <span className="eyebrow">SIDLE OPERATIONS</span>
          <h1>Moderation & product health</h1>
          <p className="muted">A compact operational view of meaningful activation and user reports. Access is enforced by the API.</p>
        </div>
        <a className="secondary compact" href="/discover">Back to app</a>
      </div>

      {error && <div className="notice err" role="alert"><span>{error}</span><button className="link" onClick={() => void load()}>Retry</button></div>}
      {notice && <div className="notice ok" role="status"><span>{notice}</span><button className="link" onClick={() => setNotice(null)}>Dismiss</button></div>}

      {loading || allowed === null ? (
        <section className="empty-state-card" aria-busy="true"><p className="muted">Loading protected operational data…</p></section>
      ) : (
        <>
          <section aria-labelledby="activation-title">
            <div className="sidle-section-heading">
              <div>
                <span className="eyebrow">LAST 30 DAYS</span>
                <h2 id="activation-title">Activation funnel</h2>
              </div>
              <span className="muted">Meaningful actions, not page-view vanity metrics.</span>
            </div>
            <div className="sidle-metric-grid">
              <Metric label="Signed up" value={summary?.signedUp ?? 0} />
              <Metric label="Onboarded" value={summary?.onboarded ?? 0} />
              <Metric label="First request" value={summary?.sentFirstRequest ?? 0} />
              <Metric label="Connected" value={summary?.connected ?? 0} />
              <Metric label="Activated ≤48h" value={summary?.activatedWithin48h ?? 0} />
              <Metric label="Activation rate" value={summary?.activationRate == null ? "—" : `${Math.round(summary.activationRate * 100)}%`} />
            </div>
          </section>

          <section className="sidle-admin-reports" aria-labelledby="reports-title">
            <div className="sidle-section-heading">
              <div>
                <span className="eyebrow">TRUST & SAFETY</span>
                <h2 id="reports-title">User reports</h2>
              </div>
              <label className="sidle-inline-field">
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as "all" | ReportStatus)}>
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>

            {reports.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-state-icon" aria-hidden="true">✓</div>
                <h3>No reports in this view</h3>
                <p className="muted">Change the status filter to review another queue.</p>
              </div>
            ) : (
              <div className="sidle-report-list">
                {reports.map((report) => {
                  const draft = drafts[report.id] ?? { actionTaken: report.actionTaken ?? "none", resolutionNotes: report.resolutionNotes ?? "" };
                  const closed = report.status === "resolved" || report.status === "dismissed";
                  return (
                    <article className="card sidle-report-card" key={report.id}>
                      <div className="sidle-report-meta">
                        <span className={`sidle-status sidle-status-${report.status}`}>{report.status}</span>
                        <span>{report.targetType.replaceAll("_", " ")}</span>
                        <time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time>
                      </div>
                      <h3>{report.reason.replaceAll("_", " ")}</h3>
                      <p className="muted">{report.details || "No additional details supplied."}</p>
                      <details>
                        <summary>Audit identifiers</summary>
                        <dl className="sidle-audit-grid">
                          <div><dt>Report</dt><dd>{report.id}</dd></div>
                          <div><dt>Target</dt><dd>{report.targetId}</dd></div>
                          <div><dt>Reporter</dt><dd>{report.reporterId}</dd></div>
                        </dl>
                      </details>

                      {closed ? (
                        <div className="sidle-resolution-summary">
                          <strong>{report.actionTaken ? ACTION_LABELS[report.actionTaken] : "Closed"}</strong>
                          {report.resolutionNotes && <p>{report.resolutionNotes}</p>}
                          {report.reviewedAt && <p className="muted">Reviewed {new Date(report.reviewedAt).toLocaleString()}</p>}
                        </div>
                      ) : (
                        <div className="sidle-resolution-editor">
                          <label>
                            <span>Action</span>
                            <select
                              value={draft.actionTaken}
                              onChange={(event) => setDrafts((current) => ({
                                ...current,
                                [report.id]: { ...draft, actionTaken: event.target.value as ReportAction },
                              }))}
                            >
                              {REPORT_ACTIONS.map((action) => <option key={action} value={action}>{ACTION_LABELS[action]}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Resolution notes</span>
                            <textarea
                              rows={3}
                              maxLength={1000}
                              value={draft.resolutionNotes}
                              onChange={(event) => setDrafts((current) => ({
                                ...current,
                                [report.id]: { ...draft, resolutionNotes: event.target.value },
                              }))}
                              placeholder="Record the reason for the decision. Avoid unnecessary personal information."
                            />
                          </label>
                          <button disabled={busyId === report.id} onClick={() => void resolve(report)}>
                            {busyId === report.id ? "Saving…" : "Resolve report"}
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sidle-metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
