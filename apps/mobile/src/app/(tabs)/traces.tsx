/**
 * 印记：全部 / 本周 / 地点。
 * 参考旧版「故事 / 足迹 / 人生时刻」，但只保留整理自己痕迹需要的东西。
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useTraces } from '@/data/hooks';
import { T } from '@/ui/T';
import { QuietButton } from '@/ui/controls';
import { router } from 'expo-router';
import { AllTraces } from '@/views/AllTraces';
import { WeekView } from '@/views/WeekView';
import { PlacesView } from '@/views/PlacesView';

type View_ = 'all' | 'week' | 'places';

export default function TracesScreen() {
  const { c } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { traces } = useTraces();
  const [view, setView] = useState<View_>('all');

  const tabs: { key: View_; label: string }[] = [
    { key: 'all', label: t.traces.all },
    { key: 'week', label: t.traces.week },
    { key: 'places', label: t.traces.places },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.rule }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T variant="display" weight="semi">{t.traces.title}</T>
          <QuietButton label={t.import.entry} icon="camera" tone="stamp" onPress={() => router.push('/import')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 12 }} accessibilityRole="tablist">
          {tabs.map((tab) => {
            const on = tab.key === view;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setView(tab.key)}
                style={{ paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: on ? c.stamp : 'transparent', marginBottom: -1 }}>
                <T variant="ui" weight={on ? 'semi' : 'regular'} tone={on ? 'ink' : 'soft'}>{tab.label}</T>
              </Pressable>
            );
          })}
        </View>
      </View>
      {view === 'all' && <AllTraces traces={traces} />}
      {view === 'week' && <WeekView traces={traces} />}
      {view === 'places' && <PlacesView traces={traces} />}
    </View>
  );
}
