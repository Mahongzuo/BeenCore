import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  encodeGeohash,
  formatTraceDate,
  historyPlaces,
  isSealed,
  monthDensity,
  onThisDay,
  sameDay,
  yearDensity,
  yearsAgo,
  type Person,
  type Seed,
  type Trace,
} from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useNow, usePersons, useTraces } from '@/data/hooks';
import { memorials, walls } from '@/data/sync';
import seedData from '@/data/seeds.json';
import { nameOf } from '@/lib/location';
import { openInGoogleMaps } from '@/lib/openMaps';
import { updateSettings, useSettings, type Layers } from '@/lib/settings';
import { TraceMap, hasGoogleMaps } from '@/map/TraceMap';
import { HistoryMark, MemorialMark, OthersMark } from '@/map/marks';
import { TraceDot } from '@/map/TraceDot';
import type { Bounds, LatLng, PlacePoint } from '@/map/types';
import { T } from '@/ui/T';
import { Postmark, stampLabels } from '@/ui/Postmark';
import { TimeRail, type TimeSel } from '@/ui/TimeRail';
import { Icon } from '@/ui/Icon';
import { IconButton, PrimaryButton, QuietButton } from '@/ui/controls';

const RAIL_HEIGHT = 66;
const HISTORY: PlacePoint[] = historyPlaces(seedData as Seed[]).map((h) => ({ ...h, kind: 'history' }));

export default function MapScreen() {
  const { c } = useTheme();
  const { t, locale } = useT();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { traces, loading } = useTraces();
  const { traces: everyone } = useTraces('all');
  const { persons } = usePersons();
  const { layers } = useSettings();
  const [time, setTime] = useState<TimeSel>({ year: null, month: null });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paper, setPaper] = useState(false);
  const [panel, setPanel] = useState<'layers' | 'time' | null>(null);
  const layersOpen = panel === 'layers';
  const setLayersOpen = (open: boolean) => setPanel(open ? 'layers' : null);

  /* 传送：从传送页带着目的地回来 */
  const params = useLocalSearchParams<{ to?: string; toName?: string; toSpan?: string; seq?: string }>();
  const [focus, setFocus] = useState<{ lat: number; lng: number; spanKm: number; seq: number } | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const [refit, setRefit] = useState(0);
  useEffect(() => {
    if (!params.to || !params.seq) return;
    const [la, ln] = params.to.split(',').map(Number);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    setFocus({ lat: la, lng: ln, spanKm: Number(params.toSpan) || 60, seq: Number(params.seq) });
    setArrived(params.toName || null);
    setPanel(null);
    setSelectedId(null);
    setPending(null);
  }, [params.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  /** 结束传送，回到我的印记 */
  const goHome = () => {
    setArrived(null);
    setFocus(null);
    setRefit((n) => n + 1);
  };
  // 点地图空白处落下的临时图钉
  const [pending, setPending] = useState<(LatLng & { name?: string | null; country?: string | null }) | null>(null);

  /* 「别人来过」：视角停下后按范围加载（离线或没有服务端时静默为空） */
  const [others, setOthers] = useState<PlacePoint[]>([]);
  const [memorialPts, setMemorialPts] = useState<PlacePoint[]>([]);
  const lastBox = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onViewportChange = useCallback(
    (b: Bounds) => {
      if (!layers.others && !layers.memorials) return;
      const box = [b.minLat, b.maxLat, b.minLng, b.maxLng].map((n) => n.toFixed(2)).join(',');
      if (box === lastBox.current) return;
      lastBox.current = box;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (layers.others) {
          walls
            .inView(b)
            .then((list) => setOthers(list.map((w) => ({ ...w, kind: 'others' as const }))))
            .catch(() => {});
        }
        if (layers.memorials) {
          memorials
            .inView(b)
            .then((list) => setMemorialPts(list.map((m) => ({ key: m.id, kind: 'memorial' as const, lat: m.lat, lng: m.lng, count: 1, name: m.name }))))
            .catch(() => {});
        }
      }, 400);
    },
    [layers.others, layers.memorials],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const places = useMemo(
    () => [...(layers.memorials ? memorialPts : []), ...(layers.others ? others : []), ...(layers.history ? HISTORY : [])],
    [layers.others, layers.history, layers.memorials, others, memorialPts],
  );

  const dropPin = (p: LatLng) => {
    setPending(p);
    nameOf(p.lat, p.lng).then((n) =>
      setPending((cur) => (cur && cur.lat === p.lat && cur.lng === p.lng ? { ...cur, ...n } : cur)),
    );
  };
  const select = (id: string | null) => {
    setSelectedId(id);
    setPending(null);
  };
  /** 点地图空白处：有选中或图钉时先收起；否则落一枚待盖的印 */
  const onMapPress = (p: LatLng) => {
    setPanel(null);
    if (selectedId || pending) {
      select(null);
      return;
    }
    dropPin(p);
  };

  // 亲友与宠物的印记：图层打开时才出现，墨色
  const showFamily = layers.family && persons.length > 0;
  const visible = useMemo(() => {
    const inTime = (x: Trace) => {
      if (isSealed(x, now)) return false;
      const d = new Date(x.happenedAt);
      if (time.year !== null && d.getFullYear() !== time.year) return false;
      if (time.month !== null && (x.precision === 'year' || d.getMonth() !== time.month)) return false;
      return true;
    };
    return [
      ...(layers.mine ? traces.filter(inTime) : []),
      ...(showFamily ? everyone.filter((x) => x.ownerId != null && inTime(x)) : []),
    ];
  }, [traces, everyone, time, now, layers.mine, showFamily]);
  const years = useMemo(() => yearDensity(traces, now), [traces, now]);
  const months = useMemo(() => (time.year !== null ? monthDensity(traces, time.year) : []), [traces, time.year]);

  /** 时光机：回到某一天。那天有印记就选中第一枚，没有就打开那个月 */
  const travelTo = (ts: number) => {
    setFocus(null);
    setArrived(null);
    const d = new Date(ts);
    setTime({ year: d.getFullYear(), month: d.getMonth() });
    const hit = traces.find((x) => x.precision === 'day' && !isSealed(x, now) && sameDay(x.happenedAt, ts));
    setPending(null);
    setSelectedId(hit?.id ?? null);
    setPanel(null);
  };
  const today = useMemo(() => onThisDay(traces, now), [traces, now]);
  const selected = visible.find((x) => x.id === selectedId) ?? null;
  const topInset = insets.top + 56;
  const empty = !loading && traces.length === 0;

  const emptyCard = (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom: 24, maxWidth: 440, padding: 24, borderRadius: 8, backgroundColor: c.sheet, borderWidth: 1, borderColor: c.rule, gap: 8 }}>
      <T variant="title" weight="semi">{t.map.emptyTitle}</T>
      <T variant="small" tone="soft" style={{ marginBottom: 12 }}>{t.map.emptyBody}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
        <PrimaryButton label={t.stamp} onPress={() => router.push('/compose')} />
        <QuietButton label={t.import.entry} icon="camera" tone="stamp" onPress={() => router.push('/import')} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TraceMap
        traces={visible}
        selectedId={selectedId}
        onSelect={select}
        onMapPress={onMapPress}
        onOpenPlace={(p) => router.push(p.kind === 'memorial' ? `/memorial/${p.key}` : `/wall/${p.key}`)}
        onPoiPress={(p) =>
          router.push({
            pathname: '/wall/[key]',
            params: { key: encodeGeohash(p.lat, p.lng), poi: p.poiId, name: p.name ?? '', lat: String(p.lat), lng: String(p.lng) },
          })
        }
        landmarks={layers.landmarks}
        focus={focus}
        refit={refit}
        onViewportChange={onViewportChange}
        places={places}
        pin={pending}
        topInset={topInset}
        bottomInset={(empty ? 0 : RAIL_HEIGHT) + (pending ? 190 : selected ? 130 : 0)}
        paper={paper}
      />

      {/* 顶栏 */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top,
          left: 0,
          right: 0,
          height: 56,
          paddingLeft: 20,
          paddingRight: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <T variant="title" weight="semi" style={{ letterSpacing: -0.3 }}>
          {t.appName}
        </T>
        <View style={{ flexDirection: 'row' }}>
          {hasGoogleMaps && (
            <IconButton name={paper ? 'map' : 'pin'} label="Map style" onPress={() => setPaper((p) => !p)} />
          )}
          <IconButton name="clock" label={t.map.timeMachine} onPress={() => setPanel((p) => (p === 'time' ? null : 'time'))} />
          <IconButton name="compass" label={t.map.teleport} onPress={() => router.push('/teleport')} />
          <IconButton name="layers" label={t.map.layers} onPress={() => setPanel((p) => (p === 'layers' ? null : 'layers'))} />
        </View>
      </View>

      {layersOpen && <LayersPanel top={insets.top + 52} layers={layers} hasFamily={persons.length > 0} />}
      {panel === 'time' && <TimeMachinePanel top={insets.top + 52} traces={traces} now={now} onTravel={travelTo} />}

      {arrived !== null && !panel && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 52,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingLeft: 14,
            paddingRight: 6,
            height: 36,
            borderRadius: 18,
            backgroundColor: c.sheet,
            borderWidth: 1,
            borderColor: c.rule,
          }}>
          <T variant="small" weight="medium">{arrived ? t.map.arrived(arrived) : t.map.teleport}</T>
          <Pressable onPress={goHome} hitSlop={8} style={{ paddingHorizontal: 8, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: c.stampWash }}>
            <T variant="meta" weight="semi" tone="stamp">{t.map.fit}</T>
          </Pressable>
        </View>
      )}

      {today.length > 0 && !empty && !panel && arrived === null && (
        <Pressable
          onPress={() => router.push(`/trace/${today[0].id}`)}
          style={{
            position: 'absolute',
            top: insets.top + 52,
            alignSelf: 'center',
            paddingHorizontal: 14,
            height: 32,
            borderRadius: 16,
            backgroundColor: c.sheet,
            borderWidth: 1,
            borderColor: c.rule,
            justifyContent: 'center',
          }}>
          <T variant="small" tone="stamp" weight="medium">
            {t.map.onThisDay(today.length)}
          </T>
        </Pressable>
      )}

      {empty && !pending && emptyCard}

      {time.year !== null && visible.length === 0 && !empty && !pending && arrived === null && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: RAIL_HEIGHT + 24, alignItems: 'center' }}>
          <T variant="small" tone="soft" align="center">
            {time.month !== null ? t.map.noTracesInMonth(time.year, time.month) : t.map.noTracesInYear(time.year)}
          </T>
        </View>
      )}

      {/* 底部：待盖的印 / 选中的印记 + 时光滑轨 */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
        {pending && (
          <View
            style={{ marginHorizontal: 12, marginBottom: 10, padding: 16, borderRadius: 10, backgroundColor: c.sheet, borderWidth: 1, borderColor: c.rule, gap: 4 }}>
            <T variant="meta" tone="soft">{t.map.here}</T>
            <T variant="title" weight="semi" numberOfLines={1}>
              {pending.name === undefined ? t.compose.locating : pending.name ?? `${pending.lat.toFixed(3)}, ${pending.lng.toFixed(3)}`}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 10 }}>
              <PrimaryButton
                label={t.map.leaveHere}
                onPress={() => {
                  const p = pending;
                  setPending(null);
                  router.push({
                    pathname: '/compose',
                    params: { lat: String(p.lat), lng: String(p.lng), name: p.name ?? '', country: p.country ?? '' },
                  });
                }}
              />
              <QuietButton label={t.compose.cancel} tone="soft" onPress={() => setPending(null)} />
            </View>
            <QuietButton
              label={t.google.lookHere}
              icon="share"
              tone="soft"
              onPress={() => openInGoogleMaps({ lat: pending.lat, lng: pending.lng })}
              style={{ paddingVertical: 4, marginTop: 4 }}
            />
          </View>
        )}
        {selected && (
          <SelectedCard
            trace={selected}
            siblings={visible.filter((x) => x.placeKey && x.placeKey === selected.placeKey && (x.ownerId ?? null) === (selected.ownerId ?? null))}
            onSelect={select}
            locale={locale}
            owner={selected.ownerId ? persons.find((p) => p.id === selected.ownerId) ?? null : null}
          />
        )}
        {!empty && (
          <View style={{ backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.rule, height: RAIL_HEIGHT, justifyContent: 'center' }}>
            <TimeRail years={years} months={months} value={time} onChange={(v) => { setTime(v); select(null); setFocus(null); setArrived(null); }} />
          </View>
        )}
      </View>
    </View>
  );
}

/** 时光机：回到 1 / 5 / 10 年前的今天，或者随便回到一天 */
function TimeMachinePanel({ top, traces, now, onTravel }: { top: number; traces: Trace[]; now: number; onTravel: (ts: number) => void }) {
  const { c } = useTheme();
  const { t, locale } = useT();
  const live = traces.filter((x) => !isSealed(x, now));
  const days = live.filter((x) => x.precision === 'day');
  const first = live.length ? Math.min(...live.map((x) => new Date(x.happenedAt).getFullYear())) : new Date(now).getFullYear();
  const options = [1, 5, 10]
    .map((n) => ({ n, ts: yearsAgo(now, n) }))
    .filter((o) => new Date(o.ts).getFullYear() >= first);
  const fmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' });

  const row = (key: string, label: string, sub: string, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flex: 1 }}>
        <T variant="ui" weight="medium">{label}</T>
        <T variant="meta" tone="faint">{sub}</T>
      </View>
      <Icon name="chevronRight" size={18} color={c.inkFaint} />
    </Pressable>
  );

  return (
    <View
      style={{
        position: 'absolute',
        top,
        right: 12,
        width: 300,
        maxWidth: '92%',
        padding: 14,
        borderRadius: 10,
        backgroundColor: c.sheet,
        borderWidth: 1,
        borderColor: c.rule,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      }}>
      <T variant="small" weight="semi" tone="soft" style={{ marginBottom: 2 }}>{t.map.timeMachine}</T>
      {live.length === 0 ? (
        <T variant="small" tone="soft" style={{ paddingVertical: 8 }}>{t.map.noTracesYet}</T>
      ) : (
        <>
          {options.map((o) => {
            const n = days.filter((x) => sameDay(x.happenedAt, o.ts)).length;
            return row(`y${o.n}`, t.map.yearsAgoToday(o.n), `${fmt.format(o.ts)}, ${t.map.tracesThatDay(n)}`, () => onTravel(o.ts));
          })}
          {days.length > 0 &&
            row('random', t.map.randomDay, t.map.randomDaySub, () => {
              const pick = days[Math.floor(Math.random() * days.length)];
              onTravel(pick.happenedAt);
            })}
        </>
      )}
    </View>
  );
}

/** 图层：每一层都只是「看见」，没有互动 */
function LayersPanel({ top, layers, hasFamily }: { top: number; layers: Layers; hasFamily: boolean }) {
  const { c } = useTheme();
  const { t } = useT();
  const row = (key: keyof Layers, label: string, hint: string | null, mark: React.ReactNode) => (
    <Pressable
      key={key}
      accessibilityRole="switch"
      accessibilityState={{ checked: layers[key] }}
      onPress={() => updateSettings({ layers: { ...layers, [key]: !layers[key] } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 32, alignItems: 'center', opacity: layers[key] ? 1 : 0.35 }}>{mark}</View>
      <View style={{ flex: 1 }}>
        <T variant="ui" weight="medium" tone={layers[key] ? 'ink' : 'faint'}>{label}</T>
        {hint ? <T variant="meta" tone="faint">{hint}</T> : null}
      </View>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: layers[key] ? c.stamp : c.inkFaint, alignItems: 'center', justifyContent: 'center' }}>
        {layers[key] && <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: c.stamp }} />}
      </View>
    </Pressable>
  );
  return (
    <View
      style={{
        position: 'absolute',
        top,
        right: 12,
        width: 300,
        maxWidth: '92%',
        padding: 14,
        borderRadius: 10,
        backgroundColor: c.sheet,
        borderWidth: 1,
        borderColor: c.rule,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      }}>
      <T variant="small" weight="semi" tone="soft" style={{ marginBottom: 2 }}>{t.map.layers}</T>
      {row('mine', t.map.layerMine, null, <TraceDot />)}
      {row('others', t.map.layerOthers, t.map.layerOthersHint, <OthersMark count={7} />)}
      {hasFamily && row('family', t.map.layerFamily, t.map.layerFamilyHint, <TraceDot tone="ink" />)}
      {row('memorials', t.map.layerMemorials, t.map.layerMemorialsHint, <MemorialMark />)}
      {row('history', t.map.layerHistory, t.map.layerHistoryHint, <HistoryMark count={30} />)}
      {hasGoogleMaps && row('landmarks', t.map.layerLandmarks, t.map.layerLandmarksHint, <Icon name="pin" size={22} color={c.inkSoft} />)}
      <T variant="meta" tone="faint" style={{ marginTop: 6 }}>{t.map.tapHint}</T>
    </View>
  );
}

function SelectedCard({
  trace,
  siblings,
  onSelect,
  locale,
  owner,
}: {
  trace: Trace;
  siblings: Trace[];
  onSelect: (id: string) => void;
  locale: string;
  /** 亲友档案里的印记：卡片上写明是谁的，邮戳用墨色 */
  owner: Person | null;
}) {
  const { c } = useTheme();
  const { t } = useT();
  const idx = siblings.findIndex((s) => s.id === trace.id);
  const labels = stampLabels(trace, locale, t.trace.unknownPlace);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/trace/${trace.id}`)}
      style={({ pressed }) => ({
        marginHorizontal: 12,
        marginBottom: 10,
        padding: 14,
        borderRadius: 10,
        backgroundColor: c.sheet,
        borderWidth: 1,
        borderColor: c.rule,
        flexDirection: 'row',
        gap: 14,
        alignItems: 'center',
        opacity: pressed ? 0.92 : 1,
      })}>
      <Postmark diameter={72} {...labels} tilt={-4} color={owner ? c.ink : undefined} opacity={owner ? 0.8 : undefined} />
      <View style={{ flex: 1, gap: 2 }}>
        {owner && (
          <T variant="meta" weight="semi" tone="ink">{t.people.whose(owner.name)}</T>
        )}
        <T variant="meta" tone="soft">
          {formatTraceDate(trace.happenedAt, trace.precision, locale)}
          {trace.place?.name ? `, ${trace.place.name}` : ''}
        </T>
        <T variant="ui" serif numberOfLines={2} italic={!trace.text} tone={trace.text ? 'ink' : 'soft'} style={{ lineHeight: 23 }}>
          {trace.text || t.traces.photoCount(trace.photoIds.length)}
        </T>
        {siblings.length > 1 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Pressable hitSlop={8} onPress={() => onSelect(siblings[(idx - 1 + siblings.length) % siblings.length].id)}>
              <Icon name="chevronLeft" size={18} color={c.inkSoft} />
            </Pressable>
            <T variant="meta" tone="soft">
              {idx + 1} / {siblings.length}
            </T>
            <Pressable hitSlop={8} onPress={() => onSelect(siblings[(idx + 1) % siblings.length].id)}>
              <Icon name="chevronRight" size={18} color={c.inkSoft} />
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}
