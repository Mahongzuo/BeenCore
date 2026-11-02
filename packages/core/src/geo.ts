/**
 * Geohash 与距离。地点墙按 geohash-6 分格（约 1.2km × 0.6km），
 * 既足够“同一个地方”，又不会精确到暴露某人的家门口。
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export const WALL_PRECISION = 6;

export function encodeGeohash(lat: number, lng: number, precision = WALL_PRECISION): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new RangeError('Invalid coordinates');
  }
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        minLng = mid;
      } else {
        ch <<= 1;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        minLat = mid;
      } else {
        ch <<= 1;
        maxLat = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function decodeGeohash(hash: string): Bounds & { lat: number; lng: number } {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let even = true;
  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) throw new RangeError(`Invalid geohash character: ${c}`);
    for (let mask = 16; mask > 0; mask >>= 1) {
      if (even) {
        const mid = (minLng + maxLng) / 2;
        if (idx & mask) minLng = mid;
        else maxLng = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (idx & mask) minLat = mid;
        else maxLat = mid;
      }
      even = !even;
    }
  }
  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };
}

export function isGeohash(value: unknown, precision = WALL_PRECISION): value is string {
  return (
    typeof value === 'string' &&
    value.length === precision &&
    [...value].every((c) => BASE32.includes(c))
  );
}

/** 两点间的大圆距离（米） */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 一组点的外包框，带一点留白。用于离线“纸上地图”的投影。 */
export function boundsOf(points: { lat: number; lng: number }[], padRatio = 0.15): Bounds | null {
  if (!points.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const latPad = Math.max((maxLat - minLat) * padRatio, 0.02);
  const lngPad = Math.max((maxLng - minLng) * padRatio, 0.02);
  return {
    minLat: Math.max(-85, minLat - latPad),
    maxLat: Math.min(85, maxLat + latPad),
    minLng: Math.max(-180, minLng - lngPad),
    maxLng: Math.min(180, maxLng + lngPad),
  };
}

/** Web Mercator 投影到 [0,1]×[0,1]，y 向下 */
export function projectMercator(lat: number, lng: number): { x: number; y: number } {
  const x = (lng + 180) / 360;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return { x, y };
}

/**
 * 打开 Google 地图的链接（Maps URLs）：不需要 key，不计费。
 * 手机上装了 Google 地图 App 会直接用 App 打开，用户看到的是自己已登录的谷歌地图。
 * https://developers.google.com/maps/documentation/urls/get-started
 */
export function googleMapsUrl(p: { lat: number; lng: number; name?: string | null; poiId?: string | null }): string {
  const query = p.poiId && p.name ? p.name : `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const params = new URLSearchParams({ api: '1', query });
  if (p.poiId) params.set('query_place_id', p.poiId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
