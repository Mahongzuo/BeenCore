/**
 * 从相册补记：读照片里的拍摄时间与地点（EXIF），再压缩后存进本地。
 *
 * - EXIF 用 exifr 读，原生和 Web 一致；读不到时退回选择器给的 exif（部分平台会提供）。
 * - 压缩到长边 2048px、JPEG 0.82：同步、导出都更轻。压缩会去掉 EXIF，所以先读后压。
 * - 照片只在本机处理，不上传到任何地方。
 */
import { Platform } from 'react-native';
import exifr from 'exifr';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { parseExifDate, type PhotoMeta } from '@been/core';

export const MAX_IMPORT = 50;
const MAX_EDGE = 2048;

export interface PickedPhoto extends PhotoMeta {
  asset: ImagePickerAsset;
}

async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web' || /^(blob|data|https?):/.test(uri)) {
    return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  }
  return new File(uri).bytes();
}

/** 选择器自带的 exif（iOS 是嵌套的 {Exif}/{GPS}，Android 是平铺的） */
function fromPickerExif(exif: Record<string, unknown> | null | undefined): Partial<PhotoMeta> {
  if (!exif) return {};
  const e = (exif['{Exif}'] as Record<string, unknown> | undefined) ?? exif;
  const g = (exif['{GPS}'] as Record<string, unknown> | undefined) ?? exif;
  const takenAt = parseExifDate(e.DateTimeOriginal ?? exif.DateTime);
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN);
  let lat = num(g.Latitude ?? g.GPSLatitude);
  let lng = num(g.Longitude ?? g.GPSLongitude);
  if ((g.LatitudeRef ?? g.GPSLatitudeRef) === 'S') lat = -Math.abs(lat);
  if ((g.LongitudeRef ?? g.GPSLongitudeRef) === 'W') lng = -Math.abs(lng);
  return {
    takenAt,
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
  };
}

export async function readPhotoMeta(id: string, asset: ImagePickerAsset): Promise<PickedPhoto> {
  let takenAt: number | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const tags = (await exifr.parse(await readBytes(asset.uri), {
      tiff: true,
      exif: true,
      gps: true,
      reviveValues: false,
      pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef'],
    })) as { DateTimeOriginal?: string; CreateDate?: string; latitude?: number; longitude?: number } | undefined;
    if (tags) {
      takenAt = parseExifDate(tags.DateTimeOriginal ?? tags.CreateDate);
      if (Number.isFinite(tags.latitude) && Number.isFinite(tags.longitude)) {
        lat = Math.round(tags.latitude! * 1e5) / 1e5;
        lng = Math.round(tags.longitude! * 1e5) / 1e5;
      }
    }
  } catch {
    // 读不到 EXIF 不算错误：交给选择器的 exif 或者让用户补
  }
  if (takenAt == null || lat == null) {
    const alt = fromPickerExif(asset.exif as Record<string, unknown> | undefined);
    takenAt = takenAt ?? alt.takenAt ?? null;
    if (lat == null && alt.lat != null && alt.lng != null) {
      lat = alt.lat;
      lng = alt.lng;
    }
  }
  return { id, takenAt, lat, lng, asset };
}

/** 压缩：长边不超过 maxEdge（默认 2048px），JPEG */
export async function compressPhoto(asset: ImagePickerAsset, maxEdge = MAX_EDGE): Promise<ImagePickerAsset> {
  try {
    const ctx = ImageManipulator.manipulate(asset.uri, { maxWidth: maxEdge, maxHeight: maxEdge });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    return { ...asset, uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg' };
  } catch {
    return asset; // 压缩失败就用原图，不丢照片
  }
}
