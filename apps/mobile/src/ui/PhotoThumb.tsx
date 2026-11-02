import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getPhoto } from '@/data/db';
import { resolvePhotoUri } from '@/data/photoStore';
import { useTheme } from '@/theme';

/** 方形小缩略图：列表、传记里用 */
export function PhotoThumb({ id, size = 56 }: { id: string; size?: number }) {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getPhoto(db, id).then(async (p) => {
      if (!p?.localRef) return;
      const u = await resolvePhotoUri(p.localRef);
      if (alive && u) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [db, id]);
  if (!uri) return <View style={{ width: size, height: size, borderRadius: 3, backgroundColor: c.rule }} />;
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 3, backgroundColor: c.rule }} resizeMode="cover" />;
}
