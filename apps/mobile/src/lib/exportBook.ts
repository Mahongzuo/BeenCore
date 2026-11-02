/**
 * 导出：人生之书（单文件 HTML，照片内嵌）与档案包（JSON）。
 * 原生端写到缓存目录后调起系统分享；Web 端直接下载。
 */
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { buildArchive, buildLifeBook, renderBookHtml } from '@been/core';
import type { Strings } from '@/i18n';
import { listPersons, listPhotos, listTraces } from '@/data/db';
import { readPhotoBytes } from '@/data/photoStore';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function deliver(filename: string, mime: string, content: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: filename });
}

/**
 * 导出传记。默认是「我」的；owner 为档案 id 时导出那份档案（author 填 TA 的名字，subtitle 填生卒与关系）。
 */
export async function exportBook(
  db: SQLiteDatabase,
  opts: { t: Strings; locale: string; author: string; owner?: string | null; subtitle?: string },
): Promise<void> {
  const [traces, photos] = await Promise.all([listTraces(db, opts.owner ?? null), listPhotos(db)]);
  const book = buildLifeBook(traces);
  const srcs = new Map<string, string>();
  for (const p of photos) {
    if (!p.localRef) continue;
    const bytes = await readPhotoBytes(p.localRef).catch(() => null);
    if (bytes) srcs.set(p.id, `data:${p.mime};base64,${toBase64(bytes)}`);
  }
  const html = renderBookHtml(book, {
    locale: opts.locale,
    author: opts.author,
    photoSrc: (id) => srcs.get(id) ?? null,
    strings: {
      title: opts.t.appName,
      subtitle: opts.subtitle ?? opts.t.book.subtitle,
      chapterPlaces: opts.t.book.chapterPlaces,
      themeLabel: (th) => opts.t.themes[th],
      unknownPlace: opts.t.trace.unknownPlace,
      colophon: opts.t.book.colophon,
    },
  });
  const date = new Date().toISOString().slice(0, 10);
  const who = opts.owner ? `-${opts.author.replace(/[\\/:*?"<>|\s]+/g, '_')}` : '';
  await deliver(`been-book${who}-${date}.html`, 'text/html', html);
}

export async function exportArchive(db: SQLiteDatabase): Promise<void> {
  const [traces, photos, persons] = await Promise.all([listTraces(db, 'all'), listPhotos(db), listPersons(db)]);
  const date = new Date().toISOString().slice(0, 10);
  await deliver(`been-archive-${date}.json`, 'application/json', JSON.stringify(buildArchive(traces, photos, Date.now(), persons), null, 2));
}
