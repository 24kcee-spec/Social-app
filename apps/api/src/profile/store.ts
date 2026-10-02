import type { SqlRunner } from "../migrate";
import type { ContentVisibility, Interest, InterestStrength, MessagePermission, Profile, ProfileMedia, PromptAnswer, PromptDefinition, SocialStyle } from "@sp/types";
import type { InterestSelectionsRequest, OnboardingInput, ProfileMediaRegistrationInput, ProfileUpdateInput, PromptAnswersRequest } from "@sp/validation";

export class ProfileValidationError extends Error {}
export class ProfileMediaLimitError extends Error {}

const SOCIAL_STYLES = new Set<SocialStyle>(["small_group", "one_to_one", "text_first", "voice_first", "low_pressure"]);
const MESSAGE_PERMISSIONS = new Set<MessagePermission>(["everyone", "connections", "nobody"]);
const CONTENT_VISIBILITIES = new Set<ContentVisibility>(["public", "connections", "private"]);

const text = (value: unknown): string => String(value);

function mapPrivacy(row: Record<string, unknown>) {
  return {
    discoverable: Boolean(row.discoverable),
    messagePermission: row.message_permission as MessagePermission,
    storyVisibility: row.story_visibility as ContentVisibility,
    activityVisibility: row.activity_visibility as ContentVisibility,
  };
}

function mapMedia(row: Record<string, unknown>): ProfileMedia {
  return {
    id: text(row.id), kind: row.kind as ProfileMedia["kind"], storagePath: text(row.storage_path), thumbnailPath: text(row.thumbnail_path),
    contentType: text(row.content_type), sizeBytes: Number(row.size_bytes), width: Number(row.width), height: Number(row.height),
    sortOrder: Number(row.sort_order), createdAt: new Date(row.created_at as string | Date).toISOString(),
  };
}

export function createProfileStore(db: SqlRunner) {
  async function ensureProfile(userId: string) {
    await db.query(`insert into profiles (user_id) values ($1) on conflict (user_id) do nothing`, [userId]);
  }

  async function fetchProfile(userId: string): Promise<Profile> {
    await ensureProfile(userId);
    const p = await db.query<Record<string, unknown>>(`select user_id, display_name, bio, social_styles, discoverable, message_permission::text, story_visibility::text, activity_visibility::text, onboarding_completed, created_at, updated_at from profiles where user_id=$1`, [userId]);
    const row = p.rows[0]!;
    const i = await db.query<Record<string, unknown>>(`select i.id, i.name, i.category, i.slug, i.sort_order, ui.strength from user_interests ui join interests i on i.id=ui.interest_id where ui.user_id=$1 and i.active=true order by i.category,i.sort_order,i.name`, [userId]);
    const prompts = await db.query<Record<string, unknown>>(`select a.prompt_id, c.prompt, c.category, a.answer, a.updated_at from prompt_answers a join prompt_catalog c on c.id=a.prompt_id where a.user_id=$1 and c.active=true order by c.sort_order,c.id`, [userId]);
    const media = await db.query<Record<string, unknown>>(`select id, kind::text, storage_path, thumbnail_path, content_type, size_bytes, width, height, sort_order, created_at from profile_media where user_id=$1 order by sort_order,created_at`, [userId]);
    return {
      userId: text(row.user_id), displayName: text(row.display_name), bio: text(row.bio),
      socialStyles: (row.social_styles as SocialStyle[]) ?? ["low_pressure"], privacy: mapPrivacy(row),
      onboardingCompleted: Boolean(row.onboarding_completed), createdAt: new Date(row.created_at as string | Date).toISOString(), updatedAt: new Date(row.updated_at as string | Date).toISOString(),
      interests: i.rows.map((r) => ({ id: text(r.id), name: text(r.name), category: text(r.category), slug: text(r.slug), sortOrder: Number(r.sort_order), strength: Number(r.strength) as InterestStrength })),
      prompts: prompts.rows.map((r) => ({ promptId: text(r.prompt_id), prompt: text(r.prompt), category: text(r.category), answer: text(r.answer), updatedAt: new Date(r.updated_at as string | Date).toISOString() })),
      media: media.rows.map(mapMedia),
    };
  }

  function assertBusinessValues(input: ProfileUpdateInput) {
    if (input.socialStyles && (input.socialStyles.length === 0 || input.socialStyles.some((x) => !SOCIAL_STYLES.has(x)))) throw new ProfileValidationError("Choose at least one valid social style");
    if (input.privacy && (!MESSAGE_PERMISSIONS.has(input.privacy.messagePermission) || !CONTENT_VISIBILITIES.has(input.privacy.storyVisibility) || !CONTENT_VISIBILITIES.has(input.privacy.activityVisibility))) throw new ProfileValidationError("Invalid privacy settings");
  }

  async function knownInterests(input: InterestSelectionsRequest) {
    const ids = input.interests.map((x) => x.interestId);
    if (!ids.length) return;
    const found = await db.query<{ id: string }>(`select id from interests where active=true and id=any($1::uuid[])`, [ids]);
    const set = new Set(found.rows.map((r) => r.id));
    if (ids.find((id) => !set.has(id))) throw new ProfileValidationError("One or more selected interests are unavailable");
  }

  async function knownPrompts(input: PromptAnswersRequest) {
    const ids = input.answers.map((x) => x.promptId);
    if (!ids.length) return;
    const found = await db.query<{ id: string }>(`select id from prompt_catalog where active=true and id=any($1::text[])`, [ids]);
    const set = new Set(found.rows.map((r) => r.id));
    if (ids.find((id) => !set.has(id))) throw new ProfileValidationError("One or more selected prompts are unavailable");
  }

  async function replaceInterests(userId: string, input: InterestSelectionsRequest) {
    await knownInterests(input);
    const ids = input.interests.map((x) => x.interestId);
    const strengths = input.interests.map((x) => x.strength);
    await db.query(`with deleted as (delete from user_interests where user_id=$1) insert into user_interests (user_id,interest_id,strength) select $1, x.id, x.strength from unnest($2::uuid[],$3::smallint[]) as x(id,strength)`, [userId, ids, strengths]);
  }

  async function replacePrompts(userId: string, input: PromptAnswersRequest) {
    await knownPrompts(input);
    const ids = input.answers.map((x) => x.promptId);
    const answers = input.answers.map((x) => x.answer);
    await db.query(`with deleted as (delete from prompt_answers where user_id=$1) insert into prompt_answers (user_id,prompt_id,answer) select $1,x.prompt_id,x.answer from unnest($2::text[],$3::text[]) as x(prompt_id,answer)`, [userId, ids, answers]);
  }

  return {
    getProfile: fetchProfile,

    async updateProfile(userId: string, input: ProfileUpdateInput): Promise<Profile> {
      assertBusinessValues(input);
      await ensureProfile(userId);
      const current = await db.query<Record<string, unknown>>(`select display_name,bio,social_styles,discoverable,message_permission::text,story_visibility::text,activity_visibility::text from profiles where user_id=$1`, [userId]);
      const row = current.rows[0]!;
      const privacy = input.privacy ?? mapPrivacy(row);
      await db.query(`update profiles set display_name=$2,bio=$3,social_styles=$4,discoverable=$5,message_permission=$6,story_visibility=$7,activity_visibility=$8,updated_at=now() where user_id=$1`, [userId, input.displayName ?? text(row.display_name), input.bio ?? text(row.bio), input.socialStyles ?? row.social_styles, privacy.discoverable, privacy.messagePermission, privacy.storyVisibility, privacy.activityVisibility]);
      return fetchProfile(userId);
    },

    async updateInterests(userId: string, input: InterestSelectionsRequest): Promise<Profile> { await ensureProfile(userId); await replaceInterests(userId, input); await db.query(`update profiles set updated_at=now() where user_id=$1`, [userId]); return fetchProfile(userId); },
    async updatePrompts(userId: string, input: PromptAnswersRequest): Promise<Profile> { await ensureProfile(userId); await replacePrompts(userId, input); await db.query(`update profiles set updated_at=now() where user_id=$1`, [userId]); return fetchProfile(userId); },

    async completeOnboarding(userId: string, input: OnboardingInput): Promise<Profile> {
      await knownInterests({ interests: input.interests });
      await knownPrompts({ answers: input.answers });
      const ids = input.interests.map((x) => x.interestId);
      const strengths = input.interests.map((x) => x.strength);
      const promptIds = input.answers.map((x) => x.promptId);
      const answers = input.answers.map((x) => x.answer);
      await db.query(
        `with upsert_profile as (
           insert into profiles (user_id,display_name,bio,social_styles,discoverable,message_permission,story_visibility,activity_visibility,onboarding_completed,updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,true,now())
           on conflict (user_id) do update set display_name=excluded.display_name,bio=excluded.bio,social_styles=excluded.social_styles,discoverable=excluded.discoverable,message_permission=excluded.message_permission,story_visibility=excluded.story_visibility,activity_visibility=excluded.activity_visibility,onboarding_completed=true,updated_at=now()
           returning user_id
         ),
         deleted_i as (delete from user_interests where user_id=$1),
         inserted_i as (insert into user_interests (user_id,interest_id,strength) select $1,x.id,x.strength from unnest($9::uuid[],$10::smallint[]) as x(id,strength)),
         deleted_p as (delete from prompt_answers where user_id=$1),
         inserted_p as (insert into prompt_answers (user_id,prompt_id,answer) select $1,x.prompt_id,x.answer from unnest($11::text[],$12::text[]) as x(prompt_id,answer))
         select 1 as ok from upsert_profile`,
        [userId,input.displayName,input.bio,input.socialStyles,input.privacy.discoverable,input.privacy.messagePermission,input.privacy.storyVisibility,input.privacy.activityVisibility,ids,strengths,promptIds,answers],
      );
      return fetchProfile(userId);
    },

    async listInterests(): Promise<Interest[]> { const { rows } = await db.query<Record<string, unknown>>(`select id,name,category,slug,sort_order from interests where active=true order by category,sort_order,name`); return rows.map((r) => ({ id:text(r.id),name:text(r.name),category:text(r.category),slug:text(r.slug),sortOrder:Number(r.sort_order) })); },
    async listPrompts(): Promise<PromptDefinition[]> { const { rows } = await db.query<Record<string, unknown>>(`select id,prompt,category,sort_order,active from prompt_catalog where active=true order by sort_order,id`); return rows.map((r) => ({ id:text(r.id),prompt:text(r.prompt),category:text(r.category),sortOrder:Number(r.sort_order),active:Boolean(r.active) })); },

    async addMedia(userId: string, input: ProfileMediaRegistrationInput): Promise<ProfileMedia> {
      if (!input.storagePath.startsWith(`${userId}/`) || !input.thumbnailPath.startsWith(`${userId}/`) || input.storagePath.includes("..") || input.thumbnailPath.includes("..")) throw new ProfileValidationError("Media paths must belong to the signed-in user");
      const existing = await db.query<{ count: string }>(`select count(*)::text as count from profile_media where user_id=$1`, [userId]);
      if (Number(existing.rows[0]?.count ?? 0) >= 6) throw new ProfileMediaLimitError("You can keep up to 6 profile images");
      const dup = await db.query(`select id from profile_media where user_id=$1 and (storage_path=$2 or thumbnail_path=$3 or storage_path=$3 or thumbnail_path=$2)`, [userId,input.storagePath,input.thumbnailPath]);
      if (dup.rows.length) throw new ProfileValidationError("That media item is already registered");
      const { rows } = await db.query<Record<string, unknown>>(`insert into profile_media (user_id,kind,storage_path,thumbnail_path,content_type,size_bytes,width,height,sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,kind::text,storage_path,thumbnail_path,content_type,size_bytes,width,height,sort_order,created_at`, [userId,input.kind,input.storagePath,input.thumbnailPath,input.contentType,input.sizeBytes,input.width,input.height,input.sortOrder]);
      return mapMedia(rows[0]!);
    },
    async deleteMedia(userId: string, mediaId: string): Promise<boolean> { const { rows } = await db.query(`delete from profile_media where id=$1 and user_id=$2 returning id`, [mediaId,userId]); return rows.length>0; },
  };
}
export type ProfileStore = ReturnType<typeof createProfileStore>;
