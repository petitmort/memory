import { readingBlend } from './reading-timeline';

type Point = { x: number; y: number };
type PageProjection = { corners: Point[] };
export type BookProjection = PageProjection & { pages?: [PageProjection, PageProjection] };

/** Map a DOM rectangle to the actual four projected corners of the paper. */
export function paperTransform(width: number, height: number, projection: BookProjection, left: number, top: number) {
  if (projection.corners.length !== 4 || width <= 0 || height <= 0) return null;
  const source = [[0, 0], [width, 0], [width, height], [0, height]];
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = source[i], u = projection.corners[i].x - left, v = projection.corners[i].y - top;
    if (!Number.isFinite(u + v)) return null;
    rows.push([x, y, 1, 0, 0, 0, -u*x, -u*y, u]);
    rows.push([0, 0, 0, x, y, 1, -v*x, -v*y, v]);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++)
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-9) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let n = column; n <= 8; n++) rows[column][n] /= divisor;
    for (let row = 0; row < 8; row++) if (row !== column) {
      const multiplier = rows[row][column];
      for (let n = column; n <= 8; n++) rows[row][n] -= multiplier * rows[column][n];
    }
  }
  const [a,b,c,d,e,f,g,h] = rows.map(row => row[8]);
  return `matrix3d(${[a,d,0,g,b,e,0,h,0,0,1,0,c,f,0,1].join(',')})`;
}

const cornersOf = (rect: DOMRect): Point[] => [
  {x:rect.left,y:rect.top}, {x:rect.right,y:rect.top},
  {x:rect.right,y:rect.bottom}, {x:rect.left,y:rect.bottom},
];

function projectedPages(projection: BookProjection): [PageProjection, PageProjection] {
  if (projection.pages) return projection.pages;
  const [a,b,c,d] = projection.corners;
  const middle = (u: Point, v: Point) => ({x:(u.x+v.x)/2,y:(u.y+v.y)/2});
  const top = middle(a,b), bottom = middle(d,c);
  return [{corners:[a,top,bottom,d]},{corners:[top,b,c,bottom]}];
}

const computedOpacity = (element: HTMLElement) => {
  const opacity = Number.parseFloat(getComputedStyle(element).opacity);
  return Number.isFinite(opacity) ? opacity : 1;
};

function correctionWeight(progress: number, start: number, end: number) {
  if (end <= start || progress >= end) return 0;
  const t = Math.max(0,Math.min(1,(progress-start)/(end-start)));
  return 1-t*t*(3-2*t);
}

// Closing corrections must disappear with their layer, even if the scene clock
// still has the rest of the cover movement to play.
function closingLayerEnd(layer: 'paper' | 'shade') {
  let start = 0, end = 1;
  for (let i = 0; i < 32; i++) {
    const middle = (start+end)/2;
    if (readingBlend(middle,false)[layer] > 0) start = middle;
    else end = middle;
  }
  return end;
}

/** Follow the physical paper on the camera's clock, then settle into the reading layout. */
export function createReaderJourney(reader: HTMLElement, opening: boolean) {
  const book = reader.querySelector<HTMLElement>('.book')!;
  const pages = Array.from(book.querySelectorAll<HTMLElement>(':scope > .page'));
  const controls = Array.from(reader.querySelectorAll<HTMLElement>('.reader-top,.reader-bottom,.page-nav'));
  const readerStyle = reader.style.cssText;
  const bookStyle = book.style.cssText;
  const pageStyles = pages.map(page => page.style.cssText);
  const controlStyles = controls.map(control => control.style.cssText);
  const scrollTop = book.scrollTop;
  let finalShade = '', finalBlur = '', blur = 0;
  let channels: number[] = [];
  let rects: DOMRect[] = [], targets: Point[][] = [], clips: number[][] = [];
  let controlOpacities: number[] = [];
  let viewportWidth = innerWidth, viewportHeight = innerHeight;
  const backing = document.createElement('div');
  backing.className = 'reading-backing';
  backing.setAttribute('aria-hidden','true');

  function measureLayout() {
    // Measure the responsive layout synchronously, before the browser can paint
    // it. The same frame then restores tracking at the previously shown quad.
    backing.remove();
    reader.classList.remove('is-tracking');
    reader.style.cssText = readerStyle;
    book.style.cssText = bookStyle;
    pages.forEach((page,index) => { page.style.cssText = pageStyles[index]; });
    controls.forEach((control,index) => { control.style.cssText = controlStyles[index]; });
    book.scrollTop = scrollTop;
    const readerComputed = getComputedStyle(reader);
    finalShade = readerComputed.backgroundColor;
    finalBlur = readerComputed.backdropFilter;
    channels = finalShade.match(/[\d.]+/g)?.map(Number) ?? [25,56,49,.64];
    if (channels.length === 3) channels.push(1);
    blur = Number(finalBlur.match(/[\d.]+/)?.[0] ?? 0);
    const bookRect = book.getBoundingClientRect();
    const clipRight = bookRect.left + book.clientWidth;
    const clipBottom = bookRect.top + book.clientHeight;
    rects = pages.map(page => page.getBoundingClientRect());
    targets = rects.map(cornersOf);
    clips = rects.map(rect => [
      Math.min(rect.height,Math.max(0,bookRect.top-rect.top)),
      Math.min(rect.width,Math.max(0,rect.right-clipRight)),
      Math.min(rect.height,Math.max(0,rect.bottom-clipBottom)),
      Math.min(rect.width,Math.max(0,bookRect.left-rect.left)),
    ]);
    controlOpacities = controls.map(computedOpacity);
    const computedBook = getComputedStyle(book);
    backing.style.cssText = `position:absolute;inset:0;pointer-events:none;border-radius:${computedBook.borderRadius};background:${computedBook.backgroundColor};box-shadow:${computedBook.boxShadow};`;
    reader.classList.add('is-tracking');
    Object.assign(book.style, {
      width:`${bookRect.width}px`,height:`${bookRect.height}px`,
      minHeight:'0',maxHeight:'none',display:'block',overflow:'visible',
    });
    book.scrollTop = 0;
    book.prepend(backing);
    pages.forEach((page,index) => {
      const rect = rects[index];
      Object.assign(page.style, {
        position:'absolute',left:`${rect.left-bookRect.left}px`,top:`${rect.top-bookRect.top}px`,
        width:`${rect.width}px`,height:`${rect.height}px`,boxSizing:'border-box',
        minHeight:'0',transformOrigin:'0 0',willChange:'transform,opacity',zIndex:'1',
      });
    });
    viewportWidth = innerWidth;
    viewportHeight = innerHeight;
  }

  measureLayout();
  const paperEnd = opening ? 1 : closingLayerEnd('paper');
  const shadeEnd = opening ? 1 : closingLayerEnd('shade');
  let lastCorners: Point[][] | undefined, lastClipFractions: number[][] | undefined;
  let lastShade: number[] | undefined, lastBlur = 0;
  let paperCorrection: {start: number; corners: Point[][]; clips: number[][]} | undefined;
  let shadeCorrection: {start: number; channels: number[]; blur: number} | undefined;
  let finished = false;
  return {
    update(frame: {progress: number; projection: BookProjection}) {
      if (finished) return;
      const p = Math.max(0,Math.min(1,frame.progress));
      const blend = readingBlend(p,opening);
      const physical = projectedPages(frame.projection);
      const resized = viewportWidth !== innerWidth || viewportHeight !== innerHeight;
      if (resized) measureLayout();
      const baseCorners = pages.map((_,index) => physical[index].corners.map((point,corner) => ({
        x:point.x+(targets[index][corner].x-point.x)*blend.layout,
        y:point.y+(targets[index][corner].y-point.y)*blend.layout,
      })));
      const baseClips = clips.map(edges => edges.map(value => value*blend.clip));
      const baseShade = [channels[0],channels[1],channels[2],channels[3]*blend.shade];
      const baseBlur = blur*blend.shade;
      if (resized) {
        paperCorrection = lastCorners && lastClipFractions && p < paperEnd ? {
          start:p,
          corners:baseCorners.map((corners,index) => corners.map((point,corner) => ({
            x:lastCorners![index][corner].x-point.x,
            y:lastCorners![index][corner].y-point.y,
          }))),
          clips:baseClips.map((edges,index) => edges.map((value,edge) =>
            lastClipFractions![index][edge]*(edge%2 ? rects[index].width : rects[index].height)-value)),
        } : undefined;
        shadeCorrection = lastShade && p < shadeEnd ? {
          start:p,channels:baseShade.map((value,index) => lastShade![index]-value),blur:lastBlur-baseBlur,
        } : undefined;
      }
      const paperWeight = paperCorrection ? correctionWeight(p,paperCorrection.start,paperEnd) : 0;
      const shadeWeight = shadeCorrection ? correctionWeight(p,shadeCorrection.start,shadeEnd) : 0;
      const shade = baseShade.map((value,index) => value+(shadeCorrection?.channels[index] ?? 0)*shadeWeight);
      const currentBlur = Math.max(0,baseBlur+(shadeCorrection?.blur ?? 0)*shadeWeight);
      reader.style.backgroundColor = blend.shade === 1 && shadeWeight === 0 ? finalShade : `rgba(${shade[0]},${shade[1]},${shade[2]},${Math.max(0,Math.min(1,shade[3]))})`;
      reader.style.backdropFilter = blend.shade === 1 && shadeWeight === 0 ? finalBlur : `blur(${currentBlur}px)`;
      reader.style.setProperty('--reading-layout',String(blend.layout));
      backing.style.opacity = String(blend.layout);
      const shownCorners: Point[][] = [], shownClipFractions: number[][] = [];
      pages.forEach((page,index) => {
        const rect = rects[index];
        const corners = baseCorners[index].map((point,corner) => ({
          x:point.x+(paperCorrection?.corners[index][corner].x ?? 0)*paperWeight,
          y:point.y+(paperCorrection?.corners[index][corner].y ?? 0)*paperWeight,
        }));
        const edges = baseClips[index].map((value,edge) => Math.max(0,Math.min(
          edge%2 ? rect.width : rect.height,value+(paperCorrection?.clips[index][edge] ?? 0)*paperWeight)));
        page.style.transform = paperTransform(rect.width,rect.height,{corners},rect.left,rect.top) ?? 'none';
        page.style.opacity = String(blend.paper);
        page.style.clipPath = `inset(${edges.map(value => `${value}px`).join(' ')})`;
        shownCorners.push(corners);
        shownClipFractions.push(edges.map((value,edge) => value/(edge%2 ? rect.width : rect.height)));
      });
      controls.forEach((control,index) => { control.style.opacity = String(controlOpacities[index]*blend.controls); });
      lastCorners = shownCorners;
      lastClipFractions = shownClipFractions;
      lastShade = shade;
      lastBlur = currentBlur;
    },
    finish() {
      if (finished) return;
      finished = true;
      if (!opening) reader.classList.add('hidden');
      backing.remove();
      reader.classList.remove('is-tracking');
      reader.style.cssText = readerStyle;
      book.style.cssText = bookStyle;
      pages.forEach((page,index) => { page.style.cssText = pageStyles[index]; });
      controls.forEach((control,index) => { control.style.cssText = controlStyles[index]; });
      book.scrollTop = scrollTop;
    },
  };
}

/** The DOM-only fallback has no camera; use the same responsive shade at both ends. */
export async function transitionReader(reader: HTMLElement, _projection: BookProjection | undefined, opening: boolean, reducedMotion: boolean) {
  const wrap = reader.querySelector<HTMLElement>('.book-wrap')!;
  const computed = getComputedStyle(reader);
  const finalShade = computed.backgroundColor, finalBlur = computed.backdropFilter;
  const duration = reducedMotion ? 100 : 500;
  const controls = Array.from(reader.querySelectorAll<HTMLElement>('.reader-top,.reader-bottom,.page-nav'));
  const animations: Animation[] = [];
  reader.classList.add('is-transitioning');
  animations.push(wrap.animate([{opacity:opening?0:1},{opacity:opening?1:0}],{duration,fill:'both'}));
  animations.push(reader.animate([
    { backgroundColor: opening ? 'rgba(25,56,49,0)' : finalShade, backdropFilter: opening ? 'blur(0px)' : finalBlur },
    { backgroundColor: opening ? finalShade : 'rgba(25,56,49,0)', backdropFilter: opening ? finalBlur : 'blur(0px)' },
  ], { duration, easing:'ease-in-out', fill:'both' }));
  for (const control of controls) {
    const opacity = computedOpacity(control);
    animations.push(control.animate(
      [{opacity:opening?0:opacity},{opacity:opening?opacity:0}],{duration,fill:'both'}));
  }
  try {
    await Promise.all(animations.map(animation => animation.finished));
  } finally {
    if (!opening) reader.classList.add('hidden');
    reader.classList.remove('is-transitioning');
    for (const animation of animations) animation.cancel();
  }
}
