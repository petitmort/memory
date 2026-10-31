import { test, expect } from '@playwright/test';

test('visible room objects share immediate feedback and cancelled gestures never replay after interruption', async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors: string[] = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(); let body = await response.text();
    const marker = 'const ray = new THREE.Raycaster();';
    expect(body).toContain(marker);
    body = body.replace(marker, `
      const hotspotStats = { records: 0, interactions: 0, catRequests: 0, pets: 0, pointerId: 0 };
      const originalInteract = onInteract;
      onInteract = () => { hotspotStats.interactions++; originalInteract(); };
      // Transport/audio behavior has its own real-media regression. Count
      // accepted record presses here without downloading or playing a song.
      onRecord = () => { hotspotStats.records++; };
      const originalCatInteract = onCatInteract;
      onCatInteract = () => { hotspotStats.catRequests++; return originalCatInteract?.() ?? false; };
      const originalPet = cat.pet.bind(cat);
      cat.pet = (...args) => { const accepted = originalPet(...args); if (accepted) hotspotStats.pets++; return accepted; };
      renderer.domElement.addEventListener('pointerdown', e => { hotspotStats.pointerId = e.pointerId; });
      let blocker;
      const objects = { record: recordPlayer.group, bouquet, book, cat: cat.group };
      const anchor = kind => {
        scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        if (kind === 'cat') return lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .09, 0));
        const local = kind === 'record' ? new THREE.Vector3(.07, .104, -.004)
          : kind === 'bouquet' ? new THREE.Vector3(.06, .95, -.1) : new THREE.Vector3(0, .0352, 0);
        return local.applyMatrix4(objects[kind].matrixWorld);
      };
      window.__hotspots = {
        point(kind) {
          const projected = anchor(kind).project(camera);
          return { x: (projected.x + 1) * innerWidth / 2, y: (1 - projected.y) * innerHeight / 2 };
        },
        stats: () => ({ ...hotspotStats, capture: renderer.domElement.hasPointerCapture(hotspotStats.pointerId), cursor: renderer.domElement.style.cursor }),
        visible(kind, visible) { objects[kind].visible = visible; requestRender(); },
        blockRecord(enabled) {
          if (blocker) { scene.remove(blocker); blocker.geometry.dispose(); blocker.material.dispose(); blocker = undefined; }
          if (enabled) {
            const point = anchor('record'), direction = point.clone().sub(camera.position).normalize();
            blocker = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .08), new THREE.MeshBasicMaterial({ color: '#765941' }));
            blocker.position.copy(point).addScaledVector(direction, -.22); scene.add(blocker);
            blocker.updateMatrixWorld(true);
          }
          requestRender();
        },
      };
      ${marker}
    `);
    const apiMarker = '  return {\n    ready,';
    expect(body).toContain(apiMarker);
    body = body.replace(apiMarker, '  return window.__hotspots.api = {\n    ready,');
    body = body.replace('renderer.render(scene, camera);', 'renderer.render(scene, camera); window.__hotspotsViewport = innerWidth + ":" + innerHeight;');
    await route.fulfill({ response, body });
  });
  const point = (kind: string) => page.evaluate(kind => (window as any).__hotspots.point(kind), kind) as Promise<{ x: number; y: number }>;
  const stats = () => page.evaluate(() => (window as any).__hotspots.stats());
  const feedback = page.locator('.scene-object-feedback');
  async function press(kind: string) {
    const p = await point(kind);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, p)).toBe('CANVAS');
    await page.mouse.move(12, 100);
    await page.waitForTimeout(70);
    await page.mouse.move(p.x, p.y);
    await expect(feedback).toHaveAttribute('data-object', kind);
    await expect(feedback).toHaveAttribute('data-phase', 'hover');
    await page.mouse.down();
    await expect(feedback).toHaveAttribute('data-object', kind);
    await expect(feedback).toHaveAttribute('data-phase', 'press');
    expect((await stats()).capture).toBe(true);
    return p;
  }
  try {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 60000 });
    await page.locator('#enter').click(); await expect(page.locator('#enter')).toBeEnabled({ timeout: 30000 });
    await page.locator('#enter').click();
    await expect(page.locator('#room-ui')).toBeVisible({ timeout: 30000 });
    await expect(feedback).toBeHidden();

    await press('record'); await page.mouse.up();
    await expect(feedback).toHaveAttribute('data-phase', 'activate');
    await expect(feedback).toHaveAttribute('data-quiet', 'false');
    expect((await stats()).records).toBe(1);
    await press('record');
    await expect(feedback).toHaveAttribute('data-quiet', 'true');
    await page.mouse.up();
    expect((await stats()).records).toBe(2);

    // A hidden ancestor and an opaque object in front of the player both
    // remove the hotspot, even though its projected coordinates still exist.
    const record = await point('record');
    for (const mode of ['hidden', 'blocked']) {
      await page.evaluate(mode => {
        const probe = (window as any).__hotspots;
        probe.api.clearInteractionFeedback();
        if (mode === 'hidden') probe.visible('record', false); else probe.blockRecord(true);
      }, mode);
      await page.mouse.click(record.x, record.y);
      await expect(feedback).toBeHidden();
      expect((await stats()).records, mode).toBe(2);
      await page.evaluate(mode => {
        const probe = (window as any).__hotspots;
        if (mode === 'hidden') probe.visible('record', true); else probe.blockRecord(false);
      }, mode);
    }

    for (const interruption of ['background', 'resize', 'disable', 'cancel', 'lost-capture']) {
      await press('record');
      await page.evaluate(interruption => {
        const probe = (window as any).__hotspots, canvas = document.querySelector('#world canvas')! as HTMLCanvasElement;
        if (interruption === 'background') {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
          delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange'));
        } else if (interruption === 'resize') window.dispatchEvent(new Event('resize'));
        else if (interruption === 'disable') { probe.api.setInteractionEnabled(false); probe.api.setInteractionEnabled(true); }
        else if (interruption === 'cancel') canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: probe.stats().pointerId, pointerType: 'mouse', isPrimary: true, button: 0, bubbles: true }));
        else canvas.releasePointerCapture(probe.stats().pointerId);
      }, interruption);
      // Force native lostpointercapture delivery while the mouse is still held.
      await page.mouse.move(record.x + 1, record.y);
      expect((await stats()).capture).toBe(false);
      await page.mouse.up();
      expect((await stats()).records, interruption).toBe(2);
      expect((await stats()).interactions, interruption).toBe(0);
    }
    await press('record');
    await page.mouse.move(record.x + 14, record.y);
    await page.mouse.move(record.x, record.y); await page.mouse.up();
    expect((await stats()).records).toBe(2);

    // A second finger cancels the first, and a later single touch is fresh.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: record.x, y: record.y, id: 11 }] });
    await expect(feedback).toHaveAttribute('data-phase', 'press');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: record.x, y: record.y, id: 11 }, { x: record.x + 22, y: record.y + 5, id: 12 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await stats()).records).toBe(2);
    await cdp.detach();
    await page.touchscreen.tap(record.x, record.y);
    expect((await stats()).records).toBe(3);

    // Starting a real view transition also invalidates a held record press.
    await press('record');
    await page.evaluate(() => document.getElementById('cozy-view')!.click());
    expect((await stats()).capture).toBe(false);
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.up();
    expect((await stats()).records).toBe(3);
    await page.locator('#cozy-view').click();
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#cozy-view')).toBeEnabled();

    // The cat is deliberately at the edge of the wide desktop composition.
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForFunction(() => (window as any).__hotspotsViewport === '1600:900');
    const cat = await press('cat');
    // Sum a short back-and-forth stroke while remaining on the small model.
    await page.mouse.move(cat.x + 5, cat.y);
    await page.mouse.move(cat.x, cat.y + 5);
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'true');
    expect((await stats()).capture).toBe(false);
    expect((await stats()).cursor).toBe('default');
    await page.mouse.up();
    await expect.poll(async () => (await stats()).pets).toBe(1);
    expect((await stats()).catRequests).toBe(1);
    await page.locator('#cozy-view').click();
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#cozy-view')).toBeEnabled();

    await press('bouquet'); await page.mouse.up();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 60000 });
    expect((await stats()).interactions).toBe(1);
    await page.locator('#close-book').click();
    await expect(page.locator('#room-ui')).toBeVisible({ timeout: 30000 });
    await press('book'); await page.mouse.up();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 60000 });
    expect((await stats()).interactions).toBe(2);
    await page.locator('#close-book').click();
    await expect(page.locator('#room-ui')).toBeVisible({ timeout: 30000 });

    await press('record');
    await page.evaluate(() => document.querySelector('#world canvas')!.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    expect((await stats()).capture).toBe(false);
    await page.mouse.up();
    expect((await stats()).records).toBe(3);
    await expect(page.locator('#fallback')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
