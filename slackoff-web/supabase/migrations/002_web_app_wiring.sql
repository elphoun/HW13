-- Wires the web app to Supabase (applied 2026-11-22).

-- The app has an "activity + stretch" break type.
alter table public.user_settings drop constraint if exists user_settings_break_type_check;
alter table public.user_settings add constraint user_settings_break_type_check
  check (break_type in ('activity', 'stretch', 'both'));

-- Weekly leaderboard. RLS only lets a user read their own rows, so this runs as the owner and
-- returns just names, avatars and point totals. `week_start` is the caller's local Monday 00:00,
-- so the week boundary follows the user's timezone, not the server's. A user's own "Reset week"
-- (profiles.leaderboard_reset_at) only counts points earned after the reset.
-- Users with no points this week are left out, except the caller.
create or replace function public.leaderboard(week_start timestamptz)
returns table (id uuid, username text, avatar text, points bigint)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.username, p.avatar, coalesce(sum(a.points), 0)::bigint as points
  from public.profiles p
  left join public.completed_activities a
    on a.user_id = p.id
   and a.completed_at >= greatest(week_start, coalesce(p.leaderboard_reset_at, week_start))
   and a.completed_at < week_start + interval '7 days'
  group by p.id
  having coalesce(sum(a.points), 0) > 0 or p.id = (select auth.uid())
  order by points desc, p.created_at;
$$;
revoke execute on function public.leaderboard(timestamptz) from public, anon;
grant execute on function public.leaderboard(timestamptz) to authenticated;
