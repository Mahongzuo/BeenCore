/**
 * 时光滑轨：一把横向的尺子。
 *
 * 第一级每一年一格：刻度高低是那年的印记数，空白的年份也保留。
 * 点一年，尺子展开成那一年的十二个月；再点一个月，地图只显示那个月。
 * 左端的「所有年份」/「‹ 2023」用来一级一级退回去。
 */
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { T } from './T';
import { Icon } from './Icon';

const COL = 44;
const MAX_TICK = 26;

export interface TimeSel {
  year: number | null;
  month: number | null;
}

export function TimeRail({
  years,
  months,
  value,
  onChange,
}: {
  years: { year: number; count: number }[];
  /** 选中年份的 12 个月计数；未选年份时忽略 */
  months: number[];
  value: TimeSel;
  onChange: (v: TimeSel) => void;
}) {
  const { c } = useTheme();
  const { t } = useT();
  const scroll = useRef<ScrollViewInstance>(null);
  const yearMode = value.year === null;

  useEffect(() => {
    const id = setTimeout(() => {
      if (yearMode) scroll.current?.scrollToEnd({ animated: false });
      else scroll.current?.scrollTo({ x: Math.max(0, ((value.month ?? 0) - 3) * COL), animated: false });
    }, 0);
    return () => clearTimeout(id);
  }, [years.length, yearMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = yearMode
    ? years.map((y) => ({ key: y.year, label: String(y.year), count: y.count, on: false }))
    : months.map((n, i) => ({ key: i, label: t.months[i], count: n, on: value.month === i }));
  const max = Math.max(1, ...cells.map((x) => x.count));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(yearMode ? { year: null, month: null } : value.month !== null ? { year: value.year, month: null } : { year: null, month: null })}
        style={{ paddingLeft: 16, paddingRight: 12, paddingBottom: 6, justifyContent: 'flex-end', height: MAX_TICK + 32 }}>
        {yearMode ? (
          <T variant="small" weight="semi" tone="stamp">{t.map.allYears}</T>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Icon name="chevronLeft" size={16} color={c.stamp} />
            <T variant="small" weight="semi" tone="stamp">{value.year}</T>
          </View>
        )}
      </Pressable>
      <View style={{ width: 1, height: MAX_TICK + 20, backgroundColor: c.rule, marginBottom: 6 }} />
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, alignItems: 'flex-end' }}>
        {cells.map((cell) => {
          const h = cell.count ? 6 + (cell.count / max) * (MAX_TICK - 6) : 3;
          return (
            <Pressable
              key={cell.key}
              accessibilityRole="button"
              accessibilityLabel={`${cell.label}, ${cell.count}`}
              accessibilityState={{ selected: cell.on }}
              onPress={() =>
                yearMode
                  ? onChange({ year: cell.key, month: null })
                  : onChange({ year: value.year, month: cell.on ? null : cell.key })
              }
              style={{ width: COL, alignItems: 'center', justifyContent: 'flex-end', height: MAX_TICK + 32 }}>
              <View
                style={{
                  width: cell.on ? 4 : 2,
                  height: h,
                  borderRadius: 1,
                  backgroundColor: cell.count ? (cell.on ? c.stamp : c.inkSoft) : c.rule,
                  marginBottom: 6,
                }}
              />
              <T variant="meta" weight={cell.on ? 'semi' : 'regular'} tone={cell.on ? 'stamp' : cell.count ? 'soft' : 'faint'}>
                {cell.label}
              </T>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
