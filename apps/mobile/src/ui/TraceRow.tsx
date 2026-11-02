import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatTraceDate, isSealed, type Trace } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { T } from './T';
import { Icon } from './Icon';
import { Postmark, stampLabels } from './Postmark';
import { PhotoThumb } from './PhotoThumb';

/** 列表里的一枚印记：小邮戳 + 日期地点 + 两三行字。封存的只露出封存日期。 */
export function TraceRow({ trace, now }: { trace: Trace; now: number }) {
  const { c } = useTheme();
  const { t, locale } = useT();
  const sealed = isSealed(trace, now);
  const labels = stampLabels(trace, locale, t.trace.unknownPlace);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/trace/${trace.id}`)}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 14, paddingVertical: 14, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 52, alignItems: 'center', paddingTop: 2 }}>
        {sealed ? (
          <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: c.rule, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={20} color={c.inkFaint} />
          </View>
        ) : (
          <Postmark diameter={52} {...labels} opacity={0.85} />
        )}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T variant="meta" tone="soft" numberOfLines={1}>
          {formatTraceDate(trace.happenedAt, trace.precision, locale)}
          {trace.place?.name ? `, ${trace.place.name}` : ''}
          {trace.photoIds.length && trace.text ? `, ${t.traces.photoCount(trace.photoIds.length)}` : ''}
        </T>
        {sealed ? (
          <T variant="ui" serif italic tone="faint">
            {t.trace.sealedUntil(formatTraceDate(trace.opensAt!, 'day', locale))}
          </T>
        ) : (
          <T variant="ui" serif numberOfLines={3} italic={!trace.text} tone={trace.text ? 'ink' : 'soft'} style={{ lineHeight: 24 }}>
            {trace.text || t.traces.photoCount(trace.photoIds.length)}
          </T>
        )}
      </View>
      {!sealed && trace.photoIds[0] ? <PhotoThumb id={trace.photoIds[0]} size={56} /> : null}
    </Pressable>
  );
}
