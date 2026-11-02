import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatTraceDate, type Trace } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { T } from './T';
import { Postmark, stampLabels } from './Postmark';
import { PhotoThumb } from './PhotoThumb';

/** 传记里的一条：邮戳 + 日期地点 + 那句话 + 最多四张照片。档案里的用墨色邮戳。 */
export function BookEntry({ trace, locale }: { trace: Trace; locale: string }) {
  const { c } = useTheme();
  const { t } = useT();
  const labels = stampLabels(trace, locale, t.trace.unknownPlace);
  const theirs = trace.ownerId != null;
  return (
    <Pressable
      onPress={() => router.push(`/trace/${trace.id}`)}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 16, paddingVertical: 16, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 64, alignItems: 'center', paddingTop: 2 }}>
        <Postmark
          diameter={64}
          {...labels}
          color={theirs ? c.ink : undefined}
          opacity={theirs ? 0.75 : 0.85}
          tilt={(trace.id.charCodeAt(trace.id.length - 1) % 9) - 4}
        />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T variant="meta" tone="soft">
          {formatTraceDate(trace.happenedAt, trace.precision, locale)}
          {trace.place?.name ? `, ${trace.place.name}` : ''}
        </T>
        {trace.text ? <T variant="body" numberOfLines={6}>{trace.text}</T> : null}
        {trace.photoIds.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            {trace.photoIds.slice(0, 4).map((pid) => (
              <PhotoThumb key={pid} id={pid} size={64} />
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}
