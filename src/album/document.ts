/** Portable, versioned content. No browser objects or editor history are stored here. */
export const PAPER_NAMES = { white: '纯净白纸', cotton: '米白棉纸', watercolor: '细纹水彩纸', aged: '淡黄旧纸', kraft: '牛皮纸', pastel: '浅色手帐纸' } as const;
export const TEMPLATE_NAMES = { blank: '空白', photo: '整页照片', 'photo-text': '照片＋文字', double: '双照片＋说明', diary: '横线日记', collage: '四图拼贴' } as const;
export const FRAME_NAMES = { white: '白边', polaroid: '拍立得', rounded: '圆角', film: '胶片', stamp: '邮票', tape: '纸胶带' } as const;
export const MOTIF_NAMES = { paw: '猫爪', flower: '小花', shell: '贝壳', star: '星星', leaf: '叶片' } as const;
export const FONT_NAMES = { serif: '宋体 · 系统字体', sans: '黑体 · 系统字体', hand: '龙藏手写 · 自带字体' } as const;
export type Motif = keyof typeof MOTIF_NAMES;
export type TextElement = { id: string; type: 'text'; text: string; role: 'title' | 'body'; font: keyof typeof FONT_NAMES; size: number; weight: number; color: string; lineHeight: number; letterSpacing: number; align: 'left' | 'center' | 'right' };
export type PhotoElement = { id: string; type: 'photo'; assetId: string; caption: string; alt: string; frame: keyof typeof FRAME_NAMES; border: number; color: string; shadow: number; crop: { zoom: number; x: number; y: number; rotation: number } };
export type StickerElement = { id: string; type: 'sticker'; motif: Motif; assetId: string; color: string; x: number; y: number; width: number; rotation: number; opacity: number; locked: boolean };
export type AlbumElement = TextElement | PhotoElement | StickerElement;
export type PageStyle = {
  paper: { kind: keyof typeof PAPER_NAMES; tint: string; texture: number };
  grid: { kind: 'none' | 'ruled' | 'square' | 'dotted'; spacing: number; weight: number; color: string; opacity: number; offset: number };
  watermark: { motif: Motif; assetId: string; mode: 'single' | 'corner' | 'border' | 'repeat'; color: string; size: number; rotation: number; opacity: number; density: number; x: number; y: number; flipX?: boolean; flipY?: boolean; hue?: number; saturation?: number; brightness?: number };
  layout: { template: keyof typeof TEMPLATE_NAMES; margin: number; columns: number; gap: number };
};
export type AlbumPage = PageStyle & { id: string; elements: AlbumElement[] };
export type AlbumSpread = { id: string; pages: [AlbumPage, AlbumPage] };
export type AlbumChapter = { id: string; title: string; date: string; spreads: AlbumSpread[] };
export type AlbumAsset = { id: string; name: string; mime: string; width: number; height: number; src?: string };
export type AlbumDocument = { schemaVersion: 1; id: string; title: string; revision: number; baseCommit: string; updatedAt: string; chapters: AlbumChapter[]; assets: AlbumAsset[] };
export const id = () => crypto.randomUUID();
export const copy = <T>(value: T): T => structuredClone(value);
export const flatten = (doc: AlbumDocument) => doc.chapters.flatMap(chapter => chapter.spreads.map(spread => ({ chapter, spread })));
export function textElement(role: TextElement['role'] = 'body'): TextElement {
  return { id: id(), type: 'text', text: '', role, font: 'serif', size: role === 'title' ? 28 : 17, weight: role === 'title' ? 600 : 400, color: '#405248', lineHeight: 1.95, letterSpacing: .5, align: role === 'title' ? 'center' : 'left' };
}
export function photoElement(): PhotoElement {
  return { id: id(), type: 'photo', assetId: '', caption: '', alt: '', frame: 'tape', border: 10, color: '#fffcf5', shadow: .15, crop: { zoom: 1, x: 50, y: 50, rotation: 0 } };
}
export function stickerElement(motif: Motif = 'flower'): StickerElement {
  return { id: id(), type: 'sticker', motif, assetId: '', color: '#b58c79', x: 75, y: 72, width: 15, rotation: -12, opacity: .75, locked: false };
}
export function pageStyle(): PageStyle {
  return { paper: { kind: 'cotton', tint: '#f8f2e5', texture: .3 }, grid: { kind: 'none', spacing: 26, weight: 1, color: '#849c96', opacity: .18, offset: 0 }, watermark: { motif: 'flower', assetId: '', mode: 'corner', color: '#bd8f88', size: 36, rotation: -12, opacity: 0, density: 3, x: 50, y: 50 }, layout: { template: 'blank', margin: 32, columns: 1, gap: 20 } };
}
/** Layout changes never discard a photo, its crop, or written text. */
export function applyTemplate(page: AlbumPage, template: keyof typeof TEMPLATE_NAMES) {
  page.layout.template = template;
  const needed = { blank: 0, photo: 1, 'photo-text': 1, double: 2, diary: 0, collage: 4 }[template];
  while (page.elements.filter(e => e.type === 'photo').length < needed) page.elements.push(photoElement());
  if (template !== 'blank' && template !== 'photo' && !page.elements.some(e => e.type === 'text')) page.elements.push(textElement('title'), textElement());
  if (template === 'diary') page.grid.kind = 'ruled';
}
export function makePage(template: keyof typeof TEMPLATE_NAMES = 'blank'): AlbumPage {
  const page: AlbumPage = { id: id(), ...pageStyle(), elements: [] };
  applyTemplate(page, template); return page;
}
export function makeSpread(): AlbumSpread { return { id: id(), pages: [makePage('photo-text'), makePage('diary')] }; }
export function newDocument(): AlbumDocument {
  return { schemaVersion: 1, id: id(), title: '未命名纪念册', revision: 0, baseCommit: typeof __ALBUM_BASE_COMMIT__ === 'string' ? __ALBUM_BASE_COMMIT__ : '', updatedAt: new Date().toISOString(), assets: [], chapters: [{ id: id(), title: '新章节', date: '', spreads: [makeSpread()] }] };
}
export function duplicateSpread(spread: AlbumSpread): AlbumSpread {
  const clone = copy(spread); clone.id = id();
  clone.pages.forEach(page => { page.id = id(); page.elements.forEach(element => { element.id = id(); }); });
  return clone;
}

/** Import is a trust boundary. Reject invalid data instead of partly applying it. */
export function validateDocument(input: unknown): AlbumDocument {
  const fail = (field: string): never => { throw new Error(`纪念册格式无效：${field}`); };
  const object = (v: unknown, key: string): any => v && typeof v === 'object' && !Array.isArray(v) ? v : fail(key);
  const str = (v: unknown, key: string, max = 500): string => typeof v === 'string' && v.length <= max ? v : fail(key);
  const num = (v: unknown, min: number, max: number, key: string) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(key);
  const choice = (v: unknown, values: string[], key: string) => typeof v === 'string' && values.includes(v) ? v : fail(key);
  const color = (v: unknown) => /^#[0-9a-f]{6}$/i.test(str(v, '颜色', 7)) || fail('颜色');
  const array = (v: unknown, min: number, max: number, key: string): any[] => Array.isArray(v) && v.length >= min && v.length <= max ? v : fail(key);
  const ids = new Set<string>();
  const checkId = (v: unknown) => { const s = str(v, 'ID', 80); if (!/^[a-zA-Z0-9_-]{1,80}$/.test(s) || ids.has(s)) fail('重复或非法ID'); ids.add(s); };
  const doc = object(input, '文档');
  if (doc.schemaVersion !== 1) fail('不支持的版本');
  checkId(doc.id); str(doc.title, '书名', 150); num(doc.revision, 0, Number.MAX_SAFE_INTEGER, 'revision');
  if (!Number.isInteger(doc.revision)) fail('revision');
  if (!/^$|^[a-f0-9]{7,40}$/.test(str(doc.baseCommit, '基线', 40))) fail('基线');
  if (!Number.isFinite(Date.parse(str(doc.updatedAt, '更新时间', 40)))) fail('更新时间');
  const assets = new Set<string>();
  for (const value of array(doc.assets, 0, 300, '素材数量')) {
    const a = object(value, '素材'); checkId(a.id); assets.add(a.id); str(a.name, '素材名称', 200);
    choice(a.mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], '图片类型');
    num(a.width, 1, 20000, '图片宽'); num(a.height, 1, 20000, '图片高');
    if (a.width * a.height > 40000000) fail('图片像素过大');
    if (a.src !== undefined && !/^\.\/album\/assets\/[a-f0-9]{64}\.(webp|png|jpg|gif)$/.test(str(a.src, '素材路径', 120))) fail('素材路径');
  }
  const ref = (value: unknown) => { if (value !== '' && !assets.has(str(value, '素材引用', 80))) fail('找不到素材'); };
  let spreads = 0, characters = 0;
  for (const value of array(doc.chapters, 1, 40, '章节数量')) {
    const chapter = object(value, '章节'); checkId(chapter.id); str(chapter.title, '章节标题', 150); str(chapter.date, '日期', 100);
    for (const value of array(chapter.spreads, 1, 160, '跨页数量')) {
      if (++spreads > 160) fail('整本跨页数量');
      const spread = object(value, '跨页'); checkId(spread.id);
      for (const value of array(spread.pages, 2, 2, '左右页')) {
        const page = object(value, '页面'); checkId(page.id);
        const p = object(page.paper, '纸张'); choice(p.kind, Object.keys(PAPER_NAMES), '纸张'); color(p.tint); num(p.texture, 0, 1, '纸纹');
        const g = object(page.grid, '格线'); choice(g.kind, ['none', 'ruled', 'square', 'dotted'], '格线'); color(g.color); num(g.opacity, 0, 1, '格线透明度'); num(g.spacing, 12, 64, '格距'); num(g.weight, .25, 3, '格线粗细'); num(g.offset, 0, 64, '格线偏移');
        const w = object(page.watermark, '图案'); choice(w.motif, Object.keys(MOTIF_NAMES), '图案'); ref(w.assetId); choice(w.mode, ['single', 'corner', 'border', 'repeat'], '图案排布'); color(w.color); num(w.opacity, 0, 1, '图案透明度'); num(w.size, 8, 120, '图案大小'); num(w.rotation, -180, 180, '图案旋转'); num(w.density, 1, 8, '图案密度'); num(w.x, 0, 100, '图案X'); num(w.y, 0, 100, '图案Y');
        for (const field of ['flipX', 'flipY']) if (w[field] !== undefined && typeof w[field] !== 'boolean') fail('图案镜像');
        if (w.hue !== undefined) num(w.hue, -180, 180, '图案色相');
        for (const field of ['saturation', 'brightness']) if (w[field] !== undefined) num(w[field], 0, 2, '图案调色');
        const l = object(page.layout, '布局'); choice(l.template, Object.keys(TEMPLATE_NAMES), '模板'); num(l.margin, 12, 60, '边距'); num(l.columns, 1, 2, '列数'); if (![1, 2].includes(l.columns)) fail('列数'); num(l.gap, 8, 40, '列距');
        for (const value of array(page.elements, 0, 80, '元素数量')) {
          const e = object(value, '元素'); checkId(e.id);
          if (e.type === 'text') {
            characters += str(e.text, '文字', 50000).length;
            choice(e.role, ['title', 'body'], '文字用途'); choice(e.font, Object.keys(FONT_NAMES), '字体'); num(e.size, 16, 52, '字号'); num(e.weight, 400, 700, '字重'); color(e.color); num(e.lineHeight, 1.2, 2.8, '行距'); num(e.letterSpacing, 0, 6, '字距'); choice(e.align, ['left', 'center', 'right'], '对齐');
          } else if (e.type === 'photo') {
            ref(e.assetId); str(e.caption, '图注', 3000); str(e.alt, '图片说明', 1000); choice(e.frame, Object.keys(FRAME_NAMES), '相框'); color(e.color); num(e.border, 0, 24, '边宽'); num(e.shadow, 0, .5, '阴影');
            const c = object(e.crop, '裁切'); num(c.zoom, 1, 4, '裁切缩放'); num(c.x, 0, 100, '取景X'); num(c.y, 0, 100, '取景Y'); num(c.rotation, -180, 180, '照片旋转');
          } else if (e.type === 'sticker') {
            choice(e.motif, Object.keys(MOTIF_NAMES), '贴纸'); ref(e.assetId); color(e.color); num(e.x, 0, 100, '贴纸X'); num(e.y, 0, 100, '贴纸Y'); num(e.width, 4, 55, '贴纸大小'); num(e.rotation, -180, 180, '贴纸旋转'); num(e.opacity, 0, 1, '贴纸透明度'); if (typeof e.locked !== 'boolean') fail('锁定');
          } else fail('元素类型');
        }
      }
    }
  }
  if (characters > 200000) fail('整本文字过多');
  return copy(doc) as AlbumDocument;
}
