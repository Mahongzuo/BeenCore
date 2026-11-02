/**
 * 本地数据库：一切以这里为准。
 *
 * 每一次写入都同时进 outbox，联网后由同步引擎推送。
 * 印记以 JSON 快照存储，额外的列只用于排序和查询。
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, type Entity, type Mutation, type Payload, type Person, type Photo, type Trace } from '@been/core';

export const DB_NAME = 'been.db';

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS traces (
     id TEXT PRIMARY KEY NOT NULL,
     data TEXT NOT NULL,
     happened_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     deleted_at INTEGER,
     place_key TEXT
   );
   CREATE INDEX IF NOT EXISTS traces_happened ON traces (happened_at);
   CREATE TABLE IF NOT EXISTS photos (
     id TEXT PRIMARY KEY NOT NULL,
     trace_id TEXT NOT NULL,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS photos_trace ON photos (trace_id);
   CREATE TABLE IF NOT EXISTS photo_blobs (
     id TEXT PRIMARY KEY NOT NULL,
     mime TEXT NOT NULL,
     bytes BLOB NOT NULL
   );
   CREATE TABLE IF NOT EXISTS outbox (
     mutation_id TEXT PRIMARY KEY NOT NULL,
     entity TEXT NOT NULL,
     entity_id TEXT NOT NULL,
     payload TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
  // 2：亲友与宠物档案。印记多一列归属，NULL 是「我」
  `ALTER TABLE traces ADD COLUMN owner_id TEXT;
   CREATE INDEX IF NOT EXISTS traces_owner ON traces (owner_id, happened_at);
   CREATE TABLE IF NOT EXISTS persons (
     id TEXT PRIMARY KEY NOT NULL,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     deleted_at INTEGER
   );`,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
}

/* ------------------------------------------------------------------ */
/* 变更通知：写入后通知所有订阅的界面重新读取                           */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();
export function onDataChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function emitDataChange(): void {
  listeners.forEach((l) => l());
}

/* ------------------------------------------------------------------ */
/* 印记                                                                */
/* ------------------------------------------------------------------ */

/**
 * 未删除的印记，按发生时间倒序。
 * owner：null（默认）只取「我」的；档案 id 只取那份档案的；'all' 全部（同步、导出档案包用）。
 */
export async function listTraces(db: SQLiteDatabase, owner: string | null | 'all' = null): Promise<Trace[]> {
  const rows =
    owner === 'all'
      ? await db.getAllAsync<{ data: string }>('SELECT data FROM traces WHERE deleted_at IS NULL ORDER BY happened_at DESC')
      : await db.getAllAsync<{ data: string }>(
          'SELECT data FROM traces WHERE deleted_at IS NULL AND owner_id IS ? ORDER BY happened_at DESC',
          owner,
        );
  return rows.map((r) => JSON.parse(r.data) as Trace);
}

/** 每份档案有几枚印记 */
export async function countTracesByOwner(db: SQLiteDatabase): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ owner_id: string; n: number }>(
    'SELECT owner_id, COUNT(*) AS n FROM traces WHERE deleted_at IS NULL AND owner_id IS NOT NULL GROUP BY owner_id',
  );
  return new Map(rows.map((r) => [r.owner_id, r.n]));
}

export async function getTrace(db: SQLiteDatabase, id: string): Promise<Trace | null> {
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM traces WHERE id = ?', id);
  return row ? (JSON.parse(row.data) as Trace) : null;
}

async function writeTrace(db: SQLiteDatabase, t: Trace): Promise<void> {
  await db.runAsync(
    `INSERT INTO traces (id, data, happened_at, updated_at, deleted_at, place_key, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET data = excluded.data, happened_at = excluded.happened_at,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, place_key = excluded.place_key,
       owner_id = excluded.owner_id`,
    t.id,
    JSON.stringify(t),
    t.happenedAt,
    t.updatedAt,
    t.deletedAt,
    t.placeKey,
    t.ownerId ?? null,
  );
}

async function enqueue(db: SQLiteDatabase, entity: Entity, payload: Payload): Promise<void> {
  // 同一实体只保留最新快照：旧的待推送项直接替换
  await db.runAsync('DELETE FROM outbox WHERE entity = ? AND entity_id = ?', entity, payload.id);
  await db.runAsync(
    'INSERT INTO outbox (mutation_id, entity, entity_id, payload, updated_at) VALUES (?, ?, ?, ?, ?)',
    newId(),
    entity,
    payload.id,
    JSON.stringify(payload),
    'updatedAt' in payload ? payload.updatedAt : payload.createdAt,
  );
}

export async function saveTrace(db: SQLiteDatabase, t: Trace): Promise<void> {
  await db.withTransactionAsync(async () => {
    await writeTrace(db, t);
    await enqueue(db, 'trace', t);
  });
  emitDataChange();
}

export async function deleteTrace(db: SQLiteDatabase, id: string): Promise<void> {
  const t = await getTrace(db, id);
  if (!t) return;
  const now = Date.now();
  await saveTrace(db, { ...t, deletedAt: now, updatedAt: now });
}

/* ------------------------------------------------------------------ */
/* 亲友与宠物档案                                                       */
/* ------------------------------------------------------------------ */

async function writePerson(db: SQLiteDatabase, p: Person): Promise<void> {
  await db.runAsync(
    `INSERT INTO persons (id, data, updated_at, deleted_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    p.id,
    JSON.stringify(p),
    p.updatedAt,
    p.deletedAt,
  );
}

export async function listPersons(db: SQLiteDatabase): Promise<Person[]> {
  const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM persons WHERE deleted_at IS NULL ORDER BY updated_at DESC');
  return rows.map((r) => JSON.parse(r.data) as Person);
}

export async function getPerson(db: SQLiteDatabase, id: string): Promise<Person | null> {
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM persons WHERE id = ?', id);
  return row ? (JSON.parse(row.data) as Person) : null;
}

export async function savePerson(db: SQLiteDatabase, p: Person): Promise<void> {
  await db.withTransactionAsync(async () => {
    await writePerson(db, p);
    await enqueue(db, 'person', p);
  });
  emitDataChange();
}

/** 删除档案：档案和它的印记一起留下墓碑 */
export async function deletePerson(db: SQLiteDatabase, id: string): Promise<void> {
  const p = await getPerson(db, id);
  if (!p) return;
  const now = Date.now();
  const traces = await listTraces(db, id);
  await db.withTransactionAsync(async () => {
    for (const t of traces) {
      const dead = { ...t, deletedAt: now, updatedAt: now };
      await writeTrace(db, dead);
      await enqueue(db, 'trace', dead);
    }
    const gone = { ...p, deletedAt: now, updatedAt: now };
    await writePerson(db, gone);
    await enqueue(db, 'person', gone);
  });
  emitDataChange();
}

/* ------------------------------------------------------------------ */
/* 照片元数据（文件本身见 photoStore）                                 */
/* ------------------------------------------------------------------ */

export async function savePhoto(db: SQLiteDatabase, p: Photo): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO photos (id, trace_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, trace_id = excluded.trace_id, updated_at = excluded.updated_at`,
      p.id,
      p.traceId,
      JSON.stringify(p),
      p.createdAt,
    );
    await enqueue(db, 'photo', p);
  });
}

export async function getPhoto(db: SQLiteDatabase, id: string): Promise<Photo | null> {
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM photos WHERE id = ?', id);
  return row ? (JSON.parse(row.data) as Photo) : null;
}

export async function listPhotos(db: SQLiteDatabase): Promise<Photo[]> {
  const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM photos');
  return rows.map((r) => JSON.parse(r.data) as Photo);
}

/* ------------------------------------------------------------------ */
/* 同步辅助                                                            */
/* ------------------------------------------------------------------ */

export async function pendingMutations(db: SQLiteDatabase, limit = 100): Promise<Mutation[]> {
  const rows = await db.getAllAsync<{ mutation_id: string; entity: Entity; entity_id: string; payload: string; updated_at: number }>(
    'SELECT * FROM outbox ORDER BY updated_at LIMIT ?',
    limit,
  );
  return rows.map((r) => ({
    mutationId: r.mutation_id,
    entity: r.entity,
    entityId: r.entity_id,
    payload: JSON.parse(r.payload),
    updatedAt: r.updated_at,
  }));
}

export async function countPending(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  return row?.n ?? 0;
}

export async function ackMutations(db: SQLiteDatabase, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.runAsync(`DELETE FROM outbox WHERE mutation_id IN (${ids.map(() => '?').join(',')})`, ...ids);
}

/** 应用服务端的变更：后写胜出，不进 outbox */
export async function applyRemote(db: SQLiteDatabase, entity: Entity, payload: Payload): Promise<boolean> {
  if (entity === 'person') {
    const p = payload as Person;
    const cur = await db.getFirstAsync<{ updated_at: number }>('SELECT updated_at FROM persons WHERE id = ?', p.id);
    if (cur && cur.updated_at >= p.updatedAt) return false;
    await writePerson(db, p);
    return true;
  }
  if (entity === 'trace') {
    const t = payload as Trace;
    const cur = await db.getFirstAsync<{ updated_at: number }>('SELECT updated_at FROM traces WHERE id = ?', t.id);
    if (cur && cur.updated_at >= t.updatedAt) return false;
    await writeTrace(db, t);
    return true;
  }
  const p = payload as Photo;
  const cur = await getPhoto(db, p.id);
  // 本地的 localRef 不能被服务端覆盖
  const merged: Photo = { ...p, localRef: cur?.localRef ?? null };
  await db.runAsync(
    `INSERT INTO photos (id, trace_id, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET data = excluded.data`,
    merged.id,
    merged.traceId,
    JSON.stringify(merged),
    merged.createdAt,
  );
  return !cur;
}
