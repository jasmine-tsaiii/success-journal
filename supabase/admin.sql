-- 成功日記：管理者用的使用統計（只回傳整體數字，不會回傳任何日記內容）
-- 用法：Supabase 後台 → SQL Editor → New query → 貼上整份 → Run。重複執行不會有影響。
-- 執行後，再另外執行一行（把 email 換成你登入成功日記用的 Google 帳號）：
--   insert into public.sj_admins (email) values ('你的 Google 帳號') on conflict do nothing;

-- 1. 管理者名單：沒有任何權限設定，所以只能在 SQL Editor 裡新增，App 讀不到也改不了
create table if not exists public.sj_admins (
  email text primary key check (email = lower(email))
);
alter table public.sj_admins enable row level security;
revoke all on public.sj_admins from anon, authenticated;

-- 2. 統計：名單上的帳號登入後才能呼叫，其他人會收到「沒有權限」
create or replace function public.sj_admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz constant text := 'Asia/Taipei';
  today date := (now() at time zone tz)::date;
  result jsonb;
begin
  if not exists (
    select 1 from public.sj_admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) then
    raise exception '沒有權限' using errcode = '42501';
  end if;

  with docs as (
    select d.user_id, d.kind, d.key, d.data, d.updated_at, d.synced_at
    from public.journal_docs d
    where not d.deleted
  ),
  entries as (
    select
      user_id,
      key::date as day,
      updated_at,
      (select count(*) from jsonb_array_elements(case when jsonb_typeof(data -> 'items') = 'array' then data -> 'items' else '[]' end) t
        where jsonb_typeof(t) = 'string' and btrim(t #>> '{}') <> '') as wins,
      (select count(*) from jsonb_array_elements(case when jsonb_typeof(data -> 'gratitude') = 'array' then data -> 'gratitude' else '[]' end) t
        where jsonb_typeof(t) = 'string' and btrim(t #>> '{}') <> '') as thanks,
      (coalesce(btrim(data #>> '{reflection,a}'), '') <> '') as reflected
    from docs
    where kind = 'entry' and key ~ '^\d{4}-\d{2}-\d{2}$'
  ),
  users as (
    select
      user_id,
      min(synced_at) as first_at,
      max(updated_at) as last_at
    from docs
    group by user_id
  ),
  per_user as (
    select u.user_id, u.first_at, u.last_at, count(e.day) as days
    from users u
    left join entries e on e.user_id = u.user_id
    group by u.user_id, u.first_at, u.last_at
  ),
  weeks as (
    select generate_series(
      date_trunc('week', today - 7 * 11)::date,
      date_trunc('week', today)::date,
      interval '7 days'
    )::date as week
  ),
  days30 as (
    select generate_series(today - 29, today, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from users),
      'active7', (select count(*) from users where last_at > now() - interval '7 days'),
      'active30', (select count(*) from users where last_at > now() - interval '30 days'),
      'new7', (select count(*) from users where first_at > now() - interval '7 days'),
      'new30', (select count(*) from users where first_at > now() - interval '30 days')
    ),
    'writing', jsonb_build_object(
      'entry_days', (select count(*) from entries),
      'wins', (select coalesce(sum(wins), 0) from entries),
      'thanks', (select coalesce(sum(thanks), 0) from entries),
      'reflections', (select count(*) from entries where reflected),
      'boards', (select count(*) from docs where kind = 'board'),
      'today_writers', (select count(distinct user_id) from entries where day = today)
    ),
    'features', jsonb_build_object(
      'thanks', (select count(distinct user_id) from entries where thanks > 0),
      'reflections', (select count(distinct user_id) from entries where reflected),
      'boards', (select count(distinct user_id) from docs where kind = 'board')
    ),
    'depth', jsonb_build_object(
      'd1', (select count(*) from per_user where days = 1),
      'd2_6', (select count(*) from per_user where days between 2 and 6),
      'd7_29', (select count(*) from per_user where days between 7 and 29),
      'd30', (select count(*) from per_user where days >= 30),
      'none', (select count(*) from per_user where days = 0)
    ),
    'weekly', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'week', w.week,
        'new_users', (select count(*) from users u where (u.first_at at time zone tz)::date >= w.week and (u.first_at at time zone tz)::date < w.week + 7),
        'writers', (select count(distinct e.user_id) from entries e where e.day >= w.week and e.day < w.week + 7),
        'entry_days', (select count(*) from entries e where e.day >= w.week and e.day < w.week + 7)
      ) order by w.week), '[]')
      from weeks w
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d.day,
        'writers', (select count(distinct e.user_id) from entries e where e.day = d.day),
        'wins', (select coalesce(sum(e.wins), 0) from entries e where e.day = d.day)
      ) order by d.day), '[]')
      from days30 d
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.sj_admin_stats() from public, anon;
grant execute on function public.sj_admin_stats() to authenticated;
