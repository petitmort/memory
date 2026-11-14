import { copy, type AlbumPage, type PageStyle, type TextElement, type PhotoElement } from '../album/document';

type StyleKit = {
  name: string; description: string; colors: [string, string, string];
  paper: PageStyle['paper']; grid: PageStyle['grid']; margin: number; gap: number;
  title: Pick<TextElement, 'font' | 'size' | 'weight' | 'color' | 'lineHeight' | 'letterSpacing' | 'align'>;
  body: StyleKit['title']; frame: Pick<PhotoElement, 'frame' | 'border' | 'color' | 'shadow'>;
};

export const STYLE_KITS: Record<string, StyleKit> = {
  coast: {
    name: '海边留白', description: '白纸 · 宋体 · 轻白边', colors: ['#fffdf7', '#52776d', '#d3e1dc'],
    paper: { kind: 'white', tint: '#fffdf7', texture: .25 },
    grid: { kind: 'none', spacing: 28, weight: .5, color: '#849c96', opacity: .12, offset: 0 }, margin: 34, gap: 22,
    title: { font: 'serif', size: 27, weight: 600, color: '#365c55', lineHeight: 1.55, letterSpacing: 1.5, align: 'center' },
    body: { font: 'serif', size: 17, weight: 400, color: '#44534e', lineHeight: 1.95, letterSpacing: .4, align: 'left' },
    frame: { frame: 'white', border: 9, color: '#ffffff', shadow: .12 },
  },
  warm: {
    name: '暖色手帐', description: '棉纸 · 手写标题 · 拍立得', colors: ['#f8f0e1', '#a77963', '#e8cdb7'],
    paper: { kind: 'cotton', tint: '#f8f0e1', texture: .38 },
    grid: { kind: 'none', spacing: 28, weight: .5, color: '#ac947b', opacity: .14, offset: 0 }, margin: 30, gap: 24,
    title: { font: 'hand', size: 32, weight: 400, color: '#895f4c', lineHeight: 1.5, letterSpacing: 1, align: 'center' },
    body: { font: 'serif', size: 17, weight: 400, color: '#5c5046', lineHeight: 2.05, letterSpacing: .5, align: 'left' },
    frame: { frame: 'polaroid', border: 10, color: '#fffcf5', shadow: .16 },
  },
  garden: {
    name: '植系日记', description: '水彩纸 · 细点阵 · 纸胶带', colors: ['#f3f3e7', '#657b58', '#c5d0b5'],
    paper: { kind: 'watercolor', tint: '#f3f3e7', texture: .3 },
    grid: { kind: 'dotted', spacing: 24, weight: .75, color: '#7c916d', opacity: .18, offset: 0 }, margin: 32, gap: 24,
    title: { font: 'serif', size: 26, weight: 600, color: '#526b48', lineHeight: 1.6, letterSpacing: 1, align: 'left' },
    body: { font: 'serif', size: 17, weight: 400, color: '#485743', lineHeight: 2, letterSpacing: .5, align: 'left' },
    frame: { frame: 'tape', border: 10, color: '#fffdf4', shadow: .13 },
  },
};

// Explicit author action only. Preserve content, template, columns, crops,
// original assets, watermark choices and every free-positioned sticker.
export function applyStyleKit(page: AlbumPage, key: string) {
  const kit = STYLE_KITS[key];
  if (!kit) throw new Error('未知的书页搭配');
  page.paper = copy(kit.paper); page.grid = copy(kit.grid);
  page.layout.margin = kit.margin; page.layout.gap = kit.gap;
  for (const element of page.elements) {
    if (element.type === 'text') Object.assign(element, kit[element.role]);
    else if (element.type === 'photo') Object.assign(element, kit.frame);
  }
}
