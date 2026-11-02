#!/usr/bin/env node
/**
 * 地点墙的「历史种子」：在某地出生或去世的知名人物。
 * 数据来自 Wikidata（CC0，可自由使用），离线打包进 App：apps/mobile/src/data/seeds.json
 *
 * 用法：NODE_USE_ENV_PROXY=1 node tools/build-seeds.mjs   # 内置城市列表（有代理时加环境变量）
 *       node tools/build-seeds.mjs Q1335                     # 追加任意城市（Wikidata 编号）
 *
 * 只取维基百科语言版本多（知名度高）的人物，避免把陌生人放上墙。
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'apps/mobile/src/data/seeds.json');

// [名称, Wikidata 编号]
const CITIES = [
  ['London', 'Q84'],
  ['Paris', 'Q90'],
  ['New York City', 'Q60'],
  ['San Francisco', 'Q62'],
  ['Tokyo', 'Q1490'],
  ['Kyoto', 'Q34600'],
  ['Lisbon', 'Q597'],
  ['Berlin', 'Q64'],
  ['Vienna', 'Q1741'],
  ['Rome', 'Q220'],
  ['Shanghai', 'Q8686'],
  ['Beijing', 'Q956'],
  ['Hong Kong', 'Q8646'],
  ['Taipei', 'Q1867'],
  ['Singapore', 'Q334'],
  ['Sydney', 'Q3130'],
  ['Buenos Aires', 'Q1486'],
  ['Cairo', 'Q85'],
];

const MIN_SITELINKS = 50;
const PER_CITY = 30;

const UA = 'BeenSeedBuilder/0.1 (offline seed pack for the Been app)';

async function sparql(q) {
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).results.bindings;
}

const qid = (uri) => uri.split('/').pop();

/**
 * 分三步，每一步都是 Wikidata 能在一秒内答完的简单查询：
 * 1. 城市坐标与名称  2. 生于 / 逝于该城的知名人物  3. 这些人的中英文名与描述
 */
async function fetchCity(name, cityQid) {
  const [city] = await sparql(
    `SELECT ?coord ?label WHERE { wd:${cityQid} wdt:P625 ?coord . OPTIONAL { wd:${cityQid} rdfs:label ?label FILTER(LANG(?label) = "en") } } LIMIT 1`,
  );
  if (!city) throw new Error('no coordinates');
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(city.coord.value);
  const lat = Math.round(parseFloat(m[2]) * 1e5) / 1e5;
  const lng = Math.round(parseFloat(m[1]) * 1e5) / 1e5;
  const placeName = city.label?.value ?? name;

  const people = new Map();
  for (const [kind, placeProp, dateProp] of [['born', 'P19', 'P569'], ['died', 'P20', 'P570']]) {
    const rows = await sparql(
      `SELECT ?person ?date ?links WHERE { ?person wdt:${placeProp} wd:${cityQid} ; wikibase:sitelinks ?links . FILTER(?links >= ${MIN_SITELINKS}) ?person wdt:${dateProp} ?date . } ORDER BY DESC(?links) LIMIT ${PER_CITY}`,
    );
    for (const r of rows) {
      const id = qid(r.person.value);
      const key = `${id}:${kind}`;
      if (people.has(key)) continue;
      const date = r.date.value; // "+1867-11-07T00:00:00Z" / "1867-11-07T00:00:00Z" / "-0043-…"
      const year = parseInt(date.match(/^([+-]?\d+)-/)?.[1] ?? 'x', 10);
      if (!Number.isFinite(year)) continue;
      people.set(key, { id, kind, year, links: Number(r.links.value) });
    }
    await pause();
  }

  const ids = [...new Set([...people.values()].map((p) => p.id))];
  if (!ids.length) return [];
  const labels = new Map();
  const rows = await sparql(`SELECT ?person ?en ?zh ?enDesc ?zhDesc WHERE {
    VALUES ?person { ${ids.map((i) => `wd:${i}`).join(' ')} }
    ?person wdt:P31 wd:Q5 .
    OPTIONAL { ?person rdfs:label ?en FILTER(LANG(?en) = "en") }
    OPTIONAL { ?person rdfs:label ?zh FILTER(LANG(?zh) = "zh") }
    OPTIONAL { ?person schema:description ?enDesc FILTER(LANG(?enDesc) = "en") }
    OPTIONAL { ?person schema:description ?zhDesc FILTER(LANG(?zhDesc) = "zh") }
  }`);
  for (const r of rows) {
    labels.set(qid(r.person.value), {
      name: r.en?.value,
      nameZh: r.zh?.value,
      desc: r.enDesc?.value,
      descZh: r.zhDesc?.value,
    });
  }

  return [...people.values()]
    .filter((p) => labels.get(p.id)?.name) // 只保留人类、且有英文名
    .sort((a, b) => b.links - a.links)
    .slice(0, PER_CITY)
    .map((p) => {
      const l = labels.get(p.id);
      return {
        id: p.id,
        name: l.name,
        ...(l.nameZh ? { nameZh: l.nameZh } : {}),
        ...(l.desc ? { desc: l.desc } : {}),
        ...(l.descZh ? { descZh: l.descZh } : {}),
        year: p.year,
        kind: p.kind,
        lat,
        lng,
        placeName,
        source: 'wikidata',
      };
    });
}

const pause = () => new Promise((r) => setTimeout(r, 1200)); // 礼貌地限速

const extra = process.argv.slice(2).map((qid) => [qid, qid]);

const existing = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : [];
const byKey = new Map(existing.map((s) => [`${s.id}:${s.kind}`, s]));
for (const [name, qid] of extra.length ? extra : CITIES) {
  try {
    const seeds = await fetchCity(name, qid);
    for (const s of seeds) byKey.set(`${s.id}:${s.kind}`, s);
    console.log(`${name}: ${seeds.length}`);
  } catch (e) {
    console.warn(`skip ${name}: ${e.message}`);
  }
  await pause();
}
const all = [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(target, JSON.stringify(all));
console.log(`seeds.json: ${all.length} seeds, ${(JSON.stringify(all).length / 1024).toFixed(1)} KB`);
