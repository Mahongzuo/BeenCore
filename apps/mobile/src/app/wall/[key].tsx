/**
 * 地点墙：谁来过这里。
 *
 * 邮戳的圆心写着「你是第几位」。下面是两条时间线：
 * 在你之前（历史人物，离线可见），以及也来过这里的人（联网后可见）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { decodeGeohash, isGeohash, ordinal, seedsNear, type Seed, type WallNote, type WallSummary } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useTrace } from '@/data/hooks';
import { ApiError, walls } from '@/data/sync';
import { useSettings } from '@/lib/settings';
import { T } from '@/ui/T';
import { IconButton, PrimaryButton, QuietButton, Rule } from '@/ui/controls';
import { openInGoogleMaps } from '@/lib/openMaps';
import { Icon } from '@/ui/Icon';
import { Postmark } from '@/ui/Postmark';
import seedData from '@/data/seeds.json';

const SEEDS = seedData as Seed[];

/** 中文界面下，城市名用中文（种子包里只有英文城市名，这里补常见的几座） */
const CITY_ZH: Record<string, string> = {
  London: '伦敦', Paris: '巴黎', 'New York City': '纽约', 'San Francisco': '旧金山', Tokyo: '东京', Kyoto: '京都',
  Lisbon: '里斯本', Berlin: '柏林', Vienna: '维也纳', Rome: '罗马', Shanghai: '上海', Beijing: '北京',
  'Hong Kong': '香港', Taipei: '台北', Singapore: '新加坡', Sydney: '悉尼', 'Buenos Aires': '布宜诺斯艾利斯', Cairo: '开罗',
};
function placeLabel(s: Seed, zh: boolean): string {
  const name = s.placeName ?? '';
  return zh ? (CITY_ZH[name] ?? name) : name;
}

export default function WallScreen() {
  // 从谷歌地图的景点进来时，带着景点的 ID、名字与坐标（名字只用于显示，不保存）
  const { key, trace: traceId, poi, name, lat, lng } = useLocalSearchParams<{
    key: string;
    trace?: string;
    poi?: string;
    name?: string;
    lat?: string;
    lng?: string;
  }>();
  const { c } = useTheme();
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token } = useSettings();
  const { trace } = useTrace(traceId);
  const [wall, setWall] = useState<WallSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'offline' | 'signedOut'>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  const valid = typeof key === 'string' && isGeohash(key);
  const center = useMemo(() => (valid ? decodeGeohash(key) : null), [key, valid]);
  const seeds = useMemo(() => (center ? seedsNear(SEEDS, center, undefined, 6) : []), [center]);

  const load = useCallback(() => {
    if (!valid) return;
    walls
      .get(key)
      .then((w) => {
        setWall(w);
        setState(token ? 'ok' : 'signedOut');
      })
      .catch((e) => setState(e instanceof ApiError && e.status === 401 ? 'signedOut' : 'offline'));
  }, [key, valid, token]);
  useEffect(load, [load]);

  const placeName = name || wall?.displayName || trace?.place?.name || seeds[0]?.placeName || '';
  const here =
    lat && lng && Number.isFinite(+lat) && Number.isFinite(+lng)
      ? { lat: +lat, lng: +lng }
      : trace?.place
        ? { lat: trace.place.lat, lng: trace.place.lng }
        : center
          ? { lat: center.lat, lng: center.lng }
          : null;
  const poiId = poi || trace?.place?.poiId || null;
  const country = trace?.place?.country ?? '';
  const mySeq = wall?.mySeq ?? trace?.wallSeq ?? null;
  const zh = lang === 'zh';

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, height: insets.top + 56, flexDirection: 'row', alignItems: 'center' }}>
        <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 56 }}>
        <View style={{ alignItems: 'flex-start', marginTop: 4 }}>
          <Postmark
            diameter={Math.min(180, (width - 40) / 2.15)}
            waves
            tilt={-4}
            top={zh ? placeName : placeName.toUpperCase()}
            bottom={zh ? country : country.toUpperCase()}
            line1={mySeq ? `Nº ${mySeq}` : '—'}
            line2={wall?.visitorCount ? (zh ? `共 ${wall.visitorCount} 人` : `OF ${wall.visitorCount}`) : ''}
          />
        </View>

        <T variant="title" weight="semi" style={{ marginTop: 24 }}>{t.wall.title}</T>
        <T variant="ui" tone="soft" style={{ marginTop: 4 }}>
          {mySeq ? t.wall.you(ordinal(mySeq)) : wall && wall.visitorCount > 0 ? t.wall.count(wall.visitorCount) : state === 'ok' ? t.wall.nobody : ''}
        </T>
        {state === 'offline' && <T variant="small" tone="faint" style={{ marginTop: 8 }}>{t.wall.offline}</T>}
        {state === 'signedOut' && <T variant="small" tone="faint" style={{ marginTop: 8 }}>{t.wall.signedOut}</T>}
        {notice && <T variant="small" tone="stamp" style={{ marginTop: 8 }}>{notice}</T>}

        {here && !traceId && (
          <PrimaryButton
            label={t.map.leaveHere}
            style={{ alignSelf: 'flex-start', marginTop: 20 }}
            onPress={() =>
              router.push({
                pathname: '/compose',
                params: { lat: String(here.lat), lng: String(here.lng), poi: poiId ?? '' },
              })
            }
          />
        )}

        {/* 谷歌地图上的照片与评价：跳转到用户自己的 Google 地图，零成本 */}
        {here && (
          <View style={{ marginTop: 24, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: c.rule, gap: 4 }}>
            <T variant="small" weight="semi" tone="soft">{t.google.title}</T>
            <QuietButton
              label={poiId ? t.google.photos : t.google.lookHere}
              icon="share"
              tone="stamp"
              onPress={() => openInGoogleMaps({ ...here, name: placeName || null, poiId })}
            />
            <T variant="meta" tone="faint">{t.google.note}</T>
          </View>
        )}

        {seeds.length > 0 && (
          <View style={{ marginTop: 36 }}>
            <T variant="small" weight="semi" tone="soft" style={{ marginBottom: 8 }}>{t.wall.before}</T>
            <Rule />
            {seeds.map((s, i) => (
              <View key={`${s.id}${s.kind}`} style={{ flexDirection: 'row', gap: 16 }}>
                {/* 年代轨：这是真实的先后顺序 */}
                <View style={{ width: 52, alignItems: 'flex-end', paddingTop: 16 }}>
                  <T variant="meta" weight="semi" tone="stamp">{s.year < 0 ? `${-s.year} BC` : s.year}</T>
                </View>
                <View style={{ width: 1, backgroundColor: c.rule, marginTop: i === 0 ? 20 : 0 }} />
                <View style={{ flex: 1, paddingVertical: 14, gap: 2 }}>
                  <T variant="ui" weight="medium">{zh && s.nameZh ? s.nameZh : s.name}</T>
                  {(zh ? s.descZh ?? s.desc : s.desc) ? (
                    <T variant="small" tone="soft" numberOfLines={2}>{zh ? s.descZh ?? s.desc : s.desc}</T>
                  ) : null}
                  <T variant="meta" tone="faint">
                    {s.diedYear
                      ? t.wall.seedLife(placeLabel(s, zh), s.year, s.diedYear)
                      : t.wall.seed(s.kind, s.year, placeLabel(s, zh))}
                  </T>
                </View>
              </View>
            ))}
          </View>
        )}

        {wall && wall.notes.length > 0 && (
          <View style={{ marginTop: 36 }}>
            <T variant="small" weight="semi" tone="soft" style={{ marginBottom: 8 }}>{t.wall.others}</T>
            <Rule />
            {wall.notes.map((n) => (
              <NoteRow key={n.id} note={n} onChanged={load} onNotice={setNotice} />
            ))}
          </View>
        )}

        {seeds.length > 0 && (
          <T variant="meta" tone="faint" style={{ marginTop: 40 }}>{t.wall.source}</T>
        )}
      </ScrollView>
    </View>
  );
}

/** 墙上的一句话：只可看见。举报与屏蔽收在「更多」里——公开内容必须有，但不该喧宾夺主。 */
function NoteRow({ note, onChanged, onNotice }: { note: WallNote; onChanged: () => void; onNotice: (s: string) => void }) {
  const { c } = useTheme();
  const { t } = useT();
  const [more, setMore] = useState(false);
  return (
    <View style={{ paddingVertical: 16, gap: 8 }}>
      <T variant="body" italic>“{note.text}”</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <T variant="meta" tone="faint">{note.seasonLabel ? `${note.seasonLabel}, ` : ''}Nº {note.seq}</T>
        {!note.mine && !more && (
          <Pressable hitSlop={10} accessibilityLabel={t.wall.more} onPress={() => setMore(true)}>
            <Icon name="more" size={18} color={c.inkFaint} />
          </Pressable>
        )}
        {!note.mine && more && (
          <>
            <Pressable hitSlop={8} onPress={() => walls.report(note.id).then(() => onNotice(t.wall.reported)).catch(() => {})}>
              <T variant="meta" tone="soft">{t.wall.report}</T>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => walls.block(note.id).then(onChanged).catch(() => {})}>
              <T variant="meta" tone="soft">{t.wall.block}</T>
            </Pressable>
          </>
        )}
      </View>
      <Rule style={{ marginTop: 8 }} />
    </View>
  );
}
