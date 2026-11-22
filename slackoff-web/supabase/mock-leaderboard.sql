-- Mock leaderboard data: 8 fake users, each with activities completed THIS week, so weekly_leaderboard has
-- people to rank you against. Run in the Supabase SQL Editor (after schema.sql + migration-002-app-sync.sql).
--
-- Safe to re-run: it deletes the previous mock users first (the cascade removes their profiles/activities).
-- To remove all mock data, run only the DELETE below.
-- Mock users have no password, so nobody can sign in as them. Points are random, so each run reshuffles the ranking.

delete from auth.users where email like '%@mock.slackoff.test';

create temp table mock_users (id uuid, username text, avatar text, activities int);
insert into mock_users values
  ('00000000-0000-4000-8000-000000000001', 'Bea Bouncer', 'sunny', 18),
  ('00000000-0000-4000-8000-000000000002', 'Rocky Roll',  'minty', 14),
  ('00000000-0000-4000-8000-000000000003', 'Pip Squat',   'bluey', 11),
  ('00000000-0000-4000-8000-000000000004', 'Mo Mentum',   'grape',  9),
  ('00000000-0000-4000-8000-000000000005', 'Zig Zag',     'sunny',  7),
  ('00000000-0000-4000-8000-000000000006', 'Lola Lunge',  'pinky',  5),
  ('00000000-0000-4000-8000-000000000007', 'Hop Along',   'minty',  3),
  ('00000000-0000-4000-8000-000000000008', 'Dee Stretch', 'bluey',  1);

-- Auth users. The on_auth_user_created trigger creates each one's profile (username/avatar from the metadata)
-- and default settings. Empty token strings keep the dashboard's Users list happy.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', m.id, 'authenticated', 'authenticated',
  'mock' || right(m.id::text, 1) || '@mock.slackoff.test', '', now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('username', m.username, 'avatar', m.avatar),
  now(), now(), '', '', '', ''
from mock_users m;

-- Activities at random times between Monday 00:00 (UTC) and now, each a random real exercise at its real point value.
insert into completed_activities (user_id, exercise_id, source, points, seconds, completed_at)
select
  m.id, e.id,
  case when random() < 0.7 then 'break' else 'wipeout' end,
  e.points,
  20 + floor(random() * 40)::int,
  date_trunc('week', now()) + random() * (now() - date_trunc('week', now()))
from mock_users m
cross join lateral generate_series(1, m.activities) as g(n)
cross join lateral (select id, points from exercises where g.n > 0 order by random() limit 1) e;   -- g.n forces a fresh pick per row

-- Matching breaks, so their stats look plausible too.
insert into breaks (user_id, taken_at)
select m.id, date_trunc('week', now()) + random() * (now() - date_trunc('week', now()))
from mock_users m cross join lateral generate_series(1, greatest(1, m.activities / 3));

drop table mock_users;

-- What the app will show:
select * from weekly_leaderboard;
