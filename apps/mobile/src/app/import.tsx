/**
 * 从相册补记。
 *
 * 选照片 → 读出拍摄时间与地点 → 按「同一天、1km 内」分成时刻 →
 * 每个时刻可以写一句（也可以不写）、补日期、跳过 → 全部盖印。
 * 每一枚印记都是用户自己确认过的，不会在后台自动生成。
 */
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import {
  clusterMoments,
  encodeGeohash,
  fonts,
  formatTraceDate,
  newId,
  type DatePrecision,
  type Moment,
  type Place,
  type Trace,
} from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { savePhoto, saveTrace } from '@/data/db';
import { usePerson } from '@/data/hooks';
import { storePhoto } from '@/data/photoStore';
import { nameOf } from '@/lib/location';
import { compressPhoto, MAX_IMPORT, readPhotoMeta, type PickedPhoto } from '@/lib/photoImport';
import { T } from '@/ui/T';
import { IconButton, PrimaryButton, QuietButton, Rule } from '@/ui/controls';
import { DatePanel } from '@/ui/DatePanel';

interface Draft {
  moment: Moment;
  photos: PickedPhoto[];
  text: string;
  skip: boolean;
  date: { ts: number; precision: DatePrecision } | null;
  place: Place | null;
  naming: boolean;
}

type Phase =
  | { kind: 'pick' }
  | { kind: 'reading'; done: number; total: number }
  | { kind: 'review' }
  | { kind: 'saving'; done: number; total: number }
  | { kind: 'done'; count: number };

export default function ImportScreen() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const { t, locale } = useT();
  const insets = useSafeAreaInsets();
  // 从档案里进来：补记的时刻都归到那份档案
  const { owner } = useLocalSearchParams<{ owner?: string }>();
  const { person } = usePerson(owner || null);
  const ownerId = person?.id ?? null;
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dateOpen, setDateOpen] = useState<string | null>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((cur) => cur.map((d) => (d.moment.key === key ? { ...d, ...patch } : d)));

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMPORT,
      exif: true,
      quality: 1,
    });
    if (res.canceled || !res.assets.length) return;
    const assets = res.assets.slice(0, MAX_IMPORT);
    setPhase({ kind: 'reading', done: 0, total: assets.length });
    const metas: PickedPhoto[] = [];
    for (const [i, a] of assets.entries()) {
      metas.push(await readPhotoMeta(newId(Date.now() + i), a));
      setPhase({ kind: 'reading', done: i + 1, total: assets.length });
    }
    const byId = new Map(metas.map((m) => [m.id, m]));
    const moments = clusterMoments(metas);
    const next: Draft[] = moments.map((m) => ({
      moment: m,
      photos: m.photos.map((p) => byId.get(p.id)!),
      text: '',
      skip: false,
      date: m.takenAt != null ? { ts: m.takenAt, precision: 'day' } : null,
      place: m.place ? { lat: Math.round(m.place.lat * 1e5) / 1e5, lng: Math.round(m.place.lng * 1e5) / 1e5 } : null,
      naming: !!m.place,
    }));
    setDrafts(next);
    setPhase({ kind: 'review' });
    // 地名逐个查（系统地理编码或离线城市表），查到一个填一个
    for (const d of next) {
      if (!d.place) continue;
      const n = await nameOf(d.place.lat, d.place.lng);
      setDrafts((cur) =>
        cur.map((x) => (x.moment.key === d.moment.key && x.place ? { ...x, place: { ...x.place, ...n }, naming: false } : x)),
      );
    }
  }

  const included = drafts.filter((d) => !d.skip);
  const missingDate = included.filter((d) => !d.date).length;

  async function stampAll() {
    const list = included.filter((d) => d.date);
    setPhase({ kind: 'saving', done: 0, total: list.length });
    let count = 0;
    for (const d of list) {
      const now = Date.now();
      const traceId = newId(now);
      const photoIds: string[] = [];
      for (const p of d.photos) {
        try {
          const small = await compressPhoto(p.asset);
          const localRef = await storePhoto(p.id, small);
          await savePhoto(db, {
            id: p.id,
            traceId,
            width: small.width,
            height: small.height,
            mime: small.mimeType ?? 'image/jpeg',
            localRef,
            remoteKey: null,
            createdAt: now,
          });
          photoIds.push(p.id);
        } catch (e) {
          // 一张照片失败不影响这个时刻的其他照片
          console.warn('[import] photo not saved', e);
        }
      }
      const trace: Trace = {
        id: traceId,
        text: d.text.trim(),
        happenedAt: d.date!.ts,
        precision: d.date!.precision,
        place: d.place,
        placeKey: d.place ? encodeGeohash(d.place.lat, d.place.lng) : null,
        theme: 'everyday',
        visibility: 'private',
        wallNote: null,
        wallSeq: null,
        opensAt: null,
        photoIds,
        ownerId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await saveTrace(db, trace);
      count++;
      setPhase({ kind: 'saving', done: count, total: list.length });
    }
    setPhase({ kind: 'done', count });
  }

  const header = (
    <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton name="close" label={t.compose.cancel} onPress={leave} />
      <View style={{ alignItems: 'center', flexShrink: 1 }}>
        <T variant="ui" weight="semi">{t.import.title}</T>
        {person && <T variant="meta" tone="soft" numberOfLines={1}>{t.people.importInto(person.name)}</T>}
      </View>
      <View style={{ width: 40 }} />
    </View>
  );

  if (phase.kind !== 'review') {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        {header}
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 16 }}>
          {phase.kind === 'pick' && (
            <>
              <T variant="display" weight="semi">{t.import.headline}</T>
              <T variant="body" tone="soft">{t.import.intro}</T>
              <PrimaryButton label={t.import.pick} onPress={pick} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
            </>
          )}
          {phase.kind === 'reading' && <Progress label={t.import.reading(phase.done, phase.total)} value={phase.done / phase.total} />}
          {phase.kind === 'saving' && <Progress label={t.import.saving(phase.done, phase.total)} value={phase.total ? phase.done / phase.total : 1} />}
          {phase.kind === 'done' && (
            <>
              <T variant="display" weight="semi">{t.import.done(phase.count)}</T>
              <T variant="body" tone="soft">{t.import.doneHint}</T>
              <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center', marginTop: 8 }}>
                {person ? (
                  <PrimaryButton label={t.people.seeArchive(person.name)} onPress={() => (router.canGoBack() ? router.back() : router.replace(`/person/${person.id}`))} />
                ) : (
                  <PrimaryButton label={t.import.seeMap} onPress={() => router.dismissTo('/')} />
                )}
                <QuietButton label={t.import.again} tone="stamp" onPress={() => { setDrafts([]); setPhase({ kind: 'pick' }); }} />
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <T variant="title" weight="semi">{t.import.found(drafts.length)}</T>
        <T variant="small" tone="soft" style={{ marginTop: 4 }}>{t.import.foundHint}</T>
        {drafts.map((d) => (
          <MomentCard
            key={d.moment.key}
            draft={d}
            locale={locale}
            dateOpen={dateOpen === d.moment.key}
            onToggleDate={() => setDateOpen((k) => (k === d.moment.key ? null : d.moment.key))}
            onChange={(patch) => update(d.moment.key, patch)}
          />
        ))}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16, backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.rule, gap: 6 }}>
        {missingDate > 0 && <T variant="meta" tone="soft">{t.import.needDate(missingDate)}</T>}
        <PrimaryButton
          label={t.import.stampAll(included.length - missingDate)}
          onPress={stampAll}
          disabled={included.length - missingDate === 0}
        />
      </View>
    </View>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10, marginTop: 24 }}>
      <T variant="ui" tone="soft">{label}</T>
      <View style={{ height: 3, backgroundColor: c.rule, borderRadius: 2, overflow: 'hidden' }}>
        <View style={{ height: 3, width: `${Math.round(value * 100)}%`, backgroundColor: c.stamp }} />
      </View>
    </View>
  );
}

function MomentCard({
  draft,
  locale,
  dateOpen,
  onToggleDate,
  onChange,
}: {
  draft: Draft;
  locale: string;
  dateOpen: boolean;
  onToggleDate: () => void;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const { c } = useTheme();
  const { t } = useT();
  const time = useMemo(
    () => (draft.date && draft.date.precision === 'day' ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(draft.date.ts) : null),
    [draft.date, locale],
  );
  return (
    <View style={{ marginTop: 24, opacity: draft.skip ? 0.45 : 1 }}>
      <Rule style={{ marginBottom: 14 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {draft.photos.map((p) => (
          <Image
            key={p.id}
            source={{ uri: p.asset.uri }}
            style={{ width: draft.photos.length === 1 ? 220 : 128, height: draft.photos.length === 1 ? 146 : 96, borderRadius: 3, backgroundColor: c.rule }}
          />
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={onToggleDate} hitSlop={6}>
            <T variant="small" weight="medium" tone={draft.date ? 'ink' : 'stamp'}>
              {draft.date ? `${formatTraceDate(draft.date.ts, draft.date.precision, locale)}${time ? `  ${time}` : ''}` : t.import.unknownDate}
            </T>
          </Pressable>
          <T variant="meta" tone="soft" numberOfLines={1}>
            {draft.place
              ? draft.naming
                ? t.compose.locating
                : draft.place.name ?? `${draft.place.lat.toFixed(3)}, ${draft.place.lng.toFixed(3)}`
              : t.import.noPlace}
            {`, ${t.traces.photoCount(draft.photos.length)}`}
          </T>
        </View>
        <QuietButton
          label={draft.skip ? t.import.include : t.import.skip}
          tone={draft.skip ? 'stamp' : 'soft'}
          onPress={() => onChange({ skip: !draft.skip })}
        />
      </View>

      {dateOpen && !draft.skip && (
        <DatePanel
          value={draft.date ?? { ts: draft.photos[0]?.takenAt ?? Date.now(), precision: 'year' }}
          onChange={(v) => onChange({ date: v })}
        />
      )}

      {!draft.skip && (
        <TextInput
          value={draft.text}
          onChangeText={(v) => onChange({ text: v })}
          placeholder={t.import.placeholder}
          placeholderTextColor={c.inkFaint}
          multiline
          style={{ marginTop: 10, fontFamily: fonts.text, fontSize: 17, lineHeight: 26, color: c.ink, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.rule, outlineStyle: 'none' } as object}
        />
      )}
    </View>
  );
}
