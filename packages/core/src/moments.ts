/**
 * 从相册补记：把一批照片分成一个个「时刻」。
 *
 * 规则（按人对一天的记忆来分）：
 * 1. 同一天、相距不到 1km 的照片是同一个时刻。
 * 2. 同一天但相距很远（比如上午在市区、傍晚到 30km 外的海边），分成两个时刻。
 * 3. 没有坐标的照片，并入同一天里时间最接近的那个时刻；那天没有带坐标的照片，就自成一个。
 * 4. 没有拍摄时间的照片：有坐标的按地点归在一起；什么信息都没有的，各自成为一个时刻，由用户补。
 */
import { distanceMeters } from './geo.ts';

export interface PhotoMeta {
  id: string;
  /** 拍摄时间（本地墙上时间，毫秒）；不知道就是 null */
  takenAt: number | null;
  lat: number | null;
  lng: number | null;
}

export interface Moment {
  key: string;
  /** 按拍摄时间排序 */
  photos: PhotoMeta[];
  /** 第一张照片的拍摄时间；整组都没有时间时为 null */
  takenAt: number | null;
  /** 带坐标照片的中心；都没有坐标时为 null */
  place: { lat: number; lng: number } | null;
}

export const MOMENT_RADIUS_METERS = 1000;

/** EXIF 的 "YYYY:MM:DD HH:MM:SS" 没有时区，按拍摄地的墙上时间理解，读成本地时间 */
export function parseExifDate(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(y, mo - 1, d, h, mi, se).getTime();
  return Number.isFinite(t) ? t : null;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function located(p: PhotoMeta): p is PhotoMeta & { lat: number; lng: number } {
  return p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

function finish(key: string, photos: PhotoMeta[]): Moment {
  photos.sort((a, b) => (a.takenAt ?? Infinity) - (b.takenAt ?? Infinity));
  const geo = photos.filter(located);
  const place = geo.length
    ? { lat: geo.reduce((s, p) => s + p.lat, 0) / geo.length, lng: geo.reduce((s, p) => s + p.lng, 0) / geo.length }
    : null;
  return { key, photos, takenAt: photos.find((p) => p.takenAt != null)?.takenAt ?? null, place };
}

export function clusterMoments(photos: PhotoMeta[], radius = MOMENT_RADIUS_METERS): Moment[] {
  const out: Moment[] = [];

  // 有时间的：按天分，再按地点分
  const byDay = new Map<string, PhotoMeta[]>();
  for (const p of photos) {
    if (p.takenAt == null) continue;
    const k = dayKey(p.takenAt);
    const list = byDay.get(k);
    if (list) list.push(p);
    else byDay.set(k, [p]);
  }
  for (const [day, list] of byDay) {
    list.sort((a, b) => a.takenAt! - b.takenAt!);
    const groups: { anchor: { lat: number; lng: number } | null; photos: PhotoMeta[] }[] = [];
    for (const p of list.filter(located)) {
      const g = groups.find((x) => x.anchor && distanceMeters(x.anchor, p) <= radius);
      if (g) g.photos.push(p);
      else groups.push({ anchor: { lat: p.lat!, lng: p.lng! }, photos: [p] });
    }
    for (const p of list.filter((x) => !located(x))) {
      if (!groups.length) {
        groups.push({ anchor: null, photos: [p] });
        continue;
      }
      // 并入时间最接近的那组
      let best = groups[0];
      let bestGap = Infinity;
      for (const g of groups) {
        for (const q of g.photos) {
          const gap = Math.abs(q.takenAt! - p.takenAt!);
          if (gap < bestGap) {
            bestGap = gap;
            best = g;
          }
        }
      }
      best.photos.push(p);
    }
    groups.forEach((g, i) => out.push(finish(`${day}#${i}`, g.photos)));
  }

  // 没有时间、有坐标的：按地点归在一起
  const undatedGeo: { anchor: { lat: number; lng: number }; photos: PhotoMeta[] }[] = [];
  for (const p of photos) {
    if (p.takenAt != null || !located(p)) continue;
    const g = undatedGeo.find((x) => distanceMeters(x.anchor, p) <= radius);
    if (g) g.photos.push(p);
    else undatedGeo.push({ anchor: { lat: p.lat, lng: p.lng }, photos: [p] });
  }
  undatedGeo.forEach((g, i) => out.push(finish(`nodate#${i}`, g.photos)));

  // 什么都没有的：各自一个
  for (const p of photos) {
    if (p.takenAt == null && !located(p)) out.push(finish(`unknown#${p.id}`, [p]));
  }

  return out.sort((a, b) => (a.takenAt ?? Infinity) - (b.takenAt ?? Infinity));
}
