import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { formatTraceDate, isSealed, ordinal } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useNow, usePerson, useTrace } from '@/data/hooks';
import { deleteTrace } from '@/data/db';
import { confirm } from '@/lib/confirm';
import { openInGoogleMaps } from '@/lib/openMaps';
import { T } from '@/ui/T';
import { Icon } from '@/ui/Icon';
import { IconButton, QuietButton, Rule } from '@/ui/controls';
import { Postmark, stampLabels } from '@/ui/Postmark';
import { PhotoView } from '@/ui/PhotoView';
import { PersonAvatar } from '@/ui/PersonAvatar';

export default function TraceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { c } = useTheme();
  const { t, locale } = useT();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { trace, loading } = useTrace(id);
  const { person: owner } = usePerson(trace?.ownerId ?? null);

  const header = (
    <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      {trace && !trace.deletedAt && (
        <View style={{ flexDirection: 'row', gap: 16, paddingRight: 8 }}>
          <QuietButton label={t.trace.edit} onPress={() => router.push(`/compose?id=${trace.id}`)} />
          <QuietButton
            label={t.trace.delete}
            tone="soft"
            onPress={async () => {
              if (await confirm(t.trace.deleteConfirm, t.trace.delete, t.compose.cancel)) {
                await deleteTrace(db, trace.id);
                router.back();
              }
            }}
          />
        </View>
      )}
    </View>
  );

  if (!trace || trace.deletedAt) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        {header}
        {!loading && <T variant="ui" tone="soft" style={{ padding: 20 }}>{t.trace.notFound}</T>}
      </View>
    );
  }

  const sealed = isSealed(trace, now);
  const labels = stampLabels(trace, locale, t.trace.unknownPlace);

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 56 }}>
        {owner && (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/person/${owner.id}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, opacity: pressed ? 0.7 : 1 })}>
            <PersonAvatar person={owner} size={32} />
            <T variant="small" weight="semi">{t.people.whose(owner.name)}</T>
            <Icon name="chevronRight" size={16} color={c.inkFaint} />
          </Pressable>
        )}
        <View style={{ alignItems: 'flex-start', marginTop: 8, marginBottom: 20 }}>
          <Postmark diameter={148} waves {...labels} tilt={-5} color={trace.ownerId ? c.ink : undefined} opacity={trace.ownerId ? 0.8 : undefined} />
        </View>
        <T variant="small" tone="soft">
          {formatTraceDate(trace.happenedAt, trace.precision, locale)}
          {trace.place?.name ? `, ${trace.place.name}` : ''}
        </T>
        <T variant="meta" tone="faint" style={{ marginTop: 2 }}>{t.themes[trace.theme]}</T>

        {sealed ? (
          <View style={{ marginTop: 28, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="lock" color={c.inkSoft} />
            <T variant="body" tone="soft">{t.trace.sealedUntil(formatTraceDate(trace.opensAt!, 'day', locale))}</T>
          </View>
        ) : (
          <>
            {trace.text ? <T variant="body" style={{ marginTop: 20, fontSize: 20, lineHeight: 32 }}>{trace.text}</T> : null}
            <View style={{ marginTop: 24, gap: 10 }}>
              {trace.photoIds.map((pid) => (
                <PhotoView key={pid} id={pid} />
              ))}
            </View>
          </>
        )}

        {trace.placeKey && (
          <View style={{ marginTop: 32, gap: 6 }}>
            <Rule />
            {trace.wallSeq ? (
              <T variant="small" tone="stamp" style={{ marginTop: 12 }}>{t.wall.you(ordinal(trace.wallSeq))}</T>
            ) : null}
            {trace.visibility === 'wall' && trace.wallNote ? (
              <T variant="ui" serif italic tone="soft">“{trace.wallNote}”</T>
            ) : null}
            {!trace.ownerId && (
              <QuietButton label={t.trace.openWall} icon="pin" tone="stamp" onPress={() => router.push(`/wall/${trace.placeKey}?trace=${trace.id}`)} />
            )}
            {trace.place && (
              <QuietButton
                label={trace.place.poiId ? t.google.photos : t.google.lookHere}
                icon="share"
                tone="soft"
                onPress={() => openInGoogleMaps(trace.place!)}
              />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
