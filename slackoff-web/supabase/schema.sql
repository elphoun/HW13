-- SlackOff schema for Supabase. The web app reads/writes it through app/src/lib/storage.ts.
-- Setup: run this file, then migration-002-app-sync.sql (adds the tables/columns the app also needs).
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
-- security_invoker: the view obeys the caller's RLS, so each user only sees their own stats.
create view weekly_stats with (security_invoker = true) as
  select user_id, date_trunc('week', completed_at) as week, count(*) as activities, sum(points) as points, sum(seconds) as seconds
  from completed_activities group by 1, 2;

-- Deliberately NOT security_invoker: it runs as the view owner so it can rank every user, but it only
-- exposes public fields (id, username, avatar, points). Reads completed_activities directly rather than
-- weekly_stats so it doesn't depend on that view's invoker semantics.
create view weekly_leaderboard as
  select p.id, p.username, p.avatar, coalesce(sum(c.points), 0)::int as points
  from profiles p
  left join completed_activities c
    on c.user_id = p.id and c.completed_at >= date_trunc('week', now())
  group by p.id, p.username, p.avatar
  order by points desc;

revoke all on weekly_leaderboard from anon;
grant select on weekly_leaderboard to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Row Level Security: the publishable key is public, so every table must be locked down.
-- ---------------------------------------------------------------------------------------------------
alter table profiles             enable row level security;
alter table user_settings        enable row level security;
alter table exercises            enable row level security;
alter table timer_sessions       enable row level security;
alter table completed_activities enable row level security;

-- profiles: rows are created by the signup trigger below; users can read and edit only their own.
create policy "profiles: read own"   on profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_settings: also created by the trigger; read/update own.
create policy "settings: read own"   on user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "settings: insert own" on user_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "settings: update own" on user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- exercises: public, read-only catalog (writes only via the SQL editor / service role).
create policy "exercises: read all" on exercises for select to anon, authenticated using (true);

-- timer_sessions: read/insert/update own.
create policy "sessions: read own"   on timer_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "sessions: insert own" on timer_sessions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "sessions: update own" on timer_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- completed_activities: read/insert own. No update/delete, so a user can't rewrite their history.
create policy "activities: read own"   on completed_activities for select to authenticated using (user_id = (select auth.uid()));
create policy "activities: insert own" on completed_activities for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------
-- Signup trigger: every new auth user gets a profile + default settings row.
-- Username comes from sign-up metadata (supabase.auth.signUp({ options: { data: { username } } }))
-- and falls back to user_<first 8 chars of id>.
-- ---------------------------------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, avatar)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), 'user_' || left(new.id::text, 8)),
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar', ''), 'pinky')
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------------
-- Seed exercises from app/src/data/exercises.ts (points = LEVELS[level].points: 10 / 20 / 30).
-- ---------------------------------------------------------------------------------------------------
insert into exercises (id, name, level, points) values
  ('neck-tilts',           'Neck Tilts',           1, 10),
  ('neck-circles',         'Neck Circles',         1, 10),
  ('seated-toe-touches',   'Seated Toe Touches',   1, 10),
  ('body-rotations',       'Body Rotations',       1, 10),
  ('squats',               'Squats',               2, 20),
  ('standing-toe-touches', 'Standing Toe Touches', 2, 20),
  ('high-knees',           'High Knees',           2, 20),
  ('pick-the-flowers',     'Pick the Flowers',     2, 20),
  ('jumping-jacks',        'Jumping Jacks',        3, 30),
  ('single-leg-hops',      'Single-Leg Hops',      3, 30),
  ('high-knees-fast',      'High Knees (Fast)',    3, 30),
  ('squat-challenge',      'Squat Challenge',      3, 30)
on conflict (id) do update set name = excluded.name, level = excluded.level, points = excluded.points;
