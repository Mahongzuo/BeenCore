/**
 * 设置：原生存在 expo-sqlite 的 kv-store 里，Web 存在 localStorage（见 kv.web.ts），并用 useSyncExternalStore 驱动界面。
 */
import { kv } from './kv';
import { useSyncExternalStore } from 'react';
import { newId } from '@been/core';

export type Appearance = 'system' | 'light' | 'dark';
export type LangSetting = 'auto' | 'en' | 'zh';

export interface Layers {
  mine: boolean;
  others: boolean;
  history: boolean;
  /** 谷歌地图上的景点（只在谷歌地图上有） */
  landmarks: boolean;
  /** 也显示亲友与宠物档案里的印记（墨色），默认关：他们的内容和「我」分开 */
  family: boolean;
  /** 公开纪念：已离世的人和宠物，墨色单圈 */
  memorials: boolean;
}

export interface Settings {
  appearance: Appearance;
  lang: LangSetting;
  authorName: string;
  deviceId: string;
  /** 会话令牌：登录后才有 */
  token: string | null;
  userId: string | null;
  syncSeq: number;
  lastSyncAt: number | null;
  /** 地图图层 */
  layers: Layers;
}

const KEY = 'been.settings.v1';

const defaults = (): Settings => ({
  appearance: 'system',
  lang: 'auto',
  authorName: '',
  deviceId: newId(),
  token: null,
  userId: null,
  syncSeq: 0,
  lastSyncAt: null,
  layers: { mine: true, others: true, history: true, landmarks: true, family: false, memorials: true },
});

function load(): Settings {
  try {
    const raw = kv.get(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      const d = defaults();
      // 新增的图层要有默认值，旧版本保存的设置里没有
      return { ...d, ...saved, layers: { ...d.layers, ...(saved.layers ?? {}) } };
    }
  } catch {
    // 读不到就用默认值，不阻塞启动
  }
  const fresh = defaults();
  try {
    kv.set(KEY, JSON.stringify(fresh));
  } catch {
    // 忽略：下一次写入会重试
  }
  return fresh;
}

let current: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  if (!current) current = load();
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...getSettings(), ...patch };
  try {
    kv.set(KEY, JSON.stringify(current));
  } catch {
    // 写入失败时内存里的值依然生效
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
