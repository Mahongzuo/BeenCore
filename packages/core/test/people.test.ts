import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArchive, canBeMemorial, cleanPerson, lifeSpan, ownerOf, parseArchive, tracesOf, yearsLived, type Person, type Trace } from '../src/index.ts';

const at = (y: number, m = 0, d = 1) => new Date(y, m, d, 12).getTime();

function person(p: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    kind: 'person',
    name: '外婆',
    relation: null,
    species: null,
    born: null,
    died: null,
    portraitPhotoId: null,
    bio: null,
    restingPlace: null,
    visibility: 'private',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...p,
  };
}

const t = (id: string, ownerId?: string | null) => ({ id, ownerId }) as Pick<Trace, 'ownerId'> & { id: string };

test('旧印记没有 ownerId，算「我」的', () => {
  assert.equal(ownerOf({}), null);
  const list = [t('a'), t('b', null), t('c', 'p1'), t('d', 'p2')];
  assert.deepEqual(tracesOf(list, null).map((x) => x.id), ['a', 'b']);
  assert.deepEqual(tracesOf(list, 'p1').map((x) => x.id), ['c']);
});

test('生卒年', () => {
  assert.equal(lifeSpan(person()), '');
  assert.equal(lifeSpan(person({ born: { at: at(1931), precision: 'year' }, died: { at: at(2019, 2, 3), precision: 'day' } })), '1931 – 2019');
  assert.equal(lifeSpan(person({ born: { at: at(2015), precision: 'year' } })), '2015 –');
  assert.equal(lifeSpan(person({ died: { at: at(2019), precision: 'year' } })), '– 2019');
});

test('活了 / 陪了多少年', () => {
  const p = person({ born: { at: at(1931, 5, 10), precision: 'day' }, died: { at: at(2019, 2, 3), precision: 'day' } });
  assert.equal(yearsLived(p), 87); // 生日还没到
  assert.equal(yearsLived(person({ born: { at: at(2008), precision: 'year' }, died: { at: at(2022, 8), precision: 'month' } })), 14);
  assert.equal(yearsLived(person()), null);
});

test('在世的人不能公开纪念；宠物和已离世的人可以', () => {
  assert.equal(canBeMemorial(person()), false);
  assert.equal(canBeMemorial(person({ died: { at: at(2019), precision: 'year' } })), true);
  assert.equal(canBeMemorial(person({ kind: 'pet' })), true);
  assert.equal(cleanPerson(person({ visibility: 'memorial' })).visibility, 'private');
});

test('清洗档案：空白、长度、离开早于出生', () => {
  const p = cleanPerson(person({ name: '  外婆  ', relation: '   ', species: '猫', bio: ' 爱种花 ', born: { at: at(1990), precision: 'year' }, died: { at: at(1980), precision: 'year' } }));
  assert.equal(p.name, '外婆');
  assert.equal(p.relation, null);
  assert.equal(p.species, null); // 人没有种类
  assert.equal(p.bio, '爱种花');
  assert.equal(p.died, null);
});

test('档案包带上档案，并能读回旧版本', () => {
  const a = buildArchive([], [], 0, [person(), person({ id: 'gone', deletedAt: 5 })]);
  assert.equal(a.version, 2);
  assert.deepEqual(a.persons.map((p) => p.id), ['p1']);
  const old = parseArchive(JSON.stringify({ format: 'been-archive', version: 1, traces: [], photos: [] }));
  assert.deepEqual(old.persons, []);
});
