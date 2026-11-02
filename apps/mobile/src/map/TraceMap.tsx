/**
 * iOS / Android：谷歌地图（react-native-maps，Google 引擎，地图加载免费不限量）。
 * 没有配置 key 时自动退回纸上地图。
 */
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTheme } from '@/theme';
import { googleMapStyle } from './mapStyle';
import { PaperMap } from './PaperMap';
import { PendingPin, TraceDot } from './TraceDot';
import { PlaceMark } from './marks';
import type { TraceMapProps } from './types';

export const hasGoogleMaps = !!(Constants.expoConfig?.extra as { googleMaps?: boolean } | undefined)?.googleMaps;

export function TraceMap(props: TraceMapProps & { paper?: boolean }) {
  if (props.paper || !hasGoogleMaps) return <PaperMap {...props} />;
  return <GoogleTraceMap {...props} />;
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
  const { c } = useTheme();
  const ref = useRef<MapView>(null);

  // 传送：飞到某处
  useEffect(() => {
    if (!focus) return;
    const latDelta = focus.spanKm / 111;
    ref.current?.animateToRegion(
      {
        latitude: focus.lat,
        longitude: focus.lng,
        latitudeDelta: latDelta,
        longitudeDelta: latDelta / Math.max(0.2, Math.cos((focus.lat * Math.PI) / 180)),
      },
      800,
    );
  }, [focus?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useMemo(() => googleMapStyle(c, landmarks), [c, landmarks]);
  const placed = useMemo(() => traces.filter((t) => t.place), [traces]);
  const coords = useMemo(() => placed.map((t) => ({ latitude: t.place!.lat, longitude: t.place!.lng })), [placed]);

  useEffect(() => {
    if (!coords.length || focus) return; // 传送中不自动取景
    const id = setTimeout(() => {
      ref.current?.fitToCoordinates(coords, {
        edgePadding: { top: topInset + 40, right: 48, bottom: bottomInset + 40, left: 48 },
        animated: true,
      });
    }, 250);
    return () => clearTimeout(id);
  }, [coords, topInset, bottomInset, refit, focus?.seq ?? null]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
      customMapStyle={style}
      onPress={(e) => {
        if (e.nativeEvent.action === 'marker-press') return;
        onMapPress?.({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude });
      }}
      onPoiClick={(e) => {
        const { placeId, name, coordinate } = e.nativeEvent;
        onPoiPress?.({ poiId: placeId, name: name?.replace(/\n/g, ' ') ?? null, lat: coordinate.latitude, lng: coordinate.longitude });
      }}
      onRegionChangeComplete={(r) =>
        onViewportChange?.({
          minLat: r.latitude - r.latitudeDelta / 2,
          maxLat: r.latitude + r.latitudeDelta / 2,
          minLng: r.longitude - r.longitudeDelta / 2,
          maxLng: r.longitude + r.longitudeDelta / 2,
        })
      }
      toolbarEnabled={false}
      showsPointsOfInterests={landmarks}
      showsBuildings={false}
      showsIndoors={false}
      rotateEnabled={false}
      pitchEnabled={false}
      mapPadding={{ top: topInset, right: 0, bottom: bottomInset, left: 0 }}>
      {places.map((p) => (
        <Marker
          key={p.key}
          coordinate={{ latitude: p.lat, longitude: p.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          onPress={(e) => {
            e.stopPropagation();
            onOpenPlace?.(p);
          }}>
          <PlaceMark place={p} />
        </Marker>
      ))}
      {placed.map((t) => (
        <Marker
          key={t.id}
          coordinate={{ latitude: t.place!.lat, longitude: t.place!.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          onPress={(e) => {
            e.stopPropagation();
            onSelect(t.id);
          }}>
          <TraceDot selected={t.id === selectedId} tone={t.ownerId != null ? 'ink' : 'stamp'} />
        </Marker>
      ))}
      {pin && (
        <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <PendingPin />
        </Marker>
      )}
    </MapView>
  );
}
