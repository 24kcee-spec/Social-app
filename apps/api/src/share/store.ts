import type { GroupSharePreview, EventSharePreview, ProfileSharePreview } from "@sp/types";

export class ShareError extends Error {
  constructor(public readonly code: "not_found" | "private" | "inactive", message: string) {
    super(message);
    this.name = "ShareError";
  }
}

export interface ShareStore {
  getGroupPreview(id: string, origin?: string): Promise<GroupSharePreview>;
  getEventPreview(id: string, origin?: string): Promise<EventSharePreview>;
  getProfilePreview(id: string, origin?: string): Promise<ProfileSharePreview>;
}

interface QueryResult<T> { rows: T[]; }
interface DbClient { query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>; }

export function createShareStore(db: DbClient, defaultBaseUrl = "https://social-app.local"): ShareStore {
  const q = <T>(sql: string, params?: unknown[]) => db.query<T>(sql, params);

  return {
    async getGroupPreview(id: string, origin = defaultBaseUrl): Promise<GroupSharePreview> {
      const sql = `
        select g.id::text as id, g.name, g.description, g.general_area, g.capacity,
               (select count(*)::int from group_members gm where gm.group_id = g.id) as member_count,
               coalesce((select array_agg(a.name order by a.name)
                           from group_activities ga
                           join activities a on a.id = ga.activity_id
                          where ga.group_id = g.id), '{}') as activities
          from groups g
          join users u on u.id = g.owner_id and u.status = 'active'
         where g.id = $1::uuid
      `;
      const res = await q<{
        id: string; name: string; description: string; general_area: string;
        capacity: number; member_count: number; activities: string[];
      }>(sql, [id]);

      const row = res.rows[0];
      if (!row) throw new ShareError("not_found", "Group not found or no longer active");

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        generalArea: row.general_area,
        memberCount: Number(row.member_count),
        capacity: Number(row.capacity),
        activities: row.activities || [],
        isPrivate: false,
        shareUrl: `${origin}/share/group/${row.id}`,
        deepLink: `socialapp://group/${row.id}`,
      };
    },

    async getEventPreview(id: string, origin = defaultBaseUrl): Promise<EventSharePreview> {
      const sql = `
        select e.id::text as id, e.group_id::text as group_id, g.name as group_name,
               e.title, e.description, e.general_area, e.starts_at, e.ends_at, e.capacity,
               (select count(*)::int from event_rsvps r where r.event_id = e.id and r.status = 'going') as attendee_count
          from events e
          join groups g on g.id = e.group_id
          join users host on host.id = e.host_id and host.status = 'active'
         where e.id = $1::uuid
      `;
      const res = await q<{
        id: string; group_id: string; group_name: string; title: string;
        description: string; general_area: string; starts_at: string;
        ends_at: string; capacity: number; attendee_count: number;
      }>(sql, [id]);

      const row = res.rows[0];
      if (!row) throw new ShareError("not_found", "Event not found or host account inactive");

      const attendeeCount = Number(row.attendee_count);
      const capacity = Number(row.capacity);
      const spotsLeft = Math.max(0, capacity - attendeeCount);

      return {
        id: row.id,
        groupId: row.group_id,
        groupName: row.group_name,
        title: row.title,
        description: row.description,
        generalArea: row.general_area,
        startsAt: new Date(row.starts_at).toISOString(),
        endsAt: new Date(row.ends_at).toISOString(),
        capacity,
        attendeeCount,
        spotsLeft,
        isFull: spotsLeft <= 0,
        shareUrl: `${origin}/share/event/${row.id}`,
        deepLink: `socialapp://event/${row.id}`,
      };
    },

    async getProfilePreview(id: string, origin = defaultBaseUrl): Promise<ProfileSharePreview> {
      const sql = `
        select p.user_id::text as id, p.display_name, p.bio, p.verification_level, p.discoverable,
               coalesce((select array_agg(i.name order by i.name)
                           from user_interests ui
                           join interests i on i.id = ui.interest_id
                          where ui.user_id = p.user_id), '{}') as interests
          from profiles p
          join users u on u.id = p.user_id and u.status = 'active'
         where p.user_id = $1::uuid and p.onboarding_completed = true
      `;
      const res = await q<{
        id: string; display_name: string; bio: string | null;
        verification_level: string; discoverable: boolean; interests: string[];
      }>(sql, [id]);

      const row = res.rows[0];
      if (!row) throw new ShareError("not_found", "Profile not found");
      if (!row.discoverable) throw new ShareError("private", "This user has disabled public discovery");

      return {
        id: row.id,
        displayName: row.display_name,
        bio: row.bio,
        interests: row.interests || [],
        verificationLevel: row.verification_level || "unverified",
        shareUrl: `${origin}/share/profile/${row.id}`,
        deepLink: `socialapp://profile/${row.id}`,
      };
    },
  };
}
