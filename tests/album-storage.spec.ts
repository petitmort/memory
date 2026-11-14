import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.goto('/album-preview.html'); });
test('autosave resolves only after the committed document is readable', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), s = await import('/src/editor/storage.ts'), d = m.newDocument(); d.title = '提交后才能报成功';
    const version = await s.saveDraft(d, new Map(), 0), read = await s.readDraft();
    return { version, storedVersion: read!.version, title: read!.document.title };
  }); expect(result).toEqual({ version: 1, storedVersion: 1, title: '提交后才能报成功' });
});
test('concurrent compare-and-write accepts one writer and preserves the winning draft', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { newDocument } = await import('/src/album/document.ts'), s = await import('/src/editor/storage.ts');
    const a = newDocument(), b = newDocument(); a.title = '甲'; b.title = '乙';
    const results = await Promise.allSettled([s.saveDraft(a, new Map(), 0), s.saveDraft(b, new Map(), 0)]), saved = await s.readDraft();
    return { results: results.map(r => r.status), error: (results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.message, title: saved!.document.title, version: saved!.version };
  }); expect(result.results.sort()).toEqual(['fulfilled', 'rejected']); expect(result.error).toContain('另一标签页'); expect(['甲', '乙']).toContain(result.title); expect(result.version).toBe(1);
});
test('missing assets and aborted transactions never replace the last saved draft', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), s = await import('/src/editor/storage.ts'), d = m.newDocument();
    d.title = '最后一次成功保存'; await s.saveDraft(d, new Map(), 0);
    const original = IDBObjectStore.prototype.put; let failed = false;
    IDBObjectStore.prototype.put = function(value, key) { const request = original.call(this, value, key); if (this.name === 'drafts') this.transaction.abort(); return request; };
    try { d.title = '不能提交'; await s.saveDraft(d, new Map(), 1); } catch { failed = true; } finally { IDBObjectStore.prototype.put = original; }
    const read = await s.readDraft(); d.assets.push({ id: m.id(), name: '丢失.png', mime: 'image/png', width: 1, height: 1 });
    let missing = false; try { await s.saveDraft(d, new Map(), 1); } catch { missing = true; }
    return { failed, missing, title: read!.document.title, version: read!.version };
  }); expect(result).toEqual({ failed: true, missing: true, title: '最后一次成功保存', version: 1 });
});
test('preview is an immutable private snapshot, not a live draft', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { newDocument } = await import('/src/album/document.ts'), s = await import('/src/editor/storage.ts'), d = newDocument(); d.title = '预览快照';
    const token = await s.savePreview(d, new Map()); d.title = '继续修改'; const preview = await s.readPreview(token);
    return { title: preview.document.title, draft: await s.readDraft() };
  }); expect(result).toEqual({ title: '预览快照', draft: undefined });
});
