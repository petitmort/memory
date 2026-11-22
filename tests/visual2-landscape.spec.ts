import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, enterFixtureRoom, finishSceneStep } from './helpers/experience-scene';
import { openRoomSettings } from './helpers/room-settings';

const primaryActions = ['open-book', 'cozy-view', 'room-settings'];
const toolActions = ['choose-record', 'room-light', 'time-flow'];

async function reachable(page: Page, ids: string[]) {
  for (const id of ids) {
    const control = page.locator('#' + id);
    await expect(control).toBeVisible();
    await control.scrollIntoViewIfNeeded();
    await expect(async () => {
      const state = await control.evaluate(element => {
        const r = element.getBoundingClientRect();
        return { width: r.width, height: r.height,
          withinViewport: r.left >= -.5 && r.top >= -.5 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5,
          centreHit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      });
      expect(state.width, id).toBeGreaterThanOrEqual(44);
      expect(state.height, id).toBeGreaterThanOrEqual(44);
      expect(state.withinViewport, id).toBe(true);
      expect(state.centreHit, id).toBe(true);
    }).toPass({ timeout: 5000 });
  }
}

async function siblingPanels(page: Page, selector: string) {
  await expect(page.locator(selector)).toBeVisible();
  await expect(async () => {
    const state = await page.evaluate(selector => {
      const panel = document.querySelector(selector)!.getBoundingClientRect();
      const overlaps = ['room-ui', 'room-settings-menu'].filter(id => {
        const element = document.getElementById(id)!;
        if (!element.checkVisibility()) return false;
        const r = element.getBoundingClientRect();
        return Math.min(panel.right, r.right) - Math.max(panel.left, r.left) > .5
          && Math.min(panel.bottom, r.bottom) - Math.max(panel.top, r.top) > .5;
      });
      return { overlaps, outside: panel.left < -.5 || panel.top < -.5 || panel.right > innerWidth + .5 || panel.bottom > innerHeight + .5 };
    }, selector);
    expect(state).toEqual({ overlaps: [], outside: false });
  }).toPass({ timeout: 5000 });
}

for (const [width, height] of [[670, 344], [759, 390], [760, 390], [844, 390], [1024, 500]]) {
  test(`short-landscape breakpoint keeps compact actions and keyboard tools usable ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
    await reachable(page, primaryActions);
    const compact = await page.locator('#room-ui').boundingBox();
    expect(compact!.height).toBeLessThanOrEqual(125);
    await openRoomSettings(page);
    await reachable(page, toolActions);
    if (width >= 760) {
      // The new desktop-camera layout must not grow toward the cat when the
      // disclosure opens. The narrower legacy mobile-camera layout is retained.
      const expanded = await page.locator('#room-ui').boundingBox();
      expect(expanded!.y).toBeCloseTo(compact!.y, 1);
      expect(expanded!.height).toBeCloseTo(compact!.height, 1);
    }
    await reachable(page, primaryActions);
    await page.locator('#room-light').focus(); await page.keyboard.press('Enter');
    await siblingPanels(page, '#room-light-panel');
    await page.locator('#room-light-brightness').fill('67');
    await page.keyboard.press('Escape'); await expect(page.locator('#room-light')).toBeFocused();
    await page.locator('#time-flow').focus(); await page.keyboard.press('Enter');
    await page.locator('#time-flow-free').check();
    await siblingPanels(page, '#time-flow-panel');
    await page.keyboard.press('Escape'); await expect(page.locator('#time-flow')).toBeFocused();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#choose-record').click(); await (await chooser).setFiles([]);
    await siblingPanels(page, '#record-panel');
    await page.keyboard.press('Escape'); await expect(page.locator('#choose-record')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(page.locator('#room-settings-menu')).toBeHidden();
    await expect(page.locator('#room-settings')).toBeFocused();
    await reachable(page, primaryActions);
    // Reflow back across both boundaries without replacing any tool state.
    await page.setViewportSize({ width: width >= 760 ? 759 : 844, height: 390 });
    await openRoomSettings(page); await page.locator('#room-light').click();
    await expect(page.locator('#room-light-brightness')).toHaveValue('67');
    await siblingPanels(page, '#room-light-panel');
  });
}

for (const [width, height] of [[760, 390], [844, 390], [844, 344], [1024, 500]]) {
  test(`focused cat tools keep their scrolling column clear of the footer ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
    await page.locator('#cozy-view').click(); await finishSceneStep(page, 'view');
    await expect(page.locator('#open-book')).toBeHidden();
    const actions = ['cozy-view', 'pet-cat', 'room-settings'];
    await openRoomSettings(page); await reachable(page, actions.concat(toolActions));
    const layout = await page.evaluate(() => {
      const room = document.querySelector('#room-ui')!.getBoundingClientRect();
      const menu = document.querySelector('#room-settings-menu')!, r = menu.getBoundingClientRect();
      const footer = document.querySelector('.footer')!.getBoundingClientRect();
      return { room: room.toJSON(), menu: r.toJSON(), footer: footer.toJSON(),
        position: getComputedStyle(menu).position, scrollHeight: menu.scrollHeight, clientHeight: menu.clientHeight };
    });
    expect(layout.position).toBe('static');
    expect(layout.menu.left).toBeGreaterThanOrEqual(layout.room.left);
    expect(layout.menu.right).toBeLessThanOrEqual(layout.room.right);
    expect(layout.room.bottom).toBeLessThanOrEqual(layout.footer.top - 4);
    if (height < 500) expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
    for (const [trigger, panel] of [['room-light', '#room-light-panel'], ['time-flow', '#time-flow-panel']]) {
      await page.locator('#' + trigger).click(); await siblingPanels(page, panel);
      await reachable(page, actions.concat(toolActions)); await page.keyboard.press('Escape');
      await expect(page.locator('#' + trigger)).toBeFocused();
    }
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#choose-record').click(); await (await chooser).setFiles([]);
    await siblingPanels(page, '#record-panel'); await reachable(page, actions);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.locator('#cozy-view').click(); await finishSceneStep(page, 'view');
    await openRoomSettings(page); await expect(page.locator('#open-book')).toBeVisible();
    await expect(page.locator('#room-settings-menu')).toHaveCSS('position', 'absolute');
    await reachable(page, primaryActions.concat(toolActions));
  });
}

test('notch-sized safe-area insets retain the landscape menu and its sibling dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 390 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setSafeAreaInsets', { insets: { left: 48, right: 48, top: 20, bottom: 21 } });
  } catch {
    test.skip(true, 'This Chromium does not expose safe-area emulation; no physical-notch claim.');
  }
  await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
  const inset = await page.evaluate(() => {
    const probe = document.createElement('i'); probe.style.width = 'env(safe-area-inset-left)';
    probe.style.display = 'block'; document.body.append(probe);
    const width = parseFloat(getComputedStyle(probe).width); probe.remove(); return width;
  });
  test.skip(inset !== 48, 'Safe-area emulation did not change CSS env(); no physical-notch claim.');
  await reachable(page, primaryActions); await openRoomSettings(page); await reachable(page, toolActions);
  const menu = await page.locator('#room-settings-menu').boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(48); expect(menu!.x + menu!.width).toBeLessThanOrEqual(712.5);
  for (const [trigger, panel] of [['room-light', '#room-light-panel'], ['time-flow', '#time-flow-panel']]) {
    await page.locator('#' + trigger).click(); await siblingPanels(page, panel);
    await reachable(page, primaryActions.concat(toolActions)); await page.keyboard.press('Escape');
  }
});

test('the real skinned cat and visible record stay clear of landscape actions and disclosure', async ({ browser }) => {
  test.setTimeout(360000);
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors: string[] = [];
  page.setDefaultTimeout(60000); page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text(), marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      window.__visual2Landscape={snapshot(){
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const point=p=>{const v=p.clone().project(camera);return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};};
        const box=new THREE.Box3().setFromObject(cat.group,true),points=[];
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(point(new THREE.Vector3(x,y,z)));
        const anchor={cat:lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.09,0)),
          bouquet:new THREE.Vector3(.06,.95,-.1).applyMatrix4(bouquet.matrixWorld),
          record:new THREE.Vector3(.07,.104,-.004).applyMatrix4(recordPlayer.group.matrixWorld)};
        const targets=Object.fromEntries(Object.entries(anchor).map(([name,position])=>{const p=point(position);return[name,{...p,hit:resolveInteraction({clientX:p.x,clientY:p.y}),dom:document.elementFromPoint(p.x,p.y)?.tagName}];}));
        const bounds={left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
        const overlaps=['room-ui','room-settings-menu'].filter(id=>{const e=document.getElementById(id);if(!e.checkVisibility())return false;const r=e.getBoundingClientRect();return Math.min(bounds.right,r.right)-Math.max(bounds.left,r.left)>.5&&Math.min(bounds.bottom,r.bottom)-Math.max(bounds.top,r.top)>.5;});
        return {viewport:[innerWidth,innerHeight],panels:Object.fromEntries(['room-ui','room-settings-menu'].map(id=>[id,document.getElementById(id).getBoundingClientRect().toJSON()])),p:camera.position.toArray(),t:target.toArray(),fov:camera.fov,targets,bounds,overlaps,memory:{...renderer.info.memory,programs:renderer.info.programs.length}};
      }};${marker}`) });
  });
  const snapshot = () => page.evaluate(() => (window as any).__visual2Landscape.snapshot());
  const expectUncovered = async () => {
    await expect(async () => {
      const state = await snapshot();
      expect(state.overlaps, JSON.stringify(state)).toEqual([]);
      expect(state.bounds.left).toBeGreaterThan(0); expect(state.bounds.right).toBeLessThan(844);
      expect(state.bounds.top).toBeGreaterThan(0); expect(state.bounds.bottom).toBeLessThan(390);
      for (const kind of ['cat', 'bouquet', 'record']) {
        expect(state.targets[kind].hit, kind).toBe(kind);
        expect(state.targets[kind].dom, kind).toBe('CANVAS');
      }
    }).toPass({ timeout: 15000 });
  };
  try {
    await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T12:00&envWeather=clear&envDensity=0&envBirdDensity=0&envQuality=normal');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
    await page.locator('#enter').click(); await expect(page.locator('#enter')).toBeEnabled(); await page.locator('#enter').click();
    await expect(page.locator('#room-ui')).toBeVisible();
    await page.addStyleTag({ content: '.environment-debug { visibility: hidden !important; }' });
    const initial = await snapshot(); expect(initial.fov).toBe(50); expect(initial.p[1]).toBe(1.65);
    await expectUncovered(); await openRoomSettings(page); await expectUncovered();
    await page.locator('#room-settings').click();
    const catPoint = (await snapshot()).targets.cat;
    await page.mouse.click(catPoint.x, catPoint.y); await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'true');
    await reachable(page, ['cozy-view', 'pet-cat', 'room-settings']);
    await expect.poll(async () => (await snapshot()).overlaps).toEqual([]);
    const focusedStates = [];
    for (const width of [760, 844]) {
      await page.setViewportSize({ width, height: 390 });
      await openRoomSettings(page);
      await reachable(page, ['cozy-view', 'pet-cat', 'room-settings', ...toolActions]);
      const picture = test.info().outputPath(`focused-menu-${width}.png`);
      await page.screenshot({ path: picture });
      await test.info().attach(`focused-menu-${width}`, { path: picture, contentType: 'image/png' });
      const focused = await snapshot(); focusedStates.push(focused);
      expect(focused.overlaps, JSON.stringify(focused)).toEqual([]);
      expect(focused.targets.cat.hit).toBe('cat'); expect(focused.targets.cat.dom).toBe('CANVAS');
      expect(focused.memory).toEqual(initial.memory);
      await page.keyboard.press('Escape');
    }
    await test.info().attach('focused-landscape-disclosure', { body: JSON.stringify(focusedStates, null, 2), contentType: 'application/json' });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#cozy-view').click(); await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'false');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await snapshot()).p).toEqual([.55, 1.65, 1.7]);
    await page.setViewportSize({ width: 844, height: 390 }); await expectUncovered();
    await openRoomSettings(page); await expectUncovered();
    const returned = await snapshot();
    for (const key of ['p', 't']) for (let axis = 0; axis < 3; axis++) expect(returned[key][axis]).toBeCloseTo(initial[key][axis], 8);
    expect(returned.memory).toEqual(initial.memory); expect(errors).toEqual([]);
    await test.info().attach('real-landscape-projection', { body: JSON.stringify({ initial, returned }, null, 2), contentType: 'application/json' });
  } finally { await context.close(); }
});
