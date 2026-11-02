/**
 * 别人公开的纪念页（只读）。
 * 没有献花、留言、计数；「在网页中打开」和「举报」收在更多菜单里。
 */
import { useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTraceDate, lifeSpan, postmarkDate, type Memorial } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { ApiError, memorials } from '@/data/sync';
import { confirm } from '@/lib/confirm';
import { useSettings } from '@/lib/settings';
import { T } from '@/ui/T';
import { IconButton, QuietButton, Rule } from '@/ui/controls';
import { Postmark } from '@/ui/Postmark';

export default function MemorialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { token } = useSettings();
  const [state, setState] = useState<{ memorial: Memorial; mine: boolean; status: string } | 'missing' | 'offline' | null>(null);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    memorials
      .get(id)
      .then(setState)
      .catch((e) => setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'offline'));
  }, [id, token]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const m = state && typeof state === 'object' ? state.memorial : null;
  const mine = state && typeof state === 'object' ? state.mine : false;
  const pageLocale = m?.locale === 'zh' ? 'zh-CN' : 'en';

  async function report() {
    setMore(false);
    if (!token) {
      setNotice(t.memorial.signInToReport);
      return;
    }
    if (!(await confirm(t.memorial.reportConfirm, t.memorial.report, t.compose.cancel))) return;
    await memorials.report(id!).catch(() => {});
    setNotice(t.memorial.reported);
  }

  const openWeb = () => {
    setMore(false);
    const url = memorials.pageUrl(id!);
    if (Platform.OS === 'web') window.open(url, '_blank');
    else Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton name="back" label="Back" onPress={back} />
        {m && <IconButton name="more" label={t.wall.more} onPress={() => setMore((x) => !x)} />}
      </View>

      {more && m && (
        <View style={{ position: 'absolute', top: insets.top + 52, right: 12, zIndex: 10, minWidth: 180, paddingVertical: 6, borderRadius: 8, backgroundColor: c.sheet, borderWidth: 1, borderColor: c.rule, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          <MenuItem label={t.memorial.openWeb} onPress={openWeb} />
          {!mine && <MenuItem label={t.memorial.report} onPress={report} soft />}
        </View>
      )}

      {state === 'missing' || state === 'offline' ? (
        <T variant="body" tone="soft" style={{ padding: 20 }}>{state === 'missing' ? t.memorial.notAvailable : t.memorial.offline}</T>
      ) : m ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 64 }}>
          <Portrait m={m} />
          <T variant="display" weight="semi" serif style={{ marginTop: 18 }}>{m.name}</T>
          <T variant="small" tone="soft" style={{ marginTop: 4 }}>{[m.species, lifeSpan(m)].filter(Boolean).join(' · ')}</T>
          {m.bio ? <T variant="body" style={{ marginTop: 18 }}>{m.bio}</T> : null}

          {mine && (
            <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <T variant="meta" tone="soft">{state && typeof state === 'object' && state.status === 'hidden' ? t.memorial.hidden : t.memorial.yours}</T>
              <QuietButton label={t.memorial.manage} tone="ink" onPress={() => router.push({ pathname: '/person/memorial', params: { id: m.id } })} />
            </View>
          )}
          {notice && <T variant="small" tone="soft" style={{ marginTop: 16 }}>{notice}</T>}

          {m.traces.length > 0 && (
            <View style={{ marginTop: 32 }}>
              <Rule />
              {m.traces.map((x) => {
                const [l1, l2] = postmarkDate(x.happenedAt, x.precision, pageLocale);
                const place = x.placeName ?? t.trace.unknownPlace;
                return (
                  <View key={x.id} style={{ flexDirection: 'row', gap: 16, paddingVertical: 18 }}>
                    <View style={{ width: 64, alignItems: 'center', paddingTop: 2 }}>
                      <Postmark diameter={64} top={m.locale === 'zh' ? place.slice(0, 12) : place.toUpperCase().slice(0, 24)} line1={l1 || l2} line2={l1 ? l2 : ''} color={c.ink} opacity={0.75} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <T variant="meta" tone="soft">
                        {formatTraceDate(x.happenedAt, x.precision, pageLocale)}
                        {x.placeName ? `, ${x.placeName}` : ''}
                      </T>
                      {x.text ? <T variant="body">{x.text}</T> : null}
                      {x.photoIds.length > 0 && (
                        <View style={{ gap: 8, marginTop: 8 }}>
                          {x.photoIds.map((pid) => (
                            <Image key={pid} source={{ uri: memorials.photoUrl(m.id, pid) }} style={{ width: '100%', aspectRatio: 3 / 2, borderRadius: 2, backgroundColor: c.rule }} resizeMode="cover" />
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Rule style={{ marginTop: 24 }} />
          <T variant="meta" tone="faint" style={{ marginTop: 14 }}>
            {(m.kind === 'pet' ? t.memorial.rememberedPet : t.memorial.remembered) + (m.place?.name ? ` · ${m.place.name}` : '')}
          </T>
          <T variant="meta" tone="faint" style={{ marginTop: 4 }}>{t.memorial.quiet}</T>
        </ScrollView>
      ) : null}
    </View>
  );
}

function Portrait({ m }: { m: Memorial }) {
  const { c } = useTheme();
  const size = 112;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: c.ink, padding: 4, backgroundColor: c.sheet }}>
      {m.portraitPhotoId ? (
        <Image source={{ uri: memorials.photoUrl(m.id, m.portraitPhotoId) }} style={{ flex: 1, borderRadius: size / 2 }} resizeMode="cover" />
      ) : (
        <View style={{ flex: 1, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.paper }}>
          <T serif style={{ fontSize: 44, lineHeight: 56, color: c.inkSoft }}>{[...m.name][0] ?? '·'}</T>
        </View>
      )}
    </View>
  );
}

function MenuItem({ label, onPress, soft }: { label: string; onPress: () => void; soft?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
      <T variant="ui" tone={soft ? 'soft' : 'ink'}>{label}</T>
    </Pressable>
  );
}
