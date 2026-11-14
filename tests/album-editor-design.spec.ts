import { test, expect, type Page } from '@playwright/test';

const left = (page: Page) => page.locator('.editor-page[data-side="0"]');
const saved = (page: Page) => expect(page.locator('#save-status')).toHaveText('✓ 已保存到本机');
const draft = (page: Page) => page.evaluate(async () => (await (await import('/src/editor/storage.ts')).readDraft())!.document);
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '设置直达' }).getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/editor.html'); await saved(page);
});

for (const size of [{ width: 1440, height: 1000 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }]) test(`a normal spread fits the complete canvas at ${size.width}×${size.height}`, async ({ page }) => {
  await page.setViewportSize(size); await page.locator('#fit-canvas').click();
  const boxes = await page.evaluate(() => {
    const stage = document.querySelector('#canvas-stage')!.getBoundingClientRect(), paper = document.querySelector('#paper-frame')!.getBoundingClientRect();
    return { stage: { left: stage.left, right: stage.right, top: stage.top, bottom: stage.bottom }, paper: { left: paper.left, right: paper.right, top: paper.top, bottom: paper.bottom }, overflow: document.documentElement.scrollWidth > innerWidth, header: document.querySelector('.editor-header')!.getBoundingClientRect().height };
  });
  expect(boxes.paper.left).toBeGreaterThan(boxes.stage.left); expect(boxes.paper.right).toBeLessThanOrEqual(boxes.stage.right - 10);
  expect(boxes.paper.top).toBeGreaterThanOrEqual(boxes.stage.top); expect(boxes.paper.bottom).toBeLessThanOrEqual(boxes.stage.bottom - 10);
  expect(boxes.overflow).toBe(false); expect(boxes.header).toBeLessThan(85);
});

test('manual zoom stays usable and a long page scrolls instead of shrinking all its writing', async ({ page }) => {
  const zoom = page.getByLabel('画布缩放'); await zoom.fill('100');
  const text = left(page).getByRole('textbox', { name: '页面正文' }); await text.fill('这是保留阅读顺序的长内容。\n'.repeat(70)); await page.locator('#select-page').click();
  await expect(zoom).toHaveValue('100');
  await page.getByLabel('纸张', { exact: true }).selectOption('watercolor'); await expect(zoom).toHaveValue('100');
  await page.locator('#fit-canvas').click(); expect(Number(await zoom.inputValue())).toBeGreaterThanOrEqual(80);
  const scroll = await page.locator('#canvas-stage').evaluate(e => { e.scrollTop = e.scrollHeight; return { height: e.clientHeight, content: e.scrollHeight, top: e.scrollTop }; });
  expect(scroll.content).toBeGreaterThan(scroll.height * 2); expect(scroll.top).toBeGreaterThan(100); await saved(page);
  expect((await draft(page)).chapters[0].spreads[0].pages[0].elements.find(e => e.type === 'text' && e.role === 'body')?.text).toContain('这是保留阅读顺序');
});

test('quick navigation opens the chosen group, retains edited text and puts keyboard focus on its summary', async ({ page }) => {
  await left(page).getByRole('textbox', { name: '页面标题' }).fill('我正在写的标题');
  await expect(page.locator('#inspector-title')).toHaveText('左页 · 文字设置');
  await page.locator('#open-watermarks').click(); const summary = page.locator('[data-section="watermark"] > summary');
  await expect(summary).toBeFocused(); await expect(page.locator('.editor-element-settings')).toHaveCount(0);
  await expect(page.locator('[data-section="watermark"]')).toHaveAttribute('open', '');
  const boxes = await page.evaluate(() => ({ summary: document.querySelector('[data-section="watermark"] > summary')!.getBoundingClientRect().top, heading: document.querySelector('.editor-inspector-heading')!.getBoundingClientRect().bottom }));
  expect(boxes.summary).toBeGreaterThanOrEqual(boxes.heading - 1);
  for (const [name, section] of [['纸张', 'paper'], ['格线', 'grid'], ['搭配', 'kits'], ['版式', 'layout']]) {
    await nav(page, name).focus(); await page.keyboard.press('Enter');
    await expect(page.locator(`[data-section="${section}"] > summary`)).toBeFocused(); await expect(nav(page, name)).toHaveAttribute('aria-pressed', 'true');
  }
  await saved(page); await page.reload(); await expect(left(page)).toContainText('我正在写的标题');
});

test('gallery categories and search filter real images without changing the draft or replacing controls', async ({ page }) => {
  await page.locator('#open-watermarks').click(); const initial = await draft(page);
  await page.evaluate(() => { (window as any).__galleryNodes = Array.from(document.querySelectorAll('.editor-watermark-choice, .editor-watermark-choice img, [aria-label="搜索水印"], [aria-label="水印透明度"]')); });
  const category = page.getByLabel('水印分类', { exact: true }), search = page.getByLabel('搜索水印', { exact: true });
  for (const [name, count] of [['cats', 29], ['flowers', 33], ['seaside', 19], ['stars', 24], ['leaves', 29], ['sentiments', 35], ['all', 169]] as const) {
    await category.selectOption(name); await expect(page.locator('.editor-watermark-choice:visible')).toHaveCount(count);
  }
  await search.fill('贝壳'); await expect(page.locator('.editor-watermark-choice:visible')).toHaveCount(18);
  await category.selectOption('cats'); await expect(page.locator('.editor-watermark-choice:visible')).toHaveCount(0); await expect(page.locator('.editor-gallery-result')).toContainText('没有找到图案');
  await search.fill(''); await expect(page.locator('.editor-watermark-choice:visible')).toHaveCount(29);
  expect(await page.evaluate(() => (window as any).__galleryNodes.every((node: Element) => node.isConnected))).toBe(true);
  expect(await draft(page)).toEqual(initial); await expect(page.locator('#undo')).toBeDisabled();
});

test('gallery filters survive image loading, side selection and inspector rebuilding', async ({ page }) => {
  await page.locator('#open-watermarks').click(); await page.getByLabel('水印分类').selectOption('seaside'); await page.getByLabel('搜索水印').fill('蓝');
  await page.getByLabel('水印种类').selectOption('扇贝'); await page.getByLabel('水印原色').selectOption('蓝');
  const choice = page.locator('.editor-watermark-choice:visible'); await expect(choice).toHaveCount(1); await choice.click();
  await expect(left(page).locator('.album-watermark img')).toHaveCount(2); await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#other-page').click(); await expect(page.getByLabel('水印分类')).toHaveValue('seaside'); await expect(page.getByLabel('搜索水印')).toHaveValue('蓝');
  await expect(page.locator('.editor-watermark-choice:visible')).toHaveCount(1); await expect(choice).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#other-page').click(); await expect(choice).toHaveAttribute('aria-pressed', 'true');
});

async function personalFixture(page: Page) {
  await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), s = await import('/src/editor/storage.ts'); const stored = (await s.readDraft())!, d = stored.document;
    const c = document.createElement('canvas'); c.width = 120; c.height = 80; const x = c.getContext('2d')!; x.fillStyle = '#91bcb2'; x.fillRect(0, 0, 120, 80);
    const blob = await new Promise<Blob>(resolve => c.toBlob(b => resolve(b!), 'image/png')); const assetId = m.id(); d.assets.push({ id: assetId, name: '我的原图.png', mime: 'image/png', width: 120, height: 80 });
    d.chapters[0].spreads.push(m.makeSpread());
    for (const p of d.chapters[0].spreads.flatMap(s => s.pages)) {
      p.layout.columns = 2; Object.assign(p.watermark, { assetId, opacity: .43, mode: 'single', x: 24, y: 72 });
      for (const e of p.elements) {
        if (e.type === 'text') { e.text = e.role === 'title' ? '我们真实写下的标题' : '原文一行\n原文第二行'; e.font = 'sans'; }
        if (e.type === 'photo') { e.assetId = assetId; e.caption = '我自己的图注'; e.alt = '我自己的照片说明'; e.crop = { zoom: 1.7, x: 24, y: 65, rotation: 11 }; }
      }
      p.elements.push(m.stickerElement('paw'));
    }
    await s.saveDraft(d, new Map([[assetId, blob]]), stored.version);
  }); await page.reload(); await saved(page);
}

for (const scope of ['page', 'spread', 'book']) test(`a style kit applies only to ${scope} and one undo preserves all original content`, async ({ page }) => {
  await personalFixture(page); const before = await draft(page); await nav(page, '搭配').click(); await page.getByLabel('页面设置应用到').selectOption(scope);
  await page.getByRole('button', { name: '套用搭配：植系日记' }).click(); await saved(page); const after = await draft(page);
  const originals = before.chapters[0].spreads.flatMap(s => s.pages), pages = after.chapters[0].spreads.flatMap(s => s.pages);
  const count = scope === 'page' ? 1 : scope === 'spread' ? 2 : 4;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i], original = originals[i];
    if (i >= count) { expect(p).toEqual(original); continue; }
    expect(p.paper.kind).toBe('watercolor'); expect(p.grid.kind).toBe('dotted'); expect(p.layout.template).toBe(original.layout.template); expect(p.layout.columns).toBe(2);
    expect(p.watermark).toEqual(original.watermark); expect(p.id).toBe(original.id); expect(p.elements.map(e => e.id)).toEqual(original.elements.map(e => e.id));
    p.elements.forEach((e, n) => {
      const old = original.elements[n];
      if (e.type === 'text' && old.type === 'text') { expect(e.text).toBe(old.text); expect(e.role).toBe(old.role); }
      else if (e.type === 'photo' && old.type === 'photo') { expect([e.assetId, e.caption, e.alt, e.crop]).toEqual([old.assetId, old.caption, old.alt, old.crop]); expect(e.frame).toBe('tape'); }
      else expect(e).toEqual(old);
    });
  }
  expect(after.assets).toEqual(before.assets);
  await page.locator('#undo').click(); await saved(page); expect((await draft(page)).chapters).toEqual(before.chapters);
  await page.locator('#redo').click(); await saved(page); await page.reload(); await saved(page); expect((await draft(page)).chapters).toEqual(after.chapters);
});

test('all three kits can be previewed and backed up using the shared page styles', async ({ page }) => {
  await personalFixture(page); await nav(page, '搭配').click();
  for (const [name, paper, frame] of [['海边留白', 'white', 'white'], ['暖色手帐', 'cotton', 'polaroid'], ['植系日记', 'watercolor', 'tape']]) {
    await page.getByRole('button', { name: `套用搭配：${name}` }).click(); await expect(left(page)).toHaveAttribute('data-paper', paper); await expect(left(page).locator('figure')).toHaveClass(new RegExp(`album-frame-${frame}`));
    await page.locator('#preview').click(); const reading = page.frameLocator('#preview-frame'); await expect(reading.locator('.page-left')).toHaveAttribute('data-paper', paper); await expect(reading.locator('.page-left figure')).toHaveClass(new RegExp(`album-frame-${frame}`));
    expect(await reading.locator('.page-left .album-paper-texture').evaluate(e => getComputedStyle(e).backgroundImage)).not.toBe('none');
    await expect(reading.locator('.page-left')).toContainText('我们真实写下的标题'); await page.locator('#close-preview').click();
  }
  await page.locator('.editor-export summary').click(); const waiting = page.waitForEvent('download'); await page.locator('#export-backup').click();
  const { readFile } = await import('node:fs/promises'); const pack = JSON.parse(await readFile((await (await waiting).path())!, 'utf8'));
  expect(pack.document.chapters[0].spreads[0].pages[0].paper.kind).toBe('watercolor'); expect(pack.assets).toHaveLength(1);
});

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) test(`narrow controls stay readable and reachable at ${size.width}×${size.height}`, async ({ page }) => {
  await page.setViewportSize(size); await page.locator('#open-watermarks').click(); await expect(page.getByLabel('搜索水印')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const sizes = await page.locator('.editor-property-nav button').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return { width: r.width, height: r.height, font: parseFloat(getComputedStyle(button).fontSize) }; }));
  for (const s of sizes) { expect(s.width).toBeGreaterThanOrEqual(44); expect(s.height).toBeGreaterThanOrEqual(44); expect(s.font).toBeGreaterThanOrEqual(13); }
  await page.getByLabel('水印分类').selectOption('cats'); await expect(page.locator('.editor-watermark-choice:visible')).toHaveCount(29);
  await nav(page, '纸张').click(); await page.getByLabel('纸张', { exact: true }).selectOption('kraft'); await expect(left(page)).toHaveAttribute('data-paper', 'kraft');
});
