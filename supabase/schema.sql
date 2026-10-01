-- 成功日記：Supabase 資料表、權限與照片空間
-- 用法：Supabase 後台 → SQL Editor → New query → 貼上整份 → Run。重複執行不會有影響。

-- 1. 日記文件：每一天、每個願景板、標籤清單各是一列
create table if not exists public.journal_docs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('entry', 'board', 'tags')),
  key text not null check (char_length(key) between 1 and 100),
  data jsonb check (data is null or pg_column_size(data) < 500000),
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

create index if not exists journal_docs_user_synced on public.journal_docs (user_id, synced_at);

-- 2. 較新的版本才能覆蓋（兩台手機同時修改時，以最後修改的為準），並記錄同步時間
create or replace function public.journal_docs_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists journal_docs_before_write on public.journal_docs;
create trigger journal_docs_before_write
  before insert or update on public.journal_docs
  for each row execute function public.journal_docs_before_write();

-- 3. 每個人只能讀寫自己的資料
alter table public.journal_docs enable row level security;

drop policy if exists "own docs: select" on public.journal_docs;
drop policy if exists "own docs: insert" on public.journal_docs;
drop policy if exists "own docs: update" on public.journal_docs;
drop policy if exists "own docs: delete" on public.journal_docs;
create policy "own docs: select" on public.journal_docs for select to authenticated using ((select auth.uid()) = user_id);
create policy "own docs: insert" on public.journal_docs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own docs: update" on public.journal_docs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own docs: delete" on public.journal_docs for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.journal_docs from anon;

-- 4. 讓使用者在 App 裡刪除自己的帳號（日記會一併刪除；照片由 App 先刪）
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 5. 願景板照片：不公開，每個人只能存取自己資料夾（photos/<使用者 id>/…）裡的照片
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "own photos: select" on storage.objects;
drop policy if exists "own photos: insert" on storage.objects;
drop policy if exists "own photos: update" on storage.objects;
drop policy if exists "own photos: delete" on storage.objects;
create policy "own photos: select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos: update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
