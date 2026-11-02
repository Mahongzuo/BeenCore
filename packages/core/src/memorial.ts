/**
 * 公开纪念：只限已离世的人和宠物。
 *
 * 纪念页是主人亲手发布的一份快照，只含主人挑选的东西：
 * 名字、生卒、一段话、头像、（可选的）地图上的位置，以及勾选的几枚印记。
 * 印记的精确坐标不公开，只留地名；没有关系称呼（那是从主人的角度说的）。
 *
 * 没有任何互动：不献花、不留言、不计数。只有「举报」，收在更多菜单里。
 */
import type { DatePrecision, FuzzyDate, Person, PersonKind, Trace } from './types.ts';
import { canBeMemorial, lifeSpan } from './people.ts';
import { escapeHtml, palettes, postmarkSvg } from './design.ts';
import { formatTraceDate, postmarkDate } from './time.ts';

export interface MemorialTrace {
  id: string;
  text: string;
  happenedAt: number;
  precision: DatePrecision;
  /** 只有地名，没有坐标 */
  placeName: string | null;
  photoIds: string[];
}

export interface Memorial {
  /** 与档案 id 相同 */
  id: string;
  kind: PersonKind;
  name: string;
  species: string | null;
  born: FuzzyDate | null;
  died: FuzzyDate | null;
  bio: string | null;
  portraitPhotoId: string | null;
  /** 地图上的纪念印：安葬地，或主人选的一个地方。null 表示不放在地图上 */
  place: { lat: number; lng: number; name: string | null } | null;
  traces: MemorialTrace[];
  /** 发布者的语言，决定纪念页上的日期格式与少量文字 */
  locale: 'zh' | 'en';
  updatedAt: number;
}

/** 地图上的一枚纪念印 */
export interface MemorialPoint {
  id: string;
  lat: number;
  lng: number;
  name: string;
  kind: PersonKind;
}

export const MEMORIAL_LIMITS = { traces: 30, photosPerTrace: 4, text: 2000, bio: 2000, name: 40 } as const;

const HEX32 = /^[0-9a-f]{32}$/;

/** 从档案和它的印记生成要公开的快照。封存中的印记、已删除的印记不会出现。 */
export function buildMemorial(
  person: Person,
  traces: Trace[],
  opts: { locale: 'zh' | 'en'; now?: number },
): Memorial {
  const now = opts.now ?? Date.now();
  const picked = new Set(person.memorialTraceIds ?? []);
  const list = traces
    .filter((t) => picked.has(t.id) && (t.ownerId ?? null) === person.id && !t.deletedAt && !(t.opensAt && t.opensAt > now))
    .sort((a, b) => a.happenedAt - b.happenedAt)
    .slice(0, MEMORIAL_LIMITS.traces)
    .map((t) => ({
      id: t.id,
      text: t.text.slice(0, MEMORIAL_LIMITS.text),
      happenedAt: t.happenedAt,
      precision: t.precision,
      placeName: t.place?.name ?? null,
      photoIds: t.photoIds.slice(0, MEMORIAL_LIMITS.photosPerTrace),
    }));
  return {
    id: person.id,
    kind: person.kind,
    name: person.name,
    species: person.kind === 'pet' ? person.species : null,
    born: person.born,
    died: person.died,
    bio: person.bio,
    portraitPhotoId: person.portraitPhotoId,
    place: person.restingPlace
      ? { lat: round5(person.restingPlace.lat), lng: round5(person.restingPlace.lng), name: person.restingPlace.name ?? null }
      : null,
    traces: list,
    locale: opts.locale,
    updatedAt: now,
  };
}

/** 纪念页上会出现的全部照片（头像 + 印记里的照片） */
export function memorialPhotoIds(m: Pick<Memorial, 'portraitPhotoId' | 'traces'>): string[] {
  return [...new Set([...(m.portraitPhotoId ? [m.portraitPhotoId] : []), ...m.traces.flatMap((t) => t.photoIds)])];
}

/** 服务端校验：不信任客户端。返回清洗后的快照，不合格时抛出带原因的 Error。 */
export function validateMemorial(input: unknown, id: string, now = Date.now()): Memorial {
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  if (!HEX32.test(id)) fail('Invalid memorial id.');
  if (!input || typeof input !== 'object') fail('Expected a memorial.');
  const x = input as Record<string, unknown>;
  const str = (v: unknown, max: number): string | null => {
    if (v == null) return null;
    if (typeof v !== 'string') return fail('Text fields must be strings.');
    const s = v.trim().slice(0, max);
    return s ? s : null;
  };
  const date = (v: unknown): FuzzyDate | null => {
    if (v == null) return null;
    const d = v as Partial<FuzzyDate>;
    if (typeof d.at !== 'number' || !Number.isFinite(d.at) || !['day', 'month', 'year'].includes(d.precision as string)) fail('Invalid date.');
    return { at: d.at!, precision: d.precision as DatePrecision };
  };
  const kind = x.kind === 'pet' ? 'pet' : x.kind === 'person' ? 'person' : fail('Invalid kind.');
  const name = str(x.name, MEMORIAL_LIMITS.name) ?? fail('A memorial needs a name.');
  const died = date(x.died);
  if (!canBeMemorial({ kind, died })) fail('Only people who have passed away, and pets, can have a public memorial.');
  const born = date(x.born);
  const photo = (v: unknown) => (typeof v === 'string' && HEX32.test(v) ? v : null);
  let place: Memorial['place'] = null;
  if (x.place != null) {
    const p = x.place as Record<string, unknown>;
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail('Invalid place.');
    place = { lat: round5(lat), lng: round5(lng), name: str(p.name, 80) };
  }
  const rawTraces = Array.isArray(x.traces) ? x.traces : [];
  if (rawTraces.length > MEMORIAL_LIMITS.traces) fail(`A memorial can show at most ${MEMORIAL_LIMITS.traces} traces.`);
  const traces: MemorialTrace[] = rawTraces.map((r) => {
    const t = r as Record<string, unknown>;
    const happenedAt = Number(t.happenedAt);
    if (!Number.isFinite(happenedAt)) fail('Invalid trace date.');
    const precision = ['day', 'month', 'year'].includes(t.precision as string) ? (t.precision as DatePrecision) : 'day';
    const ids = Array.isArray(t.photoIds) ? t.photoIds.map(photo).filter((p): p is string => !!p) : [];
    return {
      id: typeof t.id === 'string' && HEX32.test(t.id) ? t.id : fail('Invalid trace id.'),
      text: str(t.text, MEMORIAL_LIMITS.text) ?? '',
      happenedAt,
      precision,
      placeName: str(t.placeName, 80),
      photoIds: ids.slice(0, MEMORIAL_LIMITS.photosPerTrace),
    };
  });
  return {
    id,
    kind,
    name,
    species: kind === 'pet' ? str(x.species, 24) : null,
    born,
    died,
    bio: str(x.bio, MEMORIAL_LIMITS.bio),
    portraitPhotoId: photo(x.portraitPhotoId),
    place,
    traces,
    locale: x.locale === 'zh' ? 'zh' : 'en',
    updatedAt: now,
  };
}

const STRINGS = {
  zh: {
    remembered: '家人记下的',
    pet: '陪伴过我们的',
    note: '这一页记录在「来过」。没有留言，没有献花，也没有计数，只是安静地记下 TA 来过。',
    report: '如果这一页冒犯了你，可以在「来过」App 里举报。',
    unknownPlace: '某处',
  },
  en: {
    remembered: 'Remembered by family',
    pet: 'Remembered by the people they lived with',
    note: 'Kept on Been. No comments, no flowers, no counts. Just a quiet record that they were here.',
    report: 'If this page is offensive, you can report it in the Been app.',
    unknownPlace: 'Somewhere',
  },
};

/**
 * 纪念页（单文件 HTML）：家里不用 App 的长辈，拿到链接用任何浏览器都能打开。
 * 照片走服务端的公开地址，只有快照里列出的照片才能被读取。
 */
export function renderMemorialHtml(
  m: Memorial,
  opts: { photoUrl: (photoId: string) => string; pageUrl?: string },
): string {
  const p = palettes.light;
  const s = STRINGS[m.locale];
  const locale = m.locale === 'zh' ? 'zh-CN' : 'en';
  const esc = escapeHtml;
  const span = lifeSpan(m);
  const kicker = [m.species, span].filter(Boolean).join(' · ');
  const portrait = m.portraitPhotoId ? opts.photoUrl(m.portraitPhotoId) : null;
  const initial = [...m.name][0] ?? '·';
  const items = m.traces
    .map((t) => {
      const [l1, l2] = postmarkDate(t.happenedAt, t.precision, locale);
      const stamp = postmarkSvg({
        diameter: 76,
        top: (t.placeName ?? s.unknownPlace).toUpperCase().slice(0, 22),
        bottom: '',
        line1: l1,
        line2: l2,
        color: p.ink,
        waves: false,
      });
      const photos = t.photoIds.map((id) => `<img src="${esc(opts.photoUrl(id))}" alt="" loading="lazy">`).join('');
      return `<article class="trace">
  <div class="stamp">${stamp}</div>
  <div>
    <p class="meta">${esc(formatTraceDate(t.happenedAt, t.precision, locale))}${t.placeName ? `, ${esc(t.placeName)}` : ''}</p>
    ${t.text ? `<p class="text">${esc(t.text).replace(/\n/g, '<br>')}</p>` : ''}
    ${photos ? `<div class="photos">${photos}</div>` : ''}
  </div>
</article>`;
    })
    .join('\n');
  const title = span ? `${m.name} (${span})` : m.name;
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
${m.bio ? `<meta property="og:description" content="${esc(m.bio.slice(0, 160))}">` : ''}
${portrait ? `<meta property="og:image" content="${esc(portrait)}">` : ''}
${opts.pageUrl ? `<meta property="og:url" content="${esc(opts.pageUrl)}">` : ''}
<style>
  :root { --paper:${p.paper}; --ink:${p.ink}; --soft:${p.inkSoft}; --faint:${p.inkFaint}; --rule:${p.rule}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink);
    font: 18px/1.7 Literata, "Iowan Old Style", Georgia, "Songti SC", "Noto Serif CJK SC", serif; }
  main { max-width: 640px; margin: 0 auto; padding: 64px 24px 80px; }
  .portrait { width: 128px; height: 128px; border-radius: 50%; border: 1.5px solid var(--ink); padding: 4px; }
  .portrait img, .portrait span { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: flex; align-items: center; justify-content: center; }
  .portrait span { font-size: 52px; color: var(--soft); }
  h1 { font: 600 40px/1.15 Literata, Georgia, "Songti SC", serif; margin: 24px 0 6px; }
  .kicker { margin: 0; color: var(--soft); font: 15px/1.5 Archivo, system-ui, sans-serif; letter-spacing: 0.02em; }
  .bio { margin: 28px 0 0; }
  .traces { margin-top: 56px; border-top: 1px solid var(--rule); padding-top: 32px; }
  .trace { display: grid; grid-template-columns: 76px 1fr; gap: 20px; margin-bottom: 36px; }
  .stamp svg { opacity: .8; }
  .meta { margin: 0 0 4px; color: var(--soft); font: 14px/1.4 Archivo, system-ui, sans-serif; }
  .text { margin: 0; }
  .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 12px; }
  .photos img { width: 100%; border-radius: 2px; display: block; }
  footer { margin-top: 72px; padding-top: 20px; border-top: 1px solid var(--rule); color: var(--faint); font: 13px/1.6 Archivo, system-ui, sans-serif; }
  footer p { margin: 0 0 6px; }
  @media (max-width: 520px) { h1 { font-size: 32px; } .trace { grid-template-columns: 1fr; gap: 6px; } .stamp svg { width: 60px; height: 60px; } }
</style>
</head>
<body>
<main>
  <div class="portrait">${portrait ? `<img src="${esc(portrait)}" alt="">` : `<span>${esc(initial)}</span>`}</div>
  <h1>${esc(m.name)}</h1>
  ${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ''}
  ${m.bio ? `<p class="bio">${esc(m.bio).replace(/\n/g, '<br>')}</p>` : ''}
  ${items ? `<section class="traces">${items}</section>` : ''}
  <footer>
    <p>${esc(m.kind === 'pet' ? s.pet : s.remembered)}${m.place?.name ? ` · ${esc(m.place.name)}` : ''}</p>
    <p>${esc(s.note)}</p>
    <p>${esc(s.report)}</p>
  </footer>
</main>
</body>
</html>`;
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
