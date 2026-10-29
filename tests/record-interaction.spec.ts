import { test, expect } from '@playwright/test';

/** A quiet original tone, long enough not to end during a slow software-GPU run. */
function testRecord() {
  const rate = 8000, seconds = 180, samples = rate * seconds;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 320, (samples - i - 1) / 320);
    wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / rate) * 100 * fade), 44 + i * 2);
  }
  return wav;
}

test('the desk record accepts and remembers music, resumes in place and stays independent of reading, mute and touch', async ({ browser }) => {
  test.setTimeout(420000);
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep native-dialog interception enabled before the busy WebGL page loads.
  page.on('filechooser', () => {});
  await page.addInitScript(() => {
    const host = window as any;
    const stats = host.__recordStats = { contexts: 0, plays: 0, pauses: 0, targets: [] as number[], urls: [] as string[], revoked: [] as string[] };
    const NativeAudio = window.Audio;
    const TrackAudio = function (source?: string) {
      const element = source === undefined ? new NativeAudio() : new NativeAudio(source);
      host.__recordMedia = element;
      return element;
    };
    TrackAudio.prototype = NativeAudio.prototype;
    window.Audio = TrackAudio as unknown as typeof Audio;
    const play = HTMLMediaElement.prototype.play, pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function () {
      if (this === host.__recordMedia) stats.plays++;
      return play.call(this);
    };
    HTMLMediaElement.prototype.pause = function () {
      if (this === host.__recordMedia) stats.pauses++;
      return pause.call(this);
    };
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); stats.contexts++; host.__recordAmbient = this; }
    };
    const target = AudioParam.prototype.setTargetAtTime;
    AudioParam.prototype.setTargetAtTime = function (value, startTime, timeConstant) {
      stats.targets.push(value);
      return target.call(this, value, startTime, timeConstant);
    };
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = function (object) { const url = create.call(this, object); stats.urls.push(url); return url; };
    URL.revokeObjectURL = function (url) { stats.revoked.push(url); return revoke.call(this, url); };
  });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(); let body = await response.text();
    const marker = 'const ray = new THREE.Raycaster();';
    expect(body).toContain(marker);
    body = body.replace(marker, `
      window.__recordRoom = () => {
        scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        const point = new THREE.Vector3(.07, .104, -.004).applyMatrix4(recordPlayer.group.matrixWorld).project(camera);
        const bounds = object => {
          const box = new THREE.Box3().setFromObject(object, true);
          return { min: box.min.toArray(), max: box.max.toArray() };
        };
        // Instance bounds are generous. Use the photographed flower geometry
        // itself when checking the small gap beside the record player's knob.
        const flower = new THREE.Box3(), vertex = new THREE.Vector3(), instance = new THREE.Matrix4(), transform = new THREE.Matrix4();
        bouquet.traverse(object => {
          if (!object.isMesh) return;
          for (let ancestor = object; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return;
          const position = object.geometry.getAttribute('position');
          for (let n = 0; n < (object.isInstancedMesh ? object.count : 1); n++) {
            if (object.isInstancedMesh) { object.getMatrixAt(n, instance); transform.multiplyMatrices(object.matrixWorld, instance); }
            else transform.copy(object.matrixWorld);
            for (let i = 0; i < position.count; i++) flower.expandByPoint(vertex.fromBufferAttribute(position, i).applyMatrix4(transform));
          }
        });
        return {
          point: { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2 },
          playing: recordPlayer.group.userData.playing === true,
          player: bounds(recordPlayer.group), tabletop: bounds(tabletop), cup: bounds(cup), letter: bounds(letter),
          flower: { min: flower.min.toArray(), max: flower.max.toArray() }, parked: bouquetParked,
        };
      };
      ${marker}
    `);
    body = body.replace('renderer.render(scene, camera);', `
      renderer.render(scene, camera);
      window.__recordRenderedViewport = innerWidth + ':' + innerHeight;
    `);
    await route.fulfill({ response, body });
  });
  const media = () => page.evaluate(() => {
    const audio = (window as any).__recordMedia as HTMLAudioElement;
    return { time: audio.currentTime, paused: audio.paused, muted: audio.muted, source: audio.src, duration: audio.duration,
      ready: audio.readyState, network: audio.networkState, currentSource: audio.currentSrc, error: audio.error?.message,
      stats: { ...(window as any).__recordStats } };
  });
  const room = () => page.evaluate(() => (window as any).__recordRoom());
  const playing = async () => {
    await expect(page.locator('#record-toggle')).toHaveAttribute('aria-label', '暂停唱片');
    try { await expect(page.locator('#record-status')).toContainText('播放中', { timeout: 30000 }); }
    catch (error) { console.log('Music startup state:', await media()); throw error; }
  };
  const paused = () => expect(page.locator('#record-toggle')).toHaveAttribute('aria-label', '播放唱片');
  try {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 60000 });
    expect((await media()).stats.plays).toBe(0);
    await expect(page.locator('#record-toggle')).toBeHidden();
    await page.locator('#enter').click(); await expect(page.locator('#enter')).toBeEnabled();
    await page.locator('#enter').click(); await expect(page.locator('#room-ui')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#record-toggle')).toHaveAttribute('aria-label', '上传音乐');
    await expect(page.locator('#record-status')).toHaveText('上传一首你喜欢的音乐，轻触唱片机播放。');
    await expect(page.locator('#record-track')).toBeHidden();
    const initial = await room();
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, initial.point)).toBe('CANVAS');
    const choose = page.waitForEvent('filechooser', { timeout: 30000 });
    await page.mouse.click(initial.point.x, initial.point.y);
    await (await choose).setFiles({ name: 'test-record.wav', mimeType: 'audio/wav', buffer: testRecord() });
    await playing();
    await expect.poll(() => page.evaluate(() => (window as any).__recordMedia.paused)).toBe(false);
    expect((await room()).playing).toBe(true);
    await expect(page.locator('#record-track')).toHaveText('test-record');
    await expect(page.locator('#choose-record')).toHaveText('更换音乐');
    expect((await media()).stats.contexts).toBe(1);
    expect((await media()).stats.targets).toContain(.065);
    expect((await media()).stats.targets).toContain(.032);

    // A native pause/resume must retain an already-listened position, rather
    // than pass merely because a new record started near zero a moment ago.
    await page.evaluate(() => { (window as any).__recordMedia.currentTime = 9.5; });
    await page.waitForFunction(() => !(window as any).__recordMedia.seeking);
    await page.mouse.click(initial.point.x, initial.point.y); await paused();
    const stopped = await media(); expect(stopped.paused).toBe(true); expect(stopped.time).toBeGreaterThanOrEqual(9.45);
    await page.waitForTimeout(200);
    expect((await media()).time).toBeCloseTo(stopped.time, 3);
    expect((await room()).playing).toBe(false);
    await page.mouse.click(initial.point.x, initial.point.y); await playing();
    const resumed = await media(); expect(resumed.time).toBeGreaterThanOrEqual(stopped.time - .05);
    expect(resumed.source).toBe(stopped.source);
    expect(resumed.stats.plays).toBe(stopped.stats.plays + 1);

    await page.locator('#sound').click();
    const muted = await media(); expect(muted.muted).toBe(true); expect(muted.paused).toBe(false);
    await page.waitForFunction(time => (window as any).__recordMedia.currentTime > time + .1, muted.time);
    await page.locator('#sound').click(); expect((await media()).muted).toBe(false);

    // Captured drags ending over the album control are consumed as a record
    // gesture; they cannot unexpectedly open the book or toggle the music.
    const playsBeforeDrag = (await media()).stats.plays;
    const open = await page.locator('#open-book').boundingBox();
    await page.mouse.move(initial.point.x, initial.point.y); await page.mouse.down();
    await page.mouse.move(open!.x + open!.width / 2, open!.y + open!.height / 2, { steps: 4 }); await page.mouse.up();
    await expect(page.locator('#reader')).toBeHidden();
    expect((await media()).stats.plays).toBe(playsBeforeDrag);
    expect((await media()).paused).toBe(false);

    await page.locator('#open-book').click();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 60000 });
    const reading = await media(); expect(reading.paused).toBe(false);
    await page.waitForFunction(time => (window as any).__recordMedia.currentTime > time + .1, reading.time);
    await page.locator('#close-book').click(); await expect(page.locator('#room-ui')).toBeVisible({ timeout: 60000 });
    const layout = await room(); expect(layout.parked).toBe(true);
    expect(layout.flower.min[2] - layout.player.max[2]).toBeGreaterThan(.01);
    expect(layout.player.min[1]).toBeCloseTo(layout.tabletop.max[1], 3);
    expect(layout.cup.min[1]).toBeCloseTo(layout.tabletop.max[1], 3);
    expect(layout.letter.min[1]).toBeGreaterThanOrEqual(layout.tabletop.max[1] - .0001);
    expect(layout.letter.min[1]).toBeLessThan(layout.tabletop.max[1] + .001);
    expect(layout.player.min[2]).toBeGreaterThanOrEqual(layout.tabletop.min[2] - .001);
    expect((await media()).paused).toBe(false);
    await page.screenshot({ path: 'test-results/record-player-desktop.png' });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => (window as any).__recordRenderedViewport === '390:844');
    const phone = await room();
    expect(phone.point.x).toBeGreaterThan(20); expect(phone.point.x).toBeLessThan(370);
    expect(phone.point.y).toBeGreaterThan(200); expect(phone.point.y).toBeLessThan(620);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, phone.point)).toBe('CANVAS');
    await page.touchscreen.tap(phone.point.x, phone.point.y); await paused();
    await expect(page.locator('#reader')).toBeHidden();
    expect((await media()).paused).toBe(true);
    await page.touchscreen.tap(phone.point.x, phone.point.y); await playing();
    await page.screenshot({ path: 'test-results/record-player-mobile.png' });

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await paused();
    const hidden = await media(); expect(hidden.paused).toBe(true);
    await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(200);
    expect((await media()).paused).toBe(true);
    expect((await media()).time).toBeCloseTo(hidden.time, 3);
    expect((await media()).stats.plays).toBe(hidden.stats.plays);

    // The visible keyboard transport uses the same track, and replacement
    // releases the prior local URL instead of retaining an old music file.
    await page.locator('#record-toggle').focus(); await page.keyboard.press('Enter'); await playing();
    const beforeReplacement = await media();
    const replacement = page.waitForEvent('filechooser', { timeout: 30000 }); await page.locator('#choose-record').click();
    await (await replacement).setFiles({ name: 'replacement-record.wav', mimeType: 'audio/wav', buffer: testRecord() });
    await playing();
    const replaced = await media();
    expect(replaced.source).not.toBe(beforeReplacement.source);
    expect(replaced.stats.revoked).toContain(beforeReplacement.source);
    expect(replaced.stats.contexts).toBe(1);
    await expect(page.locator('#choose-record')).toHaveAttribute('title', 'replacement-record');
    await expect(page.locator('#record-track')).toHaveText('replacement-record');
    await expect(page.locator('#toast')).toHaveText('音乐已保存到此浏览器，下次无需重新上传。');

    // Music uses the native media device even if the separate room-effects
    // device cannot resume. The global mute preference must stay consistent.
    await page.locator('#sound').click(); expect((await media()).muted).toBe(true);
    await page.evaluate(() => {
      const host = window as any, context = host.__recordAmbient;
      host.__restoreAmbientResume = context.resume;
      context.resume = () => Promise.reject(new DOMException('Device interrupted', 'NotAllowedError'));
    });
    await page.locator('#sound').click();
    await expect(page.locator('#toast')).toHaveText('此浏览器暂时无法播放环境声');
    await expect(page.locator('#sound')).toHaveAttribute('aria-label', '关闭声音');
    const independent = await media(); expect(independent.muted).toBe(false); expect(independent.paused).toBe(false);
    await page.evaluate(() => { const host = window as any; host.__recordAmbient.resume = host.__restoreAmbientResume; });

    // A new document restores the actual audio bytes and filename without a
    // file picker or autoplay. Only the user's next click starts the record.
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden({ timeout: 60000 });
    await expect(page.locator('#record-track')).toHaveText('replacement-record');
    await paused();
    const restored = await media();
    expect(restored.stats.plays).toBe(0); expect(restored.paused).toBe(true);
    expect(restored.source).toMatch(/^blob:/); expect(restored.source).not.toBe(replaced.source);
    expect(await page.locator('#record-file').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
    await page.locator('#enter').click(); await expect(page.locator('#enter')).toBeEnabled();
    await page.locator('#enter').click(); await expect(page.locator('#room-ui')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#choose-record')).toHaveText('更换音乐');
    await page.locator('#record-toggle').click(); await playing();
    expect((await media()).duration).toBeCloseTo(180, 2);

    // Storage failures cannot block playback or falsely claim the new song
    // was saved. Keep the old saved file intact for the next visit.
    await page.evaluate(() => {
      const host = window as any;
      host.__restoreMusicStorageOpen = indexedDB.open;
      indexedDB.open = () => { throw new DOMException('Storage is full', 'QuotaExceededError'); };
    });
    await page.locator('#record-file').setInputFiles({ name: 'unsaved-record.wav', mimeType: 'audio/wav', buffer: testRecord() });
    await playing();
    await expect(page.locator('#record-track')).toHaveText('unsaved-record');
    await expect(page.locator('#toast')).toHaveText('这首音乐暂未保存，本次仍可播放；请检查浏览器存储空间。');
    expect((await media()).paused).toBe(false);
    await page.evaluate(() => { indexedDB.open = (window as any).__restoreMusicStorageOpen; });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
