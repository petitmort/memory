import { test, expect } from '@playwright/test';

test('paper aligns with projected corners and the closed album retains its real dimensions', async ({ page }) => {
  await page.route('**/__paper_projection', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>',
  }));
  await page.goto('/__paper_projection');
  const result = await page.evaluate(async () => {
    const path = '/src/reader-transition.ts';
    const { paperTransform } = await import(path);
    const albumPath = '/src/album-model.ts', threePath = '/node_modules/.vite/deps/three.js';
    const [{ createAlbum }, THREE] = await Promise.all([import(albumPath), import(threePath)]);
    const album = createAlbum();
    const closedSize = new THREE.Box3().setFromObject(album.group, true).getSize(new THREE.Vector3()).toArray();
    album.setOpening(1, 1);
    album.group.updateMatrixWorld(true);
    const cover = album.hinge.children.find(child => child.geometry?.type === 'BoxGeometry');
    const coverBounds = new THREE.Box3().setFromObject(cover, true);
    const worldPoints = object => {
      const vertices = object.geometry.getAttribute('position');
      return Array.from({ length: vertices.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(object.matrixWorld));
    };
    const pageEdges = object => {
      const points = worldPoints(object);
      const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
      const average = edge => {
        const samples = points.filter(point => Math.abs(point.x - edge) < .00001);
        return { x: edge, y: samples.reduce((sum, point) => sum + point.y, 0) / samples.length };
      };
      return { outer: average(minX), inner: average(maxX) };
    };
    const leftFace = album.group.getObjectByName('album-left-page');
    const leftPage = pageEdges(leftFace);
    const settledLeaf = pageEdges(album.leaf);
    const leftPoints = worldPoints(leftFace);
    const leftPlane = new THREE.Plane().setFromCoplanarPoints(leftPoints[0], leftPoints[1], leftPoints.at(-1));
    if (leftPlane.normal.y < 0) leftPlane.negate();
    const settledDistances = worldPoints(album.leaf).map(point => leftPlane.distanceToPoint(point));
    const leftDeviations = leftPoints.map(point => Math.abs(leftPlane.distanceToPoint(point)));
    const open = { coverBottom: coverBounds.min.y, coverTop: coverBounds.max.y, leftPage, settledLeaf, settledDistances, leftDeviations };
    // Reverse an actual partial turn before returning to the closed state.
    album.setOpening(.65, .3);
    album.setOpening(0, 0);
    const reclosedSize = new THREE.Box3().setFromObject(album.group, true).getSize(new THREE.Vector3()).toArray();
    const corners = [{ x: 310, y: 180 }, { x: 810, y: 205 }, { x: 858, y: 545 }, { x: 276, y: 573 }];
    const width = 920, height = 560, left = 64, top = 80;
    const paper = document.createElement('div');
    Object.assign(paper.style, {
      position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
      transformOrigin: '0 0', transform: paperTransform(width, height, { corners }, left, top),
    });
    document.body.append(paper);
    const actual = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => {
      const marker = document.createElement('span');
      Object.assign(marker.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: '0', height: '0' });
      paper.append(marker);
      const rect = marker.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    });
    const degenerate = paperTransform(width, height, { corners: Array(4).fill({ x: 4, y: 7 }) }, left, top);
    return { corners, actual, degenerate, closedSize, open, reclosedSize };
  });
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(result.actual[i].x - result.corners[i].x)).toBeLessThan(1);
    expect(Math.abs(result.actual[i].y - result.corners[i].y)).toBeLessThan(1);
  }
  expect(result.degenerate).toBeNull();
  [.32, .0351, .26].forEach((size, axis) => {
    expect(result.closedSize[axis]).toBeCloseTo(size, 4);
    expect(result.reclosedSize[axis]).toBeCloseTo(size, 4);
  });
  expect(result.open.coverBottom).toBeCloseTo(0, 5);
  const { coverTop, leftPage, settledLeaf } = result.open;
  expect(leftPage.outer.y - coverTop).toBeGreaterThanOrEqual(0);
  expect(leftPage.outer.y - coverTop).toBeLessThan(.001);
  expect(leftPage.inner.y - leftPage.outer.y).toBeGreaterThan(.02);
  expect(Math.max(...result.open.leftDeviations)).toBeLessThan(.000001);
  // The whole settled leaf must rest above the same physical plane. Matching
  // only its outer edges can hide a curved middle that jumps when removed.
  for (const distance of result.open.settledDistances) {
    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThan(.001);
  }
  for (const edge of ['outer', 'inner'] as const) {
    expect(settledLeaf[edge].x).toBeCloseTo(leftPage[edge].x, 4);
    expect(settledLeaf[edge].y - leftPage[edge].y).toBeGreaterThan(0);
    expect(settledLeaf[edge].y - leftPage[edge].y).toBeLessThan(.001);
  }
});

test('the same untainted DOM page rasters become both physical paper textures', async ({ page }) => {
  // Exercise page capture without creating a renderer or entering the 3D scene.
  await page.route('**/__page_raster', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/style.css"></head><body>
      <section class="reader" id="reader"><div class="book-wrap"><div class="book">
        <article class="page page-left"><span class="page-kicker">01 · 海边</span><div class="print"><canvas width="160" height="100"></canvas></div><p class="photo-caption">风经过的地方</p><span class="page-number">01</span></article>
        <article class="page page-right"><span class="page-kicker">THE THINGS WE KEEP</span><div class="story"><h2>把时光留在这里</h2><p class="poem">The sea remembers.\nWe keep the light.</p><img width="32" height="32" src="/__page_photo.svg"><p class="story-note">不同的文字和照片，共用实际页面的布局。</p></div><span class="page-number">02</span></article>
      </div></div></section></body></html>`,
  }));
  await page.route('**/__page_photo.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#d52c81" d="M0 0h32v32H0z"/></svg>',
  }));
  await page.goto('/__page_raster');
  const result = await page.evaluate(async () => {
    const rasterPath = '/src/page-raster.ts', albumPath = '/src/album-model.ts';
    const [{ captureBookPages }, { createAlbum }] = await Promise.all([import(rasterPath), import(albumPath)]);
    const reader = document.getElementById('reader')!;
    const artwork = reader.querySelector('canvas')!;
    const brush = artwork.getContext('2d')!;
    brush.fillStyle = '#1267b4'; brush.fillRect(0, 0, 160, 100);
    brush.fillStyle = '#e7bf51'; brush.fillRect(40, 25, 80, 50);
    // Capture must use layout dimensions and visible ink even when the live
    // pages already have a transition transform or have not faded in yet.
    for (const element of reader.querySelectorAll<HTMLElement>('.page')) {
      element.style.opacity = '0'; element.style.transform = 'scale(.2)';
    }
    const pages = await captureBookPages(reader);
    const album = createAlbum();
    album.setPageCanvases(pages);
    const faces = ['album-left-page', 'album-right-page'].map(name => album.group.getObjectByName(name).material.map.image);
    const describe = (canvas: HTMLCanvasElement) => {
      const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let blue = 0, magenta = 0, ink = 0, opaque = 0;
      for (let i = 0; i < bytes.length; i += 4) {
        if (bytes[i + 3] > 250) opaque++;
        if (bytes[i] < 60 && bytes[i + 1] > 50 && bytes[i + 1] < 150 && bytes[i + 2] > 140) blue++;
        if (bytes[i] > 160 && bytes[i + 1] < 90 && bytes[i + 2] > 90) magenta++;
        if (bytes[i] < 155 && bytes[i + 1] < 155 && bytes[i + 2] < 155 && bytes[i + 3] > 200) ink++;
      }
      return { width: canvas.width, height: canvas.height, blue, magenta, ink, opaque, url: canvas.toDataURL() };
    };
    return { pages: pages.map(describe), identical: pages.map((canvas, i) => canvas.toDataURL() === faces[i].toDataURL()) };
  });
  expect(result.identical).toEqual([true, true]);
  expect(result.pages[0].blue).toBeGreaterThan(1000);
  expect(result.pages[1].magenta).toBeGreaterThan(300);
  for (const canvas of result.pages) {
    expect(canvas.width).toBeGreaterThan(100);
    expect(canvas.height).toBeGreaterThan(100);
    expect(canvas.ink).toBeGreaterThan(100);
    expect(canvas.opaque).toBeGreaterThan(canvas.width * canvas.height * .9);
    expect(canvas.url).toMatch(/^data:image\/png;base64,/);
  }
});

test('desktop and mobile pages track a moving projection continuously through cleanup', async ({ page }) => {
  await page.route('**/__reader_journey', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/style.css"></head><body>
      <section class="reader" id="reader"><div class="reader-top"><span>THE THINGS WE KEEP</span><button>回到房间</button></div><div class="book-wrap"><div class="book">
        <article class="page page-left"><span class="page-kicker">01 · 海边</span><div class="print" style="height:200px;background:#acd0c7"></div><p class="photo-caption">风经过的地方</p></article>
        <article class="page page-right"><span class="page-kicker">THE THINGS WE KEEP</span><div class="story"><h2>把时光留在这里</h2><p class="poem">The sea remembers.\nWe keep the light.</p></div></article>
      </div><button class="page-nav prev" disabled>←</button><button class="page-nav next">→</button></div><div class="reader-bottom"><span>01 / 04</span></div></section>
    </body></html>`,
  }));
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/__reader_journey');
    const resultPromise = page.evaluate(async () => {
      const path = '/src/reader-transition.ts';
      const { createReaderJourney } = await import(path);
      const reader = document.getElementById('reader')!;
      const pages = Array.from(reader.querySelectorAll<HTMLElement>('.page'));
      const paintProbes = pages.map(page => {
        const probe = document.createElement('span');
        Object.assign(probe.style, {
          position: 'absolute', left: 'calc(50% - 6px)', top: 'calc(50% - 6px)',
          width: '12px', height: '12px', background: '#ff00ff', zIndex: '100',
        });
        page.appendChild(probe); return probe;
      });
      const markers = pages.map(page => {
        const { width, height } = page.getBoundingClientRect();
        return [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => {
        const marker = document.createElement('span');
        Object.assign(marker.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: '0', height: '0' });
        page.appendChild(marker); return marker;
      }); });
      const corners = () => markers.map(page => page.map(marker => {
        const box = marker.getBoundingClientRect(); return { x: box.left, y: box.top };
      }));
      const style = () => ({
        background: getComputedStyle(reader).backgroundColor,
        blur: getComputedStyle(reader).backdropFilter,
        previousOpacity: getComputedStyle(reader.querySelector('.prev')!).opacity,
        nextOpacity: getComputedStyle(reader.querySelector('.next')!).opacity,
      });
      const settled = { corners: corners(), style: style() };
      const width = innerWidth > 600 ? 180 : 95, x = innerWidth / 2 - width, y = innerHeight * .45;
      const projection = (progress: number, extraX = 0) => {
        const dx = progress * 16 + extraX, dy = -progress * 20;
        const point = (px: number, py: number) => ({ x: x + px + dx, y: y + py + dy });
        const left = { corners: [point(0, 8), point(width, 0), point(width, 110), point(-6, 96)] };
        const right = { corners: [point(width, 0), point(width * 2, 8), point(width * 2 + 6, 96), point(width, 110)] };
        return { corners: [left.corners[0], right.corners[1], right.corners[2], left.corners[3]], pages: [left, right] };
      };
      const journey = createReaderJourney(reader, true);
      journey.update({ progress: 0, projection: projection(0) });
      const initial = corners();
      const samples = [initial];
      for (let step = 1; step <= 200; step++) {
        const progress = step / 200;
        journey.update({ progress, projection: projection(progress) });
        samples.push(corners());
        if (step === 150) {
          // A correct DOM bounding box alone does not prove that Chromium's
          // compositor painted this nested projective transform in that place.
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          (window as any).__paperPaintProbe = paintProbes.map(probe => {
            const rect = probe.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          });
          await new Promise<void>(resolve => { (window as any).__resumePaperPaint = resolve; });
        }
      }
      const end = { corners: corners(), style: style() };
      const activeAnimations = reader.getAnimations({ subtree: true }).length;
      journey.finish();
      const cleaned = { corners: corners(), style: style() };
      // Retargeting the same global progress must immediately follow this
      // frame's new camera projection instead of an earlier cached quad.
      const rejoin = createReaderJourney(reader, false);
      rejoin.update({ progress: .2, projection: projection(.2) });
      const beforeRetarget = corners();
      rejoin.update({ progress: .2, projection: projection(.2, 8) });
      const afterRetarget = corners();
      rejoin.update({ progress: 1, projection: projection(1) });
      rejoin.finish();
      let maxStep = 0;
      for (let i = 1; i < samples.length; i++) for (let side = 0; side < 2; side++) for (let corner = 0; corner < 4; corner++) {
        const a = samples[i - 1][side][corner], b = samples[i][side][corner];
        maxStep = Math.max(maxStep, Math.hypot(b.x - a.x, b.y - a.y));
      }
      return { settled, initial, source: projection(0).pages, end, cleaned, maxStep, activeAnimations, beforeRetarget, afterRetarget, hidden: reader.classList.contains('hidden') };
    });
    const paintPromise = (async () => {
      await page.waitForFunction(() => (window as any).__paperPaintProbe?.length === 2);
      try {
        const screenshot = await page.screenshot({ path: `test-results/paper-paint-${viewport.width}.png` });
        return await page.evaluate(async encoded => {
          const image = new Image(); image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const scaleX = canvas.width / innerWidth, scaleY = canvas.height / innerHeight;
          return (window as any).__paperPaintProbe.map((point: { x: number; y: number }) => {
            const x = Math.round(point.x * scaleX), y = Math.round(point.y * scaleY);
            const pixels = context.getImageData(x - 3, y - 3, 7, 7).data;
            let magenta = 0;
            for (let index = 0; index < pixels.length; index += 4) {
              if (pixels[index] > 220 && pixels[index + 1] < 60 && pixels[index + 2] > 220 && pixels[index + 3] > 240) magenta++;
            }
            return magenta;
          }) as number[];
        }, screenshot.toString('base64'));
      } finally {
        await page.evaluate(() => (window as any).__resumePaperPaint());
      }
    })();
    const [result, paintedPixels] = await Promise.all([resultPromise, paintPromise]);
    expect(paintedPixels).toHaveLength(2);
    paintedPixels.forEach((count, side) => {
      expect(count, `${viewport.width}px page ${side + 1} should paint at its measured center`).toBeGreaterThan(0);
    });
    expect(result.activeAnimations).toBe(0);
    expect(result.maxStep).toBeGreaterThan(1);
    expect(result.maxStep).toBeLessThan(40);
    for (let side = 0; side < 2; side++) for (let corner = 0; corner < 4; corner++) {
      for (const axis of ['x', 'y'] as const) {
        expect(result.initial[side][corner][axis]).toBeCloseTo(result.source[side].corners[corner][axis], 1);
        expect(result.end.corners[side][corner][axis]).toBeCloseTo(result.settled.corners[side][corner][axis], 1);
        expect(result.cleaned.corners[side][corner][axis]).toBeCloseTo(result.end.corners[side][corner][axis], 1);
      }
      expect(result.afterRetarget[side][corner].x - result.beforeRetarget[side][corner].x).toBeGreaterThan(.1);
    }
    expect(result.end.style).toEqual(result.settled.style);
    expect(result.cleaned.style).toEqual(result.end.style);
    expect(result.cleaned.style.previousOpacity).toBe('0.2');
    expect(result.cleaned.style.nextOpacity).toBe('1');
    expect(result.hidden).toBe(true);
    if (viewport.width < 600) {
      expect(result.cleaned.corners[1][0].y).toBeGreaterThan(result.cleaned.corners[0][3].y - 1);
      expect(result.cleaned.corners[1][0].x).toBeCloseTo(result.cleaned.corners[0][0].x, 1);
    }

    // Change the real viewport during this journey, including a media-query
    // boundary. A synthetic resize event at one size cannot exercise reflow.
    await page.goto('/__reader_journey');
    const beforeResize = await page.evaluate(async () => {
      const path = '/src/reader-transition.ts';
      const { createReaderJourney } = await import(path);
      const reader = document.getElementById('reader')!;
      const pages = Array.from(reader.querySelectorAll<HTMLElement>('.page'));
      const markers = pages.map(page => Array.from({ length: 4 }, () => {
        const marker = document.createElement('span');
        Object.assign(marker.style, { position: 'absolute', width: '0', height: '0' });
        page.appendChild(marker); return marker;
      }));
      const corners = () => markers.map((pageMarkers, side) => {
        const computed = getComputedStyle(pages[side]);
        const width = parseFloat(computed.width), height = parseFloat(computed.height);
        return [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y], corner) => {
          const marker = pageMarkers[corner];
          marker.style.left = `${x}px`; marker.style.top = `${y}px`;
          const rect = marker.getBoundingClientRect(); return { x: rect.left, y: rect.top };
        });
      });
      const snapshot = () => ({
        corners: corners(),
        style: {
          background: getComputedStyle(reader).backgroundColor,
          blur: getComputedStyle(reader).backdropFilter,
          previousOpacity: getComputedStyle(reader.querySelector('.prev')!).opacity,
        },
      });
      const projection = (progress: number) => {
        const width = innerWidth > 600 ? 180 : 95, x = innerWidth / 2 - width, y = innerHeight * .45;
        const point = (px: number, py: number) => ({ x: x + px + progress * 16, y: y + py - progress * 20 });
        const left = { corners: [point(0, 8), point(width, 0), point(width, 110), point(-6, 96)] };
        const right = { corners: [point(width, 0), point(width * 2, 8), point(width * 2 + 6, 96), point(width, 110)] };
        return { corners: [left.corners[0], right.corners[1], right.corners[2], left.corners[3]], pages: [left, right] };
      };
      const journey = createReaderJourney(reader, true);
      journey.update({ progress: .82, projection: projection(.82) });
      (window as any).__readerResize = { journey, projection, snapshot };
      return snapshot();
    });
    const resizedViewport = viewport.width > 600 ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    await page.setViewportSize(resizedViewport);
    const resized = await page.evaluate(() => {
      const { journey, projection, snapshot } = (window as any).__readerResize;
      journey.update({ progress: .82, projection: projection(.82) });
      const first = snapshot();
      const samples = [first];
      for (let step = 165; step <= 200; step++) {
        const progress = step / 200;
        journey.update({ progress, projection: projection(progress) });
        samples.push(snapshot());
      }
      const end = snapshot();
      journey.finish();
      const cleaned = snapshot();
      let maxStep = 0;
      for (let i = 1; i < samples.length; i++) for (let side = 0; side < 2; side++) for (let corner = 0; corner < 4; corner++) {
        const a = samples[i - 1].corners[side][corner], b = samples[i].corners[side][corner];
        maxStep = Math.max(maxStep, Math.hypot(b.x - a.x, b.y - a.y));
      }
      return { first, end, cleaned, maxStep, width: innerWidth };
    });
    expect(resized.width).toBe(resizedViewport.width);
    for (let side = 0; side < 2; side++) for (let corner = 0; corner < 4; corner++) for (const axis of ['x', 'y'] as const) {
      expect(resized.first.corners[side][corner][axis]).toBeCloseTo(beforeResize.corners[side][corner][axis], 0);
      expect(resized.end.corners[side][corner][axis]).toBeCloseTo(resized.cleaned.corners[side][corner][axis], 1);
    }
    expect(resized.maxStep).toBeLessThan(80);
    expect(resized.end.style).toEqual(resized.cleaned.style);
    expect(resized.cleaned.style.previousOpacity).toBe('0.2');
    if (resizedViewport.width < 600) {
      expect(resized.cleaned.corners[1][0].y).toBeGreaterThan(resized.cleaned.corners[0][3].y - 1);
      expect(resized.cleaned.corners[1][0].x).toBeCloseTo(resized.cleaned.corners[0][0].x, 1);
    }
  }
});
