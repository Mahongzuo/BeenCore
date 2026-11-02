/// <reference types="google.maps" />
/**
 * Web：谷歌地图 JS API（@vis.gl/react-google-maps）。
 * 网页地图按加载次数计费（每月 1 万次免费），所以 Web 默认用纸上地图；
 * 只有配置了 EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY 才启用谷歌地图。
 * 自定义标记需要地图 ID（EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID，在 Cloud Console 里导入 docs/google-map-style.json）。
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdvancedMarker, APIProvider, ColorScheme, Map, useMap } from '@vis.gl/react-google-maps';
import { useTheme } from '@/theme';
import { PaperMap } from './PaperMap';
import { PendingPin, TraceDot } from './TraceDot';
import { PlaceMark } from './marks';
import type { TraceMapProps } from './types';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export const hasGoogleMaps = !!KEY;

export function TraceMap(props: TraceMapProps & { paper?: boolean }) {
  if (props.paper || !KEY) return <PaperMap {...props} />;
  return (
    <APIProvider apiKey={KEY}>
      <GoogleTraceMap {...props} />
    </APIProvider>
  );
}

function GoogleTraceMap({
  traces,
  selectedId,
  onSelect,
  onMapPress,
  onOpenPlace,
  onPoiPress,
  onViewportChange,
  pin,
  places = [],
  landmarks = true,
  focus,
  refit = 0,
  bottomInset,
  topInset,
}: TraceMapProps) {
  const { dark } = useTheme();
  const placed = useMemo(() => traces.filter((t) => t.place), [traces]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        mapId={MAP_ID}
        colorScheme={dark ? ColorScheme.DARK : ColorScheme.LIGHT}
        defaultCenter={{ lat: 20, lng: 0 }}
        defaultZoom={2}
        disableDefaultUI
        clickableIcons={landmarks}
        gestureHandling="greedy"
        onClick={(e) => {
          const ll = e.detail.latLng;
          if (!ll) return;
          if (e.detail.placeId) {
            // 点到景点：不弹谷歌自带的信息窗，交给 Been 的地点页（名字在那里由 Google 地图跳转查看）
            e.stop();
            onPoiPress?.({ poiId: e.detail.placeId, name: null, lat: ll.lat, lng: ll.lng });
            return;
          }
          onMapPress?.({ lat: ll.lat, lng: ll.lng });
        }}
        onIdle={(e) => {
          const b = e.map.getBounds();
          if (!b) return;
          const ne = b.getNorthEast();
          const sw = b.getSouthWest();
          onViewportChange?.({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
        }}
        style={{ width: '100%', height: '100%' }}>
        {!focus && <FitBounds traces={placed} top={topInset} bottom={bottomInset} refit={refit} />}
        <FlyTo focus={focus ?? null} />
        {places.map((p) => (
          <AdvancedMarker key={p.key} position={{ lat: p.lat, lng: p.lng }} anchorLeft="-50%" anchorTop="-50%" onClick={() => onOpenPlace?.(p)}>
            <PlaceMark place={p} />
          </AdvancedMarker>
        ))}
        {placed.map((t) => (
          <AdvancedMarker key={t.id} position={{ lat: t.place!.lat, lng: t.place!.lng }} anchorLeft="-50%" anchorTop="-50%" onClick={() => onSelect(t.id)}>
            <TraceDot selected={t.id === selectedId} tone={t.ownerId != null ? 'ink' : 'stamp'} />
          </AdvancedMarker>
        ))}
        {pin && (
          <AdvancedMarker position={{ lat: pin.lat, lng: pin.lng }} anchorLeft="-50%" anchorTop="-50%">
            <PendingPin />
          </AdvancedMarker>
        )}
      </Map>
    </View>
  );
}

function FitBounds({ traces, top, bottom, refit }: { traces: TraceMapProps['traces']; top: number; bottom: number; refit: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !traces.length || typeof google === 'undefined') return;
    const b = new google.maps.LatLngBounds();
    traces.forEach((t) => b.extend({ lat: t.place!.lat, lng: t.place!.lng }));
    map.fitBounds(b, { top: top + 40, bottom: bottom + 40, left: 48, right: 48 });
    if (traces.length === 1) map.setZoom(11);
  }, [map, traces, top, bottom, refit]);
  return null;
}

function FlyTo({ focus }: { focus: TraceMapProps['focus'] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !focus) return;
    map.panTo({ lat: focus.lat, lng: focus.lng });
    // spanKm ≈ 40000 / 2^zoom × 屏宽比例，这里取一个近似
    map.setZoom(Math.max(2, Math.min(16, Math.round(Math.log2(40000 / focus.spanKm)))));
  }, [map, focus?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
