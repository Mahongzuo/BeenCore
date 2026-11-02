/**
 * 照片存储（iOS / Android）：复制到 App 的文档目录，系统不会清理那里。
 * Web 版见 photoStore.web.ts。
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function extOf(asset: ImagePickerAsset): string {
  const fromMime = asset.mimeType?.split('/')[1];
  if (fromMime) return fromMime === 'jpeg' ? 'jpg' : fromMime;
  const m = /\.([a-z0-9]+)(?:\?|$)/i.exec(asset.uri);
  return m?.[1]?.toLowerCase() ?? 'jpg';
}

/** 保存选中的照片，返回本地引用（文件 URI） */
export async function storePhoto(id: string, asset: ImagePickerAsset): Promise<string> {
  const dest = new File(photosDir(), `${id}.${extOf(asset)}`);
  if (dest.exists) dest.delete();
  await new File(asset.uri).copy(dest);
  return dest.uri;
}

/** 可直接给 <Image source={{ uri }}> 用的地址 */
export async function resolvePhotoUri(localRef: string): Promise<string | null> {
  return new File(localRef).exists ? localRef : null;
}

export async function readPhotoBytes(localRef: string): Promise<Uint8Array | null> {
  const f = new File(localRef);
  return f.exists ? f.bytes() : null;
}

export async function removePhoto(localRef: string): Promise<void> {
  const f = new File(localRef);
  if (f.exists) f.delete();
}
