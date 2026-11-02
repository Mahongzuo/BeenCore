import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArchive,
  buildLifeBook,
  cleanWallNote,
  decodeGeohash,
  distanceMeters,
  encodeGeohash,
  googleMapsUrl,
  historyPlaces,
  isGeohash,
  isoWeek,
  mergeChanges,
  monthDensity,
  newId,
  onThisDay,
  ordinal,
  parseArchive,
  postmarkGeometry,
  postmarkSvg,
  renderBookHtml,
  seedsNear,
  shouldApply,
  weekRange,
  yearDensity,
  yearsAgo,
  type Seed,
  type Trace,
} from '../src/index.ts';

function trace(partial: Partial<Trace> & { happenedAt: number }): Trace {
  return {
    id: partial.id ?? newId(partial.happenedAt),
    text: 'x',
    precision: 'day',
    place: null,
    placeKey: null,
    theme: 'everyday',
    visibility: 'private',
    wallNote: null,
    wallSeq: null,
    opensAt: null,
    photoIds: [],
    createdAt: partial.happenedAt,
    updatedAt: partial.happenedAt,
    deletedAt: null,
    ...partial,
  };
}

test('geohash 编码与已知值一致，并能解回原处', () => {
  // 维基百科示例：57.64911, 10.40744 → u4pruydqqvj
  assert.equal(encodeGeohash(57.64911, 10.40744, 11), 'u4pruydqqvj');
  const key = encodeGeohash(48.8584, 2.2945); // 埃菲尔铁塔
  assert.equal(key.length, 6);
  assert.ok(isGeohash(key));
  const c = decodeGeohash(key);
  assert.ok(distanceMeters(c, { lat: 48.8584, lng: 2.2945 }) < 1000);
  assert.ok(!isGeohash('abc'));
  assert.ok(!isGeohash('u4pr!a'));
});

test('Google 地图链接：坐标或地点 ID，免 key', () => {
  assert.equal(
    googleMapsUrl({ lat: 34.0218023, lng: -118.8311897 }),
    'https://www.google.com/maps/search/?api=1&query=34.021802%2C-118.831190',
  );
  const u = new URL(googleMapsUrl({ lat: 34.02, lng: -118.83, name: 'Zuma Beach', poiId: 'ChIJxyz' }));
  assert.equal(u.searchParams.get('query'), 'Zuma Beach');
  assert.equal(u.searchParams.get('query_place_id'), 'ChIJxyz');
  assert.equal(u.searchParams.get('api'), '1');
});

test('distanceMeters：巴黎到伦敦约 344km', () => {
  const d = distanceMeters({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 });
  assert.ok(Math.abs(d - 343_500) < 3_000, String(d));
});

test('ISO 周：跨年边界', () => {
  assert.deepEqual(isoWeek(new Date(2026, 0, 1).getTime()), { year: 2026, week: 1 }); // 周四
  assert.deepEqual(isoWeek(new Date(2027, 0, 1).getTime()), { year: 2026, week: 53 }); // 周五
  assert.deepEqual(isoWeek(new Date(2024, 11, 30).getTime()), { year: 2025, week: 1 });
  const r = weekRange(new Date(2026, 10, 1, 15).getTime()); // 2026-11-01 是周日
  assert.equal(new Date(r.start).getDay(), 1);
  assert.equal(new Date(r.start).getDate(), 26);
  assert.equal(r.days.length, 7);
});

test('那年今日只取往年、精确到天的印记', () => {
  const now = new Date(2026, 10, 1, 9).getTime();
  const list = [
    trace({ happenedAt: new Date(2019, 10, 1, 20).getTime() }),
    trace({ happenedAt: new Date(2023, 10, 1, 8).getTime() }),
    trace({ happenedAt: new Date(2023, 10, 1).getTime(), precision: 'month' }),
    trace({ happenedAt: new Date(2026, 10, 1).getTime() }),
    trace({ happenedAt: new Date(2021, 10, 1).getTime(), deletedAt: 1 }),
  ];
  const hits = onThisDay(list, now);
  assert.deepEqual(
    hits.map((t) => new Date(t.happenedAt).getFullYear()),
    [2023, 2019],
  );
});

test('人生之书按年成章，忽略已删除与未开启的时光胶囊', () => {
  const now = new Date(2026, 10, 1).getTime();
  const book = buildLifeBook(
    [
      trace({ happenedAt: new Date(2009, 5, 1).getTime(), theme: 'study', placeKey: 'u09tun' }),
      trace({ happenedAt: new Date(2009, 8, 1).getTime(), theme: 'study', placeKey: 'u09tvw' }),
      trace({ happenedAt: new Date(2015, 1, 1).getTime(), theme: 'love' }),
      trace({ happenedAt: new Date(2016, 1, 1).getTime(), deletedAt: 5 }),
      trace({ happenedAt: new Date(2020, 1, 1).getTime(), opensAt: now + 1000 }),
    ],
    now,
  );
  assert.deepEqual(book.chapters.map((c) => c.year), [2009, 2015]);
  assert.equal(book.chapters[0].placeCount, 2);
  assert.equal(book.chapters[0].leadingTheme, 'study');
  assert.equal(book.traceCount, 3);
});

test('时光滑轨保留空白年份', () => {
  const now = new Date(2026, 0, 1).getTime();
  const d = yearDensity([trace({ happenedAt: new Date(2023, 3, 1).getTime() })], now);
  assert.deepEqual(d, [
    { year: 2023, count: 1 },
    { year: 2024, count: 0 },
    { year: 2025, count: 0 },
    { year: 2026, count: 0 },
  ]);
});

test('时光机：按月统计与 N 年前的今天', () => {
  const list = [
    trace({ happenedAt: new Date(2023, 0, 5).getTime() }),
    trace({ happenedAt: new Date(2023, 0, 20).getTime() }),
    trace({ happenedAt: new Date(2023, 6, 1).getTime(), precision: 'month' }),
    trace({ happenedAt: new Date(2023, 3, 1).getTime(), precision: 'year' }),
    trace({ happenedAt: new Date(2024, 0, 1).getTime() }),
  ];
  const m = monthDensity(list, 2023);
  assert.equal(m.length, 12);
  assert.equal(m[0], 2);
  assert.equal(m[6], 1);
  assert.equal(m[3], 0);
  const leap = yearsAgo(new Date(2028, 1, 29, 9).getTime(), 1);
  assert.equal(new Date(leap).getMonth(), 1);
  assert.equal(new Date(leap).getDate(), 28);
  assert.equal(new Date(yearsAgo(new Date(2026, 10, 1).getTime(), 10)).getFullYear(), 2016);
});

test('同步：后写胜出，同一版本不重复写', () => {
  assert.ok(shouldApply(null, { id: 'a', updatedAt: 1 }));
  assert.ok(shouldApply({ id: 'a', updatedAt: 1 }, { id: 'a', updatedAt: 2 }));
  assert.ok(!shouldApply({ id: 'a', updatedAt: 3 }, { id: 'a', updatedAt: 2 }));
  assert.ok(!shouldApply({ id: 'a', updatedAt: 3 }, { id: 'a', updatedAt: 3 }));
  const local = new Map([['a', { id: 'a', updatedAt: 5 }]]);
  const written = mergeChanges(local, [
    { id: 'a', updatedAt: 4 },
    { id: 'b', updatedAt: 1 },
  ]);
  assert.deepEqual(written.map((x) => x.id), ['b']);
});

test('newId 按时间排序', () => {
  const a = newId(1000);
  const b = newId(2000);
  assert.equal(a.length, 32);
  assert.ok(a < b);
});

test('地点墙：近处的历史人物按年代排列，签名清理与序数', () => {
  const here = { lat: 51.5007, lng: -0.1246 };
  const seeds: Seed[] = [
    { id: '1', name: 'A', year: 1900, kind: 'born', lat: 51.501, lng: -0.125, source: 'wikidata' },
    { id: '2', name: 'B', year: 1600, kind: 'died', lat: 51.502, lng: -0.12, source: 'wikidata' },
    { id: '3', name: 'C', year: 1700, kind: 'died', lat: 48.85, lng: 2.35, source: 'wikidata' },
  ];
  assert.deepEqual(seedsNear(seeds, here).map((s) => s.name), ['B', 'A']);
  // 同一个人生卒都在此地：合并为一条，带卒年
  const both = seedsNear(
    [
      { id: 'Q1', name: 'M', year: 1797, kind: 'died', lat: 51.5, lng: -0.12, source: 'wikidata' },
      { id: 'Q1', name: 'M', year: 1759, kind: 'born', lat: 51.5, lng: -0.12, source: 'wikidata' },
    ],
    here,
  );
  assert.equal(both.length, 1);
  assert.equal(both[0].kind, 'born');
  assert.equal(both[0].year, 1759);
  assert.equal(both[0].diedYear, 1797);
  // 历史图层：同一城市的种子合成一个点，同一个人只算一次
  const hp = historyPlaces([
    { id: 'Q1', name: 'M', year: 1759, kind: 'born', lat: 51.5, lng: -0.12, placeName: 'London', source: 'wikidata' },
    { id: 'Q1', name: 'M', year: 1797, kind: 'died', lat: 51.5, lng: -0.12, placeName: 'London', source: 'wikidata' },
    { id: 'Q2', name: 'N', year: 1800, kind: 'born', lat: 51.5, lng: -0.12, placeName: 'London', source: 'wikidata' },
    { id: 'Q3', name: 'P', year: 1900, kind: 'born', lat: 48.85, lng: 2.35, placeName: 'Paris', source: 'wikidata' },
  ]);
  assert.equal(hp.length, 2);
  assert.equal(hp.find((x) => x.name === 'London')?.count, 2);
  assert.equal(cleanWallNote('  hello \n  world  '), 'hello world');
  assert.equal(cleanWallNote('   '), null);
  assert.equal([...(cleanWallNote('来'.repeat(80)) ?? '')].length, 60);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 111].map(ordinal), [
    '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '111th',
  ]);
});

test('邮戳几何与 SVG', () => {
  const g = postmarkGeometry(100);
  assert.equal(g.height, 100);
  assert.ok(g.width > 100);
  assert.equal(g.waves.length, 4);
  assert.ok(!g.topArc.includes('NaN'));
  const svg = postmarkSvg({ diameter: 80, top: 'LISBON <&>', bottom: 'PT', line1: '01 NOV', line2: '2026', color: '#000', waves: false });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('LISBON &lt;&amp;&gt;'));
});

test('档案包往返，人生之书 HTML 自包含', () => {
  const t = trace({ happenedAt: new Date(2020, 4, 2).getTime(), text: 'first <day>', photoIds: ['p1'] });
  const archive = buildArchive([t], [
    { id: 'p1', traceId: t.id, width: 1, height: 1, mime: 'image/jpeg', localRef: 'file:///x', remoteKey: null, createdAt: 0 },
  ]);
  const back = parseArchive(JSON.stringify(archive));
  assert.equal(back.traces[0].text, 'first <day>');
  assert.ok(!('localRef' in back.photos[0]));
  assert.throws(() => parseArchive('{"format":"nope"}'));

  const html = renderBookHtml(buildLifeBook([t]), {
    locale: 'en',
    author: 'Ada',
    photoSrc: () => 'data:image/png;base64,AAAA',
    strings: {
      title: 'Been',
      subtitle: 'A life, by place and time',
      chapterPlaces: (n) => `${n} places`,
      themeLabel: (x) => x,
      unknownPlace: 'Somewhere',
      colophon: 'Exported from Been on',
    },
  });
  assert.ok(html.includes('first &lt;day&gt;'));
  assert.ok(html.includes('data:image/png;base64,AAAA'));
  assert.ok(!/https?:\/\//.test(html.replace('http://www.w3.org/2000/svg', '')), 'no external requests');
});
