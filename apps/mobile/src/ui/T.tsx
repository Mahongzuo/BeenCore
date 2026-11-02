import { Text, type TextProps, type TextStyle } from 'react-native';
import { fonts, type } from '@been/core';
import { useTheme } from '@/theme';

type Variant = keyof typeof type;
type Tone = 'ink' | 'soft' | 'faint' | 'stamp' | 'onStamp';
type Weight = 'regular' | 'medium' | 'semi';

export interface TProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: Weight;
  /** 用户写下的文字用衬线体；界面文字用无衬线体 */
  serif?: boolean;
  italic?: boolean;
  align?: TextStyle['textAlign'];
}

/** 全应用唯一的文字组件，保证字号阶梯与字体角色一致 */
export function T({
  variant = 'ui',
  tone = 'ink',
  weight = 'regular',
  serif = variant === 'body',
  italic,
  align,
  style,
  ...rest
}: TProps) {
  const { c } = useTheme();
  const scale = type[variant];
  const color =
    tone === 'ink' ? c.ink : tone === 'soft' ? c.inkSoft : tone === 'faint' ? c.inkFaint : tone === 'stamp' ? c.stamp : c.onStamp;
  const fontFamily = serif
    ? italic
      ? fonts.textItalic
      : weight === 'regular'
        ? fonts.text
        : fonts.textMedium
    : weight === 'semi'
      ? fonts.uiSemi
      : weight === 'medium'
        ? fonts.uiMedium
        : fonts.ui;
  const tracking =
    variant === 'display' || variant === 'numeral' ? -0.5 : variant === 'meta' ? 0.2 : 0;
  return (
    <Text
      {...rest}
      style={[
        { fontFamily, fontSize: scale.size, lineHeight: scale.line, color, letterSpacing: tracking, textAlign: align },
        style,
      ]}
    />
  );
}
