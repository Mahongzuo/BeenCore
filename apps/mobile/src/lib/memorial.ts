/**
 * 公开纪念：发布与停止。
 * 发布前先同步一次，让档案和照片都到了自己的空间里，服务端才能把照片放上纪念页。
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { buildMemorial, type Person } from '@been/core';
import { listTraces, savePerson } from '@/data/db';
import { memorials, syncNow } from '@/data/sync';

export async function publishMemorial(db: SQLiteDatabase, person: Person, lang: 'zh' | 'en') {
  const saved: Person = { ...person, visibility: 'memorial', updatedAt: Date.now() };
  await savePerson(db, saved);
  await syncNow(db).catch(() => {}); // 照片上传失败也继续：服务端会略过缺的照片并告诉我们
  const traces = await listTraces(db, person.id);
  return memorials.publish(buildMemorial(saved, traces, { locale: lang }));
}

export async function unpublishMemorial(db: SQLiteDatabase, person: Person, keepVisibility = false): Promise<void> {
  await memorials.unpublish(person.id);
  if (!keepVisibility) await savePerson(db, { ...person, visibility: 'private', updatedAt: Date.now() });
}

/** 档案改动后：若已公开，自动更新纪念页；若不再符合（例如取消了「已经离开」），停止公开。都是尽力而为。 */
export async function syncMemorialAfterEdit(
  db: SQLiteDatabase,
  before: Pick<Person, 'visibility'> | null,
  after: Person,
  lang: 'zh' | 'en',
): Promise<void> {
  if (before?.visibility !== 'memorial') return;
  if (after.visibility === 'memorial') await publishMemorial(db, after, lang).catch(() => {});
  else await unpublishMemorial(db, after, true).catch(() => {});
}
