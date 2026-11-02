import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { fonts, type Person } from '@been/core';
import { getPhoto, onDataChange } from '@/data/db';
import { resolvePhotoUri } from '@/data/photoStore';
import { useTheme } from '@/theme';
import { T } from './T';

/**
 * 档案的头像：有照片用照片，没有就是名字的第一个字。
 * 外面一圈细墨线：档案里的一切都是墨色，和「我」的印泥色分开。
 */
export function PersonAvatar({ person, size = 56, uri: override }: { person: Pick<Person, 'name' | 'portraitPhotoId'>; size?: number; uri?: string | null }) {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const id = person.portraitPhotoId;
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (!id) return setUri(null);
      getPhoto(db, id).then(async (p) => {
        const u = p?.localRef ? await resolvePhotoUri(p.localRef) : null;
        if (alive) setUri(u);
      });
    };
    load();
    const off = onDataChange(load);
    return () => {
      alive = false;
      off();
    };
  }, [db, id]);
  const src = override ?? uri;
  const ring = Math.max(1, size / 48);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring,
        borderColor: c.ink,
        padding: Math.max(2, size / 28),
        backgroundColor: c.sheet,
      }}>
      {src ? (
        <Image source={{ uri: src }} style={{ flex: 1, borderRadius: size / 2 }} resizeMode="cover" />
      ) : (
        <View style={{ flex: 1, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.paper }}>
          <T style={{ fontFamily: fonts.textMedium, fontSize: size * 0.4, lineHeight: size * 0.5, color: c.inkSoft }}>
            {[...person.name.trim()][0] ?? '·'}
          </T>
        </View>
      )}
    </View>
  );
}
