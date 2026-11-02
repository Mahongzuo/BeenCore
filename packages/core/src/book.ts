/**
 * 人生之书：把散落的印记按年份装订成章。
 * 一年是一章；章里按时间排列；没有印记的年份不占页。
 */
import type { Theme, Trace } from './types.ts';
import { isSealed } from './time.ts';

export interface Chapter {
  year: number;
  traces: Trace[];
  /** 这一年去过的不同地方（按 geohash-6 计） */
  placeCount: number;
  /** 这一年出现最多的主题，作为章节的副题 */
  leadingTheme: Theme | null;
}

export interface LifeBook {
  chapters: Chapter[];
  firstYear: number | null;
  lastYear: number | null;
  traceCount: number;
  placeCount: number;
}

export function buildLifeBook(traces: Trace[], now = Date.now()): LifeBook {
  const live = traces.filter((t) => !t.deletedAt && !isSealed(t, now));
  const byYear = new Map<number, Trace[]>();
  for (const t of live) {
    const y = new Date(t.happenedAt).getFullYear();
    const list = byYear.get(y);
    if (list) list.push(t);
    else byYear.set(y, [t]);
  }
  const chapters: Chapter[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, list]) => {
      list.sort((a, b) => a.happenedAt - b.happenedAt || a.createdAt - b.createdAt);
      const places = new Set(list.map((t) => t.placeKey).filter(Boolean));
      return { year, traces: list, placeCount: places.size, leadingTheme: leadingTheme(list) };
    });
  const allPlaces = new Set(live.map((t) => t.placeKey).filter(Boolean));
  return {
    chapters,
    firstYear: chapters[0]?.year ?? null,
    lastYear: chapters[chapters.length - 1]?.year ?? null,
    traceCount: live.length,
    placeCount: allPlaces.size,
  };
}

function leadingTheme(list: Trace[]): Theme | null {
  const counts = new Map<Theme, number>();
  for (const t of list) {
    if (t.theme === 'everyday') continue; // 日常是底色，不当副题
    counts.set(t.theme, (counts.get(t.theme) ?? 0) + 1);
  }
  let best: Theme | null = null;
  let bestCount = 0;
  for (const [theme, n] of counts) {
    if (n > bestCount) {
      best = theme;
      bestCount = n;
    }
  }
  return best;
}

/**
 * 时光滑轨的刻度：从最早一年到今年，每年的印记数。
 * 空年份也保留（计数为 0），这样滑轨上能看见“空白的那几年”。
 */
export function yearDensity(
  traces: Pick<Trace, 'happenedAt' | 'deletedAt'>[],
  now = Date.now(),
): { year: number; count: number }[] {
  const thisYear = new Date(now).getFullYear();
  const counts = new Map<number, number>();
  let first = thisYear;
  for (const t of traces) {
    if (t.deletedAt) continue;
    const y = new Date(t.happenedAt).getFullYear();
    counts.set(y, (counts.get(y) ?? 0) + 1);
    if (y < first) first = y;
  }
  const out: { year: number; count: number }[] = [];
  for (let y = first; y <= thisYear; y++) out.push({ year: y, count: counts.get(y) ?? 0 });
  return out;
}

/** 某一年里每个月的印记数（12 格）。精度只到「年」的旧事不计入任何月份。 */
export function monthDensity(traces: Pick<Trace, 'happenedAt' | 'precision' | 'deletedAt'>[], year: number): number[] {
  const out = new Array<number>(12).fill(0);
  for (const t of traces) {
    if (t.deletedAt || t.precision === 'year') continue;
    const d = new Date(t.happenedAt);
    if (d.getFullYear() === year) out[d.getMonth()]++;
  }
  return out;
}

/** N 年前的今天（本地时间正午，避开时区边界）；2 月 29 日落到 2 月 28 日 */
export function yearsAgo(now: number, n: number): number {
  const d = new Date(now);
  const y = d.getFullYear() - n;
  const m = d.getMonth();
  const day = Math.min(d.getDate(), new Date(y, m + 1, 0).getDate());
  return new Date(y, m, day, 12).getTime();
}
