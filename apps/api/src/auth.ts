/**
 * 登录只有一个目的：多设备同步与地点墙签名。不登录也能完整使用 App。
 *
 * 客户端用 Google / Apple 登录拿到 ID Token，服务端验证后换成自己的会话令牌。
 * 不存邮箱、不存昵称：服务端只知道「这是同一个人」。
 */
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import type { MiddlewareHandler } from 'hono';
import { newId } from '@been/core';
import { HttpError, type AppEnv, type Env } from './env.ts';

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

const SESSION_DAYS = 180;

export type Provider = 'google' | 'apple';

function list(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function verifyIdToken(env: Env, provider: Provider, idToken: string): Promise<string> {
  try {
    if (provider === 'google') {
      const { payload } = await jwtVerify(idToken, googleJwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: list(env.GOOGLE_CLIENT_IDS),
      });
      if (!payload.sub) throw new Error('missing sub');
      return payload.sub;
    }
    const { payload } = await jwtVerify(idToken, appleJwks, {
      issuer: 'https://appleid.apple.com',
      audience: list(env.APPLE_AUDIENCES),
    });
    if (!payload.sub) throw new Error('missing sub');
    return payload.sub;
  } catch {
    throw new HttpError(401, 'Sign-in could not be verified. Try signing in again.');
  }
}

export async function findOrCreateUser(env: Env, provider: Provider, subject: string): Promise<string> {
  const existing = await env.DB.prepare('SELECT id FROM users WHERE provider = ? AND subject = ?')
    .bind(provider, subject)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const id = newId();
  await env.DB.prepare(
    'INSERT INTO users (id, provider, subject, seq, created_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT (provider, subject) DO NOTHING',
  )
    .bind(id, provider, subject, Date.now())
    .run();
  const row = await env.DB.prepare('SELECT id FROM users WHERE provider = ? AND subject = ?')
    .bind(provider, subject)
    .first<{ id: string }>();
  return row!.id;
}

function secret(env: Env): Uint8Array {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be set (32+ characters)');
  }
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function issueSession(env: Env, userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setIssuer('been')
    .sign(secret(env));
}

async function readSession(env: Env, header: string | undefined): Promise<string | null> {
  if (!header) return null;
  if (env.DEV_AUTH === '1' && header.startsWith('Dev ')) {
    const id = header.slice(4).trim();
    if (!id) return null;
    await env.DB.prepare(
      "INSERT INTO users (id, provider, subject, seq, created_at) VALUES (?, 'dev', ?, 0, ?) ON CONFLICT DO NOTHING",
    )
      .bind(id, id, Date.now())
      .run();
    return id;
  }
  if (!header.startsWith('Bearer ')) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), secret(env), { issuer: 'been' });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** 必须登录 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = await readSession(c.env, c.req.header('Authorization'));
  if (!userId) throw new HttpError(401, 'Sign in to sync and sign walls.');
  c.set('userId', userId);
  await next();
};

/** 可选登录：读地点墙时，登录了就带上「我是第几位」 */
export const optionalUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = await readSession(c.env, c.req.header('Authorization'));
  if (userId) c.set('userId', userId);
  await next();
};
