/**
 * 地图上的一枚印记：远看是一个小小的圆形邮戳。
 * 选中时填满印泥色；多枚重叠时显示数量。
 * tone="ink"：亲友与宠物档案里的印记用墨色，和「我」的印泥色一眼分开。
 */
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fonts } from '@been/core';
import { useTheme } from '@/theme';
import { T } from '@/ui/T';

export const DOT_SIZE = 30;

/** 还没盖下去的印：虚线圈，表示「这里可以留下一枚印记」 */
export function PendingPin() {
  const { c } = useTheme();
  const s = DOT_SIZE + 6;
  return (
    <Svg width={s} height={s}>
      <Circle cx={s / 2} cy={s / 2} r={s / 2 - 2} fill={c.stampWash} stroke={c.stamp} strokeWidth={1.6} strokeDasharray="3 3" />
      <Circle cx={s / 2} cy={s / 2} r={3} fill={c.stamp} />
    </Svg>
  );
}
export const PIN_SIZE = DOT_SIZE + 6;

export function TraceDot({ selected, count = 1, tone = 'stamp' }: { selected?: boolean; count?: number; tone?: 'stamp' | 'ink' }) {
  const { c } = useTheme();
  const s = DOT_SIZE;
  const ink = tone === 'ink' ? c.ink : c.stamp;
  const on = tone === 'ink' ? c.paper : c.onStamp;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={s} height={s} style={{ position: 'absolute' }}>
        <Circle cx={s / 2} cy={s / 2} r={s / 2 - 1.5} fill={selected ? ink : c.sheet} stroke={ink} strokeWidth={1.5} />
        <Circle cx={s / 2} cy={s / 2} r={s / 2 - 5.5} fill="none" stroke={selected ? on : ink} strokeWidth={1} opacity={0.9} />
        {count === 1 && <Circle cx={s / 2} cy={s / 2} r={2.6} fill={selected ? on : ink} />}
      </Svg>
      {count > 1 && (
        <T variant="meta" weight="semi" style={{ color: selected ? on : ink, fontFamily: fonts.uiSemi, fontSize: 11, lineHeight: 13 }}>
          {count > 99 ? '99+' : count}
        </T>
      )}
    </View>
  );
}
