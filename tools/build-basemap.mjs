#!/usr/bin/env node
/**
 * 纸上地图的离线底图：Natural Earth（公有领域）
 *   - 陆地 1:110m（远景）与 1:50m（近景）
 *   - 陆上国界 1:50m
 *   - 城市 1:50m，带中英文名与等级（等级决定在哪个缩放级别出现）
 *
 * 坐标投影为 Web Mercator，世界 = WORLD × WORLD 单位（约 1km/单位），
 * 再做 Douglas-Peucker 简化。输出：apps/mobile/src/map/basemap.ts
 *
 * 数据下载（放在同一目录，默认 /tmp/ne）：
 *   https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
 *   ne_110m_land / ne_50m_land / ne_50m_admin_0_boundary_lines_land / ne_50m_populated_places
 *
 * 用法：node tools/build-basemap.mjs [数据目录]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WORLD = 40000;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ?? '/tmp/ne';
const read = (name) => JSON.parse(readFileSync(join(dir, `${name}.geojson`), 'utf8'));

function project([lng, lat]) {
  const x = ((lng + 180) / 360) * WORLD;
  const c = Math.max(-85, Math.min(85, lat));
  const s = Math.sin((c * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD;
  return [x, y];
}

/** Douglas-Peucker 简化。闭合环（首尾相同）先在离起点最远处切成两段，否则基线长度为 0。 */
function simplify(points, tol) {
  if (points.length < 3) return points;
  const [fx, fy] = points[0];
  const [lx, ly] = points[points.length - 1];
  if (fx === lx && fy === ly) {
    let far = 1;
    let best = -1;
    for (let i = 1; i < points.length - 1; i++) {
      const d = Math.hypot(points[i][0] - fx, points[i][1] - fy);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    const a = simplifyOpen(points.slice(0, far + 1), tol);
    const b = simplifyOpen(points.slice(far), tol);
    return [...a, ...b.slice(1)];
  }
  return simplifyOpen(points, tol);
}

function simplifyOpen(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** 把一组折线写成紧凑的相对坐标 SVG path */
function toPath(lines, tol, close, minPoints) {
  let d = '';
  let count = 0;
  for (const line of lines) {
    const pts = simplify(line.map(project), tol).map(([x, y]) => [Math.round(x), Math.round(y)]);
    if (pts.length < minPoints) continue;
    let prev = null;
    let seg = '';
    for (const [x, y] of pts) {
      if (prev && prev[0] === x && prev[1] === y) continue;
      seg += prev ? `l${x - prev[0]} ${y - prev[1]}` : `M${x} ${y}`;
      prev = [x, y];
      count++;
    }
    d += seg + (close ? 'z' : '');
  }
  return { d, count };
}

function rings(geo) {
  const out = [];
  for (const f of geo.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') out.push(...g.coordinates);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) out.push(...p);
  }
  return out;
}
function lines(geo) {
  const out = [];
  for (const f of geo.features) {
    const g = f.geometry;
    if (g.type === 'LineString') out.push(g.coordinates);
    else if (g.type === 'MultiLineString') out.push(...g.coordinates);
  }
  return out;
}

const land110 = toPath(rings(read('ne_110m_land')), 12, true, 4);
const land50 = toPath(rings(read('ne_50m_land')), 3, true, 4);
const borders = toPath(lines(read('ne_50m_admin_0_boundary_lines_land')), 3, false, 2);

// 城市：[英文名, 中文名, 纬度, 经度, 等级 0–10（越小越重要）, 国家代码]
const cities = read('ne_50m_populated_places')
  .features.map((f) => {
    const p = f.properties;
    const name = p.NAME_EN || p.NAME;
    const zh = (p.NAME_ZH || '').replace(/\s+/g, '');
    return [name, zh, Math.round(p.LATITUDE * 1e4) / 1e4, Math.round(p.LONGITUDE * 1e4) / 1e4, p.SCALERANK, p.ISO_A2 === '-99' ? p.ADM0_A3.slice(0, 2) : p.ISO_A2];
  })
  .sort((a, b) => a[4] - b[4] || a[0].localeCompare(b[0]));

const out = `// 由 tools/build-basemap.mjs 生成，请勿手改。
// 数据：Natural Earth（公有领域）。坐标：Web Mercator，世界 = ${WORLD}×${WORLD} 单位（约 1km/单位）。
export const WORLD = ${WORLD};
/** 1:110m 陆地，远景用 */
export const LAND_COARSE = '${land110.d}';
/** 1:50m 陆地，近景用 */
export const LAND_FINE = '${land50.d}';
/** 1:50m 陆上国界 */
export const BORDERS = '${borders.d}';
/** 城市：[英文名, 中文名, 纬度, 经度, 等级 0–10（越小越重要）, 国家代码] */
export type City = [string, string, number, number, number, string];
export const CITIES: City[] = ${JSON.stringify(cities)};
`;
writeFileSync(join(root, 'apps/mobile/src/map/basemap.ts'), out);
console.log(
  `basemap.ts ${(out.length / 1024).toFixed(0)} KB — land110 ${land110.count} pts, land50 ${land50.count} pts, borders ${borders.count} pts, ${cities.length} cities`,
);
