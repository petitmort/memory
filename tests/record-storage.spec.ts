import { test, expect, type Page } from '@playwright/test';

async function blankOrigin(page: Page) {
  await page.route('**/__record-storage-test', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Local music storage</title>',
  }));
  await page.goto('/__record-storage-test');
}

test('saved audio survives a page reload with its exact bytes and file metadata', async ({ page }) => {
  await blankOrigin(page);
  expect(await page.evaluate(async () => {
    const { createRecordStorage } = await import('/src/record-storage.ts');
    const storage = createRecordStorage();
    const empty = await storage.read();
    await storage.save(new File([new Uint8Array([0, 255, 17, 90, 6])], '海边的小曲.mp3', {
      type: 'audio/mpeg', lastModified: 123456789,
    }));
    return empty === undefined;
  })).toBe(true);
  await page.reload();
  const restored = await page.evaluate(async () => {
    const { createRecordStorage } = await import('/src/record-storage.ts');
    const file = await createRecordStorage().read();
    return file && {
      name: file.name, type: file.type, modified: file.lastModified,
      bytes: [...new Uint8Array(await file.arrayBuffer())],
    };
  });
  expect(restored).toEqual({
    name: '海边的小曲.mp3', type: 'audio/mpeg', modified: 123456789,
    bytes: [0, 255, 17, 90, 6],
  });
});

test('rapid replacements leave only the newest selected file', async ({ page }) => {
  await blankOrigin(page);
  const restored = await page.evaluate(async () => {
    const { createRecordStorage } = await import('/src/record-storage.ts');
    const storage = createRecordStorage();
    await Promise.all([
      storage.save(new File([new Uint8Array(1024 * 1024)], 'first.wav')),
      storage.save(new File(['second'], 'second.mp3')),
      storage.save(new File(['last'], 'last.m4a')),
    ]);
    const file = await createRecordStorage().read();
    return file && { name: file.name, text: await file.text() };
  });
  expect(restored).toEqual({ name: 'last.m4a', text: 'last' });
});

test('restoring the default clears only the selected personal record in save order', async ({ page }) => {
  await blankOrigin(page);
  const cleared = await page.evaluate(async () => {
    const { createRecordStorage } = await import('/src/record-storage.ts');
    const storage = createRecordStorage();
    await Promise.all([storage.save(new File(['personal'], 'personal.mp3')), storage.clear()]);
    return (await createRecordStorage().read()) === undefined;
  });
  expect(cleared).toBe(true);
});

test('quota failure preserves the previous record and does not poison later saves', async ({ page }) => {
  await blankOrigin(page);
  const result = await page.evaluate(async () => {
    const { createRecordStorage } = await import('/src/record-storage.ts');
    const storage = createRecordStorage();
    await storage.save(new File(['old'], 'old.mp3'));
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException('Storage quota exceeded', 'QuotaExceededError'); };
    let failure = '';
    try { await storage.save(new File(['new'], 'new.mp3')); }
    catch (error) { failure = (error as DOMException).name; }
    finally { IDBObjectStore.prototype.put = original; }
    const previous = await storage.read();
    await storage.save(new File(['small'], 'smaller.mp3'));
    const next = await storage.read();
    return { failure, previous: previous?.name, next: next?.name };
  });
  expect(result).toEqual({ failure: 'QuotaExceededError', previous: 'old.mp3', next: 'smaller.mp3' });
});

test('unavailable browser storage rejects cleanly and malformed entries are ignored', async ({ page }) => {
  await blankOrigin(page);
  const result = await page.evaluate(async () => {
    const { createRecordStorage } = await import('/src/record-storage.ts');
    const storage = createRecordStorage();
    await storage.save(new File(['old'], 'old.mp3'));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('tideline-records', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('music', 'readwrite');
        transaction.objectStore('music').put({ name: 'broken.mp3', blob: 'not audio' }, 'current');
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onabort = () => { database.close(); reject(transaction.error); };
      };
    });
    const malformedIgnored = (await storage.read()) === undefined;
    Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Storage disabled', 'SecurityError'); } });
    const failures = await Promise.all([storage.read(), storage.save(new File(['new'], 'new.mp3'))]
      .map(promise => promise.then(() => 'unexpected success', error => error.name)));
    return { malformedIgnored, failures };
  });
  expect(result).toEqual({ malformedIgnored: true, failures: ['SecurityError', 'SecurityError'] });
});
