/**
 * 地点墙。
 *
 * GET  /walls?bbox=minLng,minLat,maxLng,maxLat   这片范围里有人签过的墙（只有人数）
 * GET  /walls/:key           墙的概况、最近的留言、我是第几位
 * POST /walls/:key/visits    签名：成为第 N 位来过的人，可附一句话
 * POST /notes/:id/report     举报（3 次自动隐藏）
 * POST /notes/:id/block-author  屏蔽这条留言的作者（客户端永远不知道作者是谁）
 */
import { Hono } from 'hono';
import {
  cleanWallNote,
  decodeGeohash,
  distanceMeters,
  encodeGeohash,
  isGeohash,
  newId,
  type WallNote,
  type WallSummary,
} from '@been/core';
import { HttpError, type AppEnv } from './env.ts';
import { optionalUser, requireUser } from './auth.ts';

const NOTES_PAGE = 40;
const HIDE_AT_REPORTS = 3;

export const walls = new Hono<AppEnv>();

const BBOX_LIMIT = 300;

/** 「别人来过」图层：只返回位置和人数，不含任何身份或留言 */
walls.get('/walls', async (c) => {
  const parts = (c.req.query('bbox') ?? '').split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new HttpError(400, 'Expected bbox=minLng,minLat,maxLng,maxLat');
  }
  const [minLng, minLat, maxLng, maxLat] = parts;
  // 跨越 180° 经线时拆成两段
  const lngClause = minLng <= maxLng ? 'center_lng BETWEEN ? AND ?' : '(center_lng >= ? OR center_lng <= ?)';
  const { results } = await c.env.DB.prepare(
    `SELECT key, center_lat, center_lng, display_name, visitor_count FROM walls
     WHERE visitor_count > 0 AND center_lat BETWEEN ? AND ? AND ${lngClause}
     ORDER BY visitor_count DESC LIMIT ?`,
  )
    .bind(minLat, maxLat, minLng, maxLng, BBOX_LIMIT)
    .all<{ key: string; center_lat: number; center_lng: number; display_name: string | null; visitor_count: number }>();
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(
    results.map((w) => ({ key: w.key, lat: w.center_lat, lng: w.center_lng, name: w.display_name, count: w.visitor_count })),
  );
});

walls.get('/walls/:key', optionalUser, async (c) => {
  const key = c.req.param('key');
  if (!isGeohash(key)) throw new HttpError(400, 'Unknown place.');
  const userId = c.get('userId') as string | undefined;
  const db = c.env.DB;

  const wall = await db
    .prepare('SELECT key, display_name, visitor_count, first_visit_at FROM walls WHERE key = ?')
    .bind(key)
    .first<{ key: string; display_name: string | null; visitor_count: number; first_visit_at: number | null }>();

  const notes = await db
    .prepare(
      `SELECT n.id, n.text, n.seq, n.season_label, n.created_at, n.user_id
       FROM wall_notes n
       WHERE n.wall_key = ? AND n.status = 'visible'
         AND (? IS NULL OR n.user_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = ?))
       ORDER BY n.created_at DESC LIMIT ?`,
    )
    .bind(key, userId ?? null, userId ?? null, NOTES_PAGE)
    .all<{ id: string; text: string; seq: number; season_label: string; created_at: number; user_id: string }>();

  let mySeq: number | null = null;
  if (userId) {
    const v = await db
      .prepare('SELECT seq FROM wall_visits WHERE wall_key = ? AND user_id = ?')
      .bind(key, userId)
      .first<{ seq: number }>();
    mySeq = v?.seq ?? null;
  }

  return c.json<WallSummary>({
    key,
    displayName: wall?.display_name ?? null,
    visitorCount: wall?.visitor_count ?? 0,
    firstVisitAt: wall?.first_visit_at ?? null,
    mySeq,
    notes: notes.results.map<WallNote>((n) => ({
      id: n.id,
      text: n.text,
      seq: n.seq,
      seasonLabel: n.season_label,
      createdAt: n.created_at,
      mine: n.user_id === userId,
    })),
  });
});

walls.post('/walls/:key/visits', requireUser, async (c) => {
  const key = c.req.param('key');
  if (!isGeohash(key)) throw new HttpError(400, 'Unknown place.');
  const userId = c.get('userId');
  const body = await c.req
    .json<{ lat: number; lng: number; traceId?: string; note?: string; seasonLabel?: string; placeName?: string }>()
    .catch(() => null);
  if (!body || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    throw new HttpError(400, 'Expected { lat, lng }');
  }
  // 必须真的在这一格里（允许跨格边缘约 300m 的定位误差）
  const center = decodeGeohash(key);
  if (encodeGeohash(body.lat, body.lng) !== key && distanceMeters(center, body) > 1500) {
    throw new HttpError(403, 'You can only sign a wall where you are.');
  }

  const db = c.env.DB;
  const now = Date.now();
  await db
    .prepare(
      'INSERT INTO walls (key, center_lat, center_lng, display_name, visitor_count, first_visit_at) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT (key) DO NOTHING',
    )
    .bind(key, center.lat, center.lng, body.placeName?.slice(0, 80) ?? null, now)
    .run();

  let seq: number;
  const existing = await db
    .prepare('SELECT seq FROM wall_visits WHERE wall_key = ? AND user_id = ?')
    .bind(key, userId)
    .first<{ seq: number }>();
  if (existing) {
    seq = existing.seq;
  } else {
    const bumped = await db
      .prepare(
        `UPDATE walls SET visitor_count = visitor_count + 1,
           display_name = COALESCE(display_name, ?)
         WHERE key = ? RETURNING visitor_count`,
      )
      .bind(body.placeName?.slice(0, 80) ?? null, key)
      .first<{ visitor_count: number }>();
    seq = bumped!.visitor_count;
    const inserted = await db
      .prepare(
        'INSERT INTO wall_visits (wall_key, user_id, seq, trace_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      )
      .bind(key, userId, seq, body.traceId ?? null, now)
      .run();
    if (!inserted.meta.changes) {
      // 并发的第二次请求：撤销多加的计数，取已有序号
      await db.prepare('UPDATE walls SET visitor_count = visitor_count - 1 WHERE key = ?').bind(key).run();
      const v = await db
        .prepare('SELECT seq FROM wall_visits WHERE wall_key = ? AND user_id = ?')
        .bind(key, userId)
        .first<{ seq: number }>();
      seq = v!.seq;
    }
  }

  const text = cleanWallNote(body.note);
  if (text) {
    await db
      .prepare(
        `INSERT INTO wall_notes (id, wall_key, user_id, trace_id, text, seq, season_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (wall_key, user_id) DO UPDATE SET
           text = excluded.text, trace_id = excluded.trace_id,
           season_label = excluded.season_label, created_at = excluded.created_at`,
      )
      .bind(newId(now), key, userId, body.traceId ?? null, text, seq, (body.seasonLabel ?? '').slice(0, 32), now)
      .run();
  }
  return c.json({ seq });
});

walls.post('/notes/:id/report', requireUser, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  const res = await c.env.DB.prepare(
    'INSERT INTO wall_reports (note_id, user_id, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
  )
    .bind(id, userId, body.reason?.slice(0, 200) ?? null, Date.now())
    .run();
  if (res.meta.changes) {
    await c.env.DB.prepare(
      `UPDATE wall_notes SET report_count = report_count + 1,
         status = CASE WHEN report_count + 1 >= ? THEN 'hidden' ELSE status END
       WHERE id = ?`,
    )
      .bind(HIDE_AT_REPORTS, id)
      .run();
  }
  return c.json({ ok: true });
});

walls.post('/notes/:id/block-author', requireUser, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT user_id FROM wall_notes WHERE id = ?')
    .bind(id)
    .first<{ user_id: string }>();
  if (!note) throw new HttpError(404, 'This note is no longer on the wall.');
  if (note.user_id !== userId) {
    await c.env.DB.prepare('INSERT INTO blocks (user_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING')
      .bind(userId, note.user_id)
      .run();
  }
  return c.json({ ok: true });
});
