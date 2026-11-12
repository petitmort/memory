import './page.css';
import type { AlbumPage, AlbumElement, Motif, PhotoElement } from './document';

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
function watermarks(page: AlbumPage, resolve: AssetResolver) {
  const w = page.watermark, layer = document.createElement('div'); layer.className = 'album-watermark'; layer.setAttribute('aria-hidden', 'true');
  layer.style.opacity = String(w.opacity);
  if (!w.opacity) return layer;
  const positions: [number, number][] = [];
  if (w.mode === 'single') positions.push([w.x, w.y]);
  if (w.mode === 'corner') positions.push([10, 9], [90, 91]);
  if (w.mode === 'border') for (let i = 0; i <= w.density * 2; i++) { const a = 8 + 84 * i / (w.density * 2); positions.push([a, 6], [a, 94]); if (i > 0 && i < w.density * 2) positions.push([6, a], [94, a]); }
  if (w.mode === 'repeat') for (let y = 0; y < w.density * 2; y++) for (let x = 0; x < w.density; x++) positions.push([(x + .5 + (y % 2 ? .25 : 0)) * 100 / w.density, (y + .5) * 100 / (w.density * 2)]);
  for (const [x, y] of positions) {
    const tile = document.createElement('div'); tile.className = 'album-watermark-tile';
    Object.assign(tile.style, { width: `${w.size}px`, height: `${w.size}px`, left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) rotate(${w.rotation}deg)` });
    const src = w.assetId && resolve(w.assetId);
    if (src) { const img = new Image(); img.src = src; img.alt = ''; tile.append(img); } else tile.append(motifSvg(w.motif, w.color));
    layer.append(tile);
  }
  return layer;
}
function photoContent(photo: PhotoElement, resolve: AssetResolver) {
  const figure = document.createElement('figure'); figure.className = `album-photo album-frame-${photo.frame}`;
  figure.style.setProperty('--frame-color', photo.color); figure.style.setProperty('--frame-width', `${photo.border}px`); figure.style.setProperty('--frame-shadow', `0 4px 12px rgb(48 35 20 / ${photo.shadow})`);
  const view = document.createElement('div'); view.className = 'album-photo-view';
  const src = photo.assetId && resolve(photo.assetId);
  if (src) {
    const img = new Image(); img.src = src; img.alt = photo.alt || photo.caption || '纪念册照片'; img.decoding = 'async';
    img.style.objectPosition = `${photo.crop.x}% ${photo.crop.y}%`;
    const a = photo.crop.rotation * Math.PI / 180;
    const scale = photo.crop.zoom * (Math.abs(Math.cos(a)) + 4 / 3 * Math.abs(Math.sin(a)));
    img.style.transform = `translate(${(50 - photo.crop.x) * (photo.crop.zoom - 1) / photo.crop.zoom}%,${(50 - photo.crop.y) * (photo.crop.zoom - 1) / photo.crop.zoom}%) rotate(${photo.crop.rotation}deg) scale(${scale})`;
    img.onerror = () => { img.hidden = true; view.dataset.missing = '照片未能加载，请检查素材'; };
    view.append(img);
  } else { view.classList.add('album-photo-empty'); view.textContent = '＋ 选择照片'; }
  const caption = document.createElement('figcaption'); caption.textContent = photo.caption;
  figure.append(view, caption); return figure;
}
export function renderElement(element: AlbumElement, resolve: AssetResolver, editable = false) {
  const host = document.createElement('div'); host.className = `album-element album-${element.type}`; host.dataset.element = element.id;
  if (element.type === 'text') {
    host.classList.add(`album-text-${element.role}`); host.dataset.font = element.font;
    Object.assign(host.style, { fontFamily: FONT[element.font], fontSize: `${element.size}px`, fontWeight: String(element.weight), color: element.color, lineHeight: String(element.lineHeight), letterSpacing: `${element.letterSpacing}px`, textAlign: element.align });
    const text = document.createElement(element.role === 'title' ? 'h2' : 'p'); text.textContent = element.text;
    if (editable) { text.contentEditable = 'plaintext-only'; text.dataset.text = element.id; text.dataset.placeholder = element.role === 'title' ? '点击写下标题' : '点击写下你的回忆…'; text.setAttribute('aria-label', element.role === 'title' ? '页面标题' : '页面正文'); text.setAttribute('role', 'textbox'); text.setAttribute('aria-multiline', 'true'); text.spellcheck = false; }
    host.append(text);
  } else if (element.type === 'photo') host.append(photoContent(element, resolve));
  else {
    Object.assign(host.style, { left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, transform: `translate(-50%,-50%) rotate(${element.rotation}deg)`, opacity: String(element.opacity) });
    host.dataset.locked = String(element.locked); host.setAttribute('aria-hidden', 'true');
    const src = element.assetId && resolve(element.assetId);
    if (src) { const img = new Image(); img.src = src; img.alt = ''; host.append(img); } else host.append(motifSvg(element.motif, element.color));
  }
  return host;
}
/** One renderer for authoring, reader pages, leaf faces and paper capture. */
export function renderAlbumPage(host: HTMLElement, page: AlbumPage, options: PageRenderOptions) {
  host.classList.add('album-page'); host.dataset.albumPage = page.id; host.dataset.template = page.layout.template; host.dataset.paper = page.paper.kind;
  const vars: Record<string, string> = { '--paper-tint': page.paper.tint, '--paper-texture': String(page.paper.texture), '--page-margin': `${page.layout.margin}px`, '--content-columns': String(page.layout.columns), '--content-gap': `${page.layout.gap}px` };
  for (const [key, value] of Object.entries(vars)) host.style.setProperty(key, value);
  const texture = document.createElement('div'); texture.className = `album-paper-texture album-paper-${page.paper.kind}`; texture.setAttribute('aria-hidden', 'true');
  const grid = document.createElement('div'); grid.className = `album-grid album-grid-${page.grid.kind}`; grid.setAttribute('aria-hidden', 'true');
  Object.assign(grid.style, { opacity: String(page.grid.opacity), backgroundSize: `${page.grid.spacing}px ${page.grid.spacing}px`, backgroundPosition: `${page.grid.offset}px ${page.grid.offset}px` });
  grid.style.setProperty('--grid-color', page.grid.color); grid.style.setProperty('--grid-weight', `${page.grid.weight}px`);
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
export async function waitForAlbumImages(scope: ParentNode) {
  const images = Array.from(scope.querySelectorAll('img'));
  await Promise.all(images.map(image => image.decode().catch(() => {})));
  await document.fonts.ready;
}
