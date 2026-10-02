-- Phase 2: profile + onboarding data model. Storage objects themselves live outside the database;
-- see docs/supabase-profile-media.sql for the private Supabase Storage bucket and RLS policies.

create type profile_message_permission as enum ('everyone', 'connections', 'nobody');
create type profile_content_visibility as enum ('public', 'connections', 'private');
create type profile_media_kind as enum ('avatar');

create table profiles (
  user_id              uuid primary key references users (id) on delete cascade,
  display_name         text not null default 'New member',
  bio                  text not null default '',
  social_styles        text[] not null default array['low_pressure']::text[],
  discoverable         boolean not null default true,
  message_permission   profile_message_permission not null default 'everyone',
  story_visibility     profile_content_visibility not null default 'connections',
  activity_visibility  profile_content_visibility not null default 'public',
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(trim(display_name)) between 2 and 50),
  constraint profiles_bio_length check (char_length(bio) <= 280),
  constraint profiles_social_styles_allowed check (
    social_styles <@ array['small_group','one_to_one','text_first','voice_first','low_pressure']::text[]
    and cardinality(social_styles) <= 5
    and cardinality(social_styles) >= 1
  )
);

create index profiles_discoverable_idx on profiles (discoverable) where discoverable = true;

create table interests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null,
  slug        text not null unique,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index interests_category_sort_idx on interests (category, sort_order, name);

create table user_interests (
  user_id     uuid not null references users (id) on delete cascade,
  interest_id uuid not null references interests (id) on delete cascade,
  strength    smallint not null default 2 check (strength between 1 and 3),
  updated_at  timestamptz not null default now(),
  primary key (user_id, interest_id)
);

create index user_interests_interest_idx on user_interests (interest_id, user_id);

create table prompt_catalog (
  id          text primary key,
  prompt      text not null,
  category    text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table prompt_answers (
  user_id    uuid not null references users (id) on delete cascade,
  prompt_id  text not null references prompt_catalog (id),
  answer     text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, prompt_id),
  constraint prompt_answers_length check (char_length(trim(answer)) between 2 and 240)
);

create index prompt_answers_prompt_idx on prompt_answers (prompt_id, user_id);

create table profile_media (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users (id) on delete cascade,
  kind             profile_media_kind not null default 'avatar',
  storage_path     text not null unique,
  thumbnail_path   text not null unique,
  content_type     text not null,
  size_bytes       integer not null,
  width            integer not null,
  height           integer not null,
  sort_order       smallint not null default 0,
  created_at       timestamptz not null default now(),
  constraint profile_media_content_type check (content_type in ('image/jpeg','image/png','image/webp')),
  constraint profile_media_size check (size_bytes between 1 and 5242880),
  constraint profile_media_dimensions check (width between 1 and 8000 and height between 1 and 8000),
  constraint profile_media_sort_order check (sort_order between 0 and 5),
  constraint profile_media_thumbnail_distinct check (storage_path <> thumbnail_path)
);

create index profile_media_user_sort_idx on profile_media (user_id, sort_order, created_at);
create unique index profile_media_user_slot_idx on profile_media (user_id, sort_order);

-- Existing accounts get a profile shell so the API can return a stable profile object immediately.
insert into profiles (user_id)
select id from users
on conflict (user_id) do nothing;

insert into interests (name, category, slug, sort_order) values
('Football','Sports','football',10),
('Basketball','Sports','basketball',20),
('Running','Sports','running',30),
('Gym','Sports','gym',40),
('Tennis','Sports','tennis',50),
('Gaming','Gaming','gaming',10),
('FIFA / EA FC','Gaming','fifa-ea-fc',20),
('Call of Duty','Gaming','call-of-duty',30),
('Minecraft','Gaming','minecraft',40),
('Mobile Gaming','Gaming','mobile-gaming',50),
('Afrobeats','Music','afrobeats',10),
('Amapiano','Music','amapiano',20),
('Hip Hop','Music','hip-hop',30),
('R&B','Music','r-and-b',40),
('Gospel','Music','gospel',50),
('Anime','Anime','anime',10),
('Manga','Anime','manga',20),
('Cosplay','Anime','cosplay',30),
('Study Groups','Study','study-groups',10),
('Accounting','Study','accounting',20),
('Finance','Study','finance',30),
('Languages','Study','languages',40),
('Technology','Tech','technology',10),
('Programming','Tech','programming',20),
('Artificial Intelligence','Tech','artificial-intelligence',30),
('Cybersecurity','Tech','cybersecurity',40),
('Photography','Creative','photography',10),
('Drawing','Creative','drawing',20),
('Design','Creative','design',30),
('Writing','Creative','writing',40),
('Cooking','Food','cooking',10),
('Baking','Food','baking',20),
('Trying Restaurants','Food','trying-restaurants',30),
('Travel','Travel','travel',10),
('Road Trips','Travel','road-trips',20),
('Nature','Travel','nature',30),
('Movies','Entertainment','movies',10),
('Series','Entertainment','series',20),
('Documentaries','Entertainment','documentaries',30),
('Books','Learning','books',10),
('Business','Learning','business',20),
('Investing','Learning','investing',30),
('Entrepreneurship','Learning','entrepreneurship',40),
('Cars','Lifestyle','cars',10),
('Fashion','Lifestyle','fashion',20),
('Fitness','Lifestyle','fitness',30),
('Volunteering','Community','volunteering',10),
('Church / Faith Communities','Community','faith-communities',20),
('Student Life','Community','student-life',30),
('Debate','Community','debate',40)
on conflict (slug) do nothing;

insert into prompt_catalog (id, prompt, category, sort_order) values
('weekend','My ideal weekend looks like...','Lifestyle',10),
('talk_about','I can talk about this for hours...','Interests',20),
('learning','Something I want to learn next...','Growth',30),
('try_someday','Something I want to try someday...','Adventure',40),
('makes_me_laugh','Something that always makes me laugh...','Personality',50),
('small_win','A small win I am proud of...','Growth',60),
('music','A song or artist I never get tired of...','Music',70),
('food','My comfort food is...','Food',80),
('team_player','The kind of group I enjoy is...','Social',90),
('random_fact','A random fact about me...','Personality',100)
on conflict (id) do nothing;

alter table profiles enable row level security;
alter table interests enable row level security;
alter table user_interests enable row level security;
alter table prompt_catalog enable row level security;
alter table prompt_answers enable row level security;
alter table profile_media enable row level security;

-- Supabase auth-aware RLS policies and Storage bucket policies live in
-- docs/supabase-phase2-security.sql because the local PGlite test database does not provide Supabase's auth schema.
