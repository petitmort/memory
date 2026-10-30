import { test, expect, type Page } from '@playwright/test';

/** Real reader layout and artwork; freeze its clock to inspect the moving leaf. */
async function fixture(page: Page, initialChapter = 0, reducedMotion = false, photograph = false) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.install({ time: new Date('2026-10-30T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-30T12:00:00Z'));
  await page.route('**/__reader-duplex-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <script type="module">import '/src/style.css';</script><div class="vignette"></div>
    <section class="reader" id="reader" role="dialog" aria-modal="true" tabindex="-1">
      <div class="reader-top"><span class="eyebrow">THE THINGS WE KEEP</span><button id="close-book" class="text-button">回到房间</button></div>
      <div class="book-wrap"><div class="book" id="book">
        <article class="page page-left"><span id="chapter-date" class="page-kicker"></span><div class="print" id="art-holder"></div><p class="photo-caption" id="photo-caption"></p><span class="page-number" id="left-number"></span></article>
        <article class="page page-right"><span id="chapter-subtitle" class="page-kicker"></span><div class="story"><span class="small-flower">✳</span><h2 id="chapter-title"></h2><p id="chapter-text" class="poem"></p><div class="small-rule"></div><p id="chapter-note" class="story-note"></p></div><span class="page-number" id="right-number"></span></article>
      </div><button id="prev" class="page-nav prev" aria-label="上一章">←</button><button id="next" class="page-nav next" aria-label="下一章">→</button></div>
      <div class="reader-bottom"><span id="chapter-count"></span><div id="chapter-dots" class="chapter-dots"></div><span class="keyboard-hint"></span></div>
    </section>` }));
  await page.goto('/__reader-duplex-test');
  await page.evaluate(async ({ initialChapter, reducedMotion, photograph }) => {
    const content = await import('/src/content.ts');
    if (photograph) {
      const image = document.createElement('canvas'); image.width = 120; image.height = 90;
      const ink = image.getContext('2d')!;
      ink.fillStyle = '#08b568'; ink.fillRect(0, 0, 120, 90);
      ink.fillStyle = '#fa3b24'; ink.fillRect(0, 0, 35, 90);
      content.chapters[1].image = image.toDataURL();
    }
    const { createReaderController } = await import('/src/reader-controller.ts');
    const host = window as any;
    host.__duplexCanRead = true;
    host.__duplexReader = createReaderController({ canRead: () => host.__duplexCanRead, initialChapter, reducedMotion });
    host.__duplexReader.render();
  }, { initialChapter, reducedMotion, photograph });
  await page.evaluate(() => document.fonts.ready);
}

/** Place asymmetric registration marks on both printed faces to prove pixels. */
async function inspectLeaf(page: Page, degrees: number) {
  return await page.evaluate(degrees => {
    const leaf = document.querySelector<HTMLElement>('.turn-leaf')!;
    const animation = leaf.getAnimations().find(animation => animation instanceof CSSAnimation)!;
    if (!animation) throw new Error('A real CSS page turn is required');
    animation.pause();
    const effect = animation.effect as KeyframeEffect;
    const duration = Number(effect.getTiming().duration);
    effect.updateTiming({ easing: 'linear' });
    animation.currentTime = duration * degrees / 180;
    leaf.querySelectorAll('[data-registration]').forEach(marker => marker.remove());
    for (const name of ['leaf-front', 'leaf-back']) {
      const face = leaf.querySelector<HTMLElement>(`.${name}`)!;
      for (const [side, color] of [['left', '#f52b35'], ['right', '#163fee']]) {
        const marker = document.createElement('i');
        marker.dataset.registration = `${name}-${side}`;
        marker.style.cssText = `position:absolute;top:90px;${side}:55px;width:28px;height:28px;background:${color};z-index:100;`;
        face.querySelector('.page')!.append(marker);
      }
    }
    const read = (selector: string) => leaf.querySelector(selector)?.textContent;
    const base = document.querySelector('#book')!;
    const rect = leaf.getBoundingClientRect();
    return {
      front: { title: read('.leaf-front h2'), date: read('.leaf-front .page-kicker'), number: read('.leaf-front .page-number') },
      back: { title: read('.leaf-back h2'), date: read('.leaf-back .page-kicker'), number: read('.leaf-back .page-number') },
      left: base.querySelector(':scope > .page-left .page-kicker')!.textContent,
      right: base.querySelector(':scope > .page-right h2')!.textContent,
      underlayTitle: base.querySelector('.turn-underlay h2')?.textContent,
      underlayDate: base.querySelector('.turn-underlay .page-kicker')?.textContent,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      transform: getComputedStyle(leaf).transform,
      duplicateIds: [...document.querySelectorAll('[id]')].map(element => element.id).filter((id, index, ids) => ids.indexOf(id) !== index),
    };
  }, degrees);
}

async function markersArePrinted(page: Page, face: 'leaf-front' | 'leaf-back') {
  const markers = await page.locator(`[data-registration^="${face}"]`).evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { id: element.getAttribute('data-registration')!, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }));
  expect(markers).toHaveLength(2);
  expect(markers[0].x, 'the back print must read left to right rather than mirrored').toBeLessThan(markers[1].x);
  const screenshot = await page.screenshot();
  const pixels = await page.evaluate(async ({ encoded, markers }) => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ink = canvas.getContext('2d')!; ink.drawImage(image, 0, 0);
    return markers.map(marker => Array.from(ink.getImageData(Math.round(marker.x), Math.round(marker.y), 1, 1).data));
  }, { encoded: screenshot.toString('base64'), markers });
  expect(pixels[0].slice(0, 3), 'front/back registration marks must appear in the actual screenshot').toEqual([245, 43, 53]);
  expect(pixels[1].slice(0, 3)).toEqual([22, 63, 238]);
}

async function finishTurn(page: Page) {
  await page.evaluate(() => document.querySelector('.turn-leaf')?.getAnimations().forEach(animation => animation.finish()));
  await page.clock.runFor(2000);
  await expect(page.locator('.turn-leaf')).toHaveCount(0);
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
}

test('forward leaf prints the previous right page and the next left page on opposite faces', async ({ page }) => {
  await fixture(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => (document.getElementById('next') as HTMLButtonElement).click());
  await expect(page.locator('.leaf-back .page-left')).toHaveCount(1);
  const first = await inspectLeaf(page, 45);
  expect(first.front.title).toBe('风经过的地方'); expect(first.front.number).toBe('02');
  expect(first.back.date).toBe('第二章 · 日常'); expect(first.back.number).toBe('03');
  expect(first.left).toBe('第一章 · 初见'); expect(first.right).toBe('风经过的地方');
  expect(first.underlayTitle).toBe('把日子过成夏天');
  expect(first.duplicateIds).toEqual([]);
  await markersArePrinted(page, 'leaf-front');
  await page.locator('[data-registration]').evaluateAll(markers => markers.forEach(marker => marker.remove()));
  await page.screenshot({ path: test.info().outputPath('duplex-forward-front.png') });
  const canvas = await page.locator('.leaf-back canvas').evaluate((element: HTMLCanvasElement) => {
    const bytes = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let opaque = 0; for (let index = 3; index < bytes.length; index += 4) if (bytes[index] === 255) opaque++;
    return { width: element.width, height: element.height, opaque };
  });
  expect(canvas.opaque).toBe(canvas.width * canvas.height);
  const second = await inspectLeaf(page, 135);
  expect(second.left).toBe('第一章 · 初见'); expect(second.right).toBe('风经过的地方');
  expect(second.underlayTitle).toBe('把日子过成夏天');
  await markersArePrinted(page, 'leaf-back');
  await page.locator('[data-registration]').evaluateAll(markers => markers.forEach(marker => marker.remove()));
  await page.screenshot({ path: test.info().outputPath('duplex-forward-back.png') });
  await finishTurn(page);
  await expect(page.locator('#chapter-date')).toHaveText('第二章 · 日常');
  expect(await page.evaluate(() => (window as any).__duplexReader.getChapter())).toBe(1);
  expect(errors).toEqual([]);
});

test('reverse leaf keeps the current left artwork and reveals the previous right print without mirroring', async ({ page }) => {
  await fixture(page, 1);
  const original = await page.locator('#art-holder canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.evaluate(() => (document.getElementById('prev') as HTMLButtonElement).click());
  await expect(page.locator('.leaf-back .page-right')).toHaveCount(1);
  const first = await inspectLeaf(page, 45);
  expect(first.front.date).toBe('第二章 · 日常'); expect(first.front.number).toBe('03');
  expect(first.back.title).toBe('风经过的地方'); expect(first.back.number).toBe('02');
  expect(first.left).toBe('第二章 · 日常'); expect(first.right).toBe('把日子过成夏天');
  expect(first.underlayDate).toBe('第一章 · 初见');
  expect(await page.locator('.leaf-front canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(original);
  await markersArePrinted(page, 'leaf-front');
  await inspectLeaf(page, 135);
  await markersArePrinted(page, 'leaf-back');
  await page.locator('[data-registration]').evaluateAll(markers => markers.forEach(marker => marker.remove()));
  await page.screenshot({ path: test.info().outputPath('duplex-backward-back.png') });
  await finishTurn(page);
  await expect(page.locator('#chapter-title')).toHaveText('风经过的地方');
});

test('the next photograph is ready on the reverse face, and cancellation removes the temporary print', async ({ page }) => {
  await fixture(page, 0, false, true);
  await page.evaluate(() => (document.getElementById('next') as HTMLButtonElement).click());
  await expect(page.locator('.leaf-back .print img')).toHaveCount(1);
  expect(await page.locator('.leaf-back img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => {
    const host = window as any; host.__duplexCanRead = false; host.__duplexReader.cancelTurn();
  });
  await page.clock.runFor(2000);
  await expect(page.locator('.turn-leaf')).toHaveCount(0);
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
  const selected = await page.evaluate(() => (window as any).__duplexReader.getChapter());
  expect(selected).toBe(0);
  await expect(page.locator('.turn-underlay')).toHaveCount(0);
  await page.evaluate(() => { const host = window as any; host.__duplexCanRead = true; host.__duplexReader.render(); });
  expect(await page.locator('#chapter-title').textContent()).toBe(selected === 0 ? '风经过的地方' : '把日子过成夏天');
  await page.evaluate(() => (document.getElementById('next') as HTMLButtonElement).click());
  await expect(page.locator('.leaf-back .page-left')).toHaveCount(1);
  await finishTurn(page);
});

for (const mode of [
  { name: 'small-screen ordinary motion', reduced: false, width: 390, height: 844 },
  { name: 'desktop reduced motion', reduced: true, width: 1440, height: 1000 },
]) test(`${mode.name} updates the paired spread without leaving a hidden leaf`, async ({ page }) => {
  await fixture(page, 0, mode.reduced);
  await page.setViewportSize({ width: mode.width, height: mode.height });
  await page.evaluate(() => (document.getElementById('next') as HTMLButtonElement).click());
  await page.clock.runFor(2000);
  await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
  await expect(page.locator('#chapter-date')).toHaveText('第二章 · 日常');
  await expect(page.locator('.turn-leaf,.turn-underlay')).toHaveCount(0);
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
  await page.screenshot({ path: test.info().outputPath(`${mode.name.replaceAll(' ', '-')}.png`) });
});

test('an unavailable photograph falls back to printed artwork before the reverse face is shown', async ({ page }) => {
  await fixture(page);
  await page.route('**/__missing-duplex-photo.png', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.evaluate(async () => {
    const { chapters } = await import('/src/content.ts');
    chapters[1].image = '/__missing-duplex-photo.png';
    (document.getElementById('next') as HTMLButtonElement).click();
  });
  await expect(page.locator('.leaf-back .print canvas')).toHaveCount(1);
  await expect(page.locator('.leaf-back img')).toHaveCount(0);
  await inspectLeaf(page, 135);
  await markersArePrinted(page, 'leaf-back');
  await finishTurn(page);
  await expect(page.locator('#chapter-date')).toHaveText('第二章 · 日常');
  await expect(page.locator('#art-holder canvas')).toHaveCount(1);
});

test('a stalled photograph cannot keep chapter navigation locked indefinitely', async ({ page }) => {
  await fixture(page);
  let releasePhoto!: () => void;
  await page.route('**/__stalled-duplex-photo.png', async route => {
    await new Promise<void>(resolve => { releasePhoto = resolve; });
    await route.abort();
  });
  await page.evaluate(async () => {
    const { chapters } = await import('/src/content.ts');
    chapters[1].image = '/__stalled-duplex-photo.png';
    (document.getElementById('next') as HTMLButtonElement).click();
  });
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.turn-leaf')).toHaveCount(0);
  await page.clock.runFor(1210);
  await expect(page.locator('.leaf-back .print canvas')).toHaveCount(1);
  await inspectLeaf(page, 135);
  await markersArePrinted(page, 'leaf-back');
  await finishTurn(page);
  await expect(page.locator('#next')).toBeEnabled();
  await expect(page.locator('#chapter-date')).toHaveText('第二章 · 日常');
  await expect(page.locator('#art-holder canvas')).toHaveCount(1);
  await expect(page.locator('#art-holder img')).toHaveCount(0);
  releasePhoto();
});

test('resizing a moving sheet cancels it safely and permits the next narrow-screen turn', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => (document.getElementById('next') as HTMLButtonElement).click());
  await expect(page.locator('.turn-leaf')).toHaveCount(1);
  await inspectLeaf(page, 135);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(32);
  await expect(page.locator('.turn-leaf,.turn-underlay')).toHaveCount(0);
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#chapter-date')).toHaveText('第一章 · 初见');
  expect(await page.evaluate(() => (window as any).__duplexReader.getChapter())).toBe(0);
  await page.evaluate(() => (document.getElementById('next') as HTMLButtonElement).click());
  await page.clock.runFor(2000);
  await expect(page.locator('#chapter-date')).toHaveText('第二章 · 日常');
  await expect(page.locator('#next')).toBeEnabled();
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
});
