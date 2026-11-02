import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getPhoto } from '@/data/db';
import { resolvePhotoUri } from '@/data/photoStore';
import { useTheme } from '@/theme';

/** 按原始比例显示一张本地照片 */
export function PhotoView({ id }: { id: string }) {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const [src, setSrc] = useState<{ uri: string; ratio: number } | null>(null);
  useEffect(() => {
    let alive = true;
    getPhoto(db, id).then(async (p) => {
      if (!p?.localRef) return;
      const uri = await resolvePhotoUri(p.localRef);
      if (alive && uri) setSrc({ uri, ratio: p.width && p.height ? p.width / p.height : 4 / 3 });
    });
    return () => {
      alive = false;
    };
  }, [db, id]);
  if (!src) return <View style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: c.rule, borderRadius: 2 }} />;
  return <Image source={{ uri: src.uri }} style={{ width: '100%', aspectRatio: src.ratio, borderRadius: 2, backgroundColor: c.rule }} resizeMode="cover" />;
}
