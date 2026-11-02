/**
 * 地图上三种痕迹的标记，一眼能分清：
 * - 我的：印泥色的小邮戳（TraceDot）
 * - 别人来过：一圈淡墨细线，中间是人数
 * - 历史：一枚墨色方印，中间是人数
 * - 纪念：一圈墨色单线，中间一个小点（已离世的人和宠物的公开纪念）
 */
import { View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { fonts } from '@been/core';
import { useTheme } from '@/theme';
import { T } from '@/ui/T';
import type { PlacePoint } from './types';

export const MARK_SIZE = 28;

export function OthersMark({ count }: { count: number }) {
  const { c } = useTheme();
  const s = MARK_SIZE;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={s} height={s} style={{ position: 'absolute' }}>
        <Circle cx={s / 2} cy={s / 2} r={s / 2 - 1.5} fill={c.paper} fillOpacity={0.85} stroke={c.inkSoft} strokeWidth={1} />
      </Svg>
      <T variant="meta" tone="soft" style={{ fontFamily: fonts.uiMedium, fontSize: 11, lineHeight: 13 }}>
        {count > 999 ? '999+' : count}
      </T>
    </View>
  );
}

export function HistoryMark({ count }: { count: number }) {
  const { c } = useTheme();
  const s = MARK_SIZE - 4;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={s} height={s} style={{ position: 'absolute' }}>
        <Rect x={1} y={1} width={s - 2} height={s - 2} rx={3} fill={c.paper} fillOpacity={0.85} stroke={c.ink} strokeWidth={1.2} />
      </Svg>
      <T variant="meta" style={{ fontFamily: fonts.textMedium, fontSize: 11, lineHeight: 13 }}>
        {count}
      </T>
    </View>
  );
}

export function MemorialMark() {
  const { c } = useTheme();
  const s = MARK_SIZE - 6;
  return (
    <Svg width={s} height={s}>
      <Circle cx={s / 2} cy={s / 2} r={s / 2 - 1.2} fill={c.paper} fillOpacity={0.9} stroke={c.ink} strokeWidth={1.1} />
      <Circle cx={s / 2} cy={s / 2} r={2.2} fill={c.ink} />
    </Svg>
  );
}

/** 按种类画「别人的」地点 */
export function PlaceMark({ place }: { place: PlacePoint }) {
  if (place.kind === 'memorial') return <MemorialMark />;
  if (place.kind === 'others') return <OthersMark count={place.count} />;
  return <HistoryMark count={place.count} />;
}
