# 每日提醒：Supabase 設定步驟

這些步驟只需要做一次。做完之後，開啟提醒的使用者會在選的時間（還沒寫的日子）收到通知。

## 1. 開啟兩個擴充功能
Supabase 後台 → **Database → Extensions**，搜尋並開啟：
- `pg_cron`（排程）
- `pg_net`（讓資料庫可以呼叫網址）

## 2. 建立資料表與函式
**SQL Editor → New query**，貼上 `supabase/reminders.sql` 整份 → **Run**。

## 3. 建立發送提醒的程式（Edge Function）
1. **Edge Functions → Deploy a new function → Via Editor**。
2. 名稱填 `sj-reminders`。
3. 把編輯器裡原本的內容全部刪掉，貼上 `supabase/functions/sj-reminders/index.ts` 的全部內容（整個程式只有這一個檔案）。
4. **Deploy**。
5. 進到這個 function 的 **Details / Settings**，把 **Verify JWT（Enforce JWT verification）關閉**
   （這個程式用自己的暗號 `CRON_SECRET` 保護）。

## 4. 設定密鑰
**Edge Functions → Secrets（Manage secrets）**，新增三個：

| 名稱 | 值 |
|---|---|
| `VAPID_PUBLIC_KEY` | 和 `app/js/config.js` 裡的 `VAPID_PUBLIC_KEY` 相同 |
| `VAPID_PRIVATE_KEY` | 私鑰（另外提供，**不要**放進程式碼或貼到公開的地方） |
| `CRON_SECRET` | 排程暗號（另外提供） |

## 5. 設定排程
**SQL Editor → New query**，把下面的 `<專案代碼>` 換成網址 `https://<專案代碼>.supabase.co` 裡的那一段、
`<CRON_SECRET>` 換成第 4 步的暗號，然後 **Run**：

```sql
select cron.schedule(
  'sj-daily-reminders',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://<專案代碼>.supabase.co/functions/v1/sj-reminders',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
       body := '{}'::jsonb
     ) $$
);
```

## 確認
- **Edge Functions → sj-reminders → Logs / Invocations**：每 15 分鐘會有一次呼叫，回應像 `{"sent":0,"gone":0,"failed":0}`。
- 在手機開啟提醒、把時間設成接下來 15 分鐘內，不要寫當天的日記，等通知出現。

## 之後想改通知文字
改 `supabase/functions/sj-reminders/index.ts` 最上面的 `MESSAGES`，再到 Edge Functions 貼上新的內容、重新 Deploy。
