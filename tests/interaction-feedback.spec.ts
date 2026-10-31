import { test, expect, type Page } from '@playwright/test';

async function isolatedPage(page: Page) {
  await page.route('**/__interaction-feedback', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>Room interaction feedback</title><style>
      :root { --room-paper:#f6efdf; --room-ink:#244840; --room-surface:#244840ef;
        --room-paper-border:#e4d9bd; --room-border:#ffffff44; --room-pill:24px;
        --room-shadow:0 4px 16px #142c2430; }
      #target { position:fixed; left:0; top:0; width:100vw; height:100vh; }
    </style><button id="target">Room scene</button><div id="host"></div>`,
  }));
  await page.goto('/__interaction-feedback');
  await page.evaluate(async () => {
    const { createInteractionFeedback } = await import('/src/interaction-feedback.ts');
    const host = window as any;
    host.__feedbackEvents = [];
    host.__feedback = createInteractionFeedback(document.getElementById('host')!, visible => host.__feedbackEvents.push(visible));
    host.__targetClicks = 0;
    document.getElementById('target')!.onclick = () => host.__targetClicks++;
  });
}

test('each object keeps its first explanation and uses shorter hover or nonverbal feedback after acceptance', async ({ page }) => {
  await isolatedPage(page);
  const feedback = page.locator('.scene-object-feedback'), label = feedback.locator('.scene-object-feedback-label');
  for (const [kind, name] of [['bouquet','花束'], ['book','纪念册'], ['cat','小猫'], ['record','唱片机']]) {
    await page.evaluate(kind => (window as any).__feedback.show(kind, '第一次操作说明', 240, 260, 'activate', 1700), kind);
    await expect(label).toHaveText('第一次操作说明');
    await expect(feedback).toHaveAttribute('data-quiet', 'false');
    await page.evaluate(kind => (window as any).__feedback.markUsed(kind), kind);
    // Accepting an action cannot retroactively erase its first confirmation.
    await expect(label).toHaveText('第一次操作说明');
    await page.evaluate(kind => (window as any).__feedback.show(kind, '不再重复的操作说明', 240, 260, 'hover'), kind);
    await expect(label).toHaveText(name);
    await page.evaluate(kind => (window as any).__feedback.show(kind, '不再重复的操作说明', 240, 260, 'press', 1600), kind);
    await expect(feedback).toHaveAttribute('data-quiet', 'true');
    await expect(label).toBeHidden();
    await expect(feedback.locator('.scene-object-feedback-point')).toBeVisible();
    await page.evaluate(kind => (window as any).__feedback.show(kind, '不再重复的操作说明', 240, 260, 'activate', 1700), kind);
    await expect(label).toBeEmpty();
  }
  // History is per object; the entry ritual retains its original explanation.
  await page.evaluate(() => {
    const feedback = (window as any).__feedback;
    feedback.markUsed('door'); feedback.show('door', '轻轻推开这扇门…', 240, 260, 'activate');
  });
  await expect(label).toHaveText('轻轻推开这扇门…');
  await expect(feedback).toHaveAttribute('data-quiet', 'false');
});

test('learning an object updates an existing hover and visibility callbacks follow actual visibility changes', async ({ page }) => {
  await isolatedPage(page);
  const now = new Date('2026-10-31T00:00:00Z');
  await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const label = page.locator('.scene-object-feedback-label');
  await page.evaluate(() => {
    const feedback = (window as any).__feedback;
    feedback.show('cat', '轻轻摸摸睡着的小猫', 240, 260, 'hover');
    feedback.markUsed('cat');
    feedback.show('cat', '轻轻摸摸睡着的小猫', 240, 260, 'hover');
  });
  await expect(label).toHaveText('小猫');
  expect(await page.evaluate(() => (window as any).__feedbackEvents)).toEqual([true]);
  await page.evaluate(() => {
    const feedback = (window as any).__feedback;
    feedback.show('cat', '', 240, 260, 'press', 500);
  });
  await page.clock.runFor(499); await expect(page.locator('.scene-object-feedback')).toBeVisible();
  await page.clock.runFor(1); await expect(page.locator('.scene-object-feedback')).toBeHidden();
  await page.evaluate(() => {
    const feedback = (window as any).__feedback;
    feedback.hide(); feedback.hide();
    feedback.show('book', '翻阅纪念册', 240, 260, 'hover');
    feedback.dispose(); feedback.dispose();
    feedback.show('cat', '', 240, 260, 'press');
  });
  await expect(page.locator('.scene-object-feedback')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__feedbackEvents)).toEqual([true, false, true, false]);
});

test('touch-sized nonverbal feedback remains inside the viewport and cannot intercept the scene in reduced motion', async ({ page }) => {
  await page.setViewportSize({ width:320, height:568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await isolatedPage(page);
  await page.evaluate(() => {
    const feedback = (window as any).__feedback;
    feedback.markUsed('record'); feedback.show('record', '已轻触唱片机', 2, 240, 'press', 1600);
  });
  const feedback = page.locator('.scene-object-feedback');
  await expect(feedback).toBeVisible();
  await expect(feedback).toHaveCSS('pointer-events', 'none');
  await expect(feedback).toHaveCSS('animation-name', 'none');
  const rect = await feedback.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  await page.mouse.click(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  expect(await page.evaluate(() => (window as any).__targetClicks)).toBe(1);
});

test('muted cat reactions explain once and retain a concise busy and ready description with cooldown recovery', async ({ page }) => {
  await page.route('**/__cat-feedback', route => route.fulfill({
    contentType:'text/html', body:'<!doctype html><title>Cat feedback</title><div id="app"></div>',
  }));
  await page.goto('/__cat-feedback');
  await page.evaluate(async () => {
    const { mountAppView } = await import('/src/app-view.ts');
    const { createSoundController } = await import('/src/sound-controller.ts');
    const { CAT_REACTIONS } = await import('/src/cat-reactions.ts');
    const host = window as any;
    mountAppView();
    document.getElementById('loading')!.remove();
    document.getElementById('intro')!.remove();
    document.getElementById('room-ui')!.classList.remove('hidden');
    document.getElementById('cozy-details')!.classList.remove('hidden');
    document.getElementById('pet-cat')!.classList.remove('hidden');
    host.__catFeedbackProfiles = CAT_REACTIONS;
    host.__catFeedbackSound = createSoundController({
      getState: () => 'room', getSceneAvailable: () => true,
      onRecordPlaying: () => {}, toast: () => {},
    });
    host.__petFeedbackIndex = 0;
    document.getElementById('pet-cat')!.onclick = () => {
      host.__petFeedbackClock = host.__catFeedbackSound.onCatPet(CAT_REACTIONS[host.__petFeedbackIndex]);
    };
  });
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-label','开启声音');
  const now = new Date('2026-10-31T00:00:00Z');
  await page.clock.install({time:now}); await page.clock.pauseAt(new Date(now.getTime()+1000));
  const button = page.locator('#pet-cat'), hint = page.locator('#pet-hint');
  const profiles = await page.evaluate(() => (window as any).__catFeedbackProfiles.map((profile:any)=>({duration:profile.duration,hint:profile.hint})));
  await button.click();
  await expect(hint).toHaveText(profiles[0].hint);
  await expect(button).toBeDisabled(); await expect(button).toHaveAttribute('data-busy','true');
  expect(await page.evaluate(() => (window as any).__petFeedbackClock)).toBeUndefined();
  await page.clock.runFor((profiles[0].duration+.2)*1000);
  await expect(button).toBeEnabled(); await expect(button).not.toHaveAttribute('data-busy','true');
  await expect(hint).toHaveText('可以再次抚摸');
  await page.evaluate(() => { (window as any).__petFeedbackIndex=1; });
  await button.click();
  await expect(hint).toHaveText('小猫正在回应');
  await expect(button).toHaveAttribute('aria-describedby','pet-hint');
  await expect(button).toBeDisabled();
  await page.clock.runFor((profiles[1].duration+.2)*1000);
  await expect(button).toBeEnabled(); await expect(hint).toHaveText('可以再次抚摸');
  await page.evaluate(() => (window as any).__catFeedbackSound.dispose());
});
