-- Run once in the Supabase SQL Editor, after schema.sql.
-- Adds everything the web app persists that schema.sql didn't cover, so localStorage can go away.

-- ---------------------------------------------------------------------------------------------------
-- Columns the app's Settings / leaderboard / timer need
-- ---------------------------------------------------------------------------------------------------
alter table user_settings
  add column story           text    not null default 'wipeout',
  add column break_type      text    not null default 'activity' check (break_type in ('activity', 'stretch')),
  add column airpods         boolean not null default true,
  add column airpods_flip_up boolean not null default false,
  add column timer_state     jsonb;                       -- the running/paused Pomodoro clock, synced across devices

alter table profiles
  add column leaderboard_reset_at timestamptz,
  add column leaderboard_resets   int not null default 0;

-- ---------------------------------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------------------------------
create table breaks (                                     -- breaks with at least one activity completed
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references profiles on delete cascade,
  taken_at timestamptz not null default now()
);
create index on breaks (user_id, taken_at);

create table game_runs (                                  -- one play-through of a story
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references profiles on delete cascade,
  story     text not null,
  score     int  not null,
  completed int  not null,
  total     int  not null,
  played_at timestamptz not null default now()
);
create index on game_runs (user_id, played_at);

create table achievements (
  user_id        uuid not null default auth.uid() references profiles on delete cascade,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index on timer_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------------------------------
-- RLS for the new tables, plus the delete policies "Reset my stats" needs
-- ---------------------------------------------------------------------------------------------------
alter table breaks       enable row level security;
alter table game_runs    enable row level security;
alter table achievements enable row level security;

create policy "breaks: read own"   on breaks for select to authenticated using (user_id = (select auth.uid()));
create policy "breaks: insert own" on breaks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "breaks: delete own" on breaks for delete to authenticated using (user_id = (select auth.uid()));

create policy "runs: read own"   on game_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "runs: insert own" on game_runs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "runs: delete own" on game_runs for delete to authenticated using (user_id = (select auth.uid()));

create policy "achievements: read own"   on achievements for select to authenticated using (user_id = (select auth.uid()));
create policy "achievements: insert own" on achievements for insert to authenticated with check (user_id = (select auth.uid()));
create policy "achievements: delete own" on achievements for delete to authenticated using (user_id = (select auth.uid()));

create policy "activities: delete own" on completed_activities for delete to authenticated using (user_id = (select auth.uid()));
create policy "sessions: delete own"   on timer_sessions       for delete to authenticated using (user_id = (select auth.uid()));

-- Lets the app repair a missing profile row (e.g. a user created before the signup trigger existed).
create policy "profiles: insert own" on profiles for insert to authenticated with check (id = (select auth.uid()));

-- Signed-out visitors shouldn't see usernames on the leaderboard.
revoke select on weekly_leaderboard from anon, public;

-- ---------------------------------------------------------------------------------------------------
-- Signup trigger: don't fail the whole signup when the chosen username is taken; add a suffix instead.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  wanted text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), 'user_' || left(new.id::text, 8));
begin
  begin
    insert into public.profiles (id, username, avatar)
    values (new.id, wanted, coalesce(nullif(new.raw_user_meta_data ->> 'avatar', ''), 'pinky'));
  exception when unique_violation then
    insert into public.profiles (id, username, avatar)
    values (new.id, wanted || '_' || left(new.id::text, 4), coalesce(nullif(new.raw_user_meta_data ->> 'avatar', ''), 'pinky'));
  end;
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;
