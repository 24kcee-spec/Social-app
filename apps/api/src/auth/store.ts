import type { UserRole, UserStatus } from "@sp/types";
import type { SqlRunner } from "../migrate";
import type { AuthClaims } from "./verify";

export interface DbUser {
  id: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  roles: UserRole[];
  createdAt: Date;
  lastActiveAt: Date | null;
}

export interface SessionRow {
  id: string;
  userAgent: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export class AccountConflictError extends Error {}

/** All SQL for auth lives here so authorization rules stay in one reviewable place. */
export function createAuthStore(db: SqlRunner) {
  return {
    /** First login creates the user (id = auth provider uid) and the default 'user' role; later logins refresh last_active_at. */
    async upsertUser(c: AuthClaims): Promise<DbUser> {
      try {
        await db.query(
          `insert into users (id, email, phone) values ($1, $2, $3)
           on conflict (id) do update set
             email = coalesce(excluded.email, users.email),
             phone = coalesce(excluded.phone, users.phone),
             last_active_at = now()`,
          [c.userId, c.email, c.phone],
        );
      } catch (err) {
        if ((err as { code?: string }).code === "23505") throw new AccountConflictError("email or phone already belongs to another account");
        throw err;
      }
      await db.query(`insert into user_roles (user_id, role) values ($1, 'user') on conflict do nothing`, [c.userId]);
      const { rows } = await db.query<Record<string, unknown>>(
        `select u.id, u.email, u.phone, u.status::text as status, u.created_at, u.last_active_at,
                coalesce((select array_agg(r.role::text order by r.role::text) from user_roles r where r.user_id = u.id), '{}') as roles
           from users u where u.id = $1`,
        [c.userId],
      );
      const r = rows[0]!;
      return {
        id: r.id as string,
        email: r.email as string | null,
        phone: r.phone as string | null,
        status: r.status as UserStatus,
        roles: r.roles as UserRole[],
        createdAt: r.created_at as Date,
        lastActiveAt: r.last_active_at as Date | null,
      };
    },

    /** Records the session (throttled to one write/minute) and reports whether it has been revoked. */
    async touchSession(userId: string, authSessionId: string, userAgent: string | undefined): Promise<{ id: string; revoked: boolean }> {
      const { rows } = await db.query<{ id: string; revoked_at: Date | null }>(
        `insert into user_sessions (user_id, auth_session_id, user_agent) values ($1, $2, $3)
         on conflict (user_id, auth_session_id) do update set
           last_seen_at = case when user_sessions.last_seen_at < now() - interval '1 minute' then now() else user_sessions.last_seen_at end
         returning id, revoked_at`,
        [userId, authSessionId, userAgent?.slice(0, 300) ?? null],
      );
      const r = rows[0]!;
      return { id: r.id, revoked: r.revoked_at !== null };
    },

    async listSessions(userId: string): Promise<SessionRow[]> {
      const { rows } = await db.query<Record<string, unknown>>(
        `select id, user_agent, first_seen_at, last_seen_at from user_sessions
          where user_id = $1 and revoked_at is null order by last_seen_at desc`,
        [userId],
      );
      return rows.map((r) => ({ id: r.id as string, userAgent: r.user_agent as string | null, firstSeenAt: r.first_seen_at as Date, lastSeenAt: r.last_seen_at as Date }));
    },

    /** Scoped by user_id: a user can only ever revoke their own sessions (no IDOR). */
    async revokeSession(userId: string, sessionId: string): Promise<boolean> {
      const { rows } = await db.query(
        `update user_sessions set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null returning id`,
        [sessionId, userId],
      );
      return rows.length > 0;
    },
  };
}
export type AuthStore = ReturnType<typeof createAuthStore>;
