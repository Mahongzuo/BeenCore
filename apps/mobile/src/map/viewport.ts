/**
 * 纸上地图的视角：中心（世界坐标）+ 比例（屏幕像素 / 世界单位）。
 * 世界坐标是 Web Mercator，WORLD × WORLD 单位，约 1km / 单位。
 */
import { WORLD } from './basemap';

export interface View2D {
  cx: number;
  cy: number;
  /** 屏幕像素 / 世界单位 */
  s: number;
}

export interface Frame {
  w: number;
  h: number;
  top: number;
  bottom: number;
}

/** 至少显示约 600km：只有一枚印记时，也能看见周围的海岸与城市 */
export const MIN_SPAN = 600;
/** 最大放大：1km ≈ 60px */
export const MAX_SCALE = 60;

export function toWorld(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * WORLD;
  const c = Math.max(-85, Math.min(85, lat));
  const s = Math.sin((c * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD;
  return { x, y };
}

export function fromWorld(x: number, y: number): { lat: number; lng: number } {
  const n = Math.PI - (2 * Math.PI * y) / WORLD;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  const lng = ((((x / WORLD) * 360) % 360) + 360) % 360 - 180;
  return { lat, lng };
}

/** 可视区域中心在屏幕上的位置（避开顶栏和底部控件） */
function centerY(f: Frame): number {
  return f.top + (f.h - f.top - f.bottom) / 2;
}

export function minScale(f: Frame): number {
  return Math.max(0.001, (f.w / WORLD) * 0.9);
}

export function clampScale(s: number, f: Frame): number {
  return Math.min(MAX_SCALE, Math.max(minScale(f), s));
}

export function toScreen(v: View2D, f: Frame, x: number, y: number): { x: number; y: number } {
  return { x: (x - v.cx) * v.s + f.w / 2, y: (y - v.cy) * v.s + centerY(f) };
}

export function screenToWorld(v: View2D, f: Frame, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - f.w / 2) / v.s + v.cx, y: (sy - centerY(f)) / v.s + v.cy };
}

/** 取景：让所有点落在可视区域里；没有点时显示整个世界 */
export function fitView(points: { lat: number; lng: number }[], f: Frame): View2D {
  const availW = Math.max(1, f.w - 48);
  const availH = Math.max(1, f.h - f.top - f.bottom - 48);
  if (!points.length) {
    // 竖屏时按高度取景（横向可拖动），避免上下大片留白；最多放大到宽度取景的 3 倍
    const byWidth = availW / WORLD;
    const s = clampScale(Math.min(byWidth * 3, Math.max(byWidth, availH / (WORLD * 0.72))), f);
    return { cx: WORLD / 2, cy: WORLD * 0.42, s };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const w = toWorld(p.lat, p.lng);
    minX = Math.min(minX, w.x);
    maxX = Math.max(maxX, w.x);
    minY = Math.min(minY, w.y);
    maxY = Math.max(maxY, w.y);
  }
  const spanX = Math.max(MIN_SPAN, (maxX - minX) * 1.2);
  const spanY = Math.max(MIN_SPAN * 0.7, (maxY - minY) * 1.2);
  const s = clampScale(Math.min(availW / spanX, availH / spanY), f);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, s };
}

/** 以屏幕上某一点为中心缩放 k 倍（滚轮、按钮、双指） */
export function zoomAt(v: View2D, f: Frame, k: number, sx: number, sy: number): View2D {
  const s = clampScale(v.s * k, f);
  const w = screenToWorld(v, f, sx, sy);
  return { s, cx: w.x - (sx - f.w / 2) / s, cy: w.y - (sy - centerY(f)) / s };
}

/**
 * 手势结束时提交：手势期间画面整体做了「绕容器中心缩放 k、再平移 (tx, ty)」，
 * 求出与之等价的新视角。
 */
export function commitTransform(v: View2D, f: Frame, k: number, tx: number, ty: number): View2D {
  const Cx = f.w / 2;
  const Cy = f.h / 2;
  // 新视角中心在屏幕上的位置，反推回手势前的屏幕坐标
  const qx = f.w / 2;
  const qy = centerY(f);
  const px = (qx - Cx - tx) / k + Cx;
  const py = (qy - Cy - ty) / k + Cy;
  const w = screenToWorld(v, f, px, py);
  return { cx: w.x, cy: w.y, s: clampScale(v.s * k, f) };
}

/** 当前视角对应的经纬度范围（用于向服务端查询「别人来过」） */
export function viewBounds(v: View2D, f: Frame): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const tl = screenToWorld(v, f, 0, 0);
  const br = screenToWorld(v, f, f.w, f.h);
  const a = fromWorld(Math.max(0, tl.x), Math.max(0, tl.y));
  const b = fromWorld(Math.min(WORLD - 1, br.x), Math.min(WORLD - 1, br.y));
  return { minLat: b.lat, maxLat: a.lat, minLng: a.lng, maxLng: b.lng };
}

/** 当前可视宽度（世界单位 ≈ km），决定显示哪一级城市与海岸线 */
export function visibleWidth(v: View2D, f: Frame): number {
  return f.w / v.s;
}
