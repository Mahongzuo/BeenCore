/**
 * 传记：一年一章，按时间装订。
 * 年份是这一页唯一的「大字」，其余都让位给用户写下的话。
 *
 * 顶部分成「我的 / 他们」：亲友与宠物各有一份独立的档案，内容不和我的混在一起。
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { buildLifeBook, isSealed, lifeSpan, type Person } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useNow, usePersons, useTraces } from '@/data/hooks';
import { exportBook } from '@/lib/exportBook';
import { useSettings } from '@/lib/settings';
import { T } from '@/ui/T';
import { Icon } from '@/ui/Icon';
import { PrimaryButton, QuietButton, Rule } from '@/ui/controls';
import { BookEntry } from '@/ui/BookEntry';
import { PersonAvatar } from '@/ui/PersonAvatar';

type Side = 'mine' | 'theirs';
// 记住上次看的是哪一边（切换 Tab 回来还在原处）
let lastSide: Side = 'mine';

export default function BookScreen() {
  const { c } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ side?: Side }>();
  const [side, setSideState] = useState<Side>(params.side ?? lastSide);
  const setSide = (s: Side) => {
    lastSide = s;
    setSideState(s);
  };
  useEffect(() => {
    if (params.side) setSide(params.side);
  }, [params.side]);

  const tabs: { key: Side; label: string }[] = [
    { key: 'mine', label: t.people.mine },
    { key: 'theirs', label: t.people.theirs },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.rule }}>
        <View style={{ flexDirection: 'row', gap: 24 }} accessibilityRole="tablist">
          {tabs.map((tab) => {
            const on = tab.key === side;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setSide(tab.key)}
                style={{ paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: on ? (tab.key === 'theirs' ? c.ink : c.stamp) : 'transparent', marginBottom: -1 }}>
                <T variant="ui" weight={on ? 'semi' : 'regular'} tone={on ? 'ink' : 'soft'}>{tab.label}</T>
              </Pressable>
            );
          })}
        </View>
      </View>
      {side === 'mine' ? <MyBook /> : <Archives />}
    </View>
  );
}

function MyBook() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const { t, locale } = useT();
  const now = useNow();
  const { traces, loading } = useTraces();
  const { authorName } = useSettings();
  const book = useMemo(() => buildLifeBook(traces, now), [traces, now]);
  const sealed = traces.filter((x) => isSealed(x, now)).length;
  const author = authorName.trim() || t.book.defaultAuthor;

  return (
    <ScrollView contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T variant="display" weight="semi">{author}</T>
          <T variant="small" tone="soft" style={{ marginTop: 4 }}>
            {book.traceCount ? t.book.summary(book.traceCount, book.placeCount, book.firstYear) : t.book.title}
          </T>
        </View>
        {book.traceCount > 0 && (
          <QuietButton label={t.book.export} icon="share" tone="stamp" onPress={() => exportBook(db, { t, locale, author }).catch(() => {})} />
        )}
      </View>

      {!loading && book.traceCount === 0 && (
        <View style={{ marginTop: 48, gap: 20 }}>
          <T variant="body" tone="soft">{t.book.empty}</T>
          <PrimaryButton label={t.stamp} onPress={() => router.push('/compose')} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}

      {book.chapters.map((ch) => (
        <View key={ch.year} style={{ marginTop: 44 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            <T variant="display" weight="semi">{ch.year}</T>
            <T variant="small" tone="soft">
              {[ch.leadingTheme ? t.themes[ch.leadingTheme] : null, ch.placeCount ? t.book.chapterPlaces(ch.placeCount) : null]
                .filter(Boolean)
                .join(', ')}
            </T>
          </View>
          <Rule style={{ marginBottom: 8 }} />
          {ch.traces.map((x) => (
            <BookEntry key={x.id} trace={x} locale={locale} />
          ))}
        </View>
      ))}

      {sealed > 0 && (
        <View style={{ marginTop: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="lock" size={18} color={c.inkFaint} />
          <T variant="small" tone="faint">{t.book.sealed(sealed)}</T>
        </View>
      )}
    </ScrollView>
  );
}

/** 他们：亲友与宠物的档案列表 */
function Archives() {
  const { t } = useT();
  const { persons, counts, loading } = usePersons();
  const newOne = (kind: 'person' | 'pet') => router.push({ pathname: '/person/edit', params: { kind } });

  return (
    <ScrollView contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 48 }}>
      <T variant="small" tone="soft">{t.people.intro}</T>
      <View style={{ flexDirection: 'row', gap: 20, marginTop: 14, alignItems: 'center' }}>
        <QuietButton label={t.people.newPerson} icon="plus" tone="ink" onPress={() => newOne('person')} />
        <QuietButton label={t.people.newPet} icon="plus" tone="ink" onPress={() => newOne('pet')} />
      </View>
      <Rule style={{ marginTop: 16 }} />

      {!loading && persons.length === 0 && (
        <T variant="body" tone="soft" style={{ marginTop: 40 }}>{t.people.empty}</T>
      )}

      {persons.map((p) => (
        <ArchiveRow key={p.id} person={p} count={counts.get(p.id) ?? 0} />
      ))}
    </ScrollView>
  );
}

function ArchiveRow({ person, count }: { person: Person; count: number }) {
  const { c } = useTheme();
  const { t } = useT();
  const span = lifeSpan(person);
  const sub = [person.relation, person.kind === 'pet' ? person.species : null, span].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/person/${person.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: c.rule,
        opacity: pressed ? 0.7 : 1,
      })}>
      <PersonAvatar person={person} size={64} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="title" weight="semi" serif numberOfLines={1}>{person.name}</T>
        {sub ? <T variant="small" tone="soft" numberOfLines={1}>{sub}</T> : null}
        <T variant="meta" tone="faint">{t.people.count(count)}</T>
      </View>
      <Icon name="chevronRight" size={20} color={c.inkFaint} />
    </Pressable>
  );
}
