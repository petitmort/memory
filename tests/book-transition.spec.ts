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
    const motionPath = '/src/reading-motion.ts';
    const [{ createAlbum }, THREE, motion] = await Promise.all([import(albumPath), import(threePath),import(motionPath)]);
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
    // Redirect the same moving eye across a responsive breakpoint without a
    // renderer. Compare actual displacement around the join, not only a stored velocity.
    const from = {p:new THREE.Vector3(1.1,1.65,.75),t:new THREE.Vector3(-.2,.95,-1.5),fov:50};
    const to = {p:new THREE.Vector3(-.2,1.6,-.3),t:new THREE.Vector3(-.2,.78,-.94),fov:36};
    const duration = 2600, progress = .43, stepMs = .1;
    const approach = motion.createReadingPath(from,to,duration);
    const current = approach.sample(progress), beforeJoin = approach.sample(progress-stepMs/duration);
    const newDestination = {p:new THREE.Vector3(-.2,1.65,.7),t:to.t.clone(),fov:54};
    const remaining = duration*(1-progress);
    const redirected = motion.retargetReadingPath(current,newDestination,remaining);
    const join = redirected.sample(0), afterJoin = redirected.sample(stepMs/remaining), arrived = redirected.sample(1);
    const lateStart = approach.sample(.99);
    const lateDuration = motion.readingRetargetDuration({duration,elapsed:duration*.99});
    const lateRedirect = motion.retargetReadingPath(lateStart,newDestination,lateDuration);
    const lateFirstFrame = lateRedirect.sample(16/lateDuration);
    const pose = sample => ({p:sample.p.toArray(),t:sample.t.toArray(),fov:sample.fov});
    const numericalVelocity = (a,b) => ({p:b.p.clone().sub(a.p).multiplyScalar(1/stepMs).toArray(),
      t:b.t.clone().sub(a.t).multiplyScalar(1/stepMs).toArray(),fov:(b.fov-a.fov)/stepMs});
    const clock = {elapsed:0,duration:2000,lastDrawAt:null};
    const firstDraw = motion.advanceReadingClock(clock,120000);
    const nextDraw = motion.advanceReadingClock(clock,120016);
    const slowDraw = motion.advanceReadingClock(clock,120500);
    const returnClock = {elapsed:0,duration:2000,lastDrawAt:null};
    const firstReturn = motion.advanceReadingClock(returnClock,360000);
    return { corners, actual, degenerate, closedSize, open, reclosedSize,
      motion:{current:pose(current),join:pose(join),destination:pose(newDestination),arrived:pose(arrived),
        incoming:numericalVelocity(beforeJoin,current),outgoing:numericalVelocity(join,afterJoin),
        finalVelocity:pose(arrived.velocity),firstDraw,nextDraw,slowDraw,firstReturn,
        lateDuration,lateFirstDistance:lateFirstFrame.p.distanceTo(lateStart.p),lateRemainingDistance:lateFirstFrame.p.distanceTo(newDestination.p)} };
  });
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(result.actual[i].x - result.corners[i].x)).toBeLessThan(1);
    expect(Math.abs(result.actual[i].y - result.corners[i].y)).toBeLessThan(1);
  }
  expect(result.degenerate).toBeNull();
  expect(result.motion.join).toEqual(result.motion.current);
  expect(result.motion.arrived).toEqual(result.motion.destination);
  expect(result.motion.firstDraw).toBe(0);
  expect(result.motion.firstReturn).toBe(0);
  expect(result.motion.nextDraw).toBeCloseTo(.008,8);
  expect(result.motion.slowDraw).toBeCloseTo(.058,8);
  expect(result.motion.lateDuration).toBeGreaterThanOrEqual(300);
  expect(result.motion.lateFirstDistance).toBeLessThan(.05);
  expect(result.motion.lateRemainingDistance).toBeGreaterThan(.5);
  for (const vector of ['p','t'] as const) for (let axis=0;axis<3;axis++) {
    expect(result.motion.outgoing[vector][axis]).toBeCloseTo(result.motion.incoming[vector][axis],6);
    expect(result.motion.finalVelocity[vector][axis]).toBeCloseTo(0,10);
  }
  expect(result.motion.outgoing.fov).toBeCloseTo(result.motion.incoming.fov,5);
  expect(result.motion.finalVelocity.fov).toBe(0);
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
      <div class="vignette"></div><section class="reader" id="reader"><div class="reader-top"><span>THE THINGS WE KEEP</span><button>回到房间</button></div><div class="book-wrap"><div class="book">
        <article class="page page-left"><span class="page-kicker">01 · 海边</span><div class="print" style="height:200px;background:#acd0c7"></div><p class="photo-caption">风经过的地方</p></article>
        <article class="page page-right"><span class="page-kicker">THE THINGS WE KEEP</span><div class="story"><h2>把时光留在这里</h2><p class="poem">The sea remembers.\nWe keep the light.</p></div></article>
      </div><button class="page-nav prev" disabled>←</button><button class="page-nav next">→</button></div><div class="reader-bottom"><span>01 / 04</span></div></section>
    </body></html>`,
  }));
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/__reader_journey');
    const resultPromise = page.evaluate(async () => {
      const path = '/src/reader-transition.ts';
      const { createReaderJourney } = await import(path);
      const timelinePath = '/src/reading-timeline.ts';
      const { readingBlend } = await import(timelinePath);
      const reader = document.getElementById('reader')!;
      const vignette = document.querySelector<HTMLElement>('.vignette')!;
      const baselineVignette = Number(getComputedStyle(vignette).opacity);
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
      let fadeDrift = 0, fadeSamples = 0, vignetteDuringFade = 0;
      const verifyHandoff = (progress: number, opening: boolean, source: ReturnType<typeof projection>) => {
        const blend = readingBlend(progress, opening);
        if (blend.paper > 0 && blend.paper < 1) {
          fadeSamples++;
          const actual = corners();
          for (let side = 0; side < 2; side++) for (let corner = 0; corner < 4; corner++) {
            const target = source.pages[side].corners[corner], shown = actual[side][corner];
            fadeDrift = Math.max(fadeDrift,Math.hypot(shown.x-target.x,shown.y-target.y));
          }
          vignetteDuringFade = Math.max(vignetteDuringFade,Number(getComputedStyle(vignette).opacity));
        }
      };
      const lateBacking: { progress: number; background: string; opacity: number; crease: number }[] = [];
      for (let step = 1; step <= 200; step++) {
        const progress = step / 200;
        const source = projection(progress);
        journey.update({ progress, projection: source });
        verifyHandoff(progress,true,source);
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
        if (step === 160 || step === 180) {
          const backing = reader.querySelector<HTMLElement>('.reading-backing')!;
          lateBacking.push({progress,background:getComputedStyle(backing).backgroundColor,
            opacity:Number(getComputedStyle(backing).opacity),crease:Number(getComputedStyle(reader.querySelector('.book')!,'::after').opacity)});
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          (window as any).__paperLateStage = progress;
          await new Promise<void>(resolve => { (window as any).__resumePaperLateStage = resolve; });
        }
      }
      const end = { corners: corners(), style: style() };
      const activeAnimations = reader.getAnimations({ subtree: true }).length;
      journey.finish();
      const cleaned = { corners: corners(), style: style() };
      const readingVignette = Number(getComputedStyle(vignette).opacity);
      // Retargeting the same global progress must immediately follow this
      // frame's new camera projection instead of an earlier cached quad.
      const rejoin = createReaderJourney(reader, false);
      rejoin.update({ progress: 0, projection: projection(0) });
      const closingVignetteStart = Number(getComputedStyle(vignette).opacity);
      rejoin.update({ progress: .2, projection: projection(.2) });
      const beforeRetarget = corners();
      rejoin.update({ progress: .2, projection: projection(.2, 8) });
      const afterRetarget = corners();
      for (let step = 41; step <= 200; step++) {
        const progress = step / 200, source = projection(progress,8);
        rejoin.update({ progress, projection: source });
        verifyHandoff(progress,false,source);
      }
      rejoin.finish();
      const restoredVignette = Number(getComputedStyle(vignette).opacity);
      let maxStep = 0;
      for (let i = 1; i < samples.length; i++) for (let side = 0; side < 2; side++) for (let corner = 0; corner < 4; corner++) {
        const a = samples[i - 1][side][corner], b = samples[i][side][corner];
        maxStep = Math.max(maxStep, Math.hypot(b.x - a.x, b.y - a.y));
      }
      return { settled, initial, source: projection(0).pages, end, cleaned, maxStep, activeAnimations, beforeRetarget, afterRetarget,
        hidden: reader.classList.contains('hidden'),fadeDrift,fadeSamples,vignetteDuringFade,lateBacking,
        baselineVignette,readingVignette,closingVignetteStart,restoredVignette };
    });
    const paintPromise = (async () => {
      await page.waitForFunction(() => (window as any).__paperPaintProbe?.length === 2);
      let paintedPixels: number[] = [];
      try {
        const screenshot = await page.screenshot({ path: `test-results/paper-paint-${viewport.width}.png` });
        paintedPixels = await page.evaluate(async encoded => {
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
      for (const stage of [.8,.9]) {
        await page.waitForFunction(expected => (window as any).__paperLateStage === expected,stage);
        try {
          await page.screenshot({path:`test-results/paper-layout-${viewport.width}-${Math.round(stage*100)}.png`});
        } finally {
          await page.evaluate(() => (window as any).__resumePaperLateStage());
        }
      }
      return paintedPixels;
    })();
    const [result, paintedPixels] = await Promise.all([resultPromise, paintPromise]);
    expect(paintedPixels).toHaveLength(2);
    paintedPixels.forEach((count, side) => {
      expect(count, `${viewport.width}px page ${side + 1} should paint at its measured center`).toBeGreaterThan(0);
    });
    expect(result.activeAnimations).toBe(0);
    // Both printed layers must use the same quad throughout their overlap.
    expect(result.fadeSamples).toBeGreaterThan(20);
    expect(result.fadeDrift).toBeLessThan(.2);
    expect(result.vignetteDuringFade).toBe(0);
    expect(result.readingVignette).toBe(0);
    expect(result.closingVignetteStart).toBe(0);
    expect(result.restoredVignette).toBeCloseTo(result.baselineVignette,5);
    expect(result.baselineVignette).toBeGreaterThan(0);
    expect(result.lateBacking).toHaveLength(2);
    for (const backing of result.lateBacking) {
      expect(backing.background).toBe('rgba(0, 0, 0, 0)');
      expect(backing.opacity).toBe(0);
      expect(backing.crease).toBe(0);
    }
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

    // The DOM-only route must keep the same darkening lifecycle, including a
    // non-default CSS baseline rather than assuming the overlay opacity is one.
    const fallback = await page.evaluate(async () => {
      const path = '/src/reader-transition.ts';
      const { transitionReader } = await import(path);
      const reader = document.getElementById('reader')!;
      const vignette = document.querySelector<HTMLElement>('.vignette')!;
      vignette.style.setProperty('--vignette-opacity','.73');
      const baseline = Number(getComputedStyle(vignette).opacity);
      reader.classList.remove('hidden');
      await transitionReader(reader,undefined,true,true);
      const reading = Number(getComputedStyle(vignette).opacity);
      await transitionReader(reader,undefined,false,true);
      return {baseline,reading,restored:Number(getComputedStyle(vignette).opacity),hidden:reader.classList.contains('hidden')};
    });
    expect(fallback.baseline).toBeGreaterThan(0);
    expect(fallback.baseline).toBeLessThan(1);
    expect(fallback.reading).toBe(0);
    expect(fallback.restored).toBeCloseTo(fallback.baseline,5);
    expect(fallback.hidden).toBe(true);

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
