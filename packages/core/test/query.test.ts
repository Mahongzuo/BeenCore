import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTraces, groupByPlace, sectionsByYear, type Trace } from '../src/index.ts';

let n = 0;
function trace(p: Partial<Trace> & { happenedAt: number }): Trace {
  n++;
  return {
    id: `t${n}`,
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
    createdAt: p.happenedAt,
    updatedAt: p.happenedAt,
    deletedAt: null,
    ...p,
  };
}

const NOW = new Date(2026, 10, 1).getTime();
const at = (y: number, m = 0, d = 1) => new Date(y, m, d, 12).getTime();

const list = [
  trace({ happenedAt: at(2012, 5, 20), text: 'Graduation day', theme: 'study', place: { lat: 31.3, lng: 121.5, name: 'Yangpu', country: 'CN' } }),
  trace({ happenedAt: at(2017, 2, 18), text: 'Tram 28', theme: 'journey', photoIds: ['p'], place: { lat: 38.71, lng: -9.13, name: 'Alfama', country: 'PT' } }),
  trace({ happenedAt: at(2009), precision: 'year', text: 'First night in the dorm', theme: 'study', place: { lat: 31.3, lng: 121.5, name: 'yangpu', country: 'cn' } }),
  trace({ happenedAt: at(2026, 9, 1), text: 'Secret letter to future me', opensAt: at(2031) }),
  trace({ happenedAt: at(2024, 7, 15), text: 'Ten years', visibility: 'wall', wallNote: 'still looking up', place: { lat: 51.5, lng: -0.12, name: 'Westminster', country: 'GB' } }),
  trace({ happenedAt: at(2020), text: 'deleted', deletedAt: 1 }),
  trace({ happenedAt: at(2021), text: 'no name place', place: { lat: 10.01, lng: 20.01 } }),
  trace({ happenedAt: at(2021, 3), text: 'no name place 2', place: { lat: 10.02, lng: 20.02 } }),
];

test('默认按发生时间倒序，排除已删除', () => {
  const r = filterTraces(list, {}, NOW);
  assert.equal(r.length, 7);
  assert.equal(r[0].text, 'Secret letter to future me');
  assert.equal(r[r.length - 1].text, 'First night in the dorm');
  assert.equal(filterTraces(list, { sort: 'happened-asc' }, NOW)[0].text, 'First night in the dorm');
});

test('搜索文字与地名，不区分大小写；封存内容搜不到', () => {
  assert.deepEqual(filterTraces(list, { text: 'TRAM' }, NOW).map((t) => t.text), ['Tram 28']);
  assert.equal(filterTraces(list, { text: 'yangpu' }, NOW).length, 2);
  assert.equal(filterTraces(list, { text: 'secret' }, NOW).length, 0);
  assert.equal(filterTraces(list, { text: 'looking up' }, NOW).length, 1);
});

test('筛选：章节、照片、旧事、封存、签墙、年份范围', () => {
  assert.equal(filterTraces(list, { themes: ['study'] }, NOW).length, 2);
  assert.equal(filterTraces(list, { themes: ['study', 'journey'] }, NOW).length, 3);
  assert.equal(filterTraces(list, { withPhotos: true }, NOW).length, 1);
  assert.deepEqual(filterTraces(list, { oldMemories: true }, NOW).map((t) => t.text), ['First night in the dorm']);
  assert.equal(filterTraces(list, { sealed: true }, NOW).length, 1);
  assert.equal(filterTraces(list, { signed: true }, NOW).length, 1);
  assert.equal(filterTraces(list, { fromYear: 2012, toYear: 2017 }, NOW).length, 2);
  assert.equal(filterTraces(list, { themes: ['study'], fromYear: 2010 }, NOW).length, 1);
});

test('按年分段', () => {
  const s = sectionsByYear(filterTraces(list, {}, NOW));
  assert.deepEqual(s.map((x) => x.year), [2026, 2024, 2021, 2017, 2012, 2009]);
  assert.equal(s[2].traces.length, 2);
});

test('按地点分组：同名地点合并（忽略大小写），无名地点按格子合并', () => {
  const g = groupByPlace(list);
  assert.equal(g[0].count, 2);
  assert.ok(g.some((x) => x.name === 'Yangpu' && x.count === 2 && x.firstYear === 2009 && x.lastYear === 2012));
  const unnamed = g.find((x) => x.name === null);
  assert.equal(unnamed?.count, 2);
  assert.equal(g.reduce((a, x) => a + x.count, 0), 6);
});
