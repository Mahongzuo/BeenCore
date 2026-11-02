/**
 * 一份档案：TA 的样子、生卒、一段话，以及只属于 TA 的传记和地图。
 * 档案里的一切都用墨色，和「我」的印泥色分开。
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { buildLifeBook, canBeMemorial, lifeSpan, type Person } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useNow, usePerson, useTraces } from '@/data/hooks';
import { exportBook } from '@/lib/exportBook';
import { TraceMap } from '@/map/TraceMap';
import { T } from '@/ui/T';
import { Icon } from '@/ui/Icon';
import { IconButton, PrimaryButton, QuietButton, Rule } from '@/ui/controls';
import { BookEntry } from '@/ui/BookEntry';
import { PersonAvatar } from '@/ui/PersonAvatar';

type Side = 'story' | 'map';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { c } = useTheme();
  const { t, locale } = useT();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { person, loading } = usePerson(id);
  const { traces } = useTraces(id ?? '__none__');
  const [side, setSide] = useState<Side>('story');
  const book = useMemo(() => buildLifeBook(traces, now), [traces, now]);

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/book', params: { side: 'theirs' } }));

  const header = (
    <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton name="back" label="Back" onPress={back} />
      {person && (
        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center', paddingRight: 8 }}>
          {traces.length > 0 && (
            <QuietButton
              label={t.people.export}
              icon="share"
              tone="soft"
              onPress={() =>
                exportBook(db, { t, locale, author: person.name, owner: person.id, subtitle: subtitleOf(person) || t.book.subtitle }).catch(() => {})
              }
            />
          )}
          <QuietButton label={t.trace.edit} tone="ink" onPress={() => router.push({ pathname: '/person/edit', params: { id: person.id } })} />
        </View>
      )}
    </View>
  );

  if (!person) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        {header}
        {!loading && <T variant="ui" tone="soft" style={{ padding: 20 }}>{t.trace.notFound}</T>}
      </View>
    );
  }

  const tabs = (
    <View style={{ flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderBottomColor: c.rule, paddingHorizontal: 20 }} accessibilityRole="tablist">
      {(
        [
          { key: 'story', label: t.people.tabStory },
          { key: 'map', label: t.people.tabMap },
        ] as const
      ).map((tab) => {
        const on = tab.key === side;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => setSide(tab.key)}
            style={{ paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: on ? c.ink : 'transparent', marginBottom: -1 }}>
            <T variant="ui" weight={on ? 'semi' : 'regular'} tone={on ? 'ink' : 'soft'}>{tab.label}</T>
          </Pressable>
        );
      })}
    </View>
  );

  const write = () => router.push({ pathname: '/compose', params: { owner: person.id } });

  if (side === 'map') {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        {header}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 }}>
          <PersonAvatar person={person} size={40} />
          <View style={{ flex: 1 }}>
            <T variant="ui" weight="semi" serif numberOfLines={1}>{person.name}</T>
            <T variant="meta" tone="soft">{t.people.count(traces.length)}</T>
          </View>
        </View>
        {tabs}
        <View style={{ flex: 1 }}>
          <TraceMap
            traces={traces}
            selectedId={null}
            onSelect={(tid) => tid && router.push(`/trace/${tid}`)}
            onMapPress={(p) => router.push({ pathname: '/compose', params: { owner: person.id, lat: String(p.lat), lng: String(p.lng) } })}
            places={[]}
            landmarks={false}
            topInset={12}
            bottomInset={56}
            paper
          />
          <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 72, bottom: 16 }}>
            <T variant="meta" tone="soft" style={{ backgroundColor: c.sheet, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, overflow: 'hidden' }}>
              {t.people.mapHint}
            </T>
          </View>
        </View>
      </View>
    );
  }

  const sub = subtitleOf(person);
  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 56 }}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <PersonAvatar person={person} size={112} />
          <T variant="display" weight="semi" serif style={{ marginTop: 16 }}>{person.name}</T>
          {sub ? <T variant="small" tone="soft" style={{ marginTop: 4 }}>{sub}</T> : null}
          {person.bio ? <T variant="body" style={{ marginTop: 16 }}>{person.bio}</T> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginTop: 20 }}>
            <PrimaryButton label={t.people.write(person.name)} onPress={write} />
            <QuietButton
              label={t.import.entry}
              icon="camera"
              tone="ink"
              onPress={() => router.push({ pathname: '/import', params: { owner: person.id } })}
            />
          </View>
          {canBeMemorial(person) && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/person/memorial', params: { id: person.id } })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.1, borderColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.ink }} />
              </View>
              <T variant="small" weight={person.visibility === 'memorial' ? 'semi' : 'regular'} tone={person.visibility === 'memorial' ? 'ink' : 'soft'}>
                {person.visibility === 'memorial' ? t.memorial.entryOn : t.memorial.entry}
              </T>
              <Icon name="chevronRight" size={16} color={c.inkFaint} />
            </Pressable>
          )}
        </View>
        {tabs}
        <View style={{ paddingHorizontal: 20 }}>
          {traces.length === 0 && <T variant="body" tone="soft" style={{ marginTop: 28 }}>{t.people.archiveEmpty(person.name)}</T>}
          {book.chapters.map((ch) => (
            <View key={ch.year} style={{ marginTop: 32 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                <T variant="display" weight="semi">{ch.year}</T>
                {ch.placeCount ? <T variant="small" tone="soft">{t.book.chapterPlaces(ch.placeCount)}</T> : null}
              </View>
              <Rule style={{ marginBottom: 8 }} />
              {ch.traces.map((x) => (
                <BookEntry key={x.id} trace={x} locale={locale} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** 「外婆 · 1931 – 2019」「我的猫 · 猫 · 2008 – 2022」 */
function subtitleOf(p: Person): string {
  return [p.relation, p.kind === 'pet' && p.species !== p.relation ? p.species : null, lifeSpan(p)].filter(Boolean).join(' · ');
}
