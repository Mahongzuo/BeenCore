import type { Trace } from '@been/core';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * 地图上「别人的」痕迹：
 * - others：别人签过的地点墙（只有人数，没有身份）
 * - history：在这座城市出生或去世的历史人物
 * - memorial：已离世的人或宠物的公开纪念（key 是纪念页 id）
 */
export interface PlacePoint {
  key: string;
  kind: 'others' | 'history' | 'memorial';
  lat: number;
  lng: number;
  count: number;
  name: string | null;
}

export interface TraceMapProps {
  traces: Trace[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 点（或长按）地图空白处 */
  onMapPress?: (p: LatLng) => void;
  /** 点谷歌地图上的景点（名字与 ID 来自地图本身，免费） */
  onPoiPress?: (p: { poiId: string; name: string | null; lat: number; lng: number }) => void;
  /** 谷歌地图上是否显示景点 */
  landmarks?: boolean;
  /** 点开「别人来过」或「历史」的地点 */
  onOpenPlace?: (p: PlacePoint) => void;
  /** 视角停下来时回报当前范围，用于按范围加载「别人来过」 */
  onViewportChange?: (b: Bounds) => void;
  /** 变化时重新取景到我的印记（「回到我的印记」） */
  refit?: number;
  /** 飞到某处（传送）。seq 变化时才执行一次。 */
  focus?: { lat: number; lng: number; spanKm: number; seq: number } | null;
  /** 点地图空白处落下的临时图钉 */
  pin?: LatLng | null;
  places?: PlacePoint[];
  /** 底部被时光滑轨等控件遮住的高度，地图取景时避开 */
  bottomInset: number;
  topInset: number;
}
