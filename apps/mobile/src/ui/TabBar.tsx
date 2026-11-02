/**
 * 底部导航：地图、印记 | 印章 | 传记、我。
 * 中间的印章是全应用唯一的强调——留下印记是 Been 唯一的主动作。
 */
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { T } from './T';
import { Icon, type IconName } from './Icon';

const ICONS: Record<string, IconName> = { index: 'map', traces: 'traces', book: 'book', you: 'you' };

export const TAB_BAR_HEIGHT = 64;

export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const labels: Record<string, string> = { index: t.tabs.map, traces: t.tabs.traces, book: t.tabs.book, you: t.tabs.you };

  const tab = (routeName: string) => {
    const index = state.routes.findIndex((r) => r.name === routeName);
    const route = state.routes[index];
    if (!route) return null;
    const focused = state.index === index;
    const color = focused ? c.ink : c.inkFaint;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={labels[routeName]}
        onPress={() => {
          const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigateToTab(route.key);
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, height: TAB_BAR_HEIGHT }}>
        <Icon name={ICONS[routeName]} color={color} size={22} />
        <T variant="meta" weight={focused ? 'semi' : 'regular'} style={{ color }}>
          {labels[routeName]}
        </T>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: insets.bottom,
        paddingHorizontal: 8,
        backgroundColor: c.paper,
        borderTopWidth: 1,
        borderTopColor: c.rule,
      }}>
      {tab('index')}
      {tab('traces')}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <StampButton onPress={() => router.push('/compose')} label={t.stamp} />
      </View>
      {tab('book')}
      {tab('you')}
    </View>
  );
}

export function StampButton({ onPress, label, size = 58 }: { onPress: () => void; label: string; size?: number }) {
  const { c } = useTheme();
  const r = size / 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        marginTop: -18,
        borderRadius: r,
        transform: [{ scale: pressed ? 0.94 : 1 }, { rotate: pressed ? '-6deg' : '0deg' }],
        shadowColor: c.stamp,
        shadowOpacity: 0.28,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      })}>
      <Svg width={size} height={size}>
        <Circle cx={r} cy={r} r={r} fill={c.stamp} />
        <Circle cx={r} cy={r} r={r - 5} fill="none" stroke={c.onStamp} strokeWidth={1.2} opacity={0.55} />
        <Circle cx={r} cy={r} r={r - 8} fill="none" stroke={c.onStamp} strokeWidth={0.8} strokeDasharray="1.5 2.5" opacity={0.55} />
        <Path d={`M${r} ${r - 8}v16M${r - 8} ${r}h16`} stroke={c.onStamp} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    </Pressable>
  );
}
