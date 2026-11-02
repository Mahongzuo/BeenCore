import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HttpError, type AppEnv } from './env.ts';
import { findOrCreateUser, issueSession, requireUser, verifyIdToken, type Provider } from './auth.ts';
import { sync } from './sync.ts';
import { walls } from './walls.ts';
import { memorials } from './memorials.ts';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

const app = new Hono<AppEnv>();

app.use('*', cors({ origin: (origin) => origin ?? '*', allowHeaders: ['Authorization', 'Content-Type'] }));

app.get('/', (c) => c.json({ name: 'been-api', ok: true }));

app.post('/auth/:provider', async (c) => {
  const provider = c.req.param('provider') as Provider;
  if (provider !== 'google' && provider !== 'apple') throw new HttpError(404, 'Unknown sign-in method.');
  const body = await c.req.json<{ idToken?: string }>().catch(() => null);
  if (!body?.idToken) throw new HttpError(400, 'Expected { idToken }');
  const subject = await verifyIdToken(c.env, provider, body.idToken);
  const userId = await findOrCreateUser(c.env, provider, subject);
  return c.json({ userId, token: await issueSession(c.env, userId) });
});

app.route('/sync', sync);
app.route('/', walls);
app.route('/', memorials);

/* 照片：只有主人能读写。键 = userId/photoId */
app.put('/media/:id', requireUser, async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f]{32}$/.test(id)) throw new HttpError(400, 'Invalid photo id.');
  const type = c.req.header('Content-Type') ?? '';
  if (!PHOTO_TYPES.has(type)) throw new HttpError(400, 'Photos must be JPEG, PNG, WebP or HEIC.');
  const length = Number(c.req.header('Content-Length') ?? 0);
  if (length > MAX_PHOTO_BYTES) throw new HttpError(413, 'Photos must be smaller than 8 MB.');
  const body = await c.req.arrayBuffer();
  if (body.byteLength > MAX_PHOTO_BYTES) throw new HttpError(413, 'Photos must be smaller than 8 MB.');
  const key = `${c.get('userId')}/${id}`;
  await c.env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
  return c.json({ key });
});

app.get('/media/:id', requireUser, async (c) => {
  const obj = await c.env.MEDIA.get(`${c.get('userId')}/${c.req.param('id')}`);
  if (!obj) throw new HttpError(404, 'Photo not found.');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
});

/* 删除账号：清掉同步数据、照片、留言；墙上的「来过人数」保留（不含身份） */
app.delete('/me', requireUser, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  let cursor: string | undefined;
  do {
    const listed = await c.env.MEDIA.list({ prefix: `${userId}/`, cursor });
    if (listed.objects.length) await c.env.MEDIA.delete(listed.objects.map((o) => o.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  await db.batch([
    db.prepare('DELETE FROM records WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM wall_notes WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM wall_sames WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM wall_reports WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM blocks WHERE user_id = ? OR blocked_id = ?').bind(userId, userId),
    db.prepare('DELETE FROM memorial_reports WHERE memorial_id IN (SELECT id FROM memorials WHERE user_id = ?) OR user_id = ?').bind(userId, userId),
    db.prepare('DELETE FROM memorials WHERE user_id = ?').bind(userId),
    db.prepare("UPDATE wall_visits SET user_id = 'deleted:' || seq || ':' || wall_key, trace_id = NULL WHERE user_id = ?").bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
  return c.json({ ok: true });
});

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong on the server. Your traces are safe on your device.' }, 500);
});

export default app;
