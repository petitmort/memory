import { PAPER_NAMES, TEMPLATE_NAMES, FRAME_NAMES, MOTIF_NAMES, FONT_NAMES, copy, type AlbumPage, type AlbumDocument, type AlbumElement, type PageStyle } from '../album/document';

type Options = { document: AlbumDocument; page: AlbumPage; selected?: AlbumElement; scope: string; onScope(value: string): void; change(action: () => void, preview?: boolean): void; style<K extends keyof PageStyle>(key: K, value: PageStyle[K], preview?: boolean): void; upload(kind: 'photo' | 'watermark' | 'sticker'): void };
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const e = document.createElement(tag); e.textContent = text; return e; };
function field(title: string, input: HTMLElement) { const label = node('label'); label.className = 'editor-field'; if (input.matches('input,select,textarea')) input.setAttribute('aria-label', title); label.append(node('span', title), input); return label; }
// Bind values to the live model so native controls keep focus / pointer capture.
const refreshers = new WeakMap<Element, () => void>();
export function refreshProperties(host: HTMLElement) { host.querySelectorAll('*').forEach(element => refreshers.get(element)?.()); }
function bind(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: () => string | number) {
  const refresh = () => { const next = String(value()); if (input.value !== next) input.value = next; };
  refreshers.set(input, refresh); refresh();
}
function select(title: string, value: () => string | number, choices: Record<string, string>, change: (value: string) => void) {
  const input = node('select'); for (const [key, label] of Object.entries(choices)) { const option = node('option', label); option.value = key; input.append(option); } bind(input, value); input.onchange = () => change(input.value); return field(title, input);
}
function rangeField(title: string, value: () => number, min: number, max: number, step: number, change: (value: number) => void, preview: (action: () => void) => void) {
  const input = node('input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.setAttribute('aria-label', title); bind(input, value);
  const output = node('output', input.value); const wrap = node('div'); wrap.className = 'editor-range'; wrap.append(input, output);
  refreshers.set(output, () => { output.value = input.value; });
  input.oninput = () => { output.value = input.value; preview(() => change(Number(input.value))); }; input.onchange = () => change(Number(input.value)); return field(title, wrap);
}
function colorField(title: string, value: () => string, change: (value: string) => void, preview: (action: () => void) => void) { const input = node('input'); input.type = 'color'; bind(input, value); input.oninput = () => preview(() => change(input.value)); input.onchange = () => change(input.value); return field(title, input); }
function text(title: string, value: () => string, change: (value: string) => void, multiline = false) {
  const input = multiline ? node('textarea') : node('input'); bind(input, value); input.onchange = () => change(input.value); if (multiline) (input as HTMLTextAreaElement).rows = 5; return field(title, input);
}
function button(title: string, action: () => void) { const b = node('button', title); b.type = 'button'; b.onclick = action; return b; }
function group(title: string, open = false) { const g = node('details'); g.open = open; g.append(node('summary', title)); return g; }
export function createProperties(options: Options) {
  const { page, selected, document: doc } = options, host = node('div'); host.className = 'editor-properties';
  let previewing = false;
  const preview = (action: () => void) => { previewing = true; try { action(); } finally { previewing = false; } };
  const range = (title: string, value: () => number, min: number, max: number, step: number, change: (value: number) => void) => rangeField(title, value, min, max, step, change, preview);
  const color = (title: string, value: () => string, change: (value: string) => void) => colorField(title, value, change, preview);
  const hint = node('p', '页面设置可批量应用；元素样式只改变当前选中的图文。'); hint.className = 'editor-muted'; host.append(hint);
  host.append(select('页面设置应用到', () => options.scope, { page: '当前单页', spread: '当前跨页', book: '整本纪念册' }, options.onScope));
  const style = <K extends keyof PageStyle>(key: K, update: (value: PageStyle[K]) => void) => { const value = copy(page[key]); update(value); options.style(key, value, previewing); };
  const layout = group('版式与留白', true);
  layout.append(select('页面模板', () => page.layout.template, TEMPLATE_NAMES, value => style('layout', l => { l.template = value as any; })), range('页边距', () => page.layout.margin, 12, 60, 1, value => style('layout', l => { l.margin = value; })), select('文字列数', () => page.layout.columns, { '1': '单列', '2': '双列 · 手机自动单列' }, value => style('layout', l => { l.columns = Number(value); })), range('区块及列间距', () => page.layout.gap, 8, 40, 1, value => style('layout', l => { l.gap = value; })));
  const paper = group('纸张材质', true);
  const tints = { white: '#fffefa', cotton: '#f8f2e5', watercolor: '#f5f2ea', aged: '#efe1bd', kraft: '#d9bc90', pastel: '#f4e9eb' };
  paper.append(select('纸张', () => page.paper.kind, PAPER_NAMES, value => style('paper', p => { p.kind = value as any; p.tint = tints[p.kind]; })), color('纸张底色', () => page.paper.tint, value => style('paper', p => { p.tint = value; })), range('纸纹强度', () => page.paper.texture, 0, 1, .05, value => style('paper', p => { p.texture = value; })));
  const grid = group('格线与点阵');
  grid.append(select('格线样式', () => page.grid.kind, { none: '无格线', ruled: '横线', square: '方格', dotted: '点阵' }, value => style('grid', g => { g.kind = value as any; })), range('格线间距', () => page.grid.spacing, 12, 64, 1, value => style('grid', g => { g.spacing = value; })), range('格线粗细', () => page.grid.weight, .25, 3, .25, value => style('grid', g => { g.weight = value; })), color('格线颜色', () => page.grid.color, value => style('grid', g => { g.color = value; })), range('格线透明度', () => page.grid.opacity * 100, 0, 100, 1, value => style('grid', g => { g.opacity = value / 100; })), range('格线起点', () => page.grid.offset, 0, 64, 1, value => style('grid', g => { g.offset = value; })));
  const pattern = group('图案水印');
  pattern.append(select('图案主题', () => page.watermark.motif, MOTIF_NAMES, value => style('watermark', w => { w.motif = value as any; w.assetId = ''; })), select('图案排布', () => page.watermark.mode, { single: '单个', corner: '页角', border: '边框', repeat: '重复铺底' }, value => style('watermark', w => { w.mode = value as any; })), color('图案颜色', () => page.watermark.color, value => style('watermark', w => { w.color = value; })), range('水印透明度', () => page.watermark.opacity * 100, 0, 100, 1, value => style('watermark', w => { w.opacity = value / 100; })), range('图案大小', () => page.watermark.size, 8, 120, 1, value => style('watermark', w => { w.size = value; })), range('图案密度', () => page.watermark.density, 1, 8, 1, value => style('watermark', w => { w.density = value; })), range('图案角度', () => page.watermark.rotation, -180, 180, 1, value => style('watermark', w => { w.rotation = value; })), range('图案水平偏移', () => page.watermark.x, 0, 100, 1, value => style('watermark', w => { w.x = value; })), range('图案垂直偏移', () => page.watermark.y, 0, 100, 1, value => style('watermark', w => { w.y = value; })), button('导入自己的水印', () => options.upload('watermark')));
  if (page.watermark.assetId) pattern.append(node('p', '正在使用自有图片；主题颜色只作用于内置图案。'), button('恢复内置图案', () => style('watermark', w => { w.assetId = ''; })));
  host.append(layout, paper, grid, pattern);
  if (!selected) { host.append(node('p', '点击纸上的文字、照片或贴纸，显示对应设置。')); return host; }
  const element = group(selected.type === 'text' ? '文字设置' : selected.type === 'photo' ? '照片与相框' : '贴纸设置', true); element.className = 'editor-element-settings';
  const change = (action: () => void) => options.change(action, previewing);
  if (selected.type === 'text') {
    element.append(text('文字内容', () => selected.text, value => change(() => { selected.text = value; }), true), select('字体', () => selected.font, FONT_NAMES, value => change(() => { selected.font = value as any; })), range('字号', () => selected.size, 16, 52, 1, value => change(() => { selected.size = value; })), select('字重', () => selected.weight, { '400': '常规', '600': '中粗', '700': '粗体' }, value => change(() => { selected.weight = Number(value); })), color('文字颜色', () => selected.color, value => change(() => { selected.color = value; })), range('文字行距', () => selected.lineHeight, 1.2, 2.8, .05, value => change(() => { selected.lineHeight = value; })), range('文字字距', () => selected.letterSpacing, 0, 6, .1, value => change(() => { selected.letterSpacing = value; })), select('文字对齐', () => selected.align, { left: '左对齐', center: '居中', right: '右对齐' }, value => change(() => { selected.align = value as any; })));
    const information = node('p'), license = node('a', '查看字体许可'); license.href = './fonts/LongCang-OFL.txt'; license.target = '_blank'; license.rel = 'noopener'; element.append(information, license);
    const refreshFont = () => { information.textContent = selected.font === 'hand' ? '龙藏手写体自带OFL许可。' : '系统字体随读者设备变化。正文至少16px。'; license.hidden = selected.font !== 'hand'; };
    refreshers.set(information, refreshFont); refreshFont();
  } else if (selected.type === 'photo') {
    element.append(button('选择或替换照片', () => options.upload('photo')), select('照片框', () => selected.frame, FRAME_NAMES, value => change(() => { selected.frame = value as any; })), color('相框颜色', () => selected.color, value => change(() => { selected.color = value; })), range('相框宽度', () => selected.border, 0, 24, 1, value => change(() => { selected.border = value; })), range('相框阴影', () => selected.shadow, 0, .5, .05, value => change(() => { selected.shadow = value; })), text('照片图注', () => selected.caption, value => change(() => { selected.caption = value; })), text('照片替代说明', () => selected.alt, value => change(() => { selected.alt = value; })), range('照片取景缩放', () => selected.crop.zoom, 1, 4, .05, value => change(() => { selected.crop.zoom = value; })), range('照片取景水平', () => selected.crop.x, 0, 100, 1, value => change(() => { selected.crop.x = value; })), range('照片取景垂直', () => selected.crop.y, 0, 100, 1, value => change(() => { selected.crop.y = value; })), range('照片旋转', () => selected.crop.rotation, -180, 180, 1, value => change(() => { selected.crop.rotation = value; })), button('恢复照片裁切', () => change(() => { selected.crop = { zoom: 1, x: 50, y: 50, rotation: 0 }; })));
    if (doc.assets.length) element.append(select('从已有素材选择', () => selected.assetId, { '': '未选择', ...Object.fromEntries(doc.assets.map(asset => [asset.id, asset.name])) }, value => change(() => { selected.assetId = value; })));
  } else {
    element.append(select('贴纸主题', () => selected.motif, MOTIF_NAMES, value => change(() => { selected.motif = value as any; selected.assetId = ''; })), button('导入自己的贴纸', () => options.upload('sticker')), color('贴纸颜色', () => selected.color, value => change(() => { selected.color = value; })), range('贴纸透明度', () => selected.opacity * 100, 0, 100, 1, value => change(() => { selected.opacity = value / 100; })), range('贴纸大小', () => selected.width, 4, 55, .5, value => change(() => { selected.width = value; })), range('贴纸角度', () => selected.rotation, -180, 180, 1, value => change(() => { selected.rotation = value; })), range('贴纸水平', () => selected.x, 0, 100, .5, value => change(() => { selected.x = value; })), range('贴纸垂直', () => selected.y, 0, 100, .5, value => change(() => { selected.y = value; })), button('锁定贴纸', () => change(() => { selected.locked = !selected.locked; })));
  }
  if (selected.type === 'sticker') { const lock = element.querySelector<HTMLButtonElement>('button:last-child')!; const refresh = () => { lock.textContent = selected.locked ? '解锁贴纸' : '锁定贴纸'; }; refreshers.set(lock, refresh); refresh(); }
  const order = node('div'); order.className = 'editor-button-row';
  const move = (delta: number) => change(() => { const index = page.elements.indexOf(selected), to = Math.max(0, Math.min(page.elements.length - 1, index + delta)); [page.elements[index], page.elements[to]] = [page.elements[to], page.elements[index]]; });
  order.append(button('向前一层', () => move(1)), button('向后一层', () => move(-1)), button('删除元素', () => change(() => { const index = page.elements.indexOf(selected); if (index >= 0) page.elements.splice(index, 1); })));
  element.append(order); host.prepend(element); return host;
}
