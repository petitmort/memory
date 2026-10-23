type PagePair = [HTMLCanvasElement, HTMLCanvasElement];

const XHTML = 'http://www.w3.org/1999/xhtml';
let pseudoId = 0;

function copyStyle(source: CSSStyleDeclaration, target: CSSStyleDeclaration) {
  for (let i = 0; i < source.length; i++) {
    const property = source.item(i); target.setProperty(property, source.getPropertyValue(property));
  }
  target.setProperty('animation', 'none', 'important');
  target.setProperty('transition', 'none', 'important');
  target.setProperty('visibility', 'visible', 'important');
  target.removeProperty('will-change');
}

async function embeddedImage(source: HTMLImageElement, style: CSSStyleDeclaration) {
  const resolution = Math.min(devicePixelRatio || 1, 1.5);
  const width = parseFloat(style.width) || 0, height = parseFloat(style.height) || 0;
  if (!source.complete || !source.naturalWidth) await source.decode();
  if (!source.naturalWidth || !source.naturalHeight) throw new Error('The page photograph is not ready');
  // Keep enough pixels for the real CSS frame, including object-fit:cover,
  // without allocating and PNG-encoding a full-resolution camera photograph.
  const fittedScale = Math.max(width * resolution / source.naturalWidth, height * resolution / source.naturalHeight);
  const scale = Math.min(1, fittedScale > 0 ? fittedScale : 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.ceil(source.naturalHeight * scale));
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  // A non-CORS external photograph intentionally rejects, leaving the existing
  // procedural page available instead of supplying an unsafe WebGL texture.
  return canvas.toDataURL('image/png');
}

async function clonePageNode(source: Node, pseudoRules: string[]): Promise<Node> {
  if (!(source instanceof Element)) return source.cloneNode(false);
  const replacement = source instanceof HTMLCanvasElement || source instanceof HTMLImageElement;
  const clone = replacement ? document.createElementNS(XHTML, 'img') as HTMLImageElement : source.cloneNode(false) as HTMLElement;
  const computed = getComputedStyle(source);
  copyStyle(computed, clone.style);
  clone.removeAttribute('id');
  clone.removeAttribute('inert');
  if (source instanceof HTMLCanvasElement) {
    (clone as HTMLImageElement).src = source.toDataURL('image/png');
  } else if (source instanceof HTMLImageElement) {
    (clone as HTMLImageElement).src = await embeddedImage(source, computed);
    clone.removeAttribute('srcset');
    clone.removeAttribute('crossorigin');
    clone.removeAttribute('loading');
  } else {
    for (const child of Array.from(source.childNodes)) clone.appendChild(await clonePageNode(child, pseudoRules));
  }
  // Preserve the real tape and any other generated decoration without depending
  // on a stylesheet outside the self-contained SVG image.
  for (const pseudo of ['::before', '::after']) {
    const style = getComputedStyle(source, pseudo);
    if (!style.content || style.content === 'none' || style.content === 'normal' || style.display === 'none') continue;
    const key = `raster-pseudo-${pseudoId++}`;
    clone.classList.add(key);
    const declaration = document.createElement('span').style;
    copyStyle(style, declaration);
    pseudoRules.push(`.${key}${pseudo}{${declaration.cssText}}`);
  }
  return clone;
}

async function capturePage(page: HTMLElement): Promise<HTMLCanvasElement> {
  const computed = getComputedStyle(page);
  // Keep fractional CSS pixels so a responsive line never reflows at handoff.
  // Computed dimensions do not include an in-progress projective transform.
  const borderBox = computed.boxSizing === 'border-box';
  const extra = (names: string[]) => names.reduce((sum,name) => sum + (parseFloat(computed.getPropertyValue(name)) || 0),0);
  const width = parseFloat(computed.width) + (borderBox ? 0 : extra(['padding-left','padding-right','border-left-width','border-right-width']));
  const height = parseFloat(computed.height) + (borderBox ? 0 : extra(['padding-top','padding-bottom','border-top-width','border-bottom-width']));
  if (!width || !height || computed.display === 'none') throw new Error('The reading page must be laid out before capture');
  const rules: string[] = [];
  const clone = await clonePageNode(page, rules) as HTMLElement;
  Object.assign(clone.style, {
    position: 'relative', inset: 'auto', left: '0px', top: '0px', margin: '0px',
    width: `${width}px`, height: `${height}px`, minWidth: '0px', minHeight: '0px',
    maxWidth: 'none', maxHeight: 'none', boxSizing: 'border-box',
    transform: 'none', transformOrigin: '0 0', opacity: '1', visibility: 'visible',
    flex: 'none', overflow: 'hidden', boxShadow: 'none',
  });
  // The original viewport has a global border-box rule. Every descendant has
  // already received its computed box-sizing, so no external CSS is required.
  const wrapper = document.createElementNS(XHTML, 'div');
  wrapper.setAttribute('xmlns', XHTML);
  wrapper.style.cssText = `width:${width}px;height:${height}px;overflow:hidden;color-scheme:light;`;
  if (rules.length) {
    const style = document.createElementNS(XHTML, 'style'); style.textContent = rules.join('\n'); wrapper.appendChild(style);
  }
  wrapper.appendChild(clone);
  const markup = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject></svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const resolution = Math.min(devicePixelRatio || 1, 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * resolution); canvas.height = Math.ceil(height * resolution);
  const context = canvas.getContext('2d')!;
  context.fillStyle = computed.backgroundColor || '#eee7d5';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  // Fail here, rather than later inside renderer.texImage2D, if the browser
  // cannot safely rasterize one of the sources contained by this page.
  context.getImageData(0, 0, 1, 1);
  return canvas;
}

/** Capture the exact visible reader layout for both physical paper faces. */
export async function captureBookPages(reader: HTMLElement): Promise<PagePair> {
  const left = reader.querySelector<HTMLElement>('.page-left');
  const right = reader.querySelector<HTMLElement>('.page-right');
  if (!left || !right) throw new Error('Both reading pages are required');
  await document.fonts.ready;
  return await Promise.all([capturePage(left), capturePage(right)]) as PagePair;
}
