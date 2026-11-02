/**
 * 照片存储（Web）：浏览器没有可靠的文件系统，所以把照片字节存进 SQLite（OPFS 持久化）。
 * localRef 形如 "blob:<photoId>"。
 */
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { ImagePickerAsset } from 'expo-image-picker';
import { DB_NAME } from './db';

// 只用异步接口：同步接口要求页面跨域隔离（SharedArrayBuffer），开发服务器的首页 "/" 不带那两个响应头
let opening: Promise<SQLiteDatabase> | null = null;
const db = () => (opening ??= openDatabaseAsync(DB_NAME));
const urls = new Map<string, string>();

export async function storePhoto(id: string, asset: ImagePickerAsset): Promise<string> {
  const res = await fetch(asset.uri);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const mime = asset.mimeType ?? res.headers.get('content-type') ?? 'image/jpeg';
  await (await db()).runAsync(
    'INSERT OR REPLACE INTO photo_blobs (id, mime, bytes) VALUES (?, ?, ?)',
    id,
    mime,
    bytes,
  );
  return `blob:${id}`;
}

export async function resolvePhotoUri(localRef: string): Promise<string | null> {
  const cached = urls.get(localRef);
  if (cached) return cached;
  const id = localRef.replace(/^blob:/, '');
  const row = await (await db()).getFirstAsync<{ mime: string; bytes: Uint8Array }>(
    'SELECT mime, bytes FROM photo_blobs WHERE id = ?',
    id,
  );
  if (!row) return null;
  const url = URL.createObjectURL(new Blob([new Uint8Array(row.bytes)], { type: row.mime }));
  urls.set(localRef, url);
  return url;
}

export async function readPhotoBytes(localRef: string): Promise<Uint8Array | null> {
  const id = localRef.replace(/^blob:/, '');
  const row = await (await db()).getFirstAsync<{ bytes: Uint8Array }>('SELECT bytes FROM photo_blobs WHERE id = ?', id);
  return row ? new Uint8Array(row.bytes) : null;
}

export async function removePhoto(localRef: string): Promise<void> {
  const id = localRef.replace(/^blob:/, '');
  await (await db()).runAsync('DELETE FROM photo_blobs WHERE id = ?', id);
  const url = urls.get(localRef);
  if (url) URL.revokeObjectURL(url);
  urls.delete(localRef);
}
