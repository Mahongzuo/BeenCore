/**
 * 谷歌地图配色：从 Been 的调色板生成。
 * 商户、公交一律隐藏；「景点」图层打开时，只露出景点、公园与地标——
 * 那些值得人「来过」的地方。
 */
import type { Palette } from '@been/core';

export function googleMapStyle(c: Palette, landmarks = true) {
  // 只作用于这三类，避免把商户重新露出来
  const visible = landmarks
    ? ['poi.attraction', 'poi.park', 'poi.place_of_worship'].flatMap((featureType) => [
        { featureType, stylers: [{ visibility: 'on' }] },
        { featureType, elementType: 'labels.text.fill', stylers: [{ color: c.inkSoft }] },
        { featureType, elementType: 'labels.icon', stylers: [{ visibility: 'on' }, { saturation: -80 }, { lightness: 15 }] },
      ])
    : [];
  return [
    { elementType: 'geometry', stylers: [{ color: c.mapLand }] },
    { elementType: 'labels.text.fill', stylers: [{ color: c.mapLabel }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: c.mapLand }, { weight: 3 }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: c.mapRoad }] },
    { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: c.mapRoad }, { weight: 1.2 }] },
    { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: c.mapBorder }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
    { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: c.mapLand }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: c.mapWater }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: c.mapLabel }] },
    ...visible,
  ];
}
