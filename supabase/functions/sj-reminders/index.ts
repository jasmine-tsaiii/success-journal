// 成功日記：每日提醒的發送程式（Supabase Edge Function）
// 每 15 分鐘由排程呼叫一次：找出現在該提醒、今天還沒寫的人，送出網頁推播。
// 整個程式都在這一個檔案裡，在 Supabase 後台的編輯器貼上這一個檔案就可以 Deploy。
//
// 需要的密鑰（Supabase 後台 → Edge Functions → Secrets）：
//   VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY：推播用的金鑰（公開的那把也放在 app/js/config.js）
//   CRON_SECRET：排程呼叫時帶的暗號，避免別人亂呼叫
// SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自動提供。

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

/* ---------- 通知文字（每天輪替）。想改文字，改這裡就好 ---------- */

const TITLE = '成功日記';

const MESSAGES = [
  '今天辛苦了 🌙 花一分鐘，寫下今天做到的三件小事吧。',
  '今天有什麼小成功？再小的事都算數 🌱',
  '準時起床、好好吃飯，也都是一種成功。來記下今天的吧。',
  '睡前三件小成功，讓今天好好收尾 ✨',
  '今天，有誰讓你想說聲謝謝嗎？ ♡',
  '你的成功日記在等你，今天的你做到了什麼？',
  '對自己溫柔一點，今天也值得被記下來。',
];

/** 點通知打開的網址（帶 UTM，GA 看得到是從提醒來的） */
const OPEN_URL = 'https://success.jas-soul.com/?utm_source=success_journal&utm_medium=push&utm_campaign=daily_reminder#today';

/** streak：到昨天為止連續寫了幾天（有登入才知道）；day_index：一年中的第幾天，用來每天換一句 */
function reminderMessage({ streak = 0, day_index: dayIndex = 0 }: { streak?: number; day_index?: number }) {
  const n = MESSAGES.length;
  const body = streak >= 3 ? `已經連續 ${streak} 天了 ✨ 今天也記一下，讓好習慣接下去。` : MESSAGES[((dayIndex % n) + n) % n];
  return { title: TITLE, body, url: OPEN_URL };
}

/* ---------- 發送 ---------- */

const env = (k: string) => Deno.env.get(k) ?? '';

webpush.setVapidDetails('mailto:hello@jas-soul.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

Deno.serve(async (req) => {
  if (!env('CRON_SECRET') || req.headers.get('x-cron-secret') !== env('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data, error } = await db.rpc('sj_push_due');
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  let gone = 0;
  let failed = 0;
  await Promise.all(
    (data ?? []).map(async (row: { endpoint: string; p256dh: string; auth: string; streak: number; day_index: number }) => {
      const msg = reminderMessage(row);
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(msg),
          { TTL: 3600, urgency: 'normal', topic: 'daily-reminder' },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // 這台裝置已經取消通知或移除 App：刪掉訂閱
          await db.rpc('sj_push_gone', { p_endpoint: row.endpoint });
          gone++;
        } else {
          failed++;
          console.error('push failed', status, (e as Error).message);
        }
      }
    }),
  );
  return Response.json({ sent, gone, failed });
});
