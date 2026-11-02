/**
 * 本周：七天，一天一行。
 * 不催促、不打卡——空着的日子就安静地空着。只在本周提供「留一件小事」。
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { isSealed, isoWeek, onThisDay, sameDay, shiftWeek, weekRange, type Trace } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useNow } from '@/data/hooks';
import { T } from '@/ui/T';
import { IconButton, PrimaryButton, QuietButton, Rule } from '@/ui/controls';
import { Postmark, stampLabels } from '@/ui/Postmark';

/** 「印记」Tab 里的本周视图 */
export function WeekView({ traces }: { traces: Trace[] }) {
  const { c } = useTheme();
  const { t, locale } = useT();
  const now = useNow();
  const [anchor, setAnchor] = useState(now);

  const range = weekRange(anchor);
  const wk = isoWeek(anchor);
  const isCurrent = sameDay(weekRange(now).start, range.start);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const dateFmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });

  const byDay = useMemo(() => {
    const live = traces.filter((x) => x.precision === 'day' && !isSealed(x, now) && x.happenedAt >= range.start && x.happenedAt < range.end);
    return range.days.map((d) => live.filter((x) => sameDay(x.happenedAt, d)).sort((a, b) => a.happenedAt - b.happenedAt));
  }, [traces, range.start, range.end, range.days, now]);

  const memories = useMemo(() => (isCurrent ? onThisDay(traces.filter((x) => !isSealed(x, now)), now) : []), [traces, now, isCurrent]);

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <T variant="title" weight="semi">{t.week.title(wk.week)}</T>
            <T variant="small" tone="soft">
              {dateFmt.format(range.days[0])} – {dateFmt.format(range.days[6])}, {wk.year}
            </T>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <IconButton name="chevronLeft" label={t.week.prev} onPress={() => setAnchor((a) => shiftWeek(a, -1))} />
            <IconButton
              name="chevronRight"
              label={t.week.next}
              onPress={() => !isCurrent && setAnchor((a) => shiftWeek(a, 1))}
              tint={isCurrent ? c.rule : undefined}
            />
          </View>
        </View>
        {!isCurrent && <QuietButton label={t.week.thisWeek} tone="stamp" onPress={() => setAnchor(Date.now())} />}

        {memories.length > 0 && (
          <View style={{ marginTop: 24, padding: 16, borderRadius: 8, backgroundColor: c.stampWash, gap: 10 }}>
            <T variant="small" weight="semi" tone="stamp">{t.week.onThisDay}</T>
            {memories.slice(0, 3).map((m) => (
              <Pressable key={m.id} onPress={() => router.push(`/trace/${m.id}`)} style={{ gap: 2 }}>
                <T variant="meta" tone="soft">{t.week.yearsAgo(new Date(now).getFullYear() - new Date(m.happenedAt).getFullYear())}</T>
                <T variant="ui" serif numberOfLines={2}>{m.text}</T>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ marginTop: 28 }}>
          {range.days.map((d, i) => {
            const items = byDay[i];
            const today = sameDay(d, now);
            const future = d > now;
            return (
              <View key={d}>
                <View style={{ flexDirection: 'row', gap: 16, paddingVertical: 16, opacity: future ? 0.4 : 1 }}>
                  <View style={{ width: 76 }}>
                    <T variant="small" weight={today ? 'semi' : 'medium'} tone={today ? 'stamp' : 'ink'}>{dayFmt.format(d)}</T>
                    <T variant="meta" tone="faint">{dateFmt.format(d)}</T>
                  </View>
                  <View style={{ flex: 1, gap: 14 }}>
                    {items.length === 0 ? (
                      <T variant="small" tone="faint" style={{ paddingTop: 1 }}>{future ? ' ' : t.week.emptyDay}</T>
                    ) : (
                      items.map((x) => <WeekItem key={x.id} trace={x} locale={locale} />)
                    )}
                  </View>
                </View>
                {i < 6 && <Rule />}
              </View>
            );
          })}
        </View>

        {isCurrent && (
          <PrimaryButton label={t.week.smallThing} onPress={() => router.push('/compose?small=1')} style={{ marginTop: 28, alignSelf: 'center' }} />
        )}
      </ScrollView>
    </View>
  );
}

function WeekItem({ trace, locale }: { trace: Trace; locale: string }) {
  const { t } = useT();
  const labels = stampLabels(trace, locale, t.trace.unknownPlace);
  return (
    <Pressable onPress={() => router.push(`/trace/${trace.id}`)} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1 }}>
        <T variant="ui" serif numberOfLines={3} italic={!trace.text} tone={trace.text ? 'ink' : 'soft'} style={{ lineHeight: 24 }}>{trace.text || t.traces.photoCount(trace.photoIds.length)}</T>
        {trace.place?.name ? <T variant="meta" tone="soft" style={{ marginTop: 2 }}>{trace.place.name}</T> : null}
      </View>
      {trace.place ? <Postmark diameter={40} line1={String(new Date(trace.happenedAt).getDate())} {...{ top: labels.top }} /> : null}
    </Pressable>
  );
}
