/**
 * Been 的视觉语言：邮戳。
 *
 * 邮戳是「某地 + 某日 + 我经过这里」的凭证，正是「来过」的意思。
 * - 纸：偏冷的档案灰，不是暖米色。
 * - 墨：蓝黑，像钢笔墨水。
 * - 印泥：护照入境章的紫墨色，是全应用唯一的强调色，只属于「你的痕迹」。
 *
 * App（react-native-svg）和离线导出的 HTML 书共用这里的颜色与几何。
 */

export interface Palette {
  /** 页面底色 */
  paper: string;
  /** 抬起的纸面：底部抽屉、输入框 */
  sheet: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  rule: string;
  /** 印泥：只用于用户自己的印记与主操作 */
  stamp: string;
  stampWash: string;
  /** 落在印泥色上的文字 */
  onStamp: string;
  mapLand: string;
  mapWater: string;
  mapRoad: string;
  mapLabel: string;
  mapBorder: string;
}

export const palettes: { light: Palette; dark: Palette } = {
  // 白天：暖白纸 + 陶土色印泥。印泥色比常见的 #D97757 压深一点，让上面的白字达到可读的对比度。
  light: {
    paper: '#F5F4EE',
    sheet: '#FBFAF6',
    ink: '#1F1E1B',
    inkSoft: '#5E5D57',
    inkFaint: '#8F8D85',
    rule: '#E2DFD5',
    stamp: '#AE5136',
    stampWash: 'rgba(174, 81, 54, 0.09)',
    onStamp: '#FBFAF6',
    mapLand: '#ECE9DF',
    mapWater: '#D8DDD6',
    mapRoad: '#F8F7F2',
    mapLabel: '#8F8D85',
    mapBorder: '#CFCABD',
  },
  dark: {
    paper: '#13161C',
    sheet: '#1B1F27',
    ink: '#E8E6DF',
    inkSoft: '#A3A7AF',
    inkFaint: '#6E737C',
    rule: '#2A2F38',
    stamp: '#A898F2',
    stampWash: 'rgba(168, 152, 242, 0.13)',
    onStamp: '#13161C',
    mapLand: '#1A1E25',
    mapWater: '#0F1318',
    mapRoad: '#252A33',
    mapLabel: '#6E737C',
    mapBorder: '#2D323B',
  },
};

/**
 * 字体：
 * - Archivo：界面与邮戳。略宽的怪诞体，有印刷品和标牌的气质。
 * - Literata：用户写下的话。为长时间阅读设计的书籍衬线体。
 * 中文回落到系统字体。
 */
export const fonts = {
  ui: 'Archivo_400Regular',
  uiMedium: 'Archivo_500Medium',
  uiSemi: 'Archivo_600SemiBold',
  text: 'Literata_400Regular',
  textItalic: 'Literata_400Regular_Italic',
  textMedium: 'Literata_500Medium',
} as const;

/** 字号阶梯（取自《排版风格要素》的经典比例） */
export const type = {
  meta: { size: 12, line: 16 },
  small: { size: 14, line: 20 },
  ui: { size: 16, line: 22 },
  body: { size: 18, line: 29 },
  title: { size: 21, line: 28 },
  display: { size: 36, line: 40 },
  numeral: { size: 60, line: 60 },
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, gutter: 20 } as const;

/* ------------------------------------------------------------------ */
/* 邮戳几何：一个圆环、上下两段环形文字路径、右侧的波浪注销线          */
/* ------------------------------------------------------------------ */

export interface PostmarkGeometry {
  /** 画布宽高（波浪线会让宽度大于直径） */
  width: number;
  height: number;
  cx: number;
  cy: number;
  outerR: number;
  innerR: number;
  /** 上弧文字路径（从左到右） */
  topArc: string;
  /** 下弧文字路径（从左到右，文字正立） */
  bottomArc: string;
  waves: string[];
}

export function postmarkGeometry(diameter: number, withWaves = true): PostmarkGeometry {
  const stroke = Math.max(1, diameter / 60);
  const outerR = diameter / 2 - stroke;
  const innerR = outerR * 0.62;
  const textR = (outerR + innerR) / 2;
  const cx = diameter / 2;
  const cy = diameter / 2;
  const waveLen = withWaves ? diameter * 1.1 : 0;
  const width = diameter + waveLen;

  // 上弧：从约 200° 到 340°（以 3 点钟为 0°，顺时针为正）
  const arc = (r: number, fromDeg: number, toDeg: number, sweep: 0 | 1) => {
    const a0 = (fromDeg * Math.PI) / 180;
    const a1 = (toDeg * Math.PI) / 180;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    return `M ${f(x0)} ${f(y0)} A ${f(r)} ${f(r)} 0 0 ${sweep} ${f(x1)} ${f(y1)}`;
  };
  // 下弧文字要正立，所以路径从左下走到右下，半径略大以让基线贴着外圈
  const topArc = arc(textR - stroke, 195, 345, 1);
  const bottomArc = arc(textR + diameter * 0.045, 160, 20, 0);

  const waves: string[] = [];
  if (withWaves) {
    const lines = 4;
    const gap = (innerR * 1.5) / (lines - 1);
    // 从外圈右缘开始，避开环形文字
    const startX = cx + outerR * 0.94;
    const amp = diameter * 0.045;
    const period = diameter * 0.32;
    for (let i = 0; i < lines; i++) {
      const y = cy - innerR * 0.75 + i * gap;
      let d = `M ${f(startX)} ${f(y)}`;
      const half = period / 2;
      const end = width - stroke;
      for (let k = 0, x = startX; x < end - 0.5; k++, x += half) {
        const nx = Math.min(x + half, end);
        const dir = k % 2 === 0 ? -1 : 1;
        d += ` Q ${f((x + nx) / 2)} ${f(y + dir * amp)} ${f(nx)} ${f(y)}`;
      }
      waves.push(d);
    }
  }
  return { width, height: diameter, cx, cy, outerR, innerR, topArc, bottomArc, waves };
}

function f(n: number): string {
  return n.toFixed(2);
}

/** 圆心文字的字号：放得进内圈（留 20% 余量），且不超过直径的 15% */
export function postmarkCenterSize(diameter: number, text: string): number {
  const innerWidth = (diameter / 2) * 0.62 * 2 * 0.8;
  // 无衬线大写字母平均宽度约 0.62em；中日韩字符约 1em
  const em = [...text].reduce((w, ch) => w + (/[　-鿿＀-￯]/.test(ch) ? 1 : ch === ' ' ? 0.3 : 0.64), 0);
  return Math.min(diameter * 0.15, em ? innerWidth / em : diameter * 0.15);
}

/** 生成独立的邮戳 SVG 字符串，用于导出的 HTML 书 */
export function postmarkSvg(opts: {
  diameter: number;
  top: string;
  bottom: string;
  line1: string;
  line2: string;
  color: string;
  waves?: boolean;
  fontFamily?: string;
}): string {
  const g = postmarkGeometry(opts.diameter, opts.waves ?? true);
  const id = `pm${Math.random().toString(36).slice(2, 8)}`;
  const ring = Math.max(1, opts.diameter / 60);
  const font = opts.fontFamily ?? 'Archivo, system-ui, sans-serif';
  const ringText = opts.diameter * 0.085;
  const centerBig = postmarkCenterSize(opts.diameter, opts.line1);
  const centerSmall = opts.diameter * 0.11;
  const esc = escapeHtml;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(g.width)}" height="${f(g.height)}" viewBox="0 0 ${f(g.width)} ${f(g.height)}" role="img" aria-label="${esc(`${opts.top} ${opts.line1} ${opts.line2}`)}">
<defs><path id="${id}t" d="${g.topArc}"/><path id="${id}b" d="${g.bottomArc}"/></defs>
<g fill="none" stroke="${opts.color}" stroke-width="${f(ring)}" opacity="0.92">
<circle cx="${f(g.cx)}" cy="${f(g.cy)}" r="${f(g.outerR)}"/>
<circle cx="${f(g.cx)}" cy="${f(g.cy)}" r="${f(g.innerR)}"/>
${g.waves.map((d) => `<path d="${d}"/>`).join('')}
</g>
<g fill="${opts.color}" font-family="${font}" letter-spacing="${f(opts.diameter * 0.012)}">
<text font-size="${f(ringText)}" font-weight="600"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${esc(opts.top)}</textPath></text>
<text font-size="${f(ringText)}"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${esc(opts.bottom)}</textPath></text>
<text x="${f(g.cx)}" y="${f(g.cy - centerBig * 0.1)}" font-size="${f(centerBig)}" font-weight="600" text-anchor="middle">${esc(opts.line1)}</text>
<text x="${f(g.cx)}" y="${f(g.cy + centerSmall * 1.15)}" font-size="${f(centerSmall)}" text-anchor="middle">${esc(opts.line2)}</text>
</g></svg>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
