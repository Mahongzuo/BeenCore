/**
 * 交互控件：主按钮、次按钮、标签片、图标按钮、细线。
 * 圆角按层级区分：主操作是完整的圆（像印章），片是胶囊，输入面是小圆角。
 */
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '@/theme';
import { T } from './T';
import { Icon, type IconName } from './Icon';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        {
          height: 52,
          borderRadius: 26,
          paddingHorizontal: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.stamp,
          opacity: disabled ? 0.4 : pressed ? 0.85 : hovered ? 0.94 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          outlineColor: c.ink,
          outlineWidth: focused ? 2 : 0,
          outlineOffset: 2,
        } as ViewStyle,
        style,
      ]}>
      <T variant="ui" weight="semi" tone="onStamp">
        {label}
      </T>
    </Pressable>
  );
}

export function QuietButton({
  label,
  onPress,
  icon,
  tone = 'ink',
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  tone?: 'ink' | 'stamp' | 'soft';
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const color = tone === 'stamp' ? c.stamp : tone === 'soft' ? c.inkSoft : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, opacity: pressed ? 0.6 : 1 },
        style,
      ]}>
      {icon ? <Icon name={icon} size={20} color={color} /> : null}
      <T variant="ui" weight="medium" style={{ color }}>
        {label}
      </T>
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  label,
  size = 40,
  tint,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  tint?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.rule : 'transparent',
      })}>
      <Icon name={name} color={tint} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: selected ? c.stamp : c.rule,
        backgroundColor: selected ? c.stampWash : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}>
      <T variant="small" weight={selected ? 'medium' : 'regular'} tone={selected ? 'stamp' : 'soft'}>
        {label}
      </T>
    </Pressable>
  );
}

export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: 1, backgroundColor: c.rule }, style]} />;
}

/** 设置页等处的一行：标题 + 右侧内容 */
export function Row({ title, children, onPress }: { title: string; children?: ReactNode; onPress?: PressableProps['onPress'] }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        opacity: pressed ? 0.6 : 1,
      })}>
      <T variant="ui">{title}</T>
      {children}
    </Pressable>
  );
}
