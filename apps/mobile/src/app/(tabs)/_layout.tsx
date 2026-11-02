import { Tabs } from 'expo-router/tabs';
import { useTheme } from '@/theme';
import { TabBar } from '@/ui/TabBar';

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.paper } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="traces" />
      <Tabs.Screen name="book" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}
