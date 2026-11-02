/**
 * 同步协议：本地优先 + 后写胜出（LWW）。
 *
 * - 客户端每次改动写进 outbox，联网时 push。
 * - 服务端给每次写入分配单调递增的 seq，客户端用 since=seq 增量 pull。
 * - 冲突按 updatedAt 比较，晚者胜；时间戳相同视为同一版本，不重复写。
 * - 删除是墓碑（deletedAt），不是物理删除。
 *
 * 一个人的印记很少会在两台设备上同时被改，LWW 足够，且简单到不会出错。
 */
import type { Person, Photo, Trace } from './types.ts';

export type Entity = 'trace' | 'photo' | 'person';
export const ENTITIES: readonly Entity[] = ['trace', 'photo', 'person'];
export type Payload = Trace | Photo | Person;

export interface Mutation {
  /** 幂等键：同一个 mutation 重复 push 不会重复生效 */
  mutationId: string;
  entity: Entity;
  entityId: string;
  /** 实体完整快照（含 deletedAt 墓碑） */
  payload: Payload;
  updatedAt: number;
}

export interface PushRequest {
  deviceId: string;
  mutations: Mutation[];
}

export interface PushResponse {
  /** 已被服务端接受（或因更旧而被忽略）的 mutationId，客户端可以从 outbox 移除 */
  acked: string[];
  seq: number;
}

export interface PullResponse {
  changes: { entity: Entity; payload: Payload; seq: number }[];
  /** 下一次 pull 用的游标 */
  seq: number;
  hasMore: boolean;
}

/** 两个版本谁该留下。true 表示 incoming 应覆盖 current。 */
export function shouldApply(
  current: { updatedAt: number; id: string } | null | undefined,
  incoming: { updatedAt: number; id: string },
): boolean {
  if (!current) return true;
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt;
  return false; // 同一时刻的同一实体视为同一版本，不重复写
}

/** 合并一批变更到本地集合，返回需要写入的实体 */
export function mergeChanges<T extends { id: string; updatedAt: number }>(
  local: Map<string, T>,
  incoming: T[],
): T[] {
  const toWrite: T[] = [];
  for (const item of incoming) {
    if (shouldApply(local.get(item.id), item)) {
      local.set(item.id, item);
      toWrite.push(item);
    }
  }
  return toWrite;
}

/**
 * 按时间排序的 id（类 UUIDv7）：前 12 位是毫秒时间戳的十六进制，后面是随机数。
 * 字典序即时间序，离线生成也不会冲突。
 */
export function newId(now = Date.now(), random: () => number = Math.random): string {
  const time = now.toString(16).padStart(12, '0');
  let rand = '';
  for (let i = 0; i < 20; i++) rand += Math.floor(random() * 16).toString(16);
  return `${time}${rand}`;
}
