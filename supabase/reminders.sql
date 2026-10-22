-- 成功日記：每日提醒（網頁推播）
-- 用法：Supabase 後台 → SQL Editor → New query → 貼上整份 → Run。重複執行不會有影響。
-- 需要先在 Database → Extensions 開啟 pg_cron 與 pg_net（排程的部分在最下面，另外執行）。

-- 1. 推播訂閱：一台裝置一列。endpoint 是瀏覽器給的推播網址（很長、猜不到），當作這台裝置的鑰匙。
--    沒登入也可以開提醒；有登入的話會記下帳號，用來判斷「今天在別台裝置寫過了沒」。
create table if not exists public.sj_push_subs (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) < 1000),
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  user_id uuid references auth.users (id) on delete cascade,
  remind_at time not null default '21:00',
  tz text not null default 'Asia/Taipei',
  last_written date,  -- 這台裝置最近一次寫日記的日期（當地日期）
  last_sent date,     -- 最近一次送出提醒的日期（當地日期），一天只送一次
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sj_push_subs_user on public.sj_push_subs (user_id);

-- 沒有任何權限設定：App 只能透過下面的函式存取，看不到別人的訂閱
alter table public.sj_push_subs enable row level security;
revoke all on public.sj_push_subs from anon, authenticated;

-- 2. 開啟／更新提醒（時間、時區）。登入時會一併記下帳號。
create or replace function public.sj_push_save(p_endpoint text, p_p256dh text, p_auth text, p_remind_at text, p_tz text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t time := p_remind_at::time;
  zone text := case when exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then p_tz else 'Asia/Taipei' end;
begin
  insert into public.sj_push_subs (endpoint, p256dh, auth, user_id, remind_at, tz)
  values (p_endpoint, p_p256dh, p_auth, auth.uid(), t, zone)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_id = coalesce(auth.uid(), public.sj_push_subs.user_id),
        remind_at = excluded.remind_at,
        tz = excluded.tz,
        updated_at = now();
end;
$$;

-- 3. 關閉提醒
create or replace function public.sj_push_delete(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.sj_push_subs where endpoint = p_endpoint;
$$;

-- 4. 今天寫了：這台裝置今天就不提醒（沒登入的人靠這個判斷）
create or replace function public.sj_push_wrote(p_endpoint text, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sj_push_subs
  set last_written = greatest(coalesce(last_written, p_day), p_day)
  where endpoint = p_endpoint and p_day between current_date - 2 and current_date + 2;
$$;

revoke all on function public.sj_push_save(text, text, text, text, text) from public;
revoke all on function public.sj_push_delete(text) from public;
revoke all on function public.sj_push_wrote(text, date) from public;
grant execute on function public.sj_push_save(text, text, text, text, text) to anon, authenticated;
grant execute on function public.sj_push_delete(text) to anon, authenticated;
grant execute on function public.sj_push_wrote(text, date) to anon, authenticated;

-- 5. 現在該提醒誰？（只給發送提醒的伺服器程式用）
--    到了設定的時間（之後 1 小時內）、今天還沒送過、今天還沒寫。
--    取出的同時就標記為已送出，同一天不會重複。
create or replace function public.sj_push_due(p_now timestamptz default now())
returns table (endpoint text, p256dh text, auth text, streak int, day_index int)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select s.endpoint, (p_now at time zone s.tz)::date as local_day
    from public.sj_push_subs s
    -- 到了設定的時間之後 1 小時內（用時間差計算，23:00 這種跨午夜的也正確）
    where (p_now at time zone s.tz)::time - s.remind_at between interval '0' and interval '59 minutes'
      and s.last_sent is distinct from (p_now at time zone s.tz)::date
      and s.last_written is distinct from (p_now at time zone s.tz)::date
      and not exists (
        select 1 from public.journal_docs d
        where s.user_id is not null and d.user_id = s.user_id and d.kind = 'entry' and not d.deleted
          and d.key = to_char((p_now at time zone s.tz)::date, 'YYYY-MM-DD')
      )
    for update of s skip locked
  ),
  marked as (
    update public.sj_push_subs s
    set last_sent = due.local_day
    from due
    where s.endpoint = due.endpoint
    returning s.endpoint, s.p256dh, s.auth, s.user_id, due.local_day
  )
  select m.endpoint, m.p256dh, m.auth,
    -- 連續天數：到昨天為止每天都有寫（只有登入的人算得出來）
    case when m.user_id is null then 0 else (
      select coalesce(min(k), 366) - 1 from generate_series(1, 365) k
      where not exists (
        select 1 from public.journal_docs d
        where d.user_id = m.user_id and d.kind = 'entry' and not d.deleted
          and d.key = to_char(m.local_day - k, 'YYYY-MM-DD')
      )
    )::int end as streak,
    extract(doy from m.local_day)::int as day_index
  from marked m;
end;
$$;

-- 推播服務回報「這台裝置已經不收了」時刪除
create or replace function public.sj_push_gone(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.sj_push_subs where endpoint = p_endpoint;
$$;

revoke all on function public.sj_push_due(timestamptz) from public, anon, authenticated;
revoke all on function public.sj_push_gone(text) from public, anon, authenticated;
grant execute on function public.sj_push_due(timestamptz) to service_role;
grant execute on function public.sj_push_gone(text) to service_role;

-- 6. 排程：每 15 分鐘叫發送提醒的程式檢查一次。
--    先完成「Edge Function」與密鑰設定，再把下面兩個 <...> 換掉後單獨執行這一段：
--
-- select cron.schedule(
--   'sj-daily-reminders',
--   '*/15 * * * *',
--   $$ select net.http_post(
--        url := 'https://<你的專案代碼>.supabase.co/functions/v1/sj-reminders',
--        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
--        body := '{}'::jsonb
--      ) $$
-- );
