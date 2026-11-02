import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterMoments, parseExifDate, type PhotoMeta } from '../src/index.ts';

const at = (s: string) => parseExifDate(s)!;
const p = (id: string, t: string | null, lat: number | null = null, lng: number | null = null): PhotoMeta => ({
  id,
  takenAt: t ? at(t) : null,
  lat,
  lng,
});

test('EXIF 日期按本地墙上时间读，坏数据返回 null', () => {
  const t = parseExifDate('2024:08:15 21:48:10')!;
  const d = new Date(t);
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2024, 7, 15, 21, 48]);
  assert.equal(parseExifDate('0000:00:00 00:00:00'), null);
  assert.equal(parseExifDate('garbage'), null);
  assert.equal(parseExifDate(undefined), null);
  assert.ok(parseExifDate('2019-11-02T19:22:48'));
});

test('同一天、1km 内归为一个时刻；同一天相距 30km 分开', () => {
  const m = clusterMoments([
    p('sm1', '2023:07:03 15:20:31', 34.0095, -118.4962),
    p('sm2', '2023:07:03 16:05:12', 34.01103, -118.49401),
    p('zuma', '2023:07:03 18:44:50', 34.0218, -118.83119),
  ]);
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].photos.map((x) => x.id), ['sm1', 'sm2']);
  assert.deepEqual(m[1].photos.map((x) => x.id), ['zuma']);
  assert.ok(Math.abs(m[0].place!.lat - 34.010265) < 1e-6);
});

test('不同天即使同一地点也分开；顺序按时间', () => {
  const m = clusterMoments([
    p('b', '2025:10:12 10:12:44', 51.50812, -0.16351),
    p('a', '2024:08:15 21:48:10', 51.50812, -0.16351),
  ]);
  assert.deepEqual(m.map((x) => x.photos[0].id), ['a', 'b']);
});

test('没有坐标的照片并入同一天时间最近的时刻；那天没有坐标就自成一组', () => {
  const m = clusterMoments([
    p('am', '2023:07:03 09:00:00', 34.0095, -118.4962),
    p('pm', '2023:07:03 18:00:00', 34.0218, -118.83119),
    p('nogeo', '2023:07:03 17:30:00'),
    p('coffee', '2021:12:24 08:05:00'),
    p('coffee2', '2021:12:24 09:00:00'),
  ]);
  assert.equal(m.length, 3);
  assert.deepEqual(m[0].photos.map((x) => x.id), ['coffee', 'coffee2']);
  assert.equal(m[0].place, null);
  assert.deepEqual(m[2].photos.map((x) => x.id), ['nogeo', 'pm']);
});

test('没有时间：有坐标的按地点归组，什么都没有的各自一个，排在最后', () => {
  const m = clusterMoments([
    p('x', null),
    p('g1', null, 35.027, 135.7943),
    p('g2', null, 35.0272, 135.7945),
    p('dated', '2020:01:01 12:00:00', 1, 1),
    p('y', null),
  ]);
  assert.equal(m[0].photos[0].id, 'dated');
  assert.equal(m.length, 4);
  assert.deepEqual(m.find((x) => x.photos.length === 2)?.photos.map((x) => x.id), ['g1', 'g2']);
  assert.equal(m.filter((x) => x.takenAt === null && x.place === null).length, 2);
});

test('测试相册：15 张照片分成 10 个时刻', () => {
  const photos = [
    p('122', '2024:08:15 21:48:10', 51.50812, -0.09858),
    p('95', '2025:10:12 08:41:02', 51.50731, -0.1657),
    p('103', '2025:10:12 10:12:44', 51.50812, -0.16351),
    p('100', '2023:07:03 15:20:31', 34.0095, -118.4962),
    p('108', '2023:07:03 16:05:12', 34.01103, -118.49401),
    p('92', '2023:07:03 18:44:50', 34.0218, -118.83119),
    p('116', '2018:06:21 11:02:15', 43.07431, 11.6775),
    p('107', '2018:06:21 12:30:41', 43.07702, 11.68012),
    p('110', '2018:06:21 20:41:09', 43.07188, 11.67233),
    p('120', '2024:09:14 02:18:33', 36.2559, 117.1006),
    p('121', '2024:09:14 05:52:07', 36.25642, 117.10421),
    p('82', '2023:04:07 10:15:20', 35.027, 135.7943),
    p('84', '2019:11:02 19:22:48', 40.6066, -74.0447),
    p('113', '2021:12:24 08:05:00'),
    p('91', null),
  ];
  const m = clusterMoments(photos);
  assert.equal(m.length, 10);
  assert.equal(m.reduce((s, x) => s + x.photos.length, 0), 15);
});
