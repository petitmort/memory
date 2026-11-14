import './page.css';
import type { AlbumPage, AlbumElement, Motif, PhotoElement } from './document';
import { watermarkAppearance } from './watermark-appearance';
import { watermarkTiles } from './watermark-layout';

export type AssetResolver = (id: string) => string | undefined;
export type PageRenderOptions = { resolveAsset: AssetResolver; editable?: boolean; number?: number };
const NS = 'http://www.w3.org/2000/svg';
const FONT = { serif: '"Songti SC", "Noto Serif CJK SC", SimSun, serif', sans: '"PingFang SC", "Microsoft YaHei", sans-serif', hand: '"Tides Hand", cursive' };
const paths: Record<Motif, string> = {
  paw: 'M26 32C18 25 10 34 12 41C15 48 21 43 25 44C31 44 39 50 41 42C43 35 35 27 30 30ZM11 17C4 16 4 28 10 29C17 29 17 18 11 17ZM22 9C15 7 14 21 21 22C28 23 29 10 22 9ZM35 10C29 8 26 22 32 24C39 25 42 12 35 10ZM45 20C39 17 34 29 39 31C46 35 51 23 45 20Z',
  flower: 'M25 19C10-2 3 17 18 24C-5 26 8 44 22 31C19 53 40 49 30 30C50 41 55 20 33 23C48 6 29-3 25 19ZM24 25A4 4 0 1 0 32 25A4 4 0 1 0 24 25Z',
  shell: 'M25 46C20 41 4 27 5 17C7 3 17 9 20 12C22-1 34-1 35 12C47 2 55 18 46 29C40 37 31 43 25 46ZM25 41L12 17M27 40L26 11M29 39L41 17',
  star: 'M25 3L31 18L48 20L35 31L39 48L25 39L10 48L14 31L2 20L19 18Z',
  leaf: 'M8 43C-2 17 25 5 46 4C47 28 33 51 8 43ZM9 42L37 13M19 32L17 21M27 24L39 25',
};
function svgNode<K extends keyof SVGElementTagNameMap>(name: K) { return document.createElementNS(NS, name); }
export function motifSvg(motif: Motif, color: string): SVGSVGElement {
  const svg = svgNode('svg'); svg.setAttribute('viewBox', '0 0 52 52'); svg.setAttribute('aria-hidden', 'true');
  const path = svgNode('path'); path.setAttribute('d', paths[motif]); path.setAttribute('fill', motif === 'shell' || motif === 'leaf' ? 'none' : color);
  path.setAttribute('stroke', color); path.setAttribute('stroke-width', '1.6'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); svg.append(path); return svg;
}
const watermarkContents = new WeakMap<HTMLElement, string>();
function watermarks(page: AlbumPage, resolve: AssetResolver, layer: HTMLElement = document.createElement('div')) {
  const w = page.watermark; layer.className = 'album-watermark'; layer.setAttribute('aria-hidden', 'true');
  const appearance = watermarkAppearance(w);
  layer.style.filter = appearance.filter;
  layer.style.opacity = String(w.opacity);
  if (!w.opacity) { layer.replaceChildren(); return layer; }
  const tiles = watermarkTiles(w);
  while (layer.children.length > tiles.length) layer.lastElementChild!.remove();
  tiles.forEach(({ x, y, assetId, rotation }, i) => {
    let tile = layer.children[i] as HTMLElement | undefined;
    if (!tile) { tile = document.createElement('div'); tile.className = 'album-watermark-tile'; layer.append(tile); }
    const src = assetId && resolve(assetId), identity = src || `${w.motif}:${w.color}`;
    if (tile.dataset.watermarkAsset !== assetId) tile.dataset.watermarkAsset = assetId;
    const styles = { width: `${w.size}px`, height: `${w.size}px`, left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) rotate(${rotation}deg)${appearance.mirror}` };
    for (const [key, value] of Object.entries(styles)) if (tile.style.getPropertyValue(key) !== value) tile.style.setProperty(key, value);
    if (watermarkContents.get(tile) !== identity || !tile.firstElementChild) {
      if (src) { const img = new Image(); img.src = src; img.alt = ''; tile.replaceChildren(img); }
      else tile.replaceChildren(motifSvg(w.motif, w.color));
      watermarkContents.set(tile, identity);
    }
  });
  return layer;
}
function photoContent(photo: PhotoElement, resolve: AssetResolver, figure = document.createElement('figure')) {
  figure.className = `album-photo album-frame-${photo.frame}`;
  figure.style.setProperty('--frame-color', photo.color); figure.style.setProperty('--frame-width', `${photo.border}px`); figure.style.setProperty('--frame-shadow', `0 4px 12px rgb(48 35 20 / ${photo.shadow})`);
  let view = figure.querySelector<HTMLDivElement>('.album-photo-view');
  if (!view) { view = document.createElement('div'); view.className = 'album-photo-view'; figure.append(view); }
  const src = photo.assetId && resolve(photo.assetId);
  if (src) {
    let img = view.querySelector('img');
    if (!img) { img = new Image(); img.decoding = 'async'; view.replaceChildren(img); }
    if (img.getAttribute('src') !== src) { img.src = src; img.hidden = false; delete view.dataset.missing; }
    img.alt = photo.alt || photo.caption || '纪念册照片'; view.classList.remove('album-photo-empty');
    img.style.objectPosition = `${photo.crop.x}% ${photo.crop.y}%`;
    const a = photo.crop.rotation * Math.PI / 180;
    const scale = photo.crop.zoom * (Math.abs(Math.cos(a)) + 4 / 3 * Math.abs(Math.sin(a)));
    img.style.transform = `translate(${(50 - photo.crop.x) * (photo.crop.zoom - 1) / photo.crop.zoom}%,${(50 - photo.crop.y) * (photo.crop.zoom - 1) / photo.crop.zoom}%) rotate(${photo.crop.rotation}deg) scale(${scale})`;
    const image = img, frame = view;
    img.onerror = () => { image.hidden = true; frame.dataset.missing = '照片未能加载，请检查素材'; };
  } else { view.classList.add('album-photo-empty'); view.textContent = '＋ 选择照片'; delete view.dataset.missing; }
  let caption = figure.querySelector('figcaption');
  if (!caption) { caption = document.createElement('figcaption'); figure.append(caption); }
  if (caption.textContent !== photo.caption) caption.textContent = photo.caption;
  return figure;
}
function updateElement(host: HTMLElement, element: AlbumElement, resolve: AssetResolver, editable: boolean) {
  if (element.type === 'text') {
    host.classList.add(`album-text-${element.role}`); host.dataset.font = element.font;
    Object.assign(host.style, { fontFamily: FONT[element.font], fontSize: `${element.size}px`, fontWeight: String(element.weight), color: element.color, lineHeight: String(element.lineHeight), letterSpacing: `${element.letterSpacing}px`, textAlign: element.align });
    let text = host.firstElementChild as HTMLElement | null;
    if (!text) { text = document.createElement(element.role === 'title' ? 'h2' : 'p'); host.append(text); }
    // Preserve the native Chinese IME selection when the model already matches.
    if (text.textContent !== element.text && (!editable || text.innerText !== element.text)) text.textContent = element.text;
    if (editable) { text.contentEditable = 'plaintext-only'; text.dataset.text = element.id; text.dataset.placeholder = element.role === 'title' ? '点击写下标题' : '点击写下你的回忆…'; text.setAttribute('aria-label', element.role === 'title' ? '页面标题' : '页面正文'); text.setAttribute('role', 'textbox'); text.setAttribute('aria-multiline', 'true'); text.spellcheck = false; }
  } else if (element.type === 'photo') {
    const figure = host.querySelector('figure');
    const updated = photoContent(element, resolve, figure ?? undefined); if (!figure) host.append(updated);
  } else {
    Object.assign(host.style, { left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, transform: `translate(-50%,-50%) rotate(${element.rotation}deg)`, opacity: String(element.opacity) });
    host.dataset.locked = String(element.locked); host.setAttribute('aria-hidden', 'true');
    const previous = host.querySelector('svg,img'), src = element.assetId && resolve(element.assetId);
    if (src) {
      if (previous instanceof HTMLImageElement) { if (previous.getAttribute('src') !== src) previous.src = src; }
      else { const img = new Image(); img.src = src; img.alt = ''; if (previous) previous.replaceWith(img); else host.prepend(img); }
    } else { const svg = motifSvg(element.motif, element.color); if (previous) previous.replaceWith(svg); else host.prepend(svg); }
  }
}
export function renderElement(element: AlbumElement, resolve: AssetResolver, editable = false) {
  const host = document.createElement('div'); host.className = `album-element album-${element.type}`; host.dataset.element = element.id;
  updateElement(host, element, resolve, editable); return host;
}
function pageStyle(host: HTMLElement, page: AlbumPage) {
  host.classList.add('album-page'); host.dataset.albumPage = page.id; host.dataset.template = page.layout.template; host.dataset.paper = page.paper.kind;
  const vars: Record<string, string> = { '--paper-tint': page.paper.tint, '--paper-texture': String(page.paper.texture), '--page-margin': `${page.layout.margin}px`, '--content-columns': String(page.layout.columns), '--content-gap': `${page.layout.gap}px` };
  for (const [key, value] of Object.entries(vars)) if (host.style.getPropertyValue(key) !== value) host.style.setProperty(key, value);
}
function gridStyle(grid: HTMLElement, page: AlbumPage) {
  grid.className = `album-grid album-grid-${page.grid.kind}`;
  Object.assign(grid.style, { opacity: String(page.grid.opacity), backgroundSize: `${page.grid.spacing}px ${page.grid.spacing}px`, backgroundPosition: `${page.grid.offset}px ${page.grid.offset}px` });
  grid.style.setProperty('--grid-color', page.grid.color); grid.style.setProperty('--grid-weight', `${page.grid.weight}px`);
}
/** One renderer for authoring, reader pages, leaf faces and paper capture. */
export function renderAlbumPage(host: HTMLElement, page: AlbumPage, options: PageRenderOptions) {
  pageStyle(host, page);
  const texture = document.createElement('div'); texture.className = `album-paper-texture album-paper-${page.paper.kind}`; texture.setAttribute('aria-hidden', 'true');
  const grid = document.createElement('div'); grid.setAttribute('aria-hidden', 'true'); gridStyle(grid, page);
  const content = document.createElement('div'); content.className = 'album-content';
  const photos = document.createElement('div'); photos.className = 'album-photos';
  const text = document.createElement('div'); text.className = 'album-copy';
  for (const e of page.elements) {
    const rendered = renderElement(e, options.resolveAsset, options.editable);
    if (e.type === 'photo') photos.append(rendered); else if (e.type === 'text') text.append(rendered);
  }
  if (photos.childElementCount) content.append(photos);
  if (text.childElementCount) content.append(text);
  if (!content.childElementCount && options.editable) { const hint = document.createElement('p'); hint.className = 'album-blank-hint'; hint.textContent = '一张空白纸，等你慢慢写。'; content.append(hint); }
  host.replaceChildren(texture, grid, watermarks(page, options.resolveAsset), content);
  for (const e of page.elements) if (e.type === 'sticker') host.append(renderElement(e, options.resolveAsset, options.editable));
  if (options.number) { const number = document.createElement('span'); number.className = 'album-page-number'; number.textContent = String(options.number).padStart(2, '0'); host.append(number); }
}
type PageStamp = { source: AlbumPage; id: string; editable: boolean; paper: string; grid: string; watermark: string; elements: Map<string, string> };
const pageStamps = new WeakMap<HTMLElement, PageStamp>();
/** Authoring reuses the same renderer, updating only changed layers / keyed elements. */
export function updateAlbumPage(host: HTMLElement, page: AlbumPage, options: PageRenderOptions) {
  const { opacity, ...pattern } = page.watermark;
  const stamp: PageStamp = { source: page, id: page.id, editable: !!options.editable, paper: JSON.stringify(page.paper), grid: JSON.stringify(page.grid), watermark: JSON.stringify([pattern, !!opacity]), elements: new Map(page.elements.map(e => [e.id, JSON.stringify(e)])) };
  const previous = pageStamps.get(host);
  if (!previous || previous.source !== page || previous.id !== page.id || previous.editable !== stamp.editable) {
    renderAlbumPage(host, page, options); pageStamps.set(host, stamp); return;
  }
  pageStyle(host, page);
  if (previous.paper !== stamp.paper) host.querySelector('.album-paper-texture')!.className = `album-paper-texture album-paper-${page.paper.kind}`;
  if (previous.grid !== stamp.grid) gridStyle(host.querySelector<HTMLElement>('.album-grid')!, page);
  const watermark = host.querySelector<HTMLElement>('.album-watermark')!;
  if (previous.watermark !== stamp.watermark) watermarks(page, options.resolveAsset, watermark);
  else if (watermark.style.opacity !== String(opacity)) watermark.style.opacity = String(opacity);
  const content = host.querySelector<HTMLElement>('.album-content')!;
  const sync = (parent: HTMLElement, elements: AlbumElement[], direct = false) => {
    const nodes = new Map(Array.from(parent.children).filter(e => e.classList.contains('album-element')).map(e => [(e as HTMLElement).dataset.element, e as HTMLElement]));
    const wanted = new Set(elements.map(e => e.id));
    for (const [key, node] of nodes) if (!wanted.has(key!)) node.remove();
    let cursor: Element | null = direct ? Array.from(parent.children).find(e => e.classList.contains('album-sticker') || e.classList.contains('album-page-number') || e.classList.contains('editor-page-guide')) ?? null : parent.firstElementChild;
    for (const element of elements) {
      let node = nodes.get(element.id);
      if (!node) node = renderElement(element, options.resolveAsset, options.editable);
      else if (previous.elements.get(element.id) !== stamp.elements.get(element.id)) updateElement(node, element, options.resolveAsset, !!options.editable);
      if (node !== cursor) parent.insertBefore(node, cursor);
      cursor = node.nextElementSibling;
    }
  };
  for (const [type, className] of [['photo', 'album-photos'], ['text', 'album-copy']] as const) {
    const elements = page.elements.filter(e => e.type === type);
    let group = content.querySelector<HTMLElement>(`.${className}`);
    if (elements.length) {
      content.querySelector('.album-blank-hint')?.remove();
      if (!group) { group = document.createElement('div'); group.className = className; if (type === 'photo') content.prepend(group); else content.append(group); }
      sync(group, elements);
    } else group?.remove();
  }
  if (!content.childElementCount && options.editable) { const hint = document.createElement('p'); hint.className = 'album-blank-hint'; hint.textContent = '一张空白纸，等你慢慢写。'; content.append(hint); }
  sync(host, page.elements.filter(e => e.type === 'sticker'), true);
  const number = host.querySelector<HTMLElement>('.album-page-number');
  if (number && options.number) { const text = String(options.number).padStart(2, '0'); if (number.textContent !== text) number.textContent = text; }
  pageStamps.set(host, stamp);
}
export async function waitForAlbumImages(scope: ParentNode) {
  const images = Array.from(scope.querySelectorAll('img'));
  await Promise.all(images.map(image => image.decode().catch(() => {})));
  await document.fonts.ready;
}
