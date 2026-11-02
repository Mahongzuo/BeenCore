/**
 * 公开纪念。没有献花、留言、计数，也不暴露发布者是谁。
 *
 * PUT    /memorials/:id               发布或更新（主人）
 * DELETE /memorials/:id               停止公开（主人）
 * GET    /memorials?bbox=…            地图上的纪念印（只有位置、名字）
 * GET    /memorials/:id               纪念页数据
 * GET    /memorials/:id/photos/:pid   纪念页上的照片（只有快照里列出的才能读）
 * POST   /memorials/:id/report        举报（3 次自动隐藏，等待人工复核）
 * GET    /m/:id                       可以分享的网页：不用装 App 也能看
 */
import { Hono } from 'hono';
import { memorialPhotoIds, renderMemorialHtml, validateMemorial, type Memorial, type MemorialPoint } from '@been/core';
import { HttpError, type AppEnv } from './env.ts';
import { optionalUser, requireUser } from './auth.ts';

const HIDE_AT_REPORTS = 3;
const BBOX_LIMIT = 300;
const MAX_BODY = 128 * 1024;

export const memorials = new Hono<AppEnv>();

type Row = { id: string; user_id: string; payload: string; status: string };

async function load(c: { env: AppEnv['Bindings'] }, id: string): Promise<Row | null> {
  return c.env.DB.prepare('SELECT id, user_id, payload, status FROM memorials WHERE id = ?').bind(id).first<Row>();
}

memorials.put('/memorials/:id', requireUser, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const raw = await c.req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, 'This memorial is too large.');
  let m: Memorial;
  try {
    m = validateMemorial(JSON.parse(raw), id);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Invalid memorial.');
  }
  const existing = await load(c, id);
  if (existing && existing.user_id !== userId) throw new HttpError(403, 'This memorial belongs to someone else.');

  // 照片必须已经同步到自己的空间里；没有的就不放上去，免得页面上出现破图
  const missing: string[] = [];
  for (const pid of memorialPhotoIds(m)) {
    if (!(await c.env.MEDIA.head(`${userId}/${pid}`))) missing.push(pid);
  }
  if (missing.length) {
    const gone = new Set(missing);
    m = {
      ...m,
      portraitPhotoId: m.portraitPhotoId && gone.has(m.portraitPhotoId) ? null : m.portraitPhotoId,
      traces: m.traces.map((t) => ({ ...t, photoIds: t.photoIds.filter((p) => !gone.has(p)) })),
    };
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO memorials (id, user_id, payload, name, kind, lat, lng, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, name = excluded.name, kind = excluded.kind,
       lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at`,
  )
    .bind(id, userId, JSON.stringify(m), m.name, m.kind, m.place?.lat ?? null, m.place?.lng ?? null, now, now)
    .run();
  const status = existing?.status ?? 'visible';
  return c.json({ ok: true, status, missingPhotos: missing.length, url: `${new URL(c.req.url).origin}/m/${id}` });
});

memorials.delete('/memorials/:id', requireUser, async (c) => {
  const id = c.req.param('id');
  const row = await load(c, id);
  if (row && row.user_id !== c.get('userId')) throw new HttpError(403, 'This memorial belongs to someone else.');
  if (row) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM memorials WHERE id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM memorial_reports WHERE memorial_id = ?').bind(id),
    ]);
  }
  return c.json({ ok: true });
});

memorials.get('/memorials', async (c) => {
  const parts = (c.req.query('bbox') ?? '').split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new HttpError(400, 'Expected bbox=minLng,minLat,maxLng,maxLat');
  }
  const [minLng, minLat, maxLng, maxLat] = parts;
  const lngClause = minLng <= maxLng ? 'lng BETWEEN ? AND ?' : '(lng >= ? OR lng <= ?)';
  const { results } = await c.env.DB.prepare(
    `SELECT id, lat, lng, name, kind FROM memorials
     WHERE status = 'visible' AND lat IS NOT NULL AND lat BETWEEN ? AND ? AND ${lngClause}
     ORDER BY updated_at DESC LIMIT ?`,
  )
    .bind(minLat, maxLat, minLng, maxLng, BBOX_LIMIT)
    .all<MemorialPoint>();
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(results);
});

memorials.get('/memorials/:id', optionalUser, async (c) => {
  const row = await load(c, c.req.param('id'));
  const userId = c.get('userId') as string | undefined;
  const mine = !!row && row.user_id === userId;
  // 被隐藏的页面，主人自己还能看到（并知道它被隐藏了）
  if (!row || (row.status !== 'visible' && !mine)) throw new HttpError(404, 'This memorial is not available.');
  return c.json({ memorial: JSON.parse(row.payload) as Memorial, mine, status: row.status });
});

memorials.get('/memorials/:id/photos/:pid', async (c) => {
  const row = await load(c, c.req.param('id'));
  const pid = c.req.param('pid');
  if (!row || row.status !== 'visible') throw new HttpError(404, 'Photo not found.');
  const m = JSON.parse(row.payload) as Memorial;
  if (!memorialPhotoIds(m).includes(pid)) throw new HttpError(404, 'Photo not found.');
  const obj = await c.env.MEDIA.get(`${row.user_id}/${pid}`);
  if (!obj) throw new HttpError(404, 'Photo not found.');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

memorials.post('/memorials/:id/report', requireUser, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const row = await load(c, id);
  if (!row) throw new HttpError(404, 'This memorial is not available.');
  if (row.user_id === userId) return c.json({ ok: true }); // 举报自己的不算
  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  const res = await c.env.DB.prepare(
    'INSERT INTO memorial_reports (memorial_id, user_id, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
  )
    .bind(id, userId, body.reason?.slice(0, 200) ?? null, Date.now())
    .run();
  if (res.meta.changes) {
    await c.env.DB.prepare(
      `UPDATE memorials SET report_count = report_count + 1,
         status = CASE WHEN report_count + 1 >= ? THEN 'hidden' ELSE status END
       WHERE id = ?`,
    )
      .bind(HIDE_AT_REPORTS, id)
      .run();
  }
  return c.json({ ok: true });
});

/** 可分享的网页 */
memorials.get('/m/:id', async (c) => {
  const id = c.req.param('id');
  const row = await load(c, id);
  if (!row || row.status !== 'visible') {
    return c.html(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Been</title>' +
        '<body style="margin:0;background:#F5F4EE;color:#5E5D57;font:17px/1.6 Georgia,serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center">' +
        '<p>这一页现在看不到了。<br>This page is not available.</p></body>',
      404,
    );
  }
  const m = JSON.parse(row.payload) as Memorial;
  const origin = new URL(c.req.url).origin;
  c.header('Cache-Control', 'public, max-age=300');
  return c.html(
    renderMemorialHtml(m, {
      photoUrl: (pid) => `${origin}/memorials/${id}/photos/${pid}`,
      pageUrl: `${origin}/m/${id}`,
    }),
  );
});
