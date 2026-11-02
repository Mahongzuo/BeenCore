/**
 * 新建 / 修改一份档案：一个人，或一只宠物。
 *
 * 只有名字是必填的。生卒都可以只记得年份；不记得就不填。
 * 档案默认只在本机和自己的同步副本里，别人看不到。
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import { cleanPerson, fonts, formatTraceDate, newId, type FuzzyDate, type Person, type PersonKind } from '@been/core';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { deletePerson, getPerson, listTraces, savePerson, savePhoto } from '@/data/db';
import { storePhoto } from '@/data/photoStore';
import { compressPhoto } from '@/lib/photoImport';
import { confirm } from '@/lib/confirm';
import { syncMemorialAfterEdit } from '@/lib/memorial';
import { memorials } from '@/data/sync';
import { T } from '@/ui/T';
import { Chip, IconButton, PrimaryButton, QuietButton, Rule } from '@/ui/controls';
import { DatePanel } from '@/ui/DatePanel';
import { PersonAvatar } from '@/ui/PersonAvatar';

const PORTRAIT_EDGE = 1024;

export default function PersonEditScreen() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const { t, lang, locale } = useT();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; kind?: PersonKind }>();

  const [loaded, setLoaded] = useState<Person | null>(null);
  const [kind, setKind] = useState<PersonKind>(params.kind === 'pet' ? 'pet' : 'person');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [species, setSpecies] = useState('');
  const [born, setBorn] = useState<FuzzyDate | null>(null);
  const [gone, setGone] = useState(false);
  const [died, setDied] = useState<FuzzyDate | null>(null);
  const [bio, setBio] = useState('');
  const [portrait, setPortrait] = useState<{ uri: string; asset: ImagePicker.ImagePickerAsset } | null>(null);
  const [open, setOpen] = useState<'born' | 'died' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    getPerson(db, params.id).then((p) => {
      if (!p) return;
      setLoaded(p);
      setKind(p.kind);
      setName(p.name);
      setRelation(p.relation ?? '');
      setSpecies(p.species ?? '');
      setBorn(p.born);
      setGone(!!p.died);
      setDied(p.died);
      setBio(p.bio ?? '');
    });
  }, [db, params.id]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/book'));
  const pet = kind === 'pet';

  async function pickPortrait() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: Platform.OS !== 'web',
      aspect: [1, 1],
      quality: 1,
    });
    if (res.canceled || !res.assets[0]) return;
    setPortrait({ uri: res.assets[0].uri, asset: res.assets[0] });
  }

  async function submit() {
    if (!name.trim()) {
      setError(t.people.nameRequired);
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      const id = loaded?.id ?? newId(now);
      let portraitPhotoId = loaded?.portraitPhotoId ?? null;
      if (portrait) {
        const pid = newId(now);
        try {
          const small = await compressPhoto(portrait.asset, PORTRAIT_EDGE);
          const localRef = await storePhoto(pid, small);
          await savePhoto(db, {
            id: pid,
            traceId: id, // 头像挂在档案上
            width: small.width,
            height: small.height,
            mime: small.mimeType ?? 'image/jpeg',
            localRef,
            remoteKey: null,
            createdAt: now,
          });
          portraitPhotoId = pid;
        } catch {
          setError(t.errors.photo);
        }
      }
      const person = cleanPerson({
        id,
        kind,
        name,
        relation,
        species,
        born,
        died: gone ? (died ?? { at: now, precision: 'year' }) : null,
        portraitPhotoId,
        bio,
        restingPlace: loaded?.restingPlace ?? null,
        visibility: loaded?.visibility ?? 'private',
        memorialTraceIds: loaded?.memorialTraceIds,
        createdAt: loaded?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      });
      await savePerson(db, person);
      // 已公开的纪念页跟着更新（或在不再符合时停止公开），后台进行
      syncMemorialAfterEdit(db, loaded, person, lang);
      if (loaded) leave();
      else router.replace(`/person/${id}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!loaded) return;
    const n = (await listTraces(db, loaded.id)).length;
    if (!(await confirm(t.people.deleteConfirm(loaded.name, n), t.people.delete, t.compose.cancel))) return;
    if (loaded.visibility === 'memorial') await memorials.unpublish(loaded.id).catch(() => {});
    await deletePerson(db, loaded.id);
    router.dismissTo({ pathname: '/book', params: { side: 'theirs' } });
  }

  const dateText = (d: FuzzyDate | null) => (d ? formatTraceDate(d.at, d.precision, locale) : t.people.notSet);
  const inputStyle = {
    fontFamily: fonts.text,
    fontSize: 17,
    color: c.ink,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.rule,
    outlineStyle: 'none',
  } as object;
  const defaultBorn: FuzzyDate = { at: new Date(pet ? 2012 : 1950, 0, 1, 12).getTime(), precision: 'year' };
  const defaultDied: FuzzyDate = { at: new Date(new Date().getFullYear(), 0, 1, 12).getTime(), precision: 'year' };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton name="close" label={t.compose.cancel} onPress={leave} />
        <T variant="ui" weight="semi">{loaded ? t.people.editTitle : t.people.newTitle}</T>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {!loaded && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            <Chip label={t.people.kindPerson} selected={!pet} onPress={() => setKind('person')} />
            <Chip label={t.people.kindPet} selected={pet} onPress={() => setKind('pet')} />
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Pressable onPress={pickPortrait} accessibilityRole="button" accessibilityLabel={t.people.portrait}>
            <PersonAvatar person={{ name: name || '·', portraitPhotoId: loaded?.portraitPhotoId ?? null }} size={96} uri={portrait?.uri} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (error) setError(null);
              }}
              placeholder={pet ? t.people.petNamePlaceholder : t.people.namePlaceholder}
              placeholderTextColor={c.inkFaint}
              maxLength={40}
              autoFocus={!params.id}
              style={{ ...(inputStyle as Record<string, unknown>), fontSize: 26, paddingVertical: 6 } as object}
            />
            <QuietButton
              label={portrait || loaded?.portraitPhotoId ? t.people.changePortrait : t.people.portrait}
              icon="camera"
              tone="ink"
              onPress={pickPortrait}
              style={{ marginTop: 8, alignSelf: 'flex-start' }}
            />
          </View>
        </View>
        {error && <T variant="small" tone="stamp" style={{ marginTop: 8 }}>{error}</T>}

        {pet && (
          <Section label={t.people.species}>
            <TextInput value={species} onChangeText={setSpecies} maxLength={24} style={inputStyle} />
            <Suggest items={t.people.speciesSuggest} value={species} onPick={setSpecies} />
          </Section>
        )}

        <Section label={t.people.relation}>
          <TextInput
            value={relation}
            onChangeText={setRelation}
            maxLength={24}
            placeholder={pet ? '' : t.people.relationPlaceholder}
            placeholderTextColor={c.inkFaint}
            style={inputStyle}
          />
          {!pet && <Suggest items={t.people.relationSuggest} value={relation} onPick={setRelation} />}
        </Section>

        <Rule style={{ marginTop: 24 }} />

        <DateRow label={pet ? t.people.bornPet : t.people.born} value={dateText(born)} set={!!born} onPress={() => setOpen((o) => (o === 'born' ? null : 'born'))} />
        {open === 'born' && (
          <>
            <DatePanel value={born ? { ts: born.at, precision: born.precision } : { ts: defaultBorn.at, precision: 'year' }} onChange={(v) => setBorn({ at: v.ts, precision: v.precision })} />
            {born && <QuietButton label={t.people.notSet} tone="soft" onPress={() => { setBorn(null); setOpen(null); }} style={{ alignSelf: 'flex-start' }} />}
          </>
        )}

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: gone }}
          onPress={() => {
            setGone((g) => !g);
            setOpen(gone ? null : 'died');
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: gone ? c.ink : c.inkFaint, alignItems: 'center', justifyContent: 'center' }}>
            {gone && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink }} />}
          </View>
          <T variant="ui" tone={gone ? 'ink' : 'soft'}>{t.people.gone}</T>
        </Pressable>
        {gone && (
          <DateRow label={t.people.died} value={dateText(died)} set={!!died} onPress={() => setOpen((o) => (o === 'died' ? null : 'died'))} />
        )}
        {gone && open === 'died' && (
          <DatePanel value={died ? { ts: died.at, precision: died.precision } : { ts: defaultDied.at, precision: 'year' }} onChange={(v) => setDied({ at: v.ts, precision: v.precision })} />
        )}

        <Rule style={{ marginTop: 12 }} />

        <Section label={t.people.bio}>
          <TextInput
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={2000}
            placeholder={pet ? t.people.petBioPlaceholder : t.people.bioPlaceholder}
            placeholderTextColor={c.inkFaint}
            style={{ ...(inputStyle as Record<string, unknown>), minHeight: 96, lineHeight: 26, textAlignVertical: 'top' } as object}
          />
        </Section>

        <T variant="meta" tone="faint" style={{ marginTop: 16 }}>{t.people.privateNote}</T>

        {loaded && <QuietButton label={t.people.delete} tone="soft" onPress={remove} style={{ marginTop: 32, alignSelf: 'flex-start' }} />}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16, backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.rule }}>
        <PrimaryButton label={loaded ? t.people.save : t.people.create} onPress={submit} disabled={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <T variant="small" tone="soft">{label}</T>
      {children}
    </View>
  );
}

function Suggest({ items, value, onPick }: { items: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {items.map((x) => (
        <Chip key={x} label={x} selected={value === x} onPress={() => onPick(value === x ? '' : x)} />
      ))}
    </View>
  );
}

function DateRow({ label, value, set, onPress }: { label: string; value: string; set: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <T variant="small" tone="soft">{label}</T>
      <T variant="ui" weight="medium" tone={set ? 'ink' : 'faint'}>{value}</T>
    </Pressable>
  );
}
