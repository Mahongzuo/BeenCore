/**
 * 传送：去别处看看。
 *
 * 搜索用的是随 App 打包的 1251 座城市（Natural Earth，中英文名），离线、免费。
 * 不搜索时给三种去处：随便去一个地方、有人来过的地方、历史名城。
 * 选定后回到地图并飞过去，图层会让你看见那里的地点墙、历史人物与景点。
 */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, historyPlaces, type Seed, type WallPoint } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { walls } from '@/data/sync';
import seedData from '@/data/seeds.json';
import { CITIES, type City } from '@/map/basemap';
import { T } from '@/ui/T';
import { Icon } from '@/ui/Icon';
import { IconButton, PrimaryButton, Rule } from '@/ui/controls';

interface Dest {
  key: string;
  lat: number;
  lng: number;
  name: string;
  sub: string | null;
  /** 取景宽度（km） */
  span: number;
}

const BY_EN = new Map(CITIES.map((c) => [c[0].toLowerCase(), c]));

function cityDest(c: City, zh: boolean): Dest {
  const [en, cn, lat, lng, rank, iso] = c;
  return {
    key: `c:${en}:${lat}`,
    lat,
    lng,
    name: zh && cn ? cn : en,
    sub: [zh && cn ? en : cn || null, iso].filter(Boolean).join(', ') || null,
    // 取景宽度：大城市看到周边几百公里，小城市近一些
    span: rank <= 2 ? 300 : 200,
  };
}

export default function TeleportScreen() {
  const { c } = useTheme();
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const zh = lang === 'zh';
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<WallPoint[]>([]);

  // 有人来过的地方：全球人数最多的几面墙（离线时这一节不显示）
  useEffect(() => {
    walls
      .inView({ minLat: -80, maxLat: 80, minLng: -180, maxLng: 180 })
      .then((list) => setBusy(list.slice(0, 8)))
      .catch(() => {});
  }, []);

  const history = useMemo<Dest[]>(
    () =>
      historyPlaces(seedData as Seed[])
        .sort((a, b) => b.count - a.count)
        .map((h) => {
          const city = h.name ? BY_EN.get(h.name.toLowerCase()) ?? BY_EN.get(h.name.replace(' City', '').toLowerCase()) : undefined;
          return {
            key: `h:${h.key}`,
            lat: h.lat,
            lng: h.lng,
            name: city && zh && city[1] ? city[1] : h.name ?? '',
            sub: t.teleport.historyCount(h.count),
            span: 250,
          };
        }),
    [zh, t],
  );

  const results = useMemo<Dest[]>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return CITIES.filter((ct) => ct[0].toLowerCase().includes(needle) || (ct[1] && ct[1].includes(q.trim())))
      .slice(0, 40)
      .map((ct) => cityDest(ct, zh));
  }, [q, zh]);

  // 关掉传送页、回到原来那张地图（不在导航栈里再压一张新地图）
  const go = (d: { lat: number; lng: number; name: string; span: number }) =>
    router.dismissTo({
      pathname: '/',
      params: { to: `${d.lat},${d.lng}`, toName: d.name, toSpan: String(d.span), seq: String(Date.now()) },
    });

  const random = () => {
    // 一半机会去有人来过的地方，一半去一座大城市
    if (busy.length && Math.random() < 0.5) {
      const w = busy[Math.floor(Math.random() * busy.length)];
      go({ lat: w.lat, lng: w.lng, name: w.name ?? '', span: 80 });
      return;
    }
    const big = CITIES.filter((ct) => ct[4] <= 3);
    go(cityDest(big[Math.floor(Math.random() * big.length)], zh));
  };

  const Row = ({ d }: { d: Dest }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => go(d)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}>
      <Icon name="pin" size={20} color={c.inkFaint} />
      <View style={{ flex: 1 }}>
        <T variant="ui" weight="medium">{d.name}</T>
        {d.sub ? <T variant="meta" tone="faint">{d.sub}</T> : null}
      </View>
      <Icon name="chevronRight" size={18} color={c.inkFaint} />
    </Pressable>
  );

  const busyDests: Dest[] = busy
    .filter((w) => w.name)
    .map((w) => ({ key: `w:${w.key}`, lat: w.lat, lng: w.lng, name: w.name!, sub: t.wall.count(w.count), span: 80 }));

  const sections: { title: string; data: Dest[] }[] = q.trim()
    ? [{ title: '', data: results }]
    : [
        ...(busyDests.length ? [{ title: t.teleport.busy, data: busyDests }] : []),
        { title: t.teleport.history, data: history },
      ];

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton name="close" label={t.compose.cancel} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <T variant="ui" weight="semi">{t.teleport.title}</T>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={sections}
        keyExtractor={(s, i) => s.title + i}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: 23, backgroundColor: c.sheet, borderWidth: 1, borderColor: c.rule }}>
              <Icon name="search" size={18} color={c.inkFaint} />
              <TextInput
                value={q}
                onChangeText={setQ}
                autoFocus
                placeholder={t.teleport.search}
                placeholderTextColor={c.inkFaint}
                style={{ flex: 1, fontFamily: fonts.ui, fontSize: 16, color: c.ink, outlineStyle: 'none' } as object}
              />
            </View>
            {!q.trim() && (
              <View style={{ gap: 6 }}>
                <PrimaryButton label={t.teleport.random} onPress={random} style={{ alignSelf: 'flex-start' }} />
                <T variant="meta" tone="faint">{t.teleport.hint}</T>
              </View>
            )}
          </View>
        }
        renderItem={({ item: sec }) => (
          <View style={{ marginTop: 24 }}>
            {sec.title ? <T variant="small" weight="semi" tone="soft" style={{ marginBottom: 4 }}>{sec.title}</T> : null}
            {sec.data.length === 0 ? (
              <T variant="ui" tone="soft" style={{ paddingVertical: 16 }}>{t.teleport.none}</T>
            ) : (
              sec.data.map((d, i) => (
                <View key={d.key}>
                  {i > 0 && <Rule />}
                  <Row d={d} />
                </View>
              ))
            )}
          </View>
        )}
      />
    </View>
  );
}
