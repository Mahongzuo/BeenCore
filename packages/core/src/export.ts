/**
 * 导出：让痕迹比这个 App 活得更久。
 *
 * 1. 档案包（JSON）：完整数据，可重新导入，格式公开，任何程序都能读。
 * 2. 人生之书（单文件 HTML）：照片内嵌，不依赖任何服务器，
 *    十年后用任何浏览器双击就能打开，也可以直接打印成纸书。
 */
import type { Person, Photo, Trace } from './types.ts';
import type { LifeBook } from './book.ts';
import { escapeHtml, palettes, postmarkSvg } from './design.ts';
import { formatTraceDate, postmarkDate } from './time.ts';

export const ARCHIVE_FORMAT = 'been-archive';
/** 2：加入亲友与宠物档案（persons），印记多了 ownerId。仍能读 1。 */
export const ARCHIVE_VERSION = 2;

export interface Archive {
  format: typeof ARCHIVE_FORMAT;
  version: number;
  exportedAt: string;
  traces: Trace[];
  photos: Omit<Photo, 'localRef'>[];
  persons: Person[];
}

export function buildArchive(traces: Trace[], photos: Photo[], now = Date.now(), persons: Person[] = []): Archive {
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date(now).toISOString(),
    traces: traces.filter((t) => !t.deletedAt),
    photos: photos.map(({ localRef: _localRef, ...rest }) => rest),
    persons: persons.filter((p) => !p.deletedAt),
  };
}

export function parseArchive(json: string): Archive {
  const data = JSON.parse(json) as Partial<Archive>;
  if (data.format !== ARCHIVE_FORMAT || typeof data.version !== 'number') {
    throw new Error('Not a Been archive');
  }
  if (data.version > ARCHIVE_VERSION) {
    throw new Error(`Archive version ${data.version} is newer than this app supports`);
  }
  return {
    format: ARCHIVE_FORMAT,
    version: data.version,
    exportedAt: data.exportedAt ?? '',
    traces: Array.isArray(data.traces) ? data.traces : [],
    photos: Array.isArray(data.photos) ? data.photos : [],
    persons: Array.isArray(data.persons) ? data.persons : [],
  };
}

export interface BookStrings {
  title: string;
  subtitle: string;
  chapterPlaces: (n: number) => string;
  themeLabel: (theme: Trace['theme']) => string;
  unknownPlace: string;
  colophon: string;
}

export function renderBookHtml(
  book: LifeBook,
  opts: {
    locale: string;
    author: string;
    strings: BookStrings;
    /** 照片 id → data URI。缺失则略过该照片 */
    photoSrc: (photoId: string) => string | null;
    generatedAt?: number;
  },
): string {
  const p = palettes.light;
  const s = opts.strings;
  const esc = escapeHtml;
  const chapters = book.chapters
    .map((ch) => {
      const items = ch.traces
        .map((t) => {
          const [l1, l2] = postmarkDate(t.happenedAt, t.precision, opts.locale);
          const place = t.place?.name ?? s.unknownPlace;
          const stamp = postmarkSvg({
            diameter: 84,
            top: place.toUpperCase().slice(0, 22),
            bottom: (t.place?.country ?? '').toUpperCase(),
            line1: l1,
            line2: l2,
            color: p.stamp,
            waves: false,
          });
          const photos = t.photoIds
            .map((id) => opts.photoSrc(id))
            .filter((src): src is string => !!src)
            .map((src) => `<img src="${src}" alt="" loading="lazy">`)
            .join('');
          return `<article class="trace">
  <div class="stamp">${stamp}</div>
  <div class="body">
    <p class="meta">${esc(formatTraceDate(t.happenedAt, t.precision, opts.locale))}${t.place?.name ? `, ${esc(t.place.name)}` : ''}</p>
    <p class="text">${esc(t.text).replace(/\n/g, '<br>')}</p>
    ${photos ? `<div class="photos">${photos}</div>` : ''}
  </div>
</article>`;
        })
        .join('\n');
      const sub = [
        ch.leadingTheme ? s.themeLabel(ch.leadingTheme) : null,
        ch.placeCount ? s.chapterPlaces(ch.placeCount) : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `<section class="chapter">
  <header><h2>${ch.year}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</header>
  ${items}
</section>`;
    })
    .join('\n');

  const generated = new Date(opts.generatedAt ?? Date.now()).toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="${esc(opts.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.title)}: ${esc(opts.author)}</title>
<style>
  :root { --paper:${p.paper}; --sheet:${p.sheet}; --ink:${p.ink}; --soft:${p.inkSoft}; --faint:${p.inkFaint}; --rule:${p.rule}; --stamp:${p.stamp}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink);
    font: 18px/1.6 Literata, "Iowan Old Style", Georgia, "Songti SC", "Noto Serif CJK SC", serif; }
  main { max-width: 680px; margin: 0 auto; padding: 72px 24px 96px; }
  .cover { margin-bottom: 96px; }
  .cover h1 { font: 600 44px/1.1 Archivo, system-ui, sans-serif; margin: 0 0 12px; letter-spacing: -0.01em; }
  .cover p { margin: 0; color: var(--soft); font-family: Archivo, system-ui, sans-serif; font-size: 16px; }
  .chapter { margin-top: 72px; }
  .chapter header { display: flex; align-items: baseline; gap: 16px; border-bottom: 1px solid var(--rule); padding-bottom: 12px; margin-bottom: 32px; }
  .chapter h2 { font: 600 36px/1 Archivo, system-ui, sans-serif; margin: 0; }
  .chapter header p { margin: 0; color: var(--soft); font: 14px/1.4 Archivo, system-ui, sans-serif; }
  .trace { display: grid; grid-template-columns: 84px 1fr; gap: 20px; margin-bottom: 40px; break-inside: avoid; }
  .meta { margin: 0 0 4px; color: var(--soft); font: 14px/1.4 Archivo, system-ui, sans-serif; }
  .text { margin: 0; white-space: normal; }
  .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 12px; }
  .photos img { width: 100%; border-radius: 2px; display: block; }
  footer { margin-top: 96px; color: var(--faint); font: 12px/1.5 Archivo, system-ui, sans-serif; }
  @media (max-width: 520px) { .trace { grid-template-columns: 1fr; gap: 8px; } .stamp svg { width: 64px; height: 64px; } }
  @media print { body { background: #fff; } main { padding: 0; } .chapter { break-before: page; } }
</style>
</head>
<body>
<main>
  <div class="cover">
    <h1>${esc(opts.author)}</h1>
    <p>${esc(s.subtitle)}</p>
  </div>
  ${chapters}
  <footer>${esc(s.colophon)} ${generated}</footer>
</main>
</body>
</html>`;
}
