/**
 * 同步：POST /sync 推送本地改动，GET /sync?since= 拉取增量。
 * 后写胜出直接写在 SQL 的 ON CONFLICT ... WHERE 里，天然原子、天然幂等。
 */
import { Hono } from 'hono';
import { ENTITIES, type Entity, type Mutation, type PullResponse, type PushRequest, type PushResponse } from '@been/core';
import { HttpError, type AppEnv } from './env.ts';
import { requireUser } from './auth.ts';

const MAX_PUSH = 200;
const PAGE = 500;
const MAX_PAYLOAD_BYTES = 64 * 1024;

export const sync = new Hono<AppEnv>();
sync.use('*', requireUser);

sync.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<PushRequest>().catch(() => null);
  if (!body || !Array.isArray(body.mutations)) throw new HttpError(400, 'Expected { mutations: [] }');
  if (body.mutations.length > MAX_PUSH) throw new HttpError(413, `Push at most ${MAX_PUSH} changes at a time.`);

  const valid: Mutation[] = [];
  const acked: string[] = [];
  for (const m of body.mutations) {
    if (!isValidMutation(m)) continue;
    const json = JSON.stringify(m.payload);
    if (json.length > MAX_PAYLOAD_BYTES) continue;
    valid.push(m);
  }

  if (valid.length) {
    // 原子地为这批改动预留一段游标
    const reserved = await c.env.DB.prepare('UPDATE users SET seq = seq + ? WHERE id = ? RETURNING seq')
      .bind(valid.length, userId)
      .first<{ seq: number }>();
    if (!reserved) throw new HttpError(401, 'Unknown account. Sign in again.');
    const base = reserved.seq - valid.length;
    const stmt = c.env.DB.prepare(
      `INSERT INTO records (user_id, entity, id, payload, updated_at, seq)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, entity, id) DO UPDATE SET
         payload = excluded.payload, updated_at = excluded.updated_at, seq = excluded.seq
       WHERE excluded.updated_at > records.updated_at`,
    );
    await c.env.DB.batch(
      valid.map((m, i) =>
        stmt.bind(userId, m.entity, m.entityId, JSON.stringify(m.payload), m.updatedAt, base + i + 1),
      ),
    );
  }
  // 无效的改动也确认掉，避免客户端无限重试同一条坏数据
  for (const m of body.mutations) if (m && typeof m.mutationId === 'string') acked.push(m.mutationId);

  const row = await c.env.DB.prepare('SELECT seq FROM users WHERE id = ?').bind(userId).first<{ seq: number }>();
  return c.json<PushResponse>({ acked, seq: row?.seq ?? 0 });
});

sync.get('/', async (c) => {
  const userId = c.get('userId');
  const since = Math.max(0, Number(c.req.query('since') ?? 0) || 0);
  const { results } = await c.env.DB.prepare(
    'SELECT entity, payload, seq FROM records WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?',
  )
    .bind(userId, since, PAGE + 1)
    .all<{ entity: Entity; payload: string; seq: number }>();
  const hasMore = results.length > PAGE;
  const page = results.slice(0, PAGE);
  return c.json<PullResponse>({
    changes: page.map((r) => ({ entity: r.entity, payload: JSON.parse(r.payload), seq: r.seq })),
    seq: page.length ? page[page.length - 1].seq : since,
    hasMore,
  });
});

function isValidMutation(m: unknown): m is Mutation {
  if (!m || typeof m !== 'object') return false;
  const x = m as Partial<Mutation>;
  return (
    typeof x.mutationId === 'string' &&
    ENTITIES.includes(x.entity as Entity) &&
    typeof x.entityId === 'string' &&
    x.entityId.length <= 64 &&
    typeof x.updatedAt === 'number' &&
    !!x.payload &&
    typeof x.payload === 'object' &&
    (x.payload as { id?: unknown }).id === x.entityId
  );
}
