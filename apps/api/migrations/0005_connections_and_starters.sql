-- Phase 4: low-pressure interaction.
-- connection_requests carry a STRUCTURED intro (icebreaker / question card / this-or-that / short custom note),
-- so a shy person can say hello without inventing the conversation. Messaging itself is Phase 5.
-- All tables are API-owned: RLS enabled, no client policies.

create type connection_request_status as enum ('pending', 'accepted', 'declined', 'expired', 'withdrawn');
create type intro_kind as enum ('icebreaker', 'question', 'this_or_that', 'custom');

create table question_cards (
  id         text primary key,
  question   text not null,
  category   text not null,
  sort_order integer not null default 0,
  active     boolean not null default true
);

create table this_or_that_catalog (
  id         text primary key,
  option_a   text not null,
  option_b   text not null,
  sort_order integer not null default 0,
  active     boolean not null default true
);

-- Low-pressure mode: the person only receives structured intros (no free text) and unanswered requests expire quietly.
create table interaction_settings (
  user_id           uuid primary key references users (id) on delete cascade,
  low_pressure_mode boolean not null default false,
  updated_at        timestamptz not null default now()
);

create table connection_requests (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references users (id) on delete cascade,
  recipient_id uuid not null references users (id) on delete cascade,
  status       connection_request_status not null default 'pending',
  intro_kind   intro_kind not null,
  intro_ref    text,
  intro_choice text,
  intro_text   text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  responded_at timestamptz,
  constraint connection_requests_not_self check (sender_id <> recipient_id),
  constraint connection_requests_text_length check (char_length(trim(intro_text)) between 2 and 300),
  constraint connection_requests_choice check (intro_choice is null or intro_choice in ('a', 'b')),
  constraint connection_requests_game_choice check ((intro_kind = 'this_or_that') = (intro_choice is not null)),
  constraint connection_requests_custom_ref check ((intro_kind = 'custom') = (intro_ref is null))
);

-- At most one pending request between two people, in either direction.
create unique index connection_requests_one_pending_idx
  on connection_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';
create index connection_requests_inbox_idx on connection_requests (recipient_id, status, created_at desc);
create index connection_requests_outbox_idx on connection_requests (sender_id, created_at desc);

create table connections (
  user_a     uuid not null references users (id) on delete cascade,
  user_b     uuid not null references users (id) on delete cascade,
  request_id uuid references connection_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint connections_ordered check (user_a < user_b)
);
create index connections_user_b_idx on connections (user_b, user_a);

-- First-time milestones, used to measure activation (new member reaches a first real interaction within 48h).
create table activation_milestones (
  user_id    uuid not null references users (id) on delete cascade,
  milestone  text not null,
  reached_at timestamptz not null default now(),
  primary key (user_id, milestone),
  constraint activation_milestones_known check (milestone in ('first_request_sent', 'first_connection'))
);

insert into question_cards (id, question, category, sort_order) values
('q_energy','What is something that always gives you energy?','Personality',10),
('q_weekend','What was the best part of your last weekend?','Lifestyle',20),
('q_learn','What is one thing you would love to get better at this year?','Growth',30),
('q_song','What song have you had on repeat lately?','Music',40),
('q_place','Where is one place you would take a friend visiting your city?','Places',50),
('q_comfort','What is your go-to comfort meal?','Food',60),
('q_show','What are you watching or reading right now?','Entertainment',70),
('q_skill','What is a skill you picked up that surprised you?','Growth',80),
('q_morning','Are you a morning person or a night owl, and what do you do with that time?','Lifestyle',90),
('q_trip','What was the best trip or outing you have been on?','Adventure',100),
('q_proud','What is a small win you are proud of this month?','Growth',110),
('q_hobby','What is a hobby you could talk about for hours?','Interests',120),
('q_group','What kind of group hangout do you enjoy most?','Social',130),
('q_advice','What is the best advice you have ever been given?','Personality',140),
('q_try','What is something you want to try but have not yet?','Adventure',150),
('q_laugh','What is the last thing that made you properly laugh?','Personality',160)
on conflict (id) do nothing;

insert into this_or_that_catalog (id, option_a, option_b, sort_order) values
('t_coffee_tea','Coffee','Tea',10),
('t_morning_night','Early mornings','Late nights',20),
('t_movie_series','A movie','A series',30),
('t_beach_mountain','Beach','Mountains',40),
('t_call_text','A phone call','A text chat',50),
('t_plan_wing','A solid plan','Going with the flow',60),
('t_cook_eat_out','Cooking at home','Eating out',70),
('t_book_podcast','A book','A podcast',80),
('t_small_big','A small group','A big crowd',90),
('t_city_quiet','City buzz','Quiet countryside',100),
('t_sport_watch_play','Playing sport','Watching sport',110),
('t_sweet_savoury','Sweet','Savoury',120),
('t_music_silence','Music on','Peace and quiet',130),
('t_old_new','Old favourites','New discoveries',140)
on conflict (id) do nothing;

alter table question_cards enable row level security;
alter table this_or_that_catalog enable row level security;
alter table interaction_settings enable row level security;
alter table connection_requests enable row level security;
alter table connections enable row level security;
alter table activation_milestones enable row level security;
