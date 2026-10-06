import type { SqlRunner } from "../migrate";

export class CommunityError extends Error {
  constructor(public readonly code: "not_found" | "forbidden" | "full" | "invalid", message: string) { super(message); }
}
const text=(v:unknown)=>String(v);
const iso=(v:unknown)=>new Date(v as string|Date).toISOString();

export function createCommunityStore(db: SqlRunner, clock=()=>new Date()) {
  async function role(userId:string, groupId:string) {
    const r=await db.query<{role:string}>("select role from group_members where group_id=$1 and user_id=$2",[groupId,userId]);
    return r.rows[0]?.role ?? null;
  }
  return {
    async listGroups(userId:string) {
      const r=await db.query<Record<string,unknown>>("select g.id::text,g.name,g.description,g.general_area,g.capacity,g.owner_id::text,(select count(*) from group_members gm where gm.group_id=g.id)::int as member_count,exists(select 1 from group_members gm where gm.group_id=g.id and gm.user_id=$1) as joined from groups g join users u on u.id=g.owner_id and u.status='active' order by g.created_at desc limit 100",[userId]);
      return r.rows.map(x=>({id:text(x.id),name:text(x.name),description:text(x.description),generalArea:text(x.general_area),capacity:Number(x.capacity),memberCount:Number(x.member_count),joined:x.joined===true}));
    },
    async getGroup(userId:string,id:string) {
      const r=await db.query<Record<string,unknown>>("select g.id::text,g.name,g.description,g.general_area,g.capacity,g.owner_id::text,(select count(*) from group_members gm where gm.group_id=g.id)::int as member_count,exists(select 1 from group_members gm where gm.group_id=g.id and gm.user_id=$1) as joined from groups g where g.id=$2",[userId,id]);
      if(!r.rows[0]) throw new CommunityError("not_found","Group not found");
      const x=r.rows[0]; return {id:text(x.id),name:text(x.name),description:text(x.description),generalArea:text(x.general_area),capacity:Number(x.capacity),ownerId:text(x.owner_id),memberCount:Number(x.member_count),joined:x.joined===true};
    },
    async createGroup(userId:string,input:{name:string;description:string;generalArea:string;capacity:number;activityIds:string[]}) {
      const r=await db.query<{id:string}>("insert into groups(name,description,general_area,owner_id,capacity) values($1,$2,$3,$4,$5) returning id::text",[input.name.trim(),input.description.trim(),input.generalArea.trim(),userId,input.capacity]);
      const id=r.rows[0]!.id;
      await db.query("insert into group_members(group_id,user_id,role) values($1,$2,'owner')",[id,userId]);
      for(const a of input.activityIds) await db.query("insert into group_activities(group_id,activity_id) select $1,id from activities where id=$2 and active",[id,a]);
      return this.getGroup(userId,id);
    },
    async joinGroup(userId:string,id:string) {
      const g=await this.getGroup(userId,id); if(g.joined)return;
      if(g.memberCount>=g.capacity)throw new CommunityError("full","This group is full");
      await db.query("insert into group_members(group_id,user_id,role) values($1,$2,'member') on conflict do nothing",[id,userId]);
    },
    async leaveGroup(userId:string,id:string) {
      const r=await role(userId,id); if(!r)throw new CommunityError("not_found","Group not found");
      if(r==="owner")throw new CommunityError("forbidden","The group owner cannot leave the group");
      await db.query("delete from group_members where group_id=$1 and user_id=$2",[id,userId]);
    },
    async listActivities() {
      const r=await db.query<Record<string,unknown>>("select id::text,name,description from activities where active order by name");
      return r.rows.map(x=>({id:text(x.id),name:text(x.name),description:text(x.description)}));
    },
    async createEvent(userId:string,input:{groupId:string;title:string;description:string;generalArea:string;startsAt:string;endsAt:string;capacity:number}) {
      const r=await role(userId,input.groupId); if(!r)throw new CommunityError("forbidden","Join the group before creating an event");
      if(r!=="owner"&&r!=="moderator")throw new CommunityError("forbidden","Only group moderators can create events");
      const start=new Date(input.startsAt),end=new Date(input.endsAt); if(!(end>start))throw new CommunityError("invalid","Event end must be after its start");
      const q=await db.query<{id:string}>("insert into events(group_id,host_id,title,description,general_area,starts_at,ends_at,capacity) values($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8) returning id::text",[input.groupId,userId,input.title.trim(),input.description.trim(),input.generalArea.trim(),start.toISOString(),end.toISOString(),input.capacity]);
      return this.getEvent(userId,q.rows[0]!.id);
    },
    async listEvents(userId:string,area?:string) {
      const r=await db.query<Record<string,unknown>>("select e.id::text,e.group_id::text,e.title,e.description,e.general_area,e.starts_at,e.ends_at,e.capacity,(select count(*) from event_rsvps x where x.event_id=e.id and x.status='going')::int as going,exists(select 1 from event_rsvps x where x.event_id=e.id and x.user_id=$1 and x.status in ('going','waitlisted')) as attending from events e join users u on u.id=e.host_id and u.status='active' where e.starts_at>=now() and ($2::text is null or e.general_area=$2) order by e.starts_at limit 100",[userId,area??null]);
      return r.rows.map(x=>({id:text(x.id),groupId:text(x.group_id),title:text(x.title),description:text(x.description),generalArea:text(x.general_area),startsAt:iso(x.starts_at),endsAt:iso(x.ends_at),capacity:Number(x.capacity),going:Number(x.going),attending:x.attending===true}));
    },
    async getEvent(userId:string,id:string) {
      const r=await db.query<Record<string,unknown>>("select e.id::text,e.group_id::text,e.title,e.description,e.general_area,e.starts_at,e.ends_at,e.capacity,(select count(*) from event_rsvps x where x.event_id=e.id and x.status='going')::int as going,exists(select 1 from event_rsvps x where x.event_id=e.id and x.user_id=$1 and x.status in ('going','waitlisted')) as attending from events e where e.id=$2",[userId,id]);
      if(!r.rows[0])throw new CommunityError("not_found","Event not found");
      const x=r.rows[0]; return {id:text(x.id),groupId:text(x.group_id),title:text(x.title),description:text(x.description),generalArea:text(x.general_area),startsAt:iso(x.starts_at),endsAt:iso(x.ends_at),capacity:Number(x.capacity),going:Number(x.going),attending:x.attending===true};
    },
    async rsvp(userId:string,id:string) {
      const e=await this.getEvent(userId,id); const status=e.going<e.capacity?"going":"waitlisted";
      await db.query("insert into event_rsvps(event_id,user_id,status,updated_at) values($1,$2,$3,$4) on conflict(event_id,user_id) do update set status=excluded.status,updated_at=excluded.updated_at",[id,userId,status,clock().toISOString()]);
      return {status};
    },
    async cancelRsvp(userId:string,id:string) { await db.query("update event_rsvps set status='cancelled',updated_at=$3 where event_id=$1 and user_id=$2",[id,userId,clock().toISOString()]); }
  };
}
export type CommunityStore=ReturnType<typeof createCommunityStore>;
