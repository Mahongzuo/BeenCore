/**
 * 纸上地图：不需要网络、不需要 key 的地图。
 *
 * 像一张测绘图：海岸线、国界、城市名、经纬网，以及痕迹。
 * - 拖动平移，双指或滚轮缩放，右侧 +/− 与「回到我的印记」。
 * - 单击空白处：交给上层（落一枚待盖的印，或取消选中）。
 * - 单击标记：选中我的印记 / 打开别人来过或历史的地点。
 *
 * 性能：手势进行中只对整层做 transform（GPU），松手后再按新视角重算标记与文字。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Path } from 'react-native-svg';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { T } from '@/ui/T';
import { Icon } from '@/ui/Icon';
import { BORDERS, CITIES, LAND_COARSE, LAND_FINE, WORLD } from './basemap';
import { DOT_SIZE, PendingPin, PIN_SIZE, TraceDot } from './TraceDot';
import { MARK_SIZE, PlaceMark } from './marks';
import type { PlacePoint, TraceMapProps } from './types';
import {
  commitTransform,
  fitView,
  fromWorld,
  screenToWorld,
  toScreen,
  toWorld,
  viewBounds,
  visibleWidth,
  zoomAt,
  type Frame,
  type View2D,
} from './viewport';

const CLUSTER_PX = 26;
const HIT_PX = 22;
const TAP_SLOP = 6;

type Hit =
  | { kind: 'mine'; x: number; y: number; ids: string[]; count: number; family: boolean }
  | { kind: 'place'; x: number; y: number; place: PlacePoint };

function niceStep(spanDeg: number): number {
  const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 45];
  for (const s of steps) if (spanDeg / s <= 6) return s;
  return 60;
}

function fmtDeg(v: number, pos: string, neg: string): string {
  const a = Math.abs(v);
  const s = a >= 1 || a === 0 ? String(Math.round(a * 100) / 100) : a.toFixed(2);
  return `${s}°${v >= 0 ? pos : neg}`;
}

/** 可视宽度（km）对应显示到第几级城市 */
function cityRankFor(widthKm: number): number {
  if (widthKm > 16000) return 0;
  if (widthKm > 8000) return 1;
  if (widthKm > 4000) return 2;
  if (widthKm > 2000) return 3;
  if (widthKm > 900) return 4;
  if (widthKm > 400) return 6;
  return 10;
}

export function PaperMap({
  traces,
  selectedId,
  onSelect,
  onMapPress,
  onOpenPlace,
  onViewportChange,
  pin,
  places = [],
  focus,
  refit = 0,
  bottomInset,
  topInset,
}: TraceMapProps) {
  const { c } = useTheme();
  const { t, lang } = useT();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const frame: Frame = useMemo(() => ({ w: size.w, h: size.h, top: topInset, bottom: bottomInset }), [size, topInset, bottomInset]);
  const [view, setView] = useState<View2D | null>(null);

  const placed = useMemo(() => traces.filter((x) => x.place), [traces]);
  const pts = useMemo(() => placed.map((x) => ({ lat: x.place!.lat, lng: x.place!.lng })), [placed]);

  // 印记集合变化（比如时光滑轨换了年份）时重新取景
  const fitKey = placed.map((x) => x.id).join(',');
  const fit = useCallback(() => {
    if (frame.w) setView(fitView(pts, frame));
  }, [pts, frame]);
  // 传送中（focus 不为空）时不自动取景，否则印记数据一加载就会把视角拉回去
  useEffect(() => {
    if (focus) return;
    fit();
  }, [fitKey, frame.w, frame.h, refit, focus?.seq ?? null]); // eslint-disable-line react-hooks/exhaustive-deps

  // 传送：飞到某处
  useEffect(() => {
    if (!focus || !frame.w) return;
    const w = toWorld(focus.lat, focus.lng);
    const s = Math.max(0.001, (frame.w - 48) / focus.spanKm);
    // 让目的地落在可视区域中央
    setView({ cx: w.x, cy: w.y, s: Math.min(s, 60) });
  }, [focus?.seq, frame.w]); // eslint-disable-line react-hooks/exhaustive-deps

  // 视角停下后回报范围
  useEffect(() => {
    if (view && frame.w && onViewportChange) onViewportChange(viewBounds(view, frame));
  }, [view, frame, onViewportChange]);

  /* ---------------------------- 手势 ---------------------------- */

  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const k = useRef(new Animated.Value(1)).current;
  const g = useRef({ startX: 0, startY: 0, startT: 0, moved: false, pinch: 0, midX: 0, midY: 0, k: 1, tx: 0, ty: 0, touches: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const hitsRef = useRef<Hit[]>([]);
  const tapRef = useRef<(x: number, y: number) => void>(() => {});

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const n = e.nativeEvent;
          g.current = { startX: n.locationX, startY: n.locationY, startT: Date.now(), moved: false, pinch: 0, midX: 0, midY: 0, k: 1, tx: 0, ty: 0, touches: 1 };
        },
        onPanResponderMove: (e, gs) => {
          const touches = e.nativeEvent.touches;
          const st = g.current;
          const f = frameRef.current;
          if (touches && touches.length >= 2) {
            const [a, b] = touches;
            const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            const mx = (a.locationX + b.locationX) / 2;
            const my = (a.locationY + b.locationY) / 2;
            if (!st.pinch) {
              st.pinch = dist / st.k;
              st.midX = mx - st.tx;
              st.midY = my - st.ty;
            }
            st.moved = true;
            st.touches = 2;
            const kk = Math.max(0.2, Math.min(8, dist / st.pinch));
            // 让双指中点下的地点跟着手指走
            st.k = kk;
            st.tx = (1 - kk) * (st.midX - f.w / 2) + (mx - st.midX);
            st.ty = (1 - kk) * (st.midY - f.h / 2) + (my - st.midY);
          } else {
            if (Math.abs(gs.dx) > TAP_SLOP || Math.abs(gs.dy) > TAP_SLOP) st.moved = true;
            if (st.touches === 2) return; // 双指松开一指时不跳动
            st.tx = gs.dx;
            st.ty = gs.dy;
          }
          tx.setValue(st.tx);
          ty.setValue(st.ty);
          k.setValue(st.k);
        },
        onPanResponderRelease: () => {
          const st = g.current;
          const v = viewRef.current;
          if (!st.moved) {
            tapRef.current(st.startX, st.startY);
          } else if (v) {
            setView(commitTransform(v, frameRef.current, st.k, st.tx, st.ty));
          }
          tx.setValue(0);
          ty.setValue(0);
          k.setValue(1);
        },
      }),
    [tx, ty, k],
  );

  // Web：滚轮缩放（以光标为中心）
  const hostRef = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = hostRef.current as unknown as HTMLElement | null;
    if (!el || !el.addEventListener) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-ev.deltaY * 0.0018);
      setView(zoomAt(v, frameRef.current, factor, ev.clientX - rect.left, ev.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [size.w]);

  /* ---------------------- 由视角派生的图层 ---------------------- */

  const derived = useMemo(() => {
    if (!view || !frame.w) return null;
    const widthKm = visibleWidth(view, frame);
    const scr = (lat: number, lng: number) => {
      const w = toWorld(lat, lng);
      return toScreen(view, frame, w.x, w.y);
    };
    const onScreen = (p: { x: number; y: number }, pad = 40) =>
      p.x > -pad && p.x < frame.w + pad && p.y > -pad && p.y < frame.h + pad;

    // 我的印记：屏幕空间聚合
    const mine: Extract<Hit, { kind: 'mine' }>[] = [];
    for (const x of [...placed].sort((a, b) => b.happenedAt - a.happenedAt)) {
      const p = scr(x.place!.lat, x.place!.lng);
      if (!onScreen(p)) continue;
      // 亲友的印记单独成团，颜色不同，不和「我」的混在一起
      const family = x.ownerId != null;
      const near = mine.find((m) => m.family === family && Math.abs(m.x - p.x) < CLUSTER_PX && Math.abs(m.y - p.y) < CLUSTER_PX);
      if (near) {
        near.count++;
        near.ids.push(x.id);
      } else mine.push({ kind: 'mine', x: p.x, y: p.y, ids: [x.id], count: 1, family });
    }

    // 别人来过 / 历史：靠得太近的只留人数多的那个
    const others: Extract<Hit, { kind: 'place' }>[] = [];
    for (const pl of [...places].sort((a, b) => b.count - a.count)) {
      const p = scr(pl.lat, pl.lng);
      if (!onScreen(p)) continue;
      if (mine.some((m) => Math.abs(m.x - p.x) < CLUSTER_PX && Math.abs(m.y - p.y) < CLUSTER_PX)) continue;
      if (others.some((o) => Math.abs(o.x - p.x) < MARK_SIZE && Math.abs(o.y - p.y) < MARK_SIZE)) continue;
      others.push({ kind: 'place', x: p.x, y: p.y, place: pl });
    }

    // 城市名：按等级、避让
    const maxRank = cityRankFor(widthKm);
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [...mine, ...others].map((m) => ({
      x0: m.x - 16,
      y0: m.y - 16,
      x1: m.x + 16,
      y1: m.y + 16,
    }));
    const cities: { x: number; y: number; label: string; major: boolean }[] = [];
    for (const [name, zh, lat, lng, rank] of CITIES) {
      if (rank > maxRank) break; // CITIES 按等级排序
      const p = scr(lat, lng);
      if (!onScreen(p, 0) || p.y < frame.top || p.y > frame.h - frame.bottom) continue;
      const label = lang === 'zh' && zh ? zh : name;
      const wpx = label.length * (lang === 'zh' && zh ? 12 : 6.6) + 10;
      if (p.x + wpx > frame.w - 4) continue; // 贴着右边缘放不下，就不画
      const box = { x0: p.x - 3, y0: p.y - 8, x1: p.x + wpx, y1: p.y + 8 };
      if (taken.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
      taken.push(box);
      cities.push({ x: p.x, y: p.y, label, major: rank <= 1 });
      if (cities.length > 60) break;
    }

    // 经纬网：直接用世界坐标换算经度，避免在显示全世界时因取模绕回而错乱
    const tlW = screenToWorld(view, frame, 0, 0);
    const brW = screenToWorld(view, frame, frame.w, frame.h);
    const lng0 = Math.max(-180, (tlW.x / WORLD) * 360 - 180);
    const lng1 = Math.min(180, (brW.x / WORLD) * 360 - 180);
    const latTop = fromWorld(0, Math.max(0, tlW.y)).lat;
    const latBottom = fromWorld(0, Math.min(WORLD, brW.y)).lat;
    const step = niceStep(Math.max(lng1 - lng0, latTop - latBottom));
    const lngs: { v: number; x: number }[] = [];
    for (let v = Math.ceil(lng0 / step) * step; v <= lng1; v += step) lngs.push({ v, x: scr(0, v).x });
    const lats: { v: number; y: number }[] = [];
    for (let v = Math.ceil(latBottom / step) * step; v <= latTop; v += step) {
      if (Math.abs(v) <= 80) lats.push({ v, y: scr(v, 0).y });
    }

    return { widthKm, mine, others, cities, lngs, lats };
  }, [view, frame, placed, places, lang]);

  hitsRef.current = derived ? [...derived.mine, ...derived.others] : [];
  tapRef.current = (x: number, y: number) => {
    const v = viewRef.current;
    if (!v) return;
    let best: Hit | null = null;
    let bestD = HIT_PX;
    for (const h of hitsRef.current) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bestD || (d <= HIT_PX && h.kind === 'mine' && best?.kind !== 'mine')) {
        best = h;
        bestD = d;
      }
    }
    if (best?.kind === 'mine') {
      const ids = best.ids;
      if (best.count > 1 && !ids.includes(selectedId ?? '')) {
        // 一团聚在一起的印记：先放大到这一团
        const group = placed.filter((p) => ids.includes(p.id)).map((p) => ({ lat: p.place!.lat, lng: p.place!.lng }));
        const next = fitView(group, frameRef.current);
        if (next.s > v.s * 1.2) {
          setView(next);
          return;
        }
      }
      onSelect(ids[0]);
      return;
    }
    if (best?.kind === 'place') {
      onOpenPlace?.(best.place);
      return;
    }
    const w = screenToWorld(v, frameRef.current, x, y);
    const ll = fromWorld(w.x, w.y);
    onMapPress?.({ lat: Math.round(ll.lat * 1e5) / 1e5, lng: Math.round(ll.lng * 1e5) / 1e5 });
  };

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const zoomBy = (factor: number) => view && setView(zoomAt(view, frame, factor, frame.w / 2, frame.top + (frame.h - frame.top - frame.bottom) / 2));

  const fine = !!derived && derived.widthKm < 7000;
  const transform = view ? `translate(${frame.w / 2 - view.cx * view.s} ${frame.top + (frame.h - frame.top - frame.bottom) / 2 - view.cy * view.s}) scale(${view.s})` : '';
  const pinScreen = pin && view ? (() => {
    const w = toWorld(pin.lat, pin.lng);
    return toScreen(view, frame, w.x, w.y);
  })() : null;

  return (
    <View ref={hostRef} style={[StyleSheet.absoluteFill, { backgroundColor: c.mapWater, overflow: 'hidden' }]} onLayout={onLayout}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: tx }, { translateY: ty }, { scale: k }] }]}
        {...responder.panHandlers}>
        {view && size.w > 0 && (
          <Svg width={size.w} height={size.h} pointerEvents="none">
            <G transform={transform}>
              <Path d={fine ? LAND_FINE : LAND_COARSE} fill={c.paper} stroke={c.mapBorder} strokeWidth={1 / view.s} />
              {derived && derived.widthKm < 12000 && (
                <Path d={BORDERS} fill="none" stroke={c.mapBorder} strokeWidth={1 / view.s} strokeDasharray={`${4 / view.s} ${3 / view.s}`} />
              )}
            </G>
            {derived?.lngs.map((l) => (
              <Line key={`x${l.v}`} x1={l.x} x2={l.x} y1={0} y2={size.h} stroke={c.rule} strokeWidth={1} strokeDasharray="2 6" />
            ))}
            {derived?.lats.map((l) => (
              <Line key={`y${l.v}`} x1={0} x2={size.w} y1={l.y} y2={l.y} stroke={c.rule} strokeWidth={1} strokeDasharray="2 6" />
            ))}
          </Svg>
        )}

        {derived?.cities.map((ct) => (
          <View key={`${ct.label}${ct.x}`} pointerEvents="none" style={{ position: 'absolute', left: ct.x - 2.5, top: ct.y - 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.inkFaint }} />
            <T variant="meta" tone={ct.major ? 'soft' : 'faint'} weight={ct.major ? 'medium' : 'regular'} numberOfLines={1}>{ct.label}</T>
          </View>
        ))}

        {derived?.others.map((o) => (
          <View
            key={o.place.key}
            pointerEvents="none"
            accessibilityLabel={o.place.name ?? undefined}
            style={{ position: 'absolute', left: o.x - MARK_SIZE / 2, top: o.y - MARK_SIZE / 2 }}>
            <PlaceMark place={o.place} />
          </View>
        ))}

        {derived?.mine.map((m) => (
          <View key={m.ids[0]} pointerEvents="none" style={{ position: 'absolute', left: m.x - DOT_SIZE / 2, top: m.y - DOT_SIZE / 2 }}>
            <TraceDot selected={!!selectedId && m.ids.includes(selectedId)} count={m.count} tone={m.family ? 'ink' : 'stamp'} />
          </View>
        ))}

        {pinScreen && (
          <View pointerEvents="none" style={{ position: 'absolute', left: pinScreen.x - PIN_SIZE / 2, top: pinScreen.y - PIN_SIZE / 2 }}>
            <PendingPin />
          </View>
        )}
      </Animated.View>

      {/* 经纬度读数：像测绘图的边框 */}
      {derived?.lats.map((l) =>
        l.y > topInset + 8 && l.y < size.h - bottomInset - 24 ? (
          <T key={`ly${l.v}`} variant="meta" tone="faint" style={{ position: 'absolute', left: 8, top: l.y - 16 }} pointerEvents="none">
            {fmtDeg(l.v, 'N', 'S')}
          </T>
        ) : null,
      )}
      {derived?.lngs.map((l) =>
        l.x > 40 && l.x < size.w - 80 ? (
          <T key={`lx${l.v}`} variant="meta" tone="faint" style={{ position: 'absolute', bottom: bottomInset + 6, left: l.x + 4 }} pointerEvents="none">
            {fmtDeg(l.v, 'E', 'W')}
          </T>
        ) : null,
      )}

      {/* 缩放与回到我的印记 */}
      <View style={{ position: 'absolute', right: 12, bottom: bottomInset + 28, gap: 8 }} pointerEvents="box-none">
        <MapButton icon="plus" label={t.map.zoomIn} onPress={() => zoomBy(2)} />
        <MapButton icon="minus" label={t.map.zoomOut} onPress={() => zoomBy(0.5)} />
        <MapButton icon="locate" label={t.map.fit} onPress={fit} />
      </View>
    </View>
  );
}

function MapButton({ icon, label, onPress }: { icon: 'plus' | 'minus' | 'locate'; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: c.sheet,
        borderWidth: 1,
        borderColor: c.rule,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <Icon name={icon} size={20} color={c.inkSoft} />
    </Pressable>
  );
}
