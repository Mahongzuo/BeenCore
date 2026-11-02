/**
 * 同步引擎与接口客户端。
 *
 * 只在登录后运行：启动时、回到前台时、每 5 分钟一次，以及用户点「立即同步」。
 * 失败从不影响本地使用——印记已经在设备上了，同步只是多一份副本。
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import {
  seasonLabel,
  type Memorial,
  type MemorialPoint,
  type Photo,
  type PullResponse,
  type PushResponse,
  type Trace,
  type WallPoint,
  type WallSummary,
} from '@been/core';
import { deviceLang } from '@/i18n';
import { getSettings, updateSettings, useSettings } from '@/lib/settings';
import {
  ackMutations,
  applyRemote,
  emitDataChange,
  listPhotos,
  listTraces,
  pendingMutations,
  savePhoto,
  saveTrace,
} from './db';
import { readPhotoBytes } from './photoStore';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const INTERVAL = 5 * 60_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function authHeader(): Record<string, string> {
  const { token } = getSettings();
  if (!token) return {};
  return token.startsWith('dev:') ? { Authorization: `Dev ${token.slice(4)}` } : { Authorization: `Bearer ${token}` };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...authHeader(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
  return body;
}

let running: Promise<void> | null = null;

/** 推送本地改动，再拉取远端增量，最后补传照片。并发调用会合并成一次。 */
export function syncNow(db: SQLiteDatabase): Promise<void> {
  if (!getSettings().token) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    // 1. push
    for (let round = 0; round < 20; round++) {
      const batch = await pendingMutations(db, 100);
      if (!batch.length) break;
      const res = await api<PushResponse>('/sync', {
        method: 'POST',
        body: JSON.stringify({ deviceId: getSettings().deviceId, mutations: batch }),
      });
      await ackMutations(db, res.acked);
      if (res.acked.length === 0) break;
    }
    // 2. pull
    let since = getSettings().syncSeq;
    let changed = false;
    for (let round = 0; round < 50; round++) {
      const res = await api<PullResponse>(`/sync?since=${since}`);
      for (const ch of res.changes) {
        if (await applyRemote(db, ch.entity, ch.payload)) changed = true;
      }
      since = res.seq;
      updateSettings({ syncSeq: since });
      if (!res.hasMore) break;
    }
    // 3. 照片：有本地文件、还没上传的
    const photos = await listPhotos(db);
    for (const p of photos.filter((x) => x.localRef && !x.remoteKey)) {
      await uploadPhoto(db, p);
    }
    // 4. 离线时没签上的地点墙，补签
    for (const t of await listTraces(db)) {
      if (t.visibility === 'wall' && t.wallSeq == null && t.placeKey && t.place) {
        if (await signTraceWall(db, t).catch(() => false)) changed = true;
      }
    }
    updateSettings({ lastSyncAt: Date.now() });
    if (changed) emitDataChange();
  })().finally(() => {
    running = null;
  });
  return running;
}

async function uploadPhoto(db: SQLiteDatabase, p: Photo): Promise<void> {
  const bytes = await readPhotoBytes(p.localRef!);
  if (!bytes) return;
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const res = await api<{ key: string }>(`/media/${p.id}`, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': p.mime },
  });
  await savePhoto(db, { ...p, remoteKey: res.key });
}

export function useAutoSync(): void {
  const db = useSQLiteContext();
  const { token } = useSettings();
  useEffect(() => {
    if (!token) return;
    const run = () => syncNow(db).catch(() => {});
    run();
    const timer = setInterval(run, INTERVAL);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [db, token]);
}

/* ------------------------------------------------------------------ */
/* 地点墙                                                              */
/* ------------------------------------------------------------------ */

export const walls = {
  get: (key: string) => api<WallSummary>(`/walls/${key}`),
  /** 这片范围里有人签过的墙（只有位置和人数），不需要登录 */
  inView: (b: { minLat: number; maxLat: number; minLng: number; maxLng: number }) =>
    api<WallPoint[]>(`/walls?bbox=${[b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(3)).join(',')}`),
  sign: (key: string, body: { lat: number; lng: number; traceId: string; note?: string | null; seasonLabel: string; placeName?: string | null }) =>
    api<{ seq: number }>(`/walls/${key}/visits`, { method: 'POST', body: JSON.stringify(body) }),
  report: (noteId: string) => api<{ ok: true }>(`/notes/${noteId}/report`, { method: 'POST', body: '{}' }),
  block: (noteId: string) => api<{ ok: true }>(`/notes/${noteId}/block-author`, { method: 'POST' }),
};

/* ------------------------------------------------------------------ */
/* 公开纪念                                                            */
/* ------------------------------------------------------------------ */

const bboxParam = (b: { minLat: number; maxLat: number; minLng: number; maxLng: number }) =>
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(3)).join(',');

export const memorials = {
  /** 地图上的纪念印，不需要登录 */
  inView: (b: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => api<MemorialPoint[]>(`/memorials?bbox=${bboxParam(b)}`),
  get: (id: string) => api<{ memorial: Memorial; mine: boolean; status: 'visible' | 'hidden' }>(`/memorials/${id}`),
  publish: (m: Memorial) =>
    api<{ ok: true; status: 'visible' | 'hidden'; missingPhotos: number; url: string }>(`/memorials/${m.id}`, { method: 'PUT', body: JSON.stringify(m) }),
  unpublish: (id: string) => api<{ ok: true }>(`/memorials/${id}`, { method: 'DELETE' }),
  report: (id: string) => api<{ ok: true }>(`/memorials/${id}/report`, { method: 'POST', body: '{}' }),
  photoUrl: (id: string, photoId: string) => `${API_URL}/memorials/${id}/photos/${photoId}`,
  pageUrl: (id: string) => `${API_URL}/m/${id}`,
};

/** 为一枚印记签地点墙，成功则把序号写回印记。返回是否签上。 */
export async function signTraceWall(db: SQLiteDatabase, t: Trace): Promise<boolean> {
  if (!getSettings().token || !t.placeKey || !t.place) return false;
  const res = await walls.sign(t.placeKey, {
    lat: t.place.lat,
    lng: t.place.lng,
    traceId: t.id,
    note: t.wallNote,
    seasonLabel: seasonLabel(t.happenedAt, deviceLocale(), t.place.lat < 0),
    placeName: t.place.name,
  });
  await saveTrace(db, { ...t, wallSeq: res.seq, updatedAt: Date.now() });
  return true;
}

function deviceLocale(): string {
  const l = getSettings().lang;
  return l === 'zh' || (l === 'auto' && deviceLang() === 'zh') ? 'zh' : 'en';
}

export async function signOut(): Promise<void> {
  updateSettings({ token: null, userId: null, syncSeq: 0, lastSyncAt: null });
}
