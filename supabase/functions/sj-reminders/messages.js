// 每日提醒的通知文字（每天輪替）。想改文字，改這裡就好。

export const TITLE = '成功日記';

export const MESSAGES = [
  '今天辛苦了 🌙 花一分鐘，寫下今天做到的三件小事吧。',
  '今天有什麼小成功？再小的事都算數 🌱',
  '準時起床、好好吃飯，也都是一種成功。來記下今天的吧。',
  '睡前三件小成功，讓今天好好收尾 ✨',
  '今天，有誰讓你想說聲謝謝嗎？ ♡',
  '你的成功日記在等你，今天的你做到了什麼？',
  '對自己溫柔一點，今天也值得被記下來。',
];

/** 點通知打開的網址（帶 UTM，GA 看得到是從提醒來的） */
export const OPEN_URL = 'https://success.jas-soul.com/?utm_source=success_journal&utm_medium=push&utm_campaign=daily_reminder#today';

/** streak：到昨天為止連續寫了幾天（有登入才知道）；dayIndex：一年中的第幾天，用來每天換一句 */
export function reminderMessage({ streak = 0, day_index: dayIndex = 0 } = {}) {
  const body = streak >= 3 ? `已經連續 ${streak} 天了 ✨ 今天也記一下，讓好習慣接下去。` : MESSAGES[((dayIndex % MESSAGES.length) + MESSAGES.length) % MESSAGES.length];
  return { title: TITLE, body, url: OPEN_URL };
}
