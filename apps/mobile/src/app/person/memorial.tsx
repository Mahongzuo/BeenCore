/**
 * 公开纪念（主人）：选地图上的位置、挑几枚印记，然后公开。
 *
 * 只有已离世的人和宠物可以公开；在世的人只能私密。
 * 公开的是一份快照：只含勾选的印记，只有地名、没有精确坐标，也没有「外婆」这类从主人角度说的称呼。
 */
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { canBeMemorial, formatTraceDate, lifeSpan, MEMORIAL_LIMITS, type Place } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { usePerson, useTraces } from '@/data/hooks';
import { ApiError, memorials } from '@/data/sync';
import { confirm } from '@/lib/confirm';
import { publishMemorial, unpublishMemorial } from '@/lib/memorial';
import { useSettings } from '@/lib/settings';
import { T } from '@/ui/T';
import { Chip, IconButton, PrimaryButton, QuietButton, Rule } from '@/ui/controls';
import { PersonAvatar } from '@/ui/PersonAvatar';
import { PhotoThumb } from '@/ui/PhotoThumb';

const placeKey = (p: { lat: number; lng: number }) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

export default function MemorialManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { c } = useTheme();
  const { t, lang, locale } = useT();
  const insets = useSafeAreaInsets();
  const { token } = useSettings();
  const { person } = usePerson(id);
  const { traces } = useTraces(id ?? '__none__');

  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [placeSel, setPlaceSel] = useState<string | null | undefined>(undefined); // undefined = 还没初始化
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState<{ status: 'visible' | 'hidden'; missing: number } | null>(null);

  // 用档案里已保存的选择初始化一次
  useEffect(() => {
    if (!person || picked) return;
    setPicked(new Set(person.memorialTraceIds ?? []));
    setPlaceSel(person.restingPlace ? placeKey(person.restingPlace) : null);
  }, [person, picked]);

  // 已经公开的：问一下服务端现在的状态（可能被举报隐藏了）
  useEffect(() => {
    if (!person || person.visibility !== 'memorial' || !token) return;
    memorials
      .get(person.id)
      .then((r) => setLive({ status: r.status, missing: 0 }))
      .catch(() => {});
  }, [person?.id, person?.visibility, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // 可选的地图位置：TA 的印记去过的地方 + 已经选过的
  const placeOptions = useMemo(() => {
    const m = new Map<string, Place>();
    if (person?.restingPlace) m.set(placeKey(person.restingPlace), person.restingPlace);
    for (const x of [...traces].sort((a, b) => b.happenedAt - a.happenedAt)) {
      if (!x.place) continue;
      const k = placeKey(x.place);
      if (![...m.values()].some((p) => p.name && p.name === x.place!.name) && !m.has(k)) m.set(k, x.place);
    }
    return [...m.entries()].slice(0, 8);
  }, [traces, person?.restingPlace]);

  if (!person) return <View style={{ flex: 1, backgroundColor: c.paper }} />;

  const allowed = canBeMemorial(person);
  const isPublic = person.visibility === 'memorial';
  const leave = () => (router.canGoBack() ? router.back() : router.replace(`/person/${person.id}`));
  const selection = picked ?? new Set<string>();
  const shareUrl = memorials.pageUrl(person.id);

  async function publish() {
    if (!person) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const place = placeSel ? (placeOptions.find(([k]) => k === placeSel)?.[1] ?? null) : null;
      const next = {
        ...person,
        memorialTraceIds: traces.filter((x) => selection.has(x.id)).map((x) => x.id).slice(0, MEMORIAL_LIMITS.traces),
        restingPlace: place ? { lat: place.lat, lng: place.lng, name: place.name ?? null } : null,
      };
      const res = await publishMemorial(db, next, lang);
      setLive({ status: res.status, missing: res.missingPhotos });
    } catch (e) {
      setError(e instanceof ApiError && e.status !== 0 ? e.message : t.memorial.offline);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!person || !(await confirm(t.memorial.stopConfirm, t.memorial.stop, t.compose.cancel))) return;
    setBusy(true);
    try {
      await unpublishMemorial(db, person);
      setLive(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status !== 0 ? e.message : t.memorial.offline);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      if (Platform.OS === 'web') {
        const nav = navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> };
        if (nav.share) await nav.share({ url: shareUrl, title: person!.name });
        else {
          await nav.clipboard.writeText(shareUrl);
          setNotice(t.memorial.copied);
        }
      } else {
        await Share.share({ message: shareUrl, url: shareUrl, title: person!.name });
      }
    } catch {
      // 用户取消分享
    }
  }

  const toggle = (tid: string) =>
    setPicked((cur) => {
      const n = new Set(cur ?? []);
      if (n.has(tid)) n.delete(tid);
      else if (n.size < MEMORIAL_LIMITS.traces) n.add(tid);
      return n;
    });

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton name="close" label={t.compose.cancel} onPress={leave} />
        <T variant="ui" weight="semi">{t.memorial.title}</T>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 160 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <PersonAvatar person={person} size={56} />
          <View style={{ flex: 1 }}>
            <T variant="title" weight="semi" serif>{person.name}</T>
            <T variant="small" tone="soft">{[person.kind === 'pet' ? person.species : null, lifeSpan(person)].filter(Boolean).join(' · ')}</T>
          </View>
        </View>

        {!allowed ? (
          <T variant="body" tone="soft" style={{ marginTop: 24 }}>{t.memorial.notAllowed}</T>
        ) : (
          <>
            <T variant="small" tone="soft" style={{ marginTop: 20 }}>{t.memorial.intro}</T>

            {isPublic && !busy && (
              <View style={{ marginTop: 20, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: c.ink, gap: 10 }}>
                <T variant="ui" weight="semi">{live?.status === 'hidden' ? t.memorial.hidden : t.memorial.live}</T>
                <T variant="meta" tone="soft" selectable numberOfLines={1}>{shareUrl}</T>
                {live && live.missing > 0 && <T variant="meta" tone="stamp">{t.memorial.missing(live.missing)}</T>}
                <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
                  <QuietButton label={t.memorial.share} icon="share" tone="ink" onPress={share} />
                  <QuietButton label={t.memorial.view} tone="ink" onPress={() => router.push(`/memorial/${person.id}`)} />
                </View>
              </View>
            )}

            <Rule style={{ marginTop: 24 }} />
            <T variant="small" weight="semi" style={{ marginTop: 20 }}>{t.memorial.placeTitle}</T>
            <T variant="meta" tone="faint" style={{ marginTop: 2, marginBottom: 10 }}>{t.memorial.placeHint}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Chip label={t.memorial.noPlace} selected={placeSel === null} onPress={() => setPlaceSel(null)} />
              {placeOptions.map(([k, p]) => (
                <Chip key={k} label={p.name ?? `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`} selected={placeSel === k} onPress={() => setPlaceSel(k)} />
              ))}
            </View>

            <Rule style={{ marginTop: 24 }} />
            <T variant="small" weight="semi" style={{ marginTop: 20 }}>{t.memorial.tracesTitle}</T>
            <T variant="meta" tone="faint" style={{ marginTop: 2, marginBottom: 6 }}>{t.memorial.tracesHint}</T>
            {traces.length === 0 && <T variant="small" tone="soft" style={{ marginTop: 8 }}>{t.memorial.noTraces}</T>}
            {[...traces]
              .sort((a, b) => a.happenedAt - b.happenedAt)
              .map((x) => {
                const on = selection.has(x.id);
                return (
                  <Pressable
                    key={x.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(x.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.rule }}>
                    <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: on ? c.ink : c.inkFaint, backgroundColor: on ? c.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <View style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: c.paper }} />}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T variant="meta" tone="soft">
                        {formatTraceDate(x.happenedAt, x.precision, locale)}
                        {x.place?.name ? `, ${x.place.name}` : ''}
                      </T>
                      <T variant="small" numberOfLines={2} italic={!x.text} tone={x.text ? 'ink' : 'soft'}>
                        {x.text || t.traces.photoCount(x.photoIds.length)}
                      </T>
                    </View>
                    {x.photoIds[0] && <PhotoThumb id={x.photoIds[0]} size={44} />}
                  </Pressable>
                );
              })}

            {isPublic && <QuietButton label={t.memorial.stop} tone="soft" onPress={stop} style={{ marginTop: 28, alignSelf: 'flex-start' }} />}
          </>
        )}
      </ScrollView>

      {allowed && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16, backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.rule, gap: 8 }}>
          {error && <T variant="small" tone="stamp">{error}</T>}
          {notice && <T variant="small" tone="soft">{notice}</T>}
          {!token ? (
            <>
              <T variant="small" tone="soft">{t.memorial.signInFirst}</T>
              <PrimaryButton label={t.memorial.goSignIn} onPress={() => router.push('/you')} />
            </>
          ) : (
            <PrimaryButton
              label={busy ? t.memorial.publishing : isPublic ? t.memorial.update : t.memorial.publish}
              onPress={publish}
              disabled={busy}
            />
          )}
        </View>
      )}
    </View>
  );
}
