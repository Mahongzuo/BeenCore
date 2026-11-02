/**
 * 亲友与宠物的档案。
 *
 * 档案是独立的：它的印记不进「我」的地图、印记列表和传记。
 * 这里只放与界面无关的纯函数，三端共用。
 */
import type { FuzzyDate, Person, Trace } from './types.ts';

/** 印记的归属：null 是「我」 */
export function ownerOf(t: Pick<Trace, 'ownerId'>): string | null {
  return t.ownerId ?? null;
}

/** 只留某个人的印记（null = 我自己） */
export function tracesOf<T extends Pick<Trace, 'ownerId'>>(traces: T[], ownerId: string | null): T[] {
  return traces.filter((t) => ownerOf(t) === ownerId);
}

export function isGone(p: Pick<Person, 'died'>): boolean {
  return p.died != null;
}

/** 公开纪念只限已离世的人和宠物：在世的人不能被别人建「纪念页」 */
export function canBeMemorial(p: Pick<Person, 'kind' | 'died'>): boolean {
  return p.kind === 'pet' || p.died != null;
}

const yearOf = (d: FuzzyDate | null) => (d ? new Date(d.at).getFullYear() : null);

/**
 * 生卒年：「1931 – 2019」「2015 –」「– 2019」。都没有时返回空字符串。
 * 只显示年份：档案页的标题处不需要精确到日。
 */
export function lifeSpan(p: Pick<Person, 'born' | 'died'>): string {
  const a = yearOf(p.born);
  const b = yearOf(p.died);
  if (a == null && b == null) return '';
  if (b == null) return `${a} –`;
  if (a == null) return `– ${b}`;
  return a === b ? `${a}` : `${a} – ${b}`;
}

/** 一起度过 / 活了多少年（整年，向下取整）。缺出生日期时返回 null。 */
export function yearsLived(p: Pick<Person, 'born' | 'died'>, now = Date.now()): number | null {
  if (!p.born) return null;
  const end = p.died?.at ?? now;
  const a = new Date(p.born.at);
  const b = new Date(end);
  let years = b.getFullYear() - a.getFullYear();
  if (p.born.precision !== 'year' && (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate()))) years--;
  return Math.max(0, years);
}

/** 档案列表的顺序：最近改动的在前；同时间按名字 */
export function sortPeople(people: Person[]): Person[] {
  return people
    .filter((p) => !p.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
}

/** 名字与文字的清洗：去首尾空白，空串变 null，限制长度 */
export function cleanPerson(p: Person): Person {
  const s = (v: string | null, max: number) => {
    const x = (v ?? '').trim().slice(0, max);
    return x ? x : null;
  };
  // 离开的时间不能早于出生
  const died = p.died && p.born && p.died.at < p.born.at ? null : p.died;
  return {
    ...p,
    name: p.name.trim().slice(0, 40),
    relation: s(p.relation, 24),
    species: p.kind === 'pet' ? s(p.species, 24) : null,
    bio: s(p.bio, 2000),
    died,
    // 在世的人不能公开
    visibility: canBeMemorial({ kind: p.kind, died }) ? p.visibility : 'private',
  };
}
