import { test, expect, type Page } from '@playwright/test';

/** Real DOM, styles and artwork, with no scene/GPU needed for chapter controls. */
async function fixture(page: Page, reduced = true, initialChapter = 0) {
  await page.route('**/__reader-controller-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
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
  await page.goto('/__reader-controller-test');
  await page.evaluate(async ({ reducedMotion, initialChapter }) => {
    const { createReaderController } = await import('/src/reader-controller.ts');
    const host = window as any;
    host.__readerCanRead = true;
    host.__readerCloses = 0;
    host.__readerController = createReaderController({
      canRead: () => host.__readerCanRead,
      reducedMotion,
      initialChapter,
      onClose: () => {
        host.__readerCloses++;
        host.__readerCanRead = false;
        host.__readerController.cancelTurn();
      },
    });
    host.__readerController.render();
  }, { reducedMotion: reduced, initialChapter });
}

test('chapter contents, arrow keys and return use one retained reading position', async ({ page }) => {
  await fixture(page);
  const toggle = page.locator('#chapter-contents-toggle'), contents = page.locator('#chapter-contents');
  await expect(page.locator('.keyboard-hint')).toHaveText('← → 切换章节 · ESC 返回');
  await expect(contents).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(contents.locator('button').first()).toHaveAttribute('aria-current', 'page');
  await expect(contents.locator('button').first()).toBeFocused();
  await contents.locator('[data-chapter="3"]').click();
  await expect(page.locator('#chapter-title')).toHaveText('潮水会替我记得');
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
  await expect(contents).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(page.locator('#next')).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#chapter-title')).toHaveText('我们看过的远方');
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(contents).toBeHidden();
  await expect(toggle).toBeFocused();
  expect(await page.evaluate(() => (window as any).__readerCloses)).toBe(0);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).__readerCloses)).toBe(1);
  await page.evaluate(() => { const host = window as any; host.__readerCanRead = true; host.__readerController.render(); });
  await expect(page.locator('#chapter-title')).toHaveText('我们看过的远方');
  expect(await page.evaluate(() => (window as any).__readerController.getChapter())).toBe(2);
});

test('chapter animations reject repeats, cancel timers, and unlock for the next visit', async ({ page }) => {
  await fixture(page, false);
  await page.locator('#next').click();
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#next')).toBeDisabled();
  await expect(page.locator('#chapter-contents-toggle')).toBeDisabled();
  expect(await page.locator('#chapter-dots button').evaluateAll(buttons => buttons.every(button => (button as HTMLButtonElement).disabled))).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.evaluate(() => {
    const host = window as any;
    host.__readerCanRead = false;
    host.__readerController.cancelTurn();
  });
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as any).__readerController.getChapter())).toBe(0);
  await expect(page.locator('.turn-leaf')).toHaveCount(0);
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => { (window as any).__readerCanRead = true; });
  await page.locator('#next').click();
  await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#next')).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__readerController.getChapter())).toBe(1);
});

test('small, portrait, landscape and desktop reading keep text scrollable and controls reachable', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await fixture(page);
    const layout = await page.evaluate(() => {
      const book = document.querySelector<HTMLElement>('#book')!;
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
      return {
        width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
        close: rect('#close-book'), contents: rect('#chapter-contents-toggle'), previous: rect('#prev'), next: rect('#next'),
        book: rect('#book'), bookClient: book.clientHeight, bookScroll: book.scrollHeight,
        bodyFont: parseFloat(getComputedStyle(document.querySelector('.story-note')!).fontSize),
        captionFont: parseFloat(getComputedStyle(document.querySelector('.photo-caption')!).fontSize),
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(viewport.width);
    expect(layout.bodyFont).toBeGreaterThanOrEqual(16);
    expect(layout.captionFont).toBeGreaterThanOrEqual(14);
    for (const rect of [layout.close, layout.contents, layout.previous, layout.next]) {
      expect(rect.top).toBeGreaterThanOrEqual(-1);
      expect(rect.bottom).toBeLessThanOrEqual(viewport.height + 1);
      expect(rect.left).toBeGreaterThanOrEqual(-1);
      expect(rect.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    if (viewport.height < 600 || viewport.width < 760) expect(layout.bookScroll).toBeGreaterThan(layout.bookClient);
    await page.locator('#book').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const note = await page.locator('#chapter-note').boundingBox();
    expect(note!.y + note!.height).toBeLessThanOrEqual(layout.book.bottom + 1);
    await page.locator('#chapter-contents-toggle').click();
    const panel = await page.locator('#chapter-contents').boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.keyboard.press('Escape');
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press('Tab');
      expect(await page.locator('#reader').evaluate(element => element.contains(document.activeElement))).toBe(true);
      expect(await page.locator('#chapter-contents').evaluate(element => element.contains(document.activeElement))).toBe(false);
    }
  }
});

test('disposing the reader releases pending navigation and keyboard handlers', async ({ page }) => {
  await fixture(page, false);
  await page.locator('#next').click();
  await page.evaluate(() => (window as any).__readerController.dispose());
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as any).__readerController.getChapter())).toBe(0);
  await expect(page.locator('.turn-leaf')).toHaveCount(0);
  await expect(page.locator('#chapter-contents')).toHaveCount(0);
  await expect(page.locator('#book')).toHaveAttribute('aria-busy', 'false');
});

test('a scene retry can restore its last chapter without changing fresh-page defaults', async ({ page }) => {
  await fixture(page, true, 2);
  await expect(page.locator('#chapter-title')).toHaveText('我们看过的远方');
  await expect(page.locator('#next')).toBeEnabled();
  await fixture(page);
  await expect(page.locator('#chapter-title')).toHaveText('风经过的地方');
});
