/**
 * 留下印记。
 *
 * 默认只需要写一句话：地点自动获取，时间默认今天。
 * 其余都是可选的：照片、补记旧事的年份、章节、地点墙签名、时光胶囊。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  THEMES,
  cleanWallNote,
  encodeGeohash,
  fonts,
  formatTraceDate,
  newId,
  sameDay,
  type DatePrecision,
  type Photo,
  type Place,
  type Theme,
  type Trace,
} from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { getTrace, savePhoto, saveTrace } from '@/data/db';
import { usePersons } from '@/data/hooks';
import { storePhoto, resolvePhotoUri } from '@/data/photoStore';
import { signTraceWall } from '@/data/sync';
import { locateHere, nameOf } from '@/lib/location';
import { getSettings } from '@/lib/settings';
import { T } from '@/ui/T';
import { Chip, IconButton, PrimaryButton, QuietButton, Rule } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Postmark, stampLabels } from '@/ui/Postmark';
import { DatePanel } from '@/ui/DatePanel';

type PlaceState = { status: 'locating' } | { status: 'set'; place: Place; current: boolean } | { status: 'none'; denied?: boolean };

interface DraftPhoto {
  id: string;
  uri: string;
  asset?: ImagePicker.ImagePickerAsset;
  existing?: Photo;
}

const MAX_PHOTOS = 6;
const SEAL_YEARS = [1, 5, 10];

export default function ComposeScreen() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const { t, locale } = useT();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; small?: string; lat?: string; lng?: string; name?: string; country?: string; poi?: string; owner?: string }>();
  const small = params.small === '1';
  // 从地图长按进来：地点已定，多半是补记过去的事
  const picked: Place | null =
    params.lat && params.lng && Number.isFinite(+params.lat) && Number.isFinite(+params.lng)
      ? { lat: +params.lat, lng: +params.lng, name: params.name || null, country: params.country || null, poiId: params.poi || null }
      : null;

  const [loaded, setLoaded] = useState<Trace | null>(null);
  // 归属：null 是「我」；从档案进来时默认是那份档案
  const [owner, setOwner] = useState<string | null>(params.owner || null);
  const { persons } = usePersons();
  const ownerPerson = owner ? (persons.find((p) => p.id === owner) ?? null) : null;
  const forSomeone = !!params.owner;
  const [text, setText] = useState('');
  const [date, setDate] = useState<{ ts: number; precision: DatePrecision }>({ ts: Date.now(), precision: 'day' });
  // 写别人的事多半是过去的事：日期默认展开，也不自动定位到「我现在在哪」
  const [dateOpen, setDateOpen] = useState(!!picked || forSomeone);
  const [place, setPlace] = useState<PlaceState>(
    picked ? { status: 'set', place: picked, current: false } : { status: params.id || forSomeone ? 'none' : 'locating' },
  );
  const [theme, setTheme] = useState<Theme>('everyday');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [signWall, setSignWall] = useState(false);
  const [wallNote, setWallNote] = useState('');
  const [sealYears, setSealYears] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stamped, setStamped] = useState<Trace | null>(null);

  // 编辑：载入已有印记
  useEffect(() => {
    if (!params.id) return;
    getTrace(db, params.id).then(async (tr) => {
      if (!tr) return;
      setLoaded(tr);
      setOwner(tr.ownerId ?? null);
      setText(tr.text);
      setDate({ ts: tr.happenedAt, precision: tr.precision });
      setPlace(tr.place ? { status: 'set', place: tr.place, current: false } : { status: 'none' });
      setTheme(tr.theme);
      setSignWall(tr.visibility === 'wall');
      setWallNote(tr.wallNote ?? '');
      const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM photos WHERE trace_id = ?', tr.id);
      const existing = rows.map((r) => JSON.parse(r.data) as Photo);
      const drafts: DraftPhoto[] = [];
      for (const p of existing) {
        const uri = p.localRef ? await resolvePhotoUri(p.localRef) : null;
        if (uri) drafts.push({ id: p.id, uri, existing: p });
      }
      setPhotos(drafts);
    });
  }, [db, params.id]);

  // 从景点或地点墙进来、还没有地名的：补查一次（用系统地理编码或离线城市表，不用谷歌的名字）
  const pickedNeedsName = !!picked && !picked.name;
  useEffect(() => {
    if (!pickedNeedsName || !picked) return;
    nameOf(picked.lat, picked.lng).then((n) =>
      setPlace((cur) => (cur.status === 'set' && !cur.place.name ? { ...cur, place: { ...cur.place, ...n } } : cur)),
    );
  }, [pickedNeedsName]); // eslint-disable-line react-hooks/exhaustive-deps

  // 新建：自动定位（从地图选了地点的除外）
  const fromMap = !!picked;
  useEffect(() => {
    if (params.id || fromMap || forSomeone) return;
    let alive = true;
    locateHere().then((r) => {
      if (!alive) return;
      setPlace(r.ok ? { status: 'set', place: r.place, current: true } : { status: 'none', denied: r.reason === 'denied' });
    });
    return () => {
      alive = false;
    };
  }, [params.id, fromMap, forSomeone]);

  /** 直接打开编辑页（没有上一页）时，回到地图 */
  const left = useRef(false);
  const leave = () => {
    if (left.current) return;
    left.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const isToday = date.precision === 'day' && sameDay(date.ts, Date.now());
  // 地点墙是「我来过」：档案里的印记不签
  const canSignWall = !owner && place.status === 'set' && place.current && isToday && !loaded?.wallSeq;

  async function addPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.82,
      exif: false,
    });
    if (res.canceled) return;
    setPhotos((cur) => [
      ...cur,
      ...res.assets.slice(0, MAX_PHOTOS - cur.length).map((asset) => ({ id: newId(), uri: asset.uri, asset })),
    ]);
  }

  async function submit() {
    const body = text.trim();
    if (!body) {
      setError(t.compose.emptyText);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = Date.now();
      const id = loaded?.id ?? newId(now);
      const placeValue = place.status === 'set' ? place.place : null;

      // 照片：新加的先落盘
      const photoIds: string[] = [];
      for (const p of photos) {
        if (p.existing) {
          photoIds.push(p.id);
          continue;
        }
        try {
          const localRef = await storePhoto(p.id, p.asset!);
          await savePhoto(db, {
            id: p.id,
            traceId: id,
            width: p.asset?.width ?? 0,
            height: p.asset?.height ?? 0,
            mime: p.asset?.mimeType ?? 'image/jpeg',
            localRef,
            remoteKey: null,
            createdAt: now,
          });
          photoIds.push(p.id);
        } catch {
          setError(t.errors.photo);
        }
      }

      const wall = !owner && signWall && (canSignWall || loaded?.visibility === 'wall');
      const trace: Trace = {
        id,
        text: body,
        happenedAt: date.ts,
        precision: date.precision,
        place: placeValue,
        placeKey: placeValue ? encodeGeohash(placeValue.lat, placeValue.lng) : null,
        theme,
        visibility: wall ? 'wall' : 'private',
        wallNote: wall ? cleanWallNote(wallNote) : null,
        wallSeq: loaded?.wallSeq ?? null,
        opensAt: sealYears ? addYears(now, sealYears) : (loaded?.opensAt ?? null),
        photoIds,
        ownerId: owner,
        createdAt: loaded?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      await saveTrace(db, trace);
      if (wall && trace.wallSeq == null && getSettings().token) {
        signTraceWall(db, trace).catch(() => {}); // 离线就交给同步引擎补签
      }
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setStamped(trace);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton name="close" label={t.compose.cancel} onPress={leave} />
        <T variant="ui" weight="semi" numberOfLines={1} style={{ flexShrink: 1 }}>
          {loaded ? t.compose.editTitle : ownerPerson ? t.people.composeTitle(ownerPerson.name) : t.compose.title}
        </T>
        {loaded || picked ? (
          <View style={{ width: 40 }} />
        ) : (
          <QuietButton
            label={t.import.entry}
            tone={owner ? 'ink' : 'stamp'}
            onPress={() => router.replace(owner ? { pathname: '/import', params: { owner } } : '/import')}
            style={{ paddingRight: 8 }}
          />
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (error) setError(null);
          }}
          placeholder={ownerPerson ? t.people.composePlaceholder(ownerPerson.name) : small ? t.compose.smallPlaceholder : t.compose.placeholder}
          placeholderTextColor={c.inkFaint}
          multiline
          autoFocus={!params.id}
          style={{
            fontFamily: fonts.text,
            fontSize: 21,
            lineHeight: 32,
            color: c.ink,
            minHeight: small ? 96 : 150,
            paddingTop: 12,
            paddingBottom: 12,
            textAlignVertical: 'top',
            outlineStyle: 'none',
          } as object}
        />
        {error && (
          <T variant="small" tone="stamp" style={{ marginBottom: 8 }}>
            {error}
          </T>
        )}

        {/* 照片 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
          {photos.map((p) => (
            <View key={p.id}>
              <Image source={{ uri: p.uri }} style={{ width: 84, height: 84, borderRadius: 4, backgroundColor: c.rule }} />
              <Pressable
                accessibilityLabel="Remove photo"
                onPress={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))}
                style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={14} />
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_PHOTOS && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.compose.addPhoto}
              onPress={addPhoto}
              style={({ pressed }) => ({ width: 84, height: 84, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: c.inkFaint, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Icon name="camera" color={c.inkSoft} />
            </Pressable>
          )}
        </ScrollView>

        <Rule style={{ marginVertical: 12 }} />

        {/* 归属：我，或某份档案 */}
        {persons.length > 0 && (
          <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <T variant="small" tone="soft">{t.people.belongsTo}</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              <Chip label={t.people.me} selected={owner === null} onPress={() => setOwner(null)} />
              {persons.map((p) => (
                <Chip key={p.id} label={p.name} selected={owner === p.id} onPress={() => setOwner(p.id)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* 时间 */}
        <Field label={t.compose.when}>
          <Pressable onPress={() => setDateOpen((o) => !o)} hitSlop={8}>
            <T variant="ui" weight="medium" tone="stamp">
              {isToday ? t.compose.today : formatTraceDate(date.ts, date.precision, locale)}
            </T>
          </Pressable>
        </Field>
        {dateOpen && <DatePanel value={date} onChange={setDate} />}

        {/* 地点 */}
        <Field label={t.compose.where}>
          {place.status === 'locating' ? (
            <T variant="ui" tone="faint">{t.compose.locating}</T>
          ) : place.status === 'set' ? (
            <Pressable onPress={() => setPlace({ status: 'none' })} hitSlop={8} accessibilityHint={t.compose.removePlace}>
              <T variant="ui" weight="medium" numberOfLines={1}>
                {place.place.name ?? `${place.place.lat.toFixed(3)}, ${place.place.lng.toFixed(3)}`}
              </T>
            </Pressable>
          ) : (
            <QuietButton
              label={t.compose.useCurrent}
              icon="locate"
              tone="stamp"
              onPress={() => {
                setPlace({ status: 'locating' });
                locateHere().then((r) =>
                  setPlace(r.ok ? { status: 'set', place: r.place, current: true } : { status: 'none', denied: r.reason === 'denied' }),
                );
              }}
            />
          )}
        </Field>
        {place.status === 'none' && place.denied && (
          <T variant="small" tone="soft" style={{ marginBottom: 8 }}>
            {t.compose.locationDenied}
          </T>
        )}

        {/* 章节 */}
        {!small && (
          <View style={{ marginTop: 8 }}>
            <T variant="small" tone="soft" style={{ marginBottom: 10 }}>
              {t.compose.theme}
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {THEMES.map((th) => (
                <Chip key={th} label={t.themes[th]} selected={theme === th} onPress={() => setTheme(th)} />
              ))}
            </View>
          </View>
        )}

        {/* 地点墙 */}
        {(canSignWall || loaded?.visibility === 'wall') && (
          <View style={{ marginTop: 24, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: signWall ? c.stamp : c.rule, backgroundColor: signWall ? c.stampWash : 'transparent' }}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: signWall }}
              onPress={() => setSignWall((s) => !s)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Checkbox on={signWall} />
              <View style={{ flex: 1 }}>
                <T variant="ui" weight="medium">{t.compose.signWall}</T>
                <T variant="small" tone="soft">{t.compose.signWallHint}</T>
              </View>
            </Pressable>
            {signWall && (
              <TextInput
                value={wallNote}
                onChangeText={setWallNote}
                maxLength={60}
                placeholder={t.compose.wallNotePlaceholder}
                placeholderTextColor={c.inkFaint}
                style={{ marginTop: 12, fontFamily: fonts.text, fontSize: 16, color: c.ink, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.rule, outlineStyle: 'none' } as object}
              />
            )}
          </View>
        )}

        {/* 时光胶囊 */}
        {!small && !loaded && (
          <View style={{ marginTop: 24 }}>
            <T variant="small" tone="soft">{t.compose.seal}</T>
            <T variant="meta" tone="faint" style={{ marginBottom: 10 }}>{t.compose.sealHint}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label={t.compose.sealNone} selected={sealYears === null} onPress={() => setSealYears(null)} />
              {SEAL_YEARS.map((n) => (
                <Chip key={n} label={t.compose.sealYears(n)} selected={sealYears === n} onPress={() => setSealYears(n)} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16, backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.rule }}>
        <PrimaryButton label={loaded ? t.compose.save : t.compose.submit} onPress={submit} disabled={saving || !!stamped} />
      </View>

      {stamped && <StampOverlay trace={stamped} onDone={leave} />}

    </KeyboardAvoidingView>
  );
}

function addYears(ts: number, n: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear() + n, d.getMonth(), d.getDate()).getTime();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <T variant="small" tone="soft">{label}</T>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

function Checkbox({ on }: { on: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: on ? c.stamp : c.inkFaint, alignItems: 'center', justifyContent: 'center' }}>
      {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.stamp }} />}
    </View>
  );
}

/** 盖章：印章从上方落下，压一下，留下印迹。全应用唯一一处主动的动效。 */
function StampOverlay({ trace, onDone }: { trace: Trace; onDone: () => void }) {
  const { c } = useTheme();
  const { t, locale } = useT();
  const v = useRef(new Animated.Value(0)).current;
  const labels = useMemo(() => stampLabels(trace, locale, t.trace.unknownPlace), [trace, locale, t]);
  // 只结束一次：onDone 每次渲染都是新函数，若随依赖重跑会多次返回上一页（从档案页进来时会退过头）
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    let finished = false;
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(650),
    ]).start(() => {
      if (finished) return;
      finished = true;
      doneRef.current();
    });
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] });
  const opacity = v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.6, 1] });
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Animated.View style={{ transform: [{ scale }, { rotate: '-8deg' }], opacity }}>
        <Postmark diameter={180} waves {...labels} color={trace.ownerId ? c.ink : undefined} />
      </Animated.View>
      <T variant="ui" weight="semi" tone={trace.ownerId ? 'ink' : 'stamp'}>{t.compose.done}</T>
    </View>
  );
}
