-- Original SlackOff schema sketch. The live project has since grown (user_settings.story/break_type/airpods/
-- airpods_flip_up/timer_state, profiles.leaderboard_reset_at/resets, breaks, game_runs, achievements, RLS
-- policies, handle_new_user trigger); see migrations/ for changes made from this repo. The web app talks to it
-- through app/src/lib/storage.ts.
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  avatar text not null default 'pinky',
  created_at timestamptz not null default now()
);

create table user_settings (
  user_id uuid primary key references profiles on delete cascade,
  work_seconds int not null default 1500,
  exercise_seconds int not null default 300,
  intensity smallint not null default 2 check (intensity between 1 and 3),
  disabled_activities text[] not null default '{}',
  preferred_map text not null default 'forest',
  daily_goal smallint not null default 5,
  notifications boolean not null default true,
  sound boolean not null default true,
  auto_cycle boolean not null default true
);

create table exercises (            -- seed from src/data/exercises.ts
  id text primary key,
  name text not null,
  level smallint not null check (level between 1 and 3),
  points smallint not null
);

create table timer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  kind text not null check (kind in ('work', 'exercise')),
  planned_seconds int not null,
  completed boolean not null default false,
  started_at timestamptz not null default now()
);

create table completed_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  exercise_id text not null references exercises,
  source text not null check (source in ('break', 'wipeout')),
  points int not null,
  seconds int not null,
  completed_at timestamptz not null default now()
);
create index on completed_activities (user_id, completed_at desc);

-- Weekly statistics + leaderboard are derived views, so a weekly "reset" is just a new week boundary.
create view weekly_stats as
  select user_id, date_trunc('week', completed_at) as week, count(*) as activities, sum(points) as points, sum(seconds) as seconds
  from completed_activities group by 1, 2;

create view weekly_leaderboard as
  select p.id, p.username, p.avatar, coalesce(w.points, 0) as points
  from profiles p
  left join weekly_stats w on w.user_id = p.id and w.week = date_trunc('week', now())
  order by points desc;
