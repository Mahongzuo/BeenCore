/**
 * 在 Google 地图里打开某个地方：用户自己的 Google 地图（已登录的身份），
 * 照片、评价、街景都在那里看。Been 看不到他浏览了什么，也不产生任何费用。
 */
import { Linking, Platform } from 'react-native';
import { googleMapsUrl } from '@been/core';

export function openInGoogleMaps(p: { lat: number; lng: number; name?: string | null; poiId?: string | null }): void {
  const url = googleMapsUrl(p);
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener');
    return;
  }
  Linking.openURL(url).catch(() => {});
}
