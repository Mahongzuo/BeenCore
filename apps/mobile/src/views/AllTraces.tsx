/**
 * 全部印记：搜索、排序、筛选。
 * 筛选片横向一行；年份范围展开成两个步进器。列表按年份分段。
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, TextInput, View } from 'react-native';
import {
  THEMES,
  filterTraces,
  fonts,
  sectionsByYear,
  yearDensity,
  type Theme,
  type Trace,
  type TraceQuery,
  type TraceSort,
} from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useNow } from '@/data/hooks';
import { T } from '@/ui/T';
import { Icon } from '@/ui/Icon';
import { Chip, IconButton, QuietButton, Rule } from '@/ui/controls';
import { TraceRow } from '@/ui/TraceRow';

const SORTS: TraceSort[] = ['happened-desc', 'happened-asc', 'created-desc'];
type Flag = 'withPhotos' | 'oldMemories' | 'sealed' | 'signed';

export function AllTraces({ traces }: { traces: Trace[] }) {
  const { c } = useTheme();
  const { t } = useT();
  const now = useNow();
  const [text, setText] = useState('');
  const [sort, setSort] = useState<TraceSort>('happened-desc');
  const [flags, setFlags] = useState<Record<Flag, boolean>>({ withPhotos: false, oldMemories: false, sealed: false, signed: false });
  const [themes, setThemes] = useState<Theme[]>([]);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);

  const years = useMemo(() => yearDensity(traces, now), [traces, now]);
  const firstYear = years[0]?.year ?? new Date(now).getFullYear();
  const lastYear = new Date(now).getFullYear();

  const query: TraceQuery = { text, sort, themes, ...flags, fromYear: range?.from ?? null, toYear: range?.to ?? null };
  const results = useMemo(() => filterTraces(traces, query, now), [traces, text, sort, themes, flags, range, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = useMemo(
    () => sectionsByYear(results, sort === 'created-desc' ? 'createdAt' : 'happenedAt').map((s) => ({ title: s.year, data: s.traces })),
    [results, sort],
  );
  const active = !!text.trim() || themes.length > 0 || Object.values(flags).some(Boolean) || !!range;

  const clear = () => {
    setText('');
    setThemes([]);
    setFlags({ withPhotos: false, oldMemories: false, sealed: false, signed: false });
    setRange(null);
    setRangeOpen(false);
  };
  const toggleFlag = (f: Flag) => setFlags((cur) => ({ ...cur, [f]: !cur[f] }));
  const toggleTheme = (th: Theme) => setThemes((cur) => (cur.includes(th) ? cur.filter((x) => x !== th) : [...cur, th]));

  const header = (
    <View style={{ paddingTop: 16, gap: 12 }}>
      {/* 搜索 + 排序 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 12, borderRadius: 21, backgroundColor: c.sheet, borderWidth: 1, borderColor: c.rule }}>
          <Icon name="search" size={18} color={c.inkFaint} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.traces.search}
            placeholderTextColor={c.inkFaint}
            returnKeyType="search"
            style={{ flex: 1, fontFamily: fonts.ui, fontSize: 16, color: c.ink, outlineStyle: 'none' } as object}
          />
          {text ? <IconButton name="close" label={t.traces.clear} size={28} onPress={() => setText('')} /> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.traces.sort[sort]}
          onPress={() => setSort((s) => SORTS[(SORTS.indexOf(s) + 1) % SORTS.length])}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, height: 42, paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
          <Icon name="sort" size={18} color={c.inkSoft} />
          <T variant="small" tone="soft">{t.traces.sort[sort]}</T>
        </Pressable>
      </View>

      {/* 筛选片 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
        <Chip label={range ? `${range.from}–${range.to}` : t.traces.years} selected={!!range || rangeOpen} onPress={() => {
          if (!rangeOpen && !range) setRange({ from: firstYear, to: lastYear });
          setRangeOpen((o) => !o);
        }} />
        <Chip label={t.traces.photos} selected={flags.withPhotos} onPress={() => toggleFlag('withPhotos')} />
        <Chip label={t.traces.old} selected={flags.oldMemories} onPress={() => toggleFlag('oldMemories')} />
        <Chip label={t.traces.signed} selected={flags.signed} onPress={() => toggleFlag('signed')} />
        <Chip label={t.traces.sealed} selected={flags.sealed} onPress={() => toggleFlag('sealed')} />
        <View style={{ width: 1, backgroundColor: c.rule, marginHorizontal: 4 }} />
        {THEMES.map((th) => (
          <Chip key={th} label={t.themes[th]} selected={themes.includes(th)} onPress={() => toggleTheme(th)} />
        ))}
      </ScrollView>

      {rangeOpen && range && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 }}>
          <YearStepper value={range.from} min={firstYear} max={range.to} onChange={(v) => setRange({ ...range, from: v })} />
          <T variant="title" tone="faint" style={{ alignSelf: 'center' }}>–</T>
          <YearStepper value={range.to} min={range.from} max={lastYear} onChange={(v) => setRange({ ...range, to: v })} />
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
        <T variant="small" tone="soft">{t.traces.count(results.length)}</T>
        {active && <QuietButton label={t.traces.clear} tone="stamp" onPress={clear} style={{ paddingVertical: 4 }} />}
      </View>
    </View>
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={(x) => x.id}
      ListHeaderComponent={header}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      renderSectionHeader={({ section }) => (
        <View style={{ paddingTop: 20, paddingBottom: 4, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <T variant="title" weight="semi">{section.title}</T>
          <T variant="meta" tone="faint">{section.data.length}</T>
        </View>
      )}
      renderItem={({ item }) => <TraceRow trace={item} now={now} />}
      ItemSeparatorComponent={() => <Rule />}
      ListEmptyComponent={
        <View style={{ paddingVertical: 48, gap: 12, alignItems: 'flex-start' }}>
          <T variant="body" tone="soft">{active ? t.traces.none : t.book.empty}</T>
        </View>
      }
    />
  );
}

function YearStepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <IconButton name="chevronLeft" label="−" onPress={() => value > min && onChange(value - 1)} tint={value <= min ? c.rule : undefined} />
      <T variant="ui" weight="semi" style={{ minWidth: 48, textAlign: 'center' }}>{value}</T>
      <IconButton name="chevronRight" label="+" onPress={() => value < max && onChange(value + 1)} tint={value >= max ? c.rule : undefined} />
    </View>
  );
}
