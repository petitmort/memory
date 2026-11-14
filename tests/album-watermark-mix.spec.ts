import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const keys = ['variant-cat-ginger-sleep', 'fresh-cat-b-white-fish-hug', 'fresh-cat-gray-stretch'];
const left = (page: Page) => page.locator('.editor-page[data-side="0"]');
const choice = (page: Page, key: string) => page.locator(`[data-watermark-preset="${key}"]`);
const saved = (page: Page) => expect(page.locator('#save-status')).toHaveText('✓ 已保存到本机');
async function amount(page: Page, label: string, value: number) {
  await page.getByLabel(label, { exact: true }).evaluate((e, value) => {
    (e as HTMLInputElement).value = String(value); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function pick(page: Page, key: string) {
  await choice(page, key).click(); await expect(choice(page, key)).toHaveAttribute('aria-pressed', 'true');
}
async function mix(page: Page) { await page.getByLabel('同页混用多款', { exact: true }).check(); for (const key of keys) await pick(page, key); await saved(page); }
async function tiles(page: Page) {
  return left(page).locator('.album-watermark-tile').evaluateAll(nodes => nodes.map(n => ({ asset: (n as HTMLElement).dataset.watermarkAsset, transform: (n as HTMLElement).style.transform })));
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/editor.html'); await saved(page); await page.locator('#open-watermarks').click();
});

test('optional mix preserves legacy documents and rejects invalid or dangling variants, even while disabled', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), original = m.newDocument(), before = JSON.stringify(original); m.validateDocument(original);
    const base = () => { const d = m.newDocument(); d.assets = ['mix-a', 'mix-b'].map(id => ({ id, name: id, mime: 'image/png', width: 20, height: 20 })); d.chapters[0].spreads[0].pages[0].watermark.mix = { enabled: true, seed: 0, angleRange: 30, upright: .35, items: [{ assetId: 'mix-a' }, { assetId: 'mix-b', rotation: 0 }] }; return d; };
    const edits = [x => x.enabled = 1, x => x.seed = -1, x => x.seed = .2, x => x.seed = 2147483648, x => x.angleRange = NaN, x => x.angleRange = 91, x => x.upright = 1.1,
      x => x.items[0].rotation = Infinity, x => x.items[0].rotation = -181, x => x.items[0].assetId = '', x => x.items[0].assetId = 'missing', x => x.items.push(x.items[0]),
      x => x.items = Array(17).fill(x.items[0]), x => x.items[0].presetKey = '<script>', x => x.items.forEach(i => i.presetKey = 'same'), x => { x.enabled = false; x.items[0].assetId = 'missing'; }];
    const rejected = edits.map(edit => { const d = base(); edit(d.chapters[0].spreads[0].pages[0].watermark.mix); try { m.validateDocument(d); return false; } catch { return true; } });
    const valid = base(); m.validateDocument(valid); return { legacySame: before === JSON.stringify(original), hasMix: 'mix' in original.chapters[0].spreads[0].pages[0].watermark, rejected, valid: valid.schemaVersion };
  });
  expect(result.legacySame).toBe(true); expect(result.hasMix).toBe(false); expect(result.valid).toBe(1); expect(result.rejected).toEqual(Array(16).fill(true));
});

test('deterministic layout includes all selected variants with upright and distinct automatic angles', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { pageStyle } = await import('/src/album/document.ts'), { watermarkTiles } = await import('/src/album/watermark-layout.ts');
    const w = pageStyle().watermark; w.mode = 'repeat'; w.mix = { enabled: true, items: ['orange', 'white', 'gray'].map(assetId => ({ assetId })), seed: 19, angleRange: 34, upright: .35 };
    const first = watermarkTiles(w), again = watermarkTiles(structuredClone(w)); w.mix.seed++; const next = watermarkTiles(w);
    w.mix.items[0].rotation = 0; w.mix.items[1].rotation = -17; const fixed = watermarkTiles(w); w.mix.items = []; const empty = watermarkTiles(w);
    return { first, same: JSON.stringify(first) === JSON.stringify(again), changed: JSON.stringify(first) !== JSON.stringify(next), fixed, empty };
  });
  expect(result.same).toBe(true); expect(result.changed).toBe(true); expect(result.first).toHaveLength(18);
  expect(new Set(result.first.map(v => v.assetId)).size).toBe(3); expect(result.first.some(v => v.rotation === 0)).toBe(true);
  expect(new Set(result.first.map(v => v.rotation)).size).toBeGreaterThan(5);
  for (let i = 0; i < 18; i += 3) expect(new Set(result.first.slice(i, i + 3).map(v => v.assetId)).size).toBe(3);
  expect(result.fixed.filter(v => v.assetId === 'orange').every(v => v.rotation === 0)).toBe(true);
  expect(result.fixed.filter(v => v.assetId === 'white').every(v => v.rotation === -17)).toBe(true); expect(result.empty).toEqual([]);
});

test('one paper mixes actual orange, white and gray originals; fixed angles, reshuffle and reload persist', async ({ page }) => {
  await mix(page); await expect(left(page).locator('.album-watermark img')).toHaveCount(18);
  const originals = await page.evaluate(async () => {
    const d = (await (await import('/src/editor/storage.ts')).readDraft())!; const w = d.document.chapters[0].spreads[0].pages[0].watermark;
    return Promise.all(w.mix!.items.map(async item => ({ ...item, hash: await (await import('/src/editor/watermark-library.ts')).imageHash(d.assets.get(item.assetId)!) })));
  });
  for (const item of originals) expect(item.assetId).toBe(`wm-${item.hash}`);
  expect(originals.map(v => v.presetKey)).toEqual(keys);
  const rows = page.locator('.editor-mix-item'); await rows.nth(0).locator('select').selectOption('fixed'); await expect(rows.nth(0).locator('input[type=range]')).toBeVisible();
  await rows.nth(1).locator('select').selectOption('fixed'); await rows.nth(1).locator('input[type=range]').evaluate(e => { (e as HTMLInputElement).value = '-23'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  const fixed = await tiles(page);
  expect(fixed.filter(v => v.asset === originals[0].assetId).every(v => v.transform.includes('rotate(0deg)'))).toBe(true);
  expect(fixed.filter(v => v.asset === originals[1].assetId).every(v => v.transform.includes('rotate(-23deg)'))).toBe(true);
  await page.getByRole('button', { name: '换一组排布', exact: true }).click(); const shuffled = await tiles(page); expect(shuffled).not.toEqual(fixed);
  await saved(page); await page.reload(); await saved(page); expect(await tiles(page)).toEqual(shuffled);
  await page.setViewportSize({ width: 390, height: 844 }); expect(await tiles(page)).toEqual(shuffled);
});

test('native mix sliders retain images and pointer capture and form one undo command', async ({ page }) => {
  await mix(page); const original = await tiles(page); const slider = page.getByLabel('混排随机转角', { exact: true }); await slider.scrollIntoViewIfNeeded();
  await slider.evaluate(e => { (window as any).__mixSlider = e; (window as any).__mixImages = [...document.querySelectorAll('.editor-page .album-watermark img')]; });
  const box = (await slider.boundingBox())!; await page.mouse.move(box.x + box.width * .3, box.y + box.height / 2); await page.mouse.down();
  const states = [];
  for (const value of [.35, .48, .62, .8]) { await page.mouse.move(box.x + box.width * value, box.y + box.height / 2); await page.waitForTimeout(35); states.push(await slider.inputValue()); }
  await page.mouse.up(); await saved(page);
  expect(new Set(states).size).toBe(4); expect(await page.evaluate(() => (window as any).__mixSlider.isConnected && (window as any).__mixImages.every(i => i.isConnected))).toBe(true);
  expect(await tiles(page)).not.toEqual(original); await page.locator('#undo').click(); expect(await tiles(page)).toEqual(original);
});

test('concurrent choices survive reverse response order and duplicate pending clicks', async ({ page }) => {
  await page.getByLabel('同页混用多款').check();
  const presets = await page.evaluate(async keys => (await import('/src/editor/watermark-library.ts')).WATERMARK_PRESETS.filter(p => keys.includes(p.key)), keys);
  let resume!: () => void; const gate = new Promise<void>(resolve => { resume = resolve; });
  await page.route(presets[0].url, async route => { if (route.request().resourceType() === 'fetch') await gate; await route.continue(); });
  await choice(page, presets[0].key).click(); await choice(page, presets[0].key).click(); await expect(choice(page, presets[0].key)).toHaveAttribute('aria-busy', 'true');
  await pick(page, presets[1].key); await pick(page, presets[2].key); await expect(page.locator('.editor-mix-item')).toHaveCount(2);
  resume(); await expect(page.locator('.editor-mix-item')).toHaveCount(3); await saved(page);
  expect(new Set((await tiles(page)).map(v => v.asset)).size).toBe(3); await expect(choice(page, presets[0].key)).toHaveAttribute('aria-busy', 'false');
  await choice(page, presets[1].key).click(); await expect(page.locator('.editor-mix-item')).toHaveCount(2); await page.locator('#undo').click(); await expect(page.locator('.editor-mix-item')).toHaveCount(3);
});

test('failed and cancelled mixed loads leave selected images and retry usable', async ({ page }) => {
  await page.getByLabel('同页混用多款').check(); await pick(page, keys[0]);
  const presets = await page.evaluate(async keys => (await import('/src/editor/watermark-library.ts')).WATERMARK_PRESETS.filter(p => keys.slice(1).includes(p.key)), keys);
  await page.route(presets[0].url, route => route.request().resourceType() === 'fetch' ? route.fulfill({ status: 503, body: '' }) : route.continue());
  await choice(page, presets[0].key).click(); await expect(page.locator('#editor-notice')).toContainText('原稿保留'); await expect(page.locator('.editor-mix-item')).toHaveCount(1);
  await page.unroute(presets[0].url); await pick(page, presets[0].key);
  let resume!: () => void; const gate = new Promise<void>(r => { resume = r; });
  await page.route(presets[1].url, async route => { if (route.request().resourceType() === 'fetch') await gate; await route.continue(); });
  await choice(page, presets[1].key).click(); await expect(choice(page, presets[1].key)).toHaveAttribute('aria-busy', 'true');
  await page.getByLabel('同页混用多款').uncheck(); const response = page.waitForResponse(r => r.request().resourceType() === 'fetch' && r.url().includes(presets[1].file)); resume(); await response;
  await expect(choice(page, presets[1].key)).toHaveAttribute('aria-busy', 'false'); await page.getByLabel('同页混用多款').check(); await expect(page.locator('.editor-mix-item')).toHaveCount(2);
  await pick(page, presets[1].key); await expect(page.locator('.editor-mix-item')).toHaveCount(3);
});

test('scope applies mixed selection to both pages and removal respects the chosen scope', async ({ page }) => {
  await page.getByLabel('页面设置应用到').selectOption('spread'); await mix(page); await saved(page);
  await expect(page.locator('.editor-page[data-side="1"] .album-watermark img')).toHaveCount(18);
  await page.getByLabel('页面设置应用到').selectOption('page'); await choice(page, keys[1]).click(); await saved(page);
  expect(new Set((await tiles(page)).map(v => v.asset)).size).toBe(2);
  expect(await page.locator('.editor-page[data-side="1"] .album-watermark-tile').evaluateAll(nodes => new Set(nodes.map(n => (n as HTMLElement).dataset.watermarkAsset)).size)).toBe(3);
});

test('empty and disabled combinations, few positions and the sixteen item limit are explicit', async ({ page }) => {
  await mix(page); await page.getByLabel('图案排布').selectOption('corner'); await expect(page.locator('.editor-watermark-mix')).toContainText('位置不足');
  await page.getByLabel('同页混用多款').uncheck(); await expect(page.locator('.editor-watermark-mix')).toBeHidden(); await expect(page.getByLabel('图案角度', { exact: true })).toBeVisible();
  await page.getByLabel('同页混用多款').check(); await expect(page.locator('.editor-mix-item')).toHaveCount(3); await expect(page.getByLabel('图案角度', { exact: true })).toBeHidden();
  for (const key of keys) await choice(page, key).click(); await expect(left(page).locator('.album-watermark-tile')).toHaveCount(0);
  const more = await page.evaluate(async () => (await import('/src/editor/watermark-library.ts')).WATERMARK_PRESETS.slice(0, 17).map(p => p.key));
  for (const key of more.slice(0, 16)) await pick(page, key);
  await choice(page, more[16]).click(); await expect(page.locator('#editor-notice')).toContainText('最多混用16款'); await expect(page.locator('.editor-mix-item')).toHaveCount(16);
  await page.getByRole('button', { name: '导入自己的水印', exact: true }).click();
  const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 20; c.getContext('2d')!.fillRect(0, 0, 20, 20); return c.toDataURL().split(',')[1]; }), 'base64');
  await page.locator('#image-input').setInputFiles({ name: '超额测试.png', mimeType: 'image/png', buffer: png }); await expect(page.locator('#editor-notice')).toContainText('最多混用16款'); await expect(page.locator('.editor-mix-item')).toHaveCount(16);
});

test('backup remaps every mixed reference without overwriting originals retained by undo', async ({ page }) => {
  await mix(page); await page.getByLabel('同页混用多款').uncheck(); await saved(page);
  const original = await page.evaluate(async () => {
    const d = (await (await import('/src/editor/storage.ts')).readDraft())!; return { refs: d.document.chapters[0].spreads[0].pages[0].watermark.mix!.items, hashes: await Promise.all(d.document.assets.map(async a => (await import('/src/editor/watermark-library.ts')).imageHash(d.assets.get(a.id)!))) };
  });
  await page.locator('.editor-export summary').click(); const waiting = page.waitForEvent('download'); await page.locator('#export-backup').click(); const path = (await (await waiting).path())!;
  const pack = JSON.parse(await readFile(path, 'utf8')); expect(pack.document.chapters[0].spreads[0].pages[0].watermark.mix.enabled).toBe(false); expect(pack.assets).toHaveLength(3);
  await page.locator('#import-backup').click(); await page.locator('#project-input').setInputFiles(path); await expect(page.locator('#editor-notice')).toContainText('项目已恢复'); await saved(page);
  const imported = await page.evaluate(async () => {
    const d = (await (await import('/src/editor/storage.ts')).readDraft())!; return { refs: d.document.chapters[0].spreads[0].pages[0].watermark.mix!.items, hashes: await Promise.all(d.document.assets.map(async a => (await import('/src/editor/watermark-library.ts')).imageHash(d.assets.get(a.id)!))) };
  });
  expect(imported.hashes).toEqual(original.hashes); imported.refs.forEach((v, i) => { expect(v.assetId).not.toBe(original.refs[i].assetId); expect(v.presetKey).toBe(original.refs[i].presetKey); });
  await page.locator('#undo').click(); await saved(page); const restored = await page.evaluate(async () => (await (await import('/src/editor/storage.ts')).readDraft())!.document.chapters[0].spreads[0].pages[0].watermark.mix!.items);
  expect(restored).toEqual(original.refs);
});

test('public optimization retains all pool assets even while mixed rendering is off', async ({ page }) => {
  await mix(page); await page.getByLabel('同页混用多款').uncheck(); await saved(page);
  const result = await page.evaluate(async () => {
    const draft = (await (await import('/src/editor/storage.ts')).readDraft())!, p = await import('/src/editor/packages.ts');
    const optimized = await p.optimizeAssets(draft.document, draft.assets), pack = JSON.parse(await (await p.exportPackage(draft.document, draft.assets, true, await p.contentHash(null))).text());
    return { used: [...p.usedAssets(draft.document)], optimized: [...optimized.assets.keys()], pack, originalHashes: await Promise.all([...draft.assets.values()].map(b => (async () => (await import('/src/editor/watermark-library.ts')).imageHash(b))())) };
  });
  expect(result.used).toHaveLength(3); expect(result.optimized.sort()).toEqual(result.used.sort()); expect(result.pack.assets).toHaveLength(3);
  expect(result.pack.document.chapters[0].spreads[0].pages[0].watermark.mix.items.map(i => i.assetId).sort()).toEqual(result.used);
});

test('reading, physical-page raster and PNG contain each real variant and the individual angles', async ({ page }) => {
  await mix(page); await amount(page, '水印透明度', 65); await amount(page, '图案大小', 110); await page.locator('#preview').click();
  const frame = page.locator('#preview-frame').contentFrame(); await expect(frame.locator('.page-left .album-watermark img')).toHaveCount(18);
  const result = await frame.locator('#reader').evaluate(async root => {
    const { captureBookPages } = await import('/src/page-raster.ts'); await Promise.all([...root.querySelectorAll('img')].map(i => i.decode()));
    const get = async () => { const c = (await captureBookPages(root as HTMLElement))[0]; return c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; };
    const before = await get(), all = [...root.querySelectorAll<HTMLElement>('.page-left .album-watermark-tile')], ids = [...new Set(all.map(n => n.dataset.watermarkAsset))];
    const diff = (a: Uint8ClampedArray) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - before[i]) + Math.abs(a[i + 1] - before[i + 1]) + Math.abs(a[i + 2] - before[i + 2]) > 6) n++; return n; };
    const perVariant = [];
    for (const id of ids) { const selected = all.filter(n => n.dataset.watermarkAsset === id); selected.forEach(n => n.style.opacity = '0'); perVariant.push(diff(await get())); selected.forEach(n => n.style.opacity = ''); }
    const transforms = all.map(n => n.style.transform); all.forEach(n => n.style.transform = n.style.transform.replace(/rotate\([^)]*\)/, 'rotate(0deg)')); const rotationPixels = diff(await get()); all.forEach((n, i) => n.style.transform = transforms[i]);
    return { ids, perVariant, rotationPixels };
  });
  expect(result.ids).toHaveLength(3); result.perVariant.forEach(n => expect(n).toBeGreaterThan(500)); expect(result.rotationPixels).toBeGreaterThan(500);
  await page.locator('#close-preview').click(); await page.locator('.editor-export summary').click(); const waiting = page.waitForEvent('download'); await page.locator('#export-page-image').click(); const bytes = await readFile((await (await waiting).path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test('mixed controls remain reachable at mobile sizes without page overflow', async ({ page }) => {
  await mix(page);
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await page.getByLabel('混排随机转角').scrollIntoViewIfNeeded(); await expect(page.getByLabel('混排随机转角')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const remove = page.locator('.editor-mix-heading button').first(); await remove.scrollIntoViewIfNeeded(); await expect(remove).toBeInViewport(); expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('own uploaded image joins the pool and remains available after save and reload', async ({ page }) => {
  await mix(page); await page.getByRole('button', { name: '导入自己的水印', exact: true }).click();
  const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 32; c.getContext('2d')!.fillRect(8, 8, 16, 16); return c.toDataURL().split(',')[1]; }), 'base64');
  await page.locator('#image-input').setInputFiles({ name: '我的小印章.png', mimeType: 'image/png', buffer: png }); await expect(page.locator('.editor-mix-item')).toHaveCount(4); await saved(page);
  expect(new Set((await tiles(page)).map(v => v.asset)).size).toBe(4); await page.reload(); await saved(page); expect(new Set((await tiles(page)).map(v => v.asset)).size).toBe(4);
});

test('a catalog ID reused for other bytes never removes or overwrites the original in a mixed pool', async ({ page }) => {
  const original = await page.evaluate(async key => {
    const { readDraft, saveDraft } = await import('/src/editor/storage.ts'), { imageHash, WATERMARK_PRESETS } = await import('/src/editor/watermark-library.ts');
    const d = (await readDraft())!, preset = WATERMARK_PRESETS.find(p => p.key === key)!;
    const c = document.createElement('canvas'); c.width = c.height = 32; c.getContext('2d')!.fillRect(8, 8, 16, 16); const b = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));
    d.document.assets.push({ id: preset.assetId, name: '我的原图.png', mime: 'image/png', width: 32, height: 32 });
    const w = d.document.chapters[0].spreads[0].pages[0].watermark; w.mix = { enabled: true, items: [{ assetId: preset.assetId }], seed: 0, angleRange: 28, upright: .35 }; w.opacity = .4; w.mode = 'repeat';
    await saveDraft(d.document, new Map([[preset.assetId, b]]), d.version); return { id: preset.assetId, hash: await imageHash(b) };
  }, keys[0]);
  await page.reload(); await saved(page); await page.locator('#open-watermarks').click(); await choice(page, keys[0]).click(); await expect(page.locator('.editor-mix-item')).toHaveCount(2); await saved(page);
  const result = await page.evaluate(async () => { const d = (await (await import('/src/editor/storage.ts')).readDraft())!; return Promise.all(d.document.chapters[0].spreads[0].pages[0].watermark.mix!.items.map(async i => ({ ...i, hash: await (await import('/src/editor/watermark-library.ts')).imageHash(d.assets.get(i.assetId)!) }))); });
  expect(result[0]).toEqual({ assetId: original.id, hash: original.hash }); expect(result[1].assetId).not.toBe(original.id); expect(`wm-${result[1].hash}`).toBe(original.id);
  await choice(page, keys[0]).click(); await expect(page.locator('.editor-mix-item')).toHaveCount(1); await page.locator('#undo').click(); await expect(page.locator('.editor-mix-item')).toHaveCount(2);
});

test('moving duplex leaf carries the same mixed images and angles on its front and back', async ({ page }) => {
  await page.getByLabel('页面设置应用到').selectOption('spread'); await mix(page); await page.getByRole('button', { name: '复制跨页', exact: true }).click();
  await page.locator('#preview').click(); await expect(page.locator('#preview-frame')).toHaveAttribute('src', /album-preview/); const src = (await page.locator('#preview-frame').getAttribute('src'))!, reader = await page.context().newPage();
  await reader.setViewportSize({ width: 1440, height: 1000 }); await reader.goto(src); await expect(reader.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  const expected = await reader.locator('#book > .page-right .album-watermark-tile').evaluateAll(nodes => nodes.map(n => ({ asset: (n as HTMLElement).dataset.watermarkAsset, transform: (n as HTMLElement).style.transform })));
  await reader.evaluate(() => {
    const style = document.createElement('style'); style.textContent = '.turn-leaf{animation-play-state:paused!important}'; document.head.append(style);
    (document.querySelector('#next') as HTMLButtonElement).click();
  });
  await expect(reader.locator('.turn-leaf')).toHaveCount(1);
  for (const face of ['leaf-front', 'leaf-back']) {
    expect(await reader.locator(`.${face} .album-watermark-tile`).evaluateAll(nodes => nodes.map(n => ({ asset: (n as HTMLElement).dataset.watermarkAsset, transform: (n as HTMLElement).style.transform })))).toEqual(expected);
    expect(await reader.locator(`.${face} img`).evaluateAll(images => images.every(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
  }
  await reader.locator('.turn-leaf').evaluate(e => e.getAnimations().forEach(a => a.finish())); await expect(reader.locator('#chapter-count')).toHaveText('02 / 02 跨页');
  expect(await reader.locator('#book > .page-left .album-watermark-tile').evaluateAll(nodes => nodes.map(n => ({ asset: (n as HTMLElement).dataset.watermarkAsset, transform: (n as HTMLElement).style.transform })))).toEqual(expected); await reader.close();
});

test('a late mixed selection cannot write into a replacement blank project', async ({ page }) => {
  await page.getByLabel('同页混用多款').check(); const preset = await page.evaluate(async key => (await import('/src/editor/watermark-library.ts')).WATERMARK_PRESETS.find(p => p.key === key)!, keys[0]);
  let resume!: () => void; const gate = new Promise<void>(r => { resume = r; });
  await page.route(preset.url, async route => { if (route.request().resourceType() === 'fetch') await gate; await route.continue(); });
  await choice(page, preset.key).click(); await expect(choice(page, preset.key)).toHaveAttribute('aria-busy', 'true');
  await page.locator('.editor-help summary').click(); await page.locator('#new-project').click(); const response = page.waitForResponse(r => r.request().resourceType() === 'fetch' && r.url().includes(preset.file)); resume(); await response;
  await expect(choice(page, preset.key)).toHaveAttribute('aria-busy', 'false'); await saved(page);
  const d = await page.evaluate(async () => (await (await import('/src/editor/storage.ts')).readDraft())!.document); expect(d.assets).toHaveLength(0); expect(d.chapters[0].spreads[0].pages[0].watermark.mix).toBeUndefined();
});
