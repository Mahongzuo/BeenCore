/**
 * 邮戳：Been 的视觉核心。
 * 外圈上弧写地名，下弧写国家/地区，圆心是日期，右侧是波浪注销线。
 * 几何来自 @been/core，与导出的 HTML 书完全一致。
 */
import { memo, useMemo } from 'react';
import Svg, { Circle, Defs, G, Path, Text as SvgText, TextPath } from 'react-native-svg';
import { fonts, postmarkCenterSize, postmarkDate, postmarkGeometry, type Trace } from '@been/core';
import { useTheme } from '@/theme';

let uid = 0;

export interface PostmarkProps {
  diameter: number;
  top?: string;
  bottom?: string;
  line1?: string;
  line2?: string;
  waves?: boolean;
  color?: string;
  /** 实心：用于地图上被选中的印记 */
  filled?: boolean;
  /** 墨色深浅，模拟盖章的力度 */
  opacity?: number;
  /** 微微旋转，像真的盖上去的 */
  tilt?: number;
}

export const Postmark = memo(function Postmark({
  diameter,
  top = '',
  bottom = '',
  line1 = '',
  line2 = '',
  waves = false,
  color,
  filled = false,
  opacity = 0.92,
  tilt = 0,
}: PostmarkProps) {
  const { c } = useTheme();
  const ink = color ?? c.stamp;
  const g = useMemo(() => postmarkGeometry(diameter, waves), [diameter, waves]);
  const id = useMemo(() => `pm${uid++}`, []);
  const ring = Math.max(1, diameter / 60);
  const ringText = diameter * 0.085;
  const small = diameter < 56;
  const centerBig = small ? diameter * 0.24 : postmarkCenterSize(diameter, line1);
  const centerSmall = diameter * 0.11;
  const fg = filled ? c.onStamp : ink;

  return (
    <Svg
      width={g.width}
      height={g.height}
      viewBox={`0 0 ${g.width} ${g.height}`}
      style={tilt ? { transform: [{ rotate: `${tilt}deg` }] } : undefined}>
      <Defs>
        <Path id={`${id}t`} d={g.topArc} />
        <Path id={`${id}b`} d={g.bottomArc} />
      </Defs>
      <G opacity={opacity}>
        <Circle cx={g.cx} cy={g.cy} r={g.outerR} stroke={ink} strokeWidth={ring} fill={filled ? ink : 'none'} />
        {!small && <Circle cx={g.cx} cy={g.cy} r={g.innerR} stroke={fg} strokeWidth={ring} fill="none" />}
        {g.waves.map((d, i) => (
          <Path key={i} d={d} stroke={ink} strokeWidth={ring} fill="none" strokeLinecap="round" />
        ))}
        {!small && top ? (
          <SvgText fill={fg} fontSize={ringText} fontFamily={fonts.uiSemi} letterSpacing={diameter * 0.012}>
            <TextPath href={`#${id}t`} startOffset="50%" textAnchor="middle">
              {top}
            </TextPath>
          </SvgText>
        ) : null}
        {!small && bottom ? (
          <SvgText fill={fg} fontSize={ringText} fontFamily={fonts.ui} letterSpacing={diameter * 0.012}>
            <TextPath href={`#${id}b`} startOffset="50%" textAnchor="middle">
              {bottom}
            </TextPath>
          </SvgText>
        ) : null}
        {line1 ? (
          <SvgText
            x={g.cx}
            y={small ? g.cy + centerBig * 0.36 : g.cy - centerBig * 0.1}
            fill={fg}
            fontSize={centerBig}
            fontFamily={fonts.uiSemi}
            textAnchor="middle">
            {line1}
          </SvgText>
        ) : null}
        {!small && line2 ? (
          <SvgText x={g.cx} y={g.cy + centerSmall * 1.15} fill={fg} fontSize={centerSmall} fontFamily={fonts.ui} textAnchor="middle">
            {line2}
          </SvgText>
        ) : null}
      </G>
    </Svg>
  );
});

/** 由印记生成邮戳文字的便捷函数 */
export function stampLabels(
  t: Pick<Trace, 'happenedAt' | 'precision' | 'place'>,
  locale: string,
  unknownPlace: string,
) {
  const [line1, line2] = postmarkDate(t.happenedAt, t.precision, locale);
  const zh = locale.startsWith('zh');
  const name = t.place?.name ?? unknownPlace;
  return {
    top: zh ? name.slice(0, 12) : name.toUpperCase().slice(0, 24),
    bottom: zh ? (t.place?.country ?? '') : (t.place?.country ?? '').toUpperCase(),
    line1: line1 || line2,
    line2: line1 ? line2 : '',
  };
}
