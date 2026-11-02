/**
 * 定位与地名。
 * iOS / Android 的逆地理编码由系统提供（免费、离线时也可能有缓存），
 * Web 端没有系统地理编码，有 Google key 时调用 Geocoding API；都查不到时用离线城市表。
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { distanceMeters, type Place } from '@been/core';
import { deviceLang } from '@/i18n';
import { getSettings } from '@/lib/settings';
import { CITIES } from '@/map/basemap';

export type LocateResult = { ok: true; place: Place } | { ok: false; reason: 'denied' | 'unavailable' };

export async function locateHere(): Promise<LocateResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'denied' };
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const lat = round(pos.coords.latitude);
    const lng = round(pos.coords.longitude);
    const named = await nameOf(lat, lng);
    return { ok: true, place: { lat, lng, ...named } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** 地名：街区级。故意不取门牌号。查不到时退回离线城市表。 */
export async function nameOf(lat: number, lng: number): Promise<{ name: string | null; country: string | null }> {
  try {
    const found =
      Platform.OS === 'web'
        ? await googleName(lat, lng)
        : await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).then(([a]) =>
            a
              ? { name: a.district ?? a.subregion ?? a.city ?? a.region ?? a.name ?? null, country: a.isoCountryCode ?? a.country ?? null }
              : { name: null, country: null },
          );
    if (found.name) return found;
  } catch {
    // 离线或接口不可用：走下面的兜底
  }
  return { name: nearestCity(lat, lng), country: null };
}

/**
 * 离线兜底：随 App 打包的 1251 座城市（Natural Earth）里最近的一座。
 * 50km 内直接用城市名，150km 内写作「某某附近」，再远就不猜了。
 */
function nearestCity(lat: number, lng: number): string | null {
  const zh = getSettings().lang === 'zh' || (getSettings().lang === 'auto' && deviceLang() === 'zh');
  let best: { name: string; d: number } | null = null;
  for (const [en, cn, clat, clng] of CITIES) {
    if (Math.abs(clat - lat) > 2 || Math.abs(clng - lng) > 3) continue;
    const d = distanceMeters({ lat, lng }, { lat: clat, lng: clng });
    if (!best || d < best.d) best = { name: zh && cn ? cn : en, d };
  }
  if (!best || best.d > 150_000) return null;
  if (best.d <= 50_000) return best.name;
  return zh ? `${best.name}附近` : `Near ${best.name}`;
}

async function googleName(lat: number, lng: number): Promise<{ name: string | null; country: string | null }> {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
  if (!key) return { name: null, country: null };
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=neighborhood|sublocality|locality&key=${key}`;
  const res = await fetch(url);
  const json = (await res.json()) as {
    results?: { address_components: { long_name: string; short_name: string; types: string[] }[] }[];
  };
  const comps = json.results?.[0]?.address_components ?? [];
  const pick = (t: string) => comps.find((c) => c.types.includes(t));
  return {
    name: (pick('neighborhood') ?? pick('sublocality') ?? pick('locality'))?.long_name ?? null,
    country: pick('country')?.short_name ?? null,
  };
}

/** 保留 5 位小数（约 1 米），足够，也不多存 */
function round(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
