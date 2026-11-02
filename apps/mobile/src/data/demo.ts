/**
 * 开发用示例数据：一个人十几年的痕迹。只在开发模式下可用。
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { encodeGeohash, newId, type DatePrecision, type Theme, type Trace } from '@been/core';
import { saveTrace } from './db';

type Seed = [
  y: number,
  m: number,
  d: number,
  precision: DatePrecision,
  theme: Theme,
  place: [number, number, string, string] | null,
  en: string,
  zh: string,
  wallNote?: string,
];

const SAMPLES: Seed[] = [
  [2009, 8, 1, 'year', 'study', [31.2989, 121.5015, 'Yangpu', 'CN'], 'The first night in the dorm. Six of us, one fan, nobody slept.', '宿舍的第一晚。六个人，一台风扇，谁都没睡着。'],
  [2012, 5, 20, 'day', 'study', [31.2989, 121.5015, 'Yangpu', 'CN'], 'Graduation. Dad wore the tie he wore at his own.', '毕业那天。爸爸系的是他自己毕业时那条领带。'],
  [2014, 2, 1, 'month', 'work', [51.5226, -0.0846, 'Shoreditch', 'GB'], 'First job abroad. The rain here is quieter than at home.', '第一份海外的工作。这里的雨比家里的安静。'],
  [2015, 9, 3, 'day', 'love', [51.5079, -0.0877, 'London Bridge', 'GB'], 'We missed the last train and walked across the bridge instead.', '错过了末班车，我们就走路过了桥。'],
  [2017, 3, 18, 'day', 'journey', [38.7139, -9.1334, 'Alfama', 'PT'], 'Tram 28, standing room only. An old man sang the whole way.', '28 路电车，只剩站票。一个老人唱了一路。'],
  [2017, 3, 19, 'day', 'journey', [38.6916, -9.2160, 'Belém', 'PT'], 'Pastéis still warm. Burned my tongue, worth it.', '蛋挞还是热的。烫到舌头，值得。'],
  [2019, 10, 2, 'day', 'family', [31.2304, 121.4737, 'Huangpu', 'CN'], 'Grandma taught me her dumpling fold. Mine still look like boats.', '外婆教我包饺子。我的还是像小船。'],
  [2020, 0, 1, 'year', 'everyday', null, 'The year we all stayed home. I learned the names of the birds outside the window.', '那一年大家都待在家里。我学会了窗外那些鸟的名字。'],
  [2021, 11, 24, 'day', 'farewell', [31.2304, 121.4737, 'Huangpu', 'CN'], 'Grandma’s kitchen, for the last time. I took her rolling pin.', '最后一次走进外婆的厨房。我带走了她的擀面杖。'],
  [2023, 4, 7, 'day', 'journey', [35.0270, 135.7982, 'Higashiyama', 'JP'], 'Philosopher’s Path after the rain. Petals stuck to my shoes.', '雨后的哲学之道。花瓣粘在鞋上。'],
  [2024, 7, 15, 'day', 'growth', [51.5007, -0.1246, 'Westminster', 'GB'], 'Ten years in this city. Still get lost south of the river.', '在这座城市的第十年。过了河往南还是会迷路。', 'Ten years and still looking up.'],
  [2025, 10, 1, 'day', 'everyday', [51.5226, -0.0846, 'Shoreditch', 'GB'], 'The café on the corner closed. I didn’t know the owner’s name.', '街角的咖啡馆关门了。我始终不知道老板叫什么。'],
  [2026, 9, 27, 'day', 'everyday', [51.5226, -0.0846, 'Shoreditch', 'GB'], 'Fixed the bike. Rode it to nowhere in particular.', '修好了自行车。骑去了一个哪儿也不是的地方。'],
  [2026, 9, 29, 'day', 'family', [51.5079, -0.0877, 'London Bridge', 'GB'], 'Called Mum on the walk home. She asked if I was eating enough.', '回家路上给妈妈打电话。她问我有没有好好吃饭。'],
  [2026, 9, 31, 'day', 'everyday', [51.5007, -0.1246, 'Westminster', 'GB'], 'First frost on the bench by the river.', '河边长椅上的第一层霜。'],
];

export async function loadDemo(db: SQLiteDatabase, lang: 'en' | 'zh'): Promise<void> {
  const now = Date.now();
  for (const [y, m, d, precision, theme, place, en, zh, wallNote] of SAMPLES) {
    const happenedAt = new Date(y, m, d, 12).getTime();
    if (happenedAt > now) continue;
    const p = place ? { lat: place[0], lng: place[1], name: place[2], country: place[3] } : null;
    const trace: Trace = {
      id: newId(happenedAt),
      text: lang === 'zh' ? zh : en,
      happenedAt,
      precision,
      place: p,
      placeKey: p ? encodeGeohash(p.lat, p.lng) : null,
      theme,
      // 签名交给同步引擎：登录后会真的签到地点墙上
      visibility: wallNote ? 'wall' : 'private',
      wallNote: wallNote ?? null,
      wallSeq: null,
      opensAt: null,
      photoIds: [],
      createdAt: happenedAt,
      updatedAt: now,
      deletedAt: null,
    };
    await saveTrace(db, trace);
  }
  // 一枚时光胶囊
  await saveTrace(db, {
    id: newId(now),
    text: lang === 'zh' ? '给五年后的自己。' : 'To me, five years from now.',
    happenedAt: now - 86_400_000 * 2,
    precision: 'day',
    place: null,
    placeKey: null,
    theme: 'growth',
    visibility: 'private',
    wallNote: null,
    wallSeq: null,
    opensAt: new Date(new Date().getFullYear() + 5, 0, 1).getTime(),
    photoIds: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}
