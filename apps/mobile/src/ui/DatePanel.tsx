import { Pressable, View } from 'react-native';
import type { DatePrecision } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { T } from './T';
import { Chip, IconButton } from './controls';

/**
 * 选时间：年份步进 + 月份 + 日期。
 * 记不清月份就停在「年」，记不清日子就停在「月」——精度跟着记忆走。
 */
export function DatePanel({ value, onChange }: { value: { ts: number; precision: DatePrecision }; onChange: (v: { ts: number; precision: DatePrecision }) => void }) {
  const { c } = useTheme();
  const { t } = useT();
  const d = new Date(value.ts);
  const y = d.getFullYear();
  const m = value.precision === 'year' ? null : d.getMonth();
  const day = value.precision === 'day' ? d.getDate() : null;
  const thisYear = new Date().getFullYear();
  const daysIn = m === null ? 0 : new Date(y, m + 1, 0).getDate();

  const set = (year: number, month: number | null, dd: number | null) => {
    const precision: DatePrecision = month === null ? 'year' : dd === null ? 'month' : 'day';
    const ts = new Date(year, month ?? 0, dd ?? 1, 12).getTime();
    onChange({ ts: Math.min(ts, Date.now()), precision });
  };

  return (
    <View style={{ paddingVertical: 12, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <IconButton name="chevronLeft" label="Previous year" onPress={() => set(y - 1, m, day)} />
        <T variant="title" weight="semi" style={{ minWidth: 64, textAlign: 'center' }}>{y}</T>
        <IconButton name="chevronRight" label="Next year" onPress={() => y < thisYear && set(y + 1, m, day)} tint={y >= thisYear ? c.rule : undefined} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label={t.compose.notSure} selected={m === null} onPress={() => set(y, null, null)} />
        {t.months.map((label, i) => (
          <Chip key={label} label={label} selected={m === i} onPress={() => set(y, i, day && day <= new Date(y, i + 1, 0).getDate() ? day : null)} />
        ))}
      </View>
      {m !== null && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label={t.compose.notSure} selected={day === null} onPress={() => set(y, m, null)} />
          {Array.from({ length: daysIn }, (_, i) => i + 1).map((n) => (
            <DayCell key={n} n={n} on={day === n} onPress={() => set(y, m, n)} />
          ))}
        </View>
      )}
    </View>
  );
}

function DayCell({ n, on, onPress }: { n: number; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.stamp : 'transparent' }}>
      <T variant="small" tone={on ? 'onStamp' : 'soft'} weight={on ? 'semi' : 'regular'}>{n}</T>
    </Pressable>
  );
}

