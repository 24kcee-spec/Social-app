import type { ReportAction, ReportItem, ReportReason, ReportStatus, ReportSummary, ReportTargetType } from "@sp/types";
import type { CreateReportInput, ReportListQuery, ResolveReportInput } from "@sp/validation";
import type { SqlRunner } from "../migrate";

export class SafetyError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "invalid" | "rate_limited" | "already_reported",
    message: string,
  ) {
    super(message);
  }
}

export interface SafetyStore {
  createReport(reporterId: string, input: CreateReportInput): Promise<ReportSummary>;
  listReports(query: ReportListQuery): Promise<ReportItem[]>;
  getReport(id: string): Promise<ReportItem>;
  resolveReport(adminId: string, id: string, input: ResolveReportInput): Promise<ReportItem>;
  deleteAccount(userId: string): Promise<void>;
}

export interface SafetyStoreOptions {
  now?: () => Date;
  maxReportsPerHour?: number;
}

const text = (v: unknown): string => String(v);
const iso = (v: unknown): string => (v ? new Date(v as string | Date).toISOString() : "");

export function createSafetyStore(db: SqlRunner, options: SafetyStoreOptions = {}): SafetyStore {
  const clock = options.now ?? (() => new Date());
  const maxReportsPerHour = options.maxReportsPerHour ?? 5;

  return {
    async createReport(reporterId: string, input: CreateReportInput): Promise<ReportSummary> {
      // 1. Rate limiting: max N reports per hour per reporter
      const { rows: countRows } = await db.query<{ count: string | number }>(
        `select count(*)::int as count from reports where reporter_id = $1 and created_at > $2::timestamptz - interval '1 hour'`,
        [reporterId, clock().toISOString()],
      );
      if (Number(countRows[0]?.count ?? 0) >= maxReportsPerHour) {
        throw new SafetyError("rate_limited", "Too many reports submitted recently. Please wait before submitting another report.");
      }

      // 2. Prevent duplicate report on same target in 24 hours
      const { rows: dupRows } = await db.query<{ id: string; status: ReportStatus }>(
        `select id::text as id, status from reports where reporter_id = $1 and target_type = $2 and target_id = $3 and created_at > $4::timestamptz - interval '24 hours' limit 1`,
        [reporterId, input.targetType, input.targetId, clock().toISOString()],
      );
      if (dupRows[0]) {
        return { id: text(dupRows[0].id), status: dupRows[0].status };
      }

      // 3. Verify target exists and identify associated user for auto-blocking
      let userToBlock: string | null = null;
      if (input.targetType === "profile") {
        if (input.targetId === reporterId) {
          throw new SafetyError("invalid", "You cannot report your own profile.");
        }
        const { rows } = await db.query(`select 1 from profiles where user_id = $1`, [input.targetId]);
        if (!rows[0]) throw new SafetyError("not_found", "Profile not found.");
        userToBlock = input.targetId;
      } else if (input.targetType === "message") {
        const { rows } = await db.query<{ sender_id: string }>(`select sender_id::text as sender_id from messages where id = $1`, [input.targetId]);
        if (!rows[0]) throw new SafetyError("not_found", "Message not found.");
        userToBlock = rows[0].sender_id;
      } else if (input.targetType === "group") {
        const { rows } = await db.query<{ owner_id: string }>(`select owner_id::text as owner_id from groups where id = $1`, [input.targetId]);
        if (!rows[0]) throw new SafetyError("not_found", "Group not found.");
        userToBlock = rows[0].owner_id;
      } else if (input.targetType === "event") {
        const { rows } = await db.query<{ group_id: string }>(`select group_id::text as group_id from events where id = $1`, [input.targetId]);
        if (!rows[0]) throw new SafetyError("not_found", "Event not found.");
      } else if (input.targetType === "event_message") {
        const { rows } = await db.query<{ sender_id: string }>(`select sender_id::text as sender_id from event_messages where id = $1`, [input.targetId]);
        if (!rows[0]) throw new SafetyError("not_found", "Event message not found.");
        userToBlock = rows[0].sender_id;
      }

      // 4. Insert report
      const { rows: inserted } = await db.query<{ id: string; status: ReportStatus }>(
        `insert into reports (reporter_id, target_type, target_id, reason, details, created_at)
         values ($1, $2, $3, $4, $5, $6::timestamptz)
         returning id::text as id, status`,
        [reporterId, input.targetType, input.targetId, input.reason, input.details ?? null, clock().toISOString()],
      );

      // 5. Automatic block if requested
      if (input.blockUser && userToBlock && userToBlock !== reporterId) {
        await db.query(
          `insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`,
          [reporterId, userToBlock],
        );
      }

      const rep = inserted[0]!;
      return { id: text(rep.id), status: rep.status };
    },

    async listReports(query: ReportListQuery): Promise<ReportItem[]> {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (query.status) {
        params.push(query.status);
        conditions.push(`status = $${params.length}`);
      }
      if (query.targetType) {
        params.push(query.targetType);
        conditions.push(`target_type = $${params.length}`);
      }
      if (query.before) {
        params.push(query.before);
        conditions.push(`created_at < $${params.length}::timestamptz`);
      }

      params.push(query.limit ?? 50);
      const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

      const { rows } = await db.query<Record<string, unknown>>(
        `select id::text as id, reporter_id::text as reporter_id, target_type, target_id,
                reason, details, status, action_taken, reviewed_by::text as reviewed_by,
                reviewed_at, resolution_notes, created_at
           from reports
           ${whereClause}
          order by created_at desc
          limit $${params.length}`,
        params,
      );

      return rows.map((r) => ({
        id: text(r.id),
        reporterId: text(r.reporter_id),
        targetType: r.target_type as ReportTargetType,
        targetId: text(r.target_id),
        reason: r.reason as ReportReason,
        details: r.details ? text(r.details) : null,
        status: r.status as ReportStatus,
        actionTaken: (r.action_taken as ReportAction) || null,
        reviewedBy: r.reviewed_by ? text(r.reviewed_by) : null,
        reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null,
        resolutionNotes: r.resolution_notes ? text(r.resolution_notes) : null,
        createdAt: iso(r.created_at),
      }));
    },

    async getReport(id: string): Promise<ReportItem> {
      const { rows } = await db.query<Record<string, unknown>>(
        `select id::text as id, reporter_id::text as reporter_id, target_type, target_id,
                reason, details, status, action_taken, reviewed_by::text as reviewed_by,
                reviewed_at, resolution_notes, created_at
           from reports where id = $1`,
        [id],
      );
      if (!rows[0]) throw new SafetyError("not_found", "Report not found.");
      const r = rows[0];
      return {
        id: text(r.id),
        reporterId: text(r.reporter_id),
        targetType: r.target_type as ReportTargetType,
        targetId: text(r.target_id),
        reason: r.reason as ReportReason,
        details: r.details ? text(r.details) : null,
        status: r.status as ReportStatus,
        actionTaken: (r.action_taken as ReportAction) || null,
        reviewedBy: r.reviewed_by ? text(r.reviewed_by) : null,
        reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null,
        resolutionNotes: r.resolution_notes ? text(r.resolution_notes) : null,
        createdAt: iso(r.created_at),
      };
    },

    async resolveReport(adminId: string, id: string, input: ResolveReportInput): Promise<ReportItem> {
      const current = await this.getReport(id);

      if (input.actionTaken === "content_removed") {
        if (current.targetType === "message") {
          await db.query(`delete from messages where id = $1`, [current.targetId]);
        } else if (current.targetType === "event_message") {
          await db.query(`delete from event_messages where id = $1`, [current.targetId]);
        } else if (current.targetType === "group") {
          await db.query(`delete from groups where id = $1`, [current.targetId]);
        } else if (current.targetType === "event") {
          await db.query(`delete from events where id = $1`, [current.targetId]);
        }
      } else if (input.actionTaken === "user_suspended" || input.actionTaken === "user_banned") {
        let userId: string | null = null;
        if (current.targetType === "profile") {
          userId = current.targetId;
        } else if (current.targetType === "message") {
          const m = await db.query<{ sender_id: string }>(`select sender_id::text as sender_id from messages where id = $1`, [current.targetId]);
          userId = m.rows[0]?.sender_id ?? null;
        } else if (current.targetType === "event_message") {
          const em = await db.query<{ sender_id: string }>(`select sender_id::text as sender_id from event_messages where id = $1`, [current.targetId]);
          userId = em.rows[0]?.sender_id ?? null;
        } else if (current.targetType === "group") {
          const g = await db.query<{ owner_id: string }>(`select owner_id::text as owner_id from groups where id = $1`, [current.targetId]);
          userId = g.rows[0]?.owner_id ?? null;
        }

        if (userId) {
          const newStatus = input.actionTaken === "user_suspended" ? "suspended" : "banned";
          await db.query(`update users set status = $1 where id = $2`, [newStatus, userId]);
          await db.query(`delete from user_sessions where user_id = $1`, [userId]);
        }
      }

      const nextStatus: ReportStatus = input.actionTaken === "none" ? "dismissed" : "resolved";
      const { rows } = await db.query<Record<string, unknown>>(
        `update reports
            set status = $1, action_taken = $2, reviewed_by = $3,
                reviewed_at = $4::timestamptz, resolution_notes = $5
          where id = $6
          returning id::text as id, reporter_id::text as reporter_id, target_type, target_id,
                    reason, details, status, action_taken, reviewed_by::text as reviewed_by,
                    reviewed_at, resolution_notes, created_at`,
        [nextStatus, input.actionTaken, adminId, clock().toISOString(), input.resolutionNotes ?? null, id],
      );

      const r = rows[0]!;
      return {
        id: text(r.id),
        reporterId: text(r.reporter_id),
        targetType: r.target_type as ReportTargetType,
        targetId: text(r.target_id),
        reason: r.reason as ReportReason,
        details: r.details ? text(r.details) : null,
        status: r.status as ReportStatus,
        actionTaken: (r.action_taken as ReportAction) || null,
        reviewedBy: r.reviewed_by ? text(r.reviewed_by) : null,
        reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null,
        resolutionNotes: r.resolution_notes ? text(r.resolution_notes) : null,
        createdAt: iso(r.created_at),
      };
    },

    async deleteAccount(userId: string): Promise<void> {
      await db.query(`update users set status = 'deleted' where id = $1`, [userId]);
      await db.query(
        `update profiles
            set display_name = 'Deleted User', bio = '', onboarding_completed = false,
                verification_level = 'unverified'
          where user_id = $1`,
        [userId],
      );
      await db.query(`delete from user_sessions where user_id = $1`, [userId]);
      await db.query(`delete from device_push_tokens where user_id = $1`, [userId]);
      await db.query(`delete from notification_settings where user_id = $1`, [userId]);
      await db.query(`delete from profile_media where user_id = $1`, [userId]);
      await db.query(`delete from user_interests where user_id = $1`, [userId]);
      await db.query(`delete from prompt_answers where user_id = $1`, [userId]);
      await db.query(`delete from event_rsvps where user_id = $1`, [userId]);
      await db.query(`delete from group_members where user_id = $1`, [userId]);
    },
  };
}
