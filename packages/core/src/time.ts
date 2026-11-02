/**
 * 时间工具。所有计算都在用户本地时区完成：
 * “这一周”“那年今日”是生活里的日子，而不是 UTC 的日子。
 */
import type { DatePrecision, Trace } from './types.ts';

const DAY = 86_400_000;

export interface WeekId {
  year: number;
  week: number;
}

/** ISO 8601 周：周一开始，第一周包含当年第一个周四 */
export function isoWeek(ts: number): WeekId {
  const d = new Date(ts);
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNum = (date.getDay() + 6) % 7; // 周一 = 0
  date.setDate(date.getDate() - dayNum + 3); // 移到本周四
  const year = date.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * DAY));
  return { year, week };
}

export function weekKey(id: WeekId): string {
  return `${id.year}-W${String(id.week).padStart(2, '0')}`;
}

/** 某个时刻所在周的周一 00:00 到下周一 00:00（本地时间） */
export function weekRange(ts: number): { start: number; end: number; days: number[] } {
  const d = new Date(ts);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const days: number[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).getTime());
  }
  const end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7).getTime();
  return { start: monday.getTime(), end, days };
}

export function shiftWeek(ts: number, weeks: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + weeks * 7).getTime();
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** 按精度格式化日期。精度为 year 的旧事只显示年份。 */
export function formatTraceDate(ts: number, precision: DatePrecision, locale: string): string {
  const d = new Date(ts);
  if (precision === 'year') return String(d.getFullYear());
  if (precision === 'month') {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(d);
  }
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

/** 邮戳中心的日期，分成两行：「01 NOV」「2026」 */
export function postmarkDate(ts: number, precision: DatePrecision, locale: string): [string, string] {
  const d = new Date(ts);
  const year = String(d.getFullYear());
  if (precision === 'year') return ['', year];
  const zh = locale.toLowerCase().startsWith('zh');
  if (zh) {
    if (precision === 'month') return [`${d.getMonth() + 1}月`, year];
    return [`${d.getMonth() + 1}月${d.getDate()}日`, year];
  }
  const month = new Intl.DateTimeFormat('en', { month: 'short' }).format(d).toUpperCase();
  if (precision === 'month') return [month, year];
  return [`${String(d.getDate()).padStart(2, '0')} ${month}`, year];
}

/**
 * 那年今日：往年同月同日（精确到天）的印记。
 * 只有精度为 day 的印记参与，按年份从近到远。
 */
export function onThisDay<T extends Pick<Trace, 'happenedAt' | 'precision' | 'deletedAt'>>(
  traces: T[],
  now: number,
): T[] {
  const today = new Date(now);
  const m = today.getMonth();
  const day = today.getDate();
  const y = today.getFullYear();
  return traces
    .filter((t) => {
      if (t.deletedAt || t.precision !== 'day') return false;
      const d = new Date(t.happenedAt);
      return d.getMonth() === m && d.getDate() === day && d.getFullYear() < y;
    })
    .sort((a, b) => b.happenedAt - a.happenedAt);
}

/** 地点墙留言上的季节标签，例如 "Autumn 2026" / "2026年秋" */
export function seasonLabel(ts: number, locale: string, southern = false): string {
  const d = new Date(ts);
  const m = d.getMonth();
  let idx = m >= 2 && m <= 4 ? 0 : m >= 5 && m <= 7 ? 1 : m >= 8 && m <= 10 ? 2 : 3;
  if (southern) idx = (idx + 2) % 4;
  // 12 月属于下一年的冬天会让人困惑，这里按日历年
  const year = d.getFullYear();
  if (locale.toLowerCase().startsWith('zh')) {
    return `${year}年${['春', '夏', '秋', '冬'][idx]}`;
  }
  return `${['Spring', 'Summer', 'Autumn', 'Winter'][idx]} ${year}`;
}

export function isSealed(trace: Pick<Trace, 'opensAt'>, now: number): boolean {
  return trace.opensAt != null && trace.opensAt > now;
}
