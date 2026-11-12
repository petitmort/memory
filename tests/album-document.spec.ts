import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.goto('/editor.html'); });

test('all six templates and duplicate spreads retain text, originals and crop', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), doc = m.newDocument(), page = doc.chapters[0].spreads[0].pages[0];
    const photo = page.elements.find(e => e.type === 'photo') as any, text = page.elements.find(e => e.type === 'text') as any;
    photo.crop = { zoom: 2.3, x: 28, y: 70, rotation: 15 }; text.text = '手写自己的故事\n第二行';
    for (const template of Object.keys(m.TEMPLATE_NAMES)) m.applyTemplate(page, template as any);
    const clone = m.duplicateSpread(doc.chapters[0].spreads[0]);
    return { text: page.elements.find(e => e.id === text.id), crop: (page.elements.find(e => e.id === photo.id) as any).crop, count: page.elements.filter(e => e.type === 'photo').length,
      distinct: clone.id !== doc.chapters[0].spreads[0].id && clone.pages[0].id !== page.id && clone.pages[0].elements.every((e, i) => e.id !== page.elements[i].id) };
  });
  expect(result.text.text).toBe('手写自己的故事\n第二行'); expect(result.crop).toEqual({ zoom: 2.3, x: 28, y: 70, rotation: 15 }); expect(result.count).toBe(4); expect(result.distinct).toBe(true);
});
test('document validation rejects unsafe paths, missing references, duplicate IDs and invalid styles', async ({ page }) => {
  const rejected = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts');
    const edits = [d => d.schemaVersion = 2, d => d.title = '<script>text only</script>', d => d.chapters[0].id = d.id,
      d => d.chapters[0].spreads[0].pages[0].paper.tint = 'url(javascript:alert(1))', d => d.chapters[0].spreads[0].pages[0].elements[0].assetId = 'missing',
      d => d.chapters[0].spreads[0].pages[0].watermark.opacity = NaN, d => d.chapters[0].spreads[0].pages[0].layout.columns = 1.5,
      d => d.assets.push({ id: m.id(), name: 'bad', mime: 'image/png', width: 1, height: 1, src: 'https://evil.test/a.png' })];
    return edits.map(edit => { const d = m.newDocument(); edit(d as any); try { m.validateDocument(d); return false; } catch { return true; } });
  });
  // Text is deliberately inert plain text; all malformed structure is rejected.
  expect(rejected).toEqual([true, false, true, true, true, true, true, true]);
});
test('paper, grids and all watermark modes render deterministically without changing content', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { newDocument } = await import('/src/album/document.ts'), { renderAlbumPage } = await import('/src/album/renderer.ts');
    const p = newDocument().chapters[0].spreads[0].pages[0], host = document.createElement('article');
    const paths = new Set<string>(); for (const motif of ['paw', 'flower', 'shell', 'star', 'leaf']) {
      p.watermark.motif = motif as any; p.watermark.opacity = .12; p.watermark.mode = 'repeat'; renderAlbumPage(host, p, { resolveAsset: () => undefined }); paths.add(host.querySelector('path')!.getAttribute('d')!);
    }
    const before = JSON.stringify(p); renderAlbumPage(host, p, { resolveAsset: () => undefined }); const first = host.outerHTML;
    renderAlbumPage(host, p, { resolveAsset: () => undefined });
    const repeated = first === host.outerHTML, counts = [];
    for (const mode of ['single', 'corner', 'border', 'repeat']) { p.watermark.mode = mode as any; renderAlbumPage(host, p, { resolveAsset: () => undefined }); counts.push(host.querySelectorAll('.album-watermark-tile').length); }
    p.watermark.opacity = 0; renderAlbumPage(host, p, { resolveAsset: () => undefined });
    return { distinct: paths.size, repeated, unchanged: before === JSON.stringify({ ...p, watermark: { ...p.watermark, mode: 'repeat', opacity: .12 } }), counts, none: host.querySelectorAll('.album-watermark-tile').length };
  });
  expect(result).toEqual({ distinct: 5, repeated: true, unchanged: true, counts: [1, 2, 24, 18], none: 0 });
});
test('editable backup roundtrip preserves original image, type, crop and text; public output is optimized', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), p = await import('/src/editor/packages.ts');
    const canvas = document.createElement('canvas'); canvas.width = 2600; canvas.height = 1800; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#be8565'; ctx.fillRect(0, 0, 2600, 1800);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
    const imported = await p.importImage(new File([blob], '自己的照片.png', { type: blob.type })), doc = m.newDocument(), blobs = new Map([[imported.asset.id, imported.blob]]);
    doc.assets.push(imported.asset); const photo = doc.chapters[0].spreads[0].pages[0].elements[0] as any; photo.assetId = imported.asset.id; photo.crop.zoom = 1.8;
    const backup = await p.exportPackage(doc, blobs, false, await p.contentHash(null)), restored = await p.importPackage(backup);
    const publicBlob = await p.exportPackage(doc, blobs, true, await p.contentHash(null)), pack = JSON.parse(await publicBlob.text());
    const a = new Uint8Array(await restored.assets.get(imported.asset.id)!.arrayBuffer()), b = new Uint8Array(await blob.arrayBuffer());
    return { equal: a.length === b.length && a.every((n, i) => n === b[i]), doc: JSON.stringify(doc) === JSON.stringify(restored.document), format: pack.format, width: pack.document.assets[0].width, type: pack.document.assets[0].mime, crop: pack.document.chapters[0].spreads[0].pages[0].elements[0].crop.zoom };
  });
  expect(result).toEqual({ equal: true, doc: true, format: 'tides-album-content', width: 2000, type: 'image/webp', crop: 1.8 });
});
test('invalid or incomplete project packages fail before replacing content', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), p = await import('/src/editor/packages.ts');
    const d = m.newDocument(), a = { id: m.id(), name: 'bad.png', mime: 'image/png', width: 1, height: 1 }; d.assets.push(a);
    const attempts = [{ format: 'tides-album-content', version: 1, document: d, assets: [] }, { format: 'tides-album-project', version: 1, document: d, assets: [] }, { format: 'tides-album-project', version: 1, document: d, assets: [{ id: a.id, data: 'data:image/png;base64,eA==' }] }];
    return Promise.all(attempts.map(async input => { try { await p.importPackage(new Blob([JSON.stringify(input)])); return false; } catch { return true; } }));
  });
  expect(result).toEqual([true, true, true]);
});
