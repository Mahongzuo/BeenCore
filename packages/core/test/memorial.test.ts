import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMemorial, memorialPhotoIds, renderMemorialHtml, validateMemorial, type Person, type Trace } from '../src/index.ts';

const at = (y: number, m = 0, d = 1) => new Date(y, m, d, 12).getTime();
const hex = (n: number) => n.toString(16).padStart(32, '0');
const PID = hex(1);

const grandma: Person = {
  id: PID,
  kind: 'person',
  name: '外婆',
  relation: '外婆',
  species: null,
  born: { at: at(1931), precision: 'year' },
  died: { at: at(2019, 2), precision: 'month' },
  portraitPhotoId: hex(100),
  bio: '苏州人，教了一辈子小学音乐。',
  restingPlace: { lat: 31.298901234, lng: 120.585309876, name: '苏州' },
  visibility: 'memorial',
  memorialTraceIds: [hex(11), hex(12), hex(13), hex(14)],
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
};

function trace(id: number, p: Partial<Trace> = {}): Trace {
  return {
    id: hex(id),
    text: `t${id}`,
    happenedAt: at(2000 + id),
    precision: 'day',
    place: { lat: 31.3, lng: 120.6, name: '苏州' },
    placeKey: 'wtte5',
    theme: 'family',
    visibility: 'private',
    wallNote: null,
    wallSeq: null,
    opensAt: null,
    photoIds: [hex(200 + id)],
    ownerId: PID,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...p,
  };
}

const NOW = at(2026, 10, 1);
const traces = [
  trace(11),
  trace(12, { ownerId: null }), // 我的印记：即使被勾选也不能出现
  trace(13, { opensAt: at(2030) }), // 封存中
  trace(14, { deletedAt: 5 }),
  trace(15), // 没被勾选
];

test('快照只含勾选的、属于这份档案的、未封存未删除的印记，且没有坐标和关系称呼', () => {
  const m = buildMemorial(grandma, traces, { locale: 'zh', now: NOW });
  assert.deepEqual(m.traces.map((t) => t.id), [hex(11)]);
  assert.equal(m.traces[0].placeName, '苏州');
  assert.equal('place' in m.traces[0], false);
  assert.equal('relation' in m, false);
  assert.deepEqual(m.place, { lat: 31.2989, lng: 120.58531, name: '苏州' });
  assert.deepEqual(memorialPhotoIds(m), [hex(100), hex(211)]);
});

test('服务端校验：在世的人不能公开', () => {
  const m = buildMemorial({ ...grandma, died: null }, traces, { locale: 'zh', now: NOW });
  assert.throws(() => validateMemorial(m, PID), /passed away/);
  // 宠物可以
  const pet = buildMemorial({ ...grandma, kind: 'pet', died: null, species: '狗' }, traces, { locale: 'zh', now: NOW });
  assert.equal(validateMemorial(pet, PID).species, '狗');
});

test('服务端校验：清洗输入', () => {
  const bad = {
    ...buildMemorial(grandma, traces, { locale: 'zh', now: NOW }),
    name: '  外婆  ',
    portraitPhotoId: '../etc/passwd',
    traces: [{ id: hex(11), text: 'x', happenedAt: 1, precision: 'weird', photoIds: ['nope', hex(3)] }],
    extra: 'ignored',
  };
  const m = validateMemorial(bad, PID, 9);
  assert.equal(m.name, '外婆');
  assert.equal(m.portraitPhotoId, null);
  assert.equal(m.traces[0].precision, 'day');
  assert.deepEqual(m.traces[0].photoIds, [hex(3)]);
  assert.equal(m.updatedAt, 9);
  assert.equal('extra' in m, false);
  assert.throws(() => validateMemorial(bad, 'not-an-id'), /id/);
  assert.throws(() => validateMemorial({ ...bad, place: { lat: 200, lng: 0 } }, PID), /place/);
  assert.throws(() => validateMemorial({ ...bad, traces: Array(31).fill(bad.traces[0]) }, PID), /at most/);
});

test('纪念页 HTML：转义、生卒、只用给定的照片地址，没有任何互动按钮', () => {
  const m = validateMemorial({ ...buildMemorial(grandma, traces, { locale: 'zh', now: NOW }), bio: '<script>alert(1)</script>' }, PID);
  const html = renderMemorialHtml(m, { photoUrl: (id) => `https://api.example/memorials/${PID}/photos/${id}` });
  assert.match(html, /1931 – 2019/);
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes(`/photos/${hex(100)}`));
  assert.ok(!/<button|<form|<input/i.test(html));
});
