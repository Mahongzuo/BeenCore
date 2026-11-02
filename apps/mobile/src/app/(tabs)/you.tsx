import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { fonts, newId } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { updateSettings, useSettings, type Appearance, type LangSetting } from '@/lib/settings';
import { exportArchive, exportBook } from '@/lib/exportBook';
import { countPending, onDataChange } from '@/data/db';
import { signOut, syncNow } from '@/data/sync';
import { loadDemo } from '@/data/demo';
import { T } from '@/ui/T';
import { Chip, QuietButton, Rule } from '@/ui/controls';

export default function YouScreen() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const { t, locale, lang } = useT();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const [pending, setPending] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const load = () => countPending(db).then(setPending).catch(() => {});
    load();
    return onDataChange(load);
  }, [db]);

  const author = s.authorName.trim() || t.book.defaultAuthor;
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <ScrollView style={{ backgroundColor: c.paper }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <T variant="display" weight="semi">{t.you.title}</T>

      <Section title={t.you.name}>
        <TextInput
          value={s.authorName}
          onChangeText={(v) => updateSettings({ authorName: v.slice(0, 40) })}
          placeholder={t.you.namePlaceholder}
          placeholderTextColor={c.inkFaint}
          style={{ fontFamily: fonts.text, fontSize: 18, color: c.ink, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.rule, outlineStyle: 'none' } as object}
        />
      </Section>

      <Section title={t.you.keep}>
        <T variant="small" tone="soft">{t.you.keepBody}</T>
        <QuietButton label={t.you.exportBook} icon="book" tone="stamp" onPress={() => exportBook(db, { t, locale, author }).catch(() => {})} />
        <QuietButton label={t.you.exportArchive} icon="share" tone="stamp" onPress={() => exportArchive(db).catch(() => {})} />
        <T variant="meta" tone="faint" style={{ marginTop: 4 }}>{t.you.promise}</T>
      </Section>

      <Section title={t.you.account}>
        {s.token ? (
          <>
            <T variant="small" tone="soft">{s.lastSyncAt ? t.you.lastSync(fmt.format(s.lastSyncAt)) : t.you.neverSynced}</T>
            {pending > 0 && <T variant="small" tone="soft">{t.you.pending(pending)}</T>}
            {status && <T variant="small" tone="stamp">{status}</T>}
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <QuietButton
                label={t.you.syncNow}
                tone="stamp"
                onPress={() => {
                  setStatus(null);
                  syncNow(db).catch(() => setStatus(t.errors.network));
                }}
              />
              <QuietButton label={t.you.signOut} tone="soft" onPress={signOut} />
            </View>
          </>
        ) : (
          <>
            <T variant="small" tone="soft">{t.you.signedOutBody}</T>
            {__DEV__ && (
              <QuietButton
                label={t.you.signInDev}
                tone="stamp"
                onPress={() => updateSettings({ token: `dev:${s.deviceId.slice(0, 12) || newId().slice(0, 12)}`, userId: s.deviceId })}
              />
            )}
          </>
        )}
      </Section>

      {__DEV__ && (
        <Section title="Developer">
          <QuietButton label="Load sample traces" tone="stamp" onPress={() => loadDemo(db, lang).catch(() => {})} />
        </Section>
      )}

      <Section title={t.you.appearance}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['system', 'light', 'dark'] as Appearance[]).map((a) => (
            <Chip key={a} label={t.you[a]} selected={s.appearance === a} onPress={() => updateSettings({ appearance: a })} />
          ))}
        </View>
      </Section>

      <Section title={t.you.language}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(
            [
              ['auto', t.you.system],
              ['en', 'English'],
              ['zh', '中文'],
            ] as [LangSetting, string][]
          ).map(([v, label]) => (
            <Chip key={v} label={label} selected={s.lang === v} onPress={() => updateSettings({ lang: v })} />
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 36, gap: 10 }}>
      <T variant="ui" weight="semi">{title}</T>
      <Rule />
      {children}
    </View>
  );
}
