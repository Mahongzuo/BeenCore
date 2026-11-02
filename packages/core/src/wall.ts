/**
 * 地点墙：「你是第 N 位来过这里的人，最早的一位是……」
 *
 * 两层内容：
 * 1. 种子（Seed）：历史上与此地有关的人，来自 Wikidata，随 App 离线打包。
 * 2. 留言（WallNote）：真实来过的人签下的一句话，存在服务端。
 */
import type { Seed } from './types.ts';
import { distanceMeters, encodeGeohash } from './geo.ts';

export const WALL_NOTE_MAX = 60;
/** 种子按城市记录（坐标是城市中心），所以半径取一座城市的尺度 */
export const SEED_RADIUS_METERS = 25_000;

/**
 * 离此处最近的历史人物，按年代从早到晚排列。
 * 同一个人既生于此、又逝于此时只出现一次，带上卒年（diedYear）。
 */
export function seedsNear(
  seeds: Seed[],
  here: { lat: number; lng: number },
  radius = SEED_RADIUS_METERS,
  limit = 5,
): (Seed & { distance: number; diedYear?: number })[] {
  const near = seeds
    .map((s) => ({ ...s, distance: distanceMeters(here, s) }))
    .filter((s) => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance || a.year - b.year);
  const byPerson = new Map<string, Seed & { distance: number; diedYear?: number }>();
  for (const s of near) {
    const prev = byPerson.get(s.id);
    if (!prev) byPerson.set(s.id, { ...s });
    else if (prev.kind === 'born' && s.kind === 'died') prev.diedYear = s.year;
    else if (prev.kind === 'died' && s.kind === 'born') byPerson.set(s.id, { ...s, diedYear: prev.year });
  }
  return [...byPerson.values()].slice(0, limit).sort((a, b) => a.year - b.year);
}

/** 清理签名的一句话：去首尾空白、合并空白、截断。返回 null 表示不合格。 */
export function cleanWallNote(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return [...text].slice(0, WALL_NOTE_MAX).join('');
}

/** 英文序数：1st 2nd 3rd 4th … 11th 12th 13th … 21st */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * 「历史」图层：把种子按城市聚合成地图上的点。
 * key 是城市中心的 geohash-6，点开就是那面地点墙（墙会列出附近的历史人物）。
 */
export function historyPlaces(seeds: Seed[]): { key: string; lat: number; lng: number; name: string | null; count: number }[] {
  const byPlace = new Map<string, { key: string; lat: number; lng: number; name: string | null; people: Set<string> }>();
  for (const s of seeds) {
    const key = encodeGeohash(s.lat, s.lng);
    const g = byPlace.get(key);
    if (g) g.people.add(s.id);
    else byPlace.set(key, { key, lat: s.lat, lng: s.lng, name: s.placeName ?? null, people: new Set([s.id]) });
  }
  return [...byPlace.values()].map(({ people, ...rest }) => ({ ...rest, count: people.size }));
}
