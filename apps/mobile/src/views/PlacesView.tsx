/**
 * 按地点：同一个街区的印记聚成一组，点开看这里发生过的所有事。
 */
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { groupByPlace, isSealed, type Trace } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useNow } from '@/data/hooks';
import { T } from '@/ui/T';
import { Icon } from '@/ui/Icon';
import { Rule } from '@/ui/controls';
import { TraceRow } from '@/ui/TraceRow';

export function PlacesView({ traces }: { traces: Trace[] }) {
  const { c } = useTheme();
  const { t } = useT();
  const now = useNow();
  const groups = useMemo(() => groupByPlace(traces.filter((x) => !isSealed(x, now))), [traces, now]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <FlatList
      data={groups}
      keyExtractor={(g) => g.key}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}
      ItemSeparatorComponent={() => <Rule />}
      ListEmptyComponent={<T variant="body" tone="soft" style={{ paddingVertical: 48 }}>{t.traces.placesEmpty}</T>}
      renderItem={({ item: g }) => {
        const expanded = open === g.key;
        return (
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? null : g.key)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, opacity: pressed ? 0.7 : 1 })}>
              {/* 印记数量用一叠小圆表示：一枚一圈，最多五圈 */}
              <View style={{ width: 52, height: 36, justifyContent: 'center' }}>
                {Array.from({ length: Math.min(5, g.count) }).map((_, i) => (
                  <View
                    key={i}
                    style={{ position: 'absolute', left: i * 5, width: 30, height: 30, borderRadius: 15, borderWidth: 1.2, borderColor: c.stamp, backgroundColor: c.paper, opacity: 0.5 + (i / 5) * 0.5 }}
                  />
                ))}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="ui" weight="semi" numberOfLines={1}>
                  {g.name ?? t.traces.unnamed}
                  {g.country ? <T variant="small" tone="faint">{`  ${g.country}`}</T> : null}
                </T>
                <T variant="small" tone="soft">{t.traces.placeSpan(g.count, g.firstYear, g.lastYear)}</T>
              </View>
              <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
                <Icon name="chevronRight" size={20} color={c.inkFaint} />
              </View>
            </Pressable>
            {expanded && (
              <View style={{ paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: c.stamp, marginLeft: 14, marginBottom: 12 }}>
                {g.traces.map((x, i) => (
                  <View key={x.id}>
                    {i > 0 && <Rule />}
                    <TraceRow trace={x} now={now} />
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      }}
    />
  );
}
