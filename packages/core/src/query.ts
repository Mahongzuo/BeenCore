/**
 * 「印记」Tab 的查询：搜索、筛选、排序、按地点分组。
 * 全部在内存里完成——一个人一生的印记以千计，不需要数据库索引，离线也一样快。
 */
import type { Theme, Trace } from './types.ts';
import { isSealed } from './time.ts';

export type TraceSort = 'happened-desc' | 'happened-asc' | 'created-desc';

export interface TraceQuery {
  text?: string;
  /** 任一章节命中即可 */
  themes?: Theme[];
  withPhotos?: boolean;
  /** 补记的旧事：精度为年或月 */
  oldMemories?: boolean;
  /** 只看封存中的时光胶囊 */
  sealed?: boolean;
  /** 只看签过地点墙的 */
  signed?: boolean;
  fromYear?: number | null;
  toYear?: number | null;
  sort?: TraceSort;
}

function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

export function filterTraces(traces: Trace[], q: TraceQuery, now = Date.now()): Trace[] {
  const needle = q.text?.trim() ? norm(q.text.trim()) : null;
  const out = traces.filter((t) => {
    if (t.deletedAt) return false;
    const sealed = isSealed(t, now);
    if (q.sealed && !sealed) return false;
    if (q.themes?.length && !q.themes.includes(t.theme)) return false;
    if (q.withPhotos && !t.photoIds.length) return false;
    if (q.oldMemories && t.precision === 'day') return false;
    if (q.signed && t.visibility !== 'wall') return false;
    const y = new Date(t.happenedAt).getFullYear();
    if (q.fromYear != null && y < q.fromYear) return false;
    if (q.toYear != null && y > q.toYear) return false;
    if (needle) {
      // 封存中的印记不能被内容搜到——那会提前泄露胶囊里的话
      const hay = norm([sealed ? '' : t.text, t.place?.name ?? '', sealed ? '' : (t.wallNote ?? '')].join('\n'));
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const sort = q.sort ?? 'happened-desc';
  out.sort((a, b) =>
    sort === 'happened-asc'
      ? a.happenedAt - b.happenedAt || a.createdAt - b.createdAt
      : sort === 'created-desc'
        ? b.createdAt - a.createdAt
        : b.happenedAt - a.happenedAt || b.createdAt - a.createdAt,
  );
  return out;
}

/** 按年份分段，顺序与列表一致。用于列表的年份小标题。 */
export function sectionsByYear(traces: Trace[], key: 'happenedAt' | 'createdAt' = 'happenedAt'): { year: number; traces: Trace[] }[] {
  const out: { year: number; traces: Trace[] }[] = [];
  for (const t of traces) {
    const y = new Date(t[key]).getFullYear();
    const last = out[out.length - 1];
    if (last && last.year === y) last.traces.push(t);
    else out.push({ year: y, traces: [t] });
  }
  return out;
}

export interface PlaceGroup {
  key: string;
  name: string | null;
  country: string | null;
  count: number;
  firstYear: number;
  lastYear: number;
  /** 最近的一枚在前 */
  traces: Trace[];
  center: { lat: number; lng: number };
}

/**
 * 按地点分组。有地名的按「地名 + 国家」归并（同一个街区的多枚印记），
 * 没有地名的按约 5km 的格子归并。没有地点的印记不参与。
 */
export function groupByPlace(traces: Trace[]): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const t of traces) {
    if (t.deletedAt || !t.place) continue;
    const name = t.place.name?.trim() || null;
    const key = name
      ? `n:${norm(name)}|${(t.place.country ?? '').toUpperCase()}`
      : `g:${Math.round(t.place.lat * 20) / 20},${Math.round(t.place.lng * 20) / 20}`;
    const y = new Date(t.happenedAt).getFullYear();
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.traces.push(t);
      g.firstYear = Math.min(g.firstYear, y);
      g.lastYear = Math.max(g.lastYear, y);
      if (!g.country && t.place.country) g.country = t.place.country;
    } else {
      groups.set(key, {
        key,
        name,
        country: t.place.country ?? null,
        count: 1,
        firstYear: y,
        lastYear: y,
        traces: [t],
        center: { lat: t.place.lat, lng: t.place.lng },
      });
    }
  }
  const list = [...groups.values()];
  for (const g of list) g.traces.sort((a, b) => b.happenedAt - a.happenedAt);
  return list.sort((a, b) => b.count - a.count || b.lastYear - a.lastYear);
}
