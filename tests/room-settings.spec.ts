import {test, expect} from '@playwright/test';
import {mockExperienceScene, enterFixtureRoom, finishSceneStep, openFixtureBook, closeFixtureBook} from './helpers/experience-scene';
import {openRoomSettings} from './helpers/room-settings';

for (const [width,height] of [[320,568],[390,844],[844,390],[1280,800],[1920,1080]]) {
  test(`room disclosure keeps its compact view and nested keyboard tools usable ${width}×${height}`, async ({page}) => {
    await page.setViewportSize({width,height}); await page.emulateMedia({reducedMotion:'reduce'});
    await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
    const trigger=page.locator('#room-settings'), menu=page.locator('#room-settings-menu');
    await expect(menu).toBeHidden(); await expect(page.locator('#room-light')).toBeHidden();
    const compact=await page.locator('#room-ui').boundingBox(); expect(compact!.height).toBeLessThanOrEqual(125);
    await trigger.focus(); await page.keyboard.press('Enter'); await expect(menu).toBeVisible();
    await page.keyboard.press('Tab'); await expect(page.locator('#choose-record')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.locator('#room-light')).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.locator('#room-light-panel')).toBeVisible();
    await page.locator('#room-light-brightness').fill('68');
    await page.keyboard.press('Escape'); await expect(page.locator('#room-light')).toBeFocused();
    await expect(menu).toBeVisible(); await expect(page.locator('#room-light-panel')).toBeHidden();
    await page.keyboard.press('Escape'); await expect(menu).toBeHidden(); await expect(trigger).toBeFocused();
    await openRoomSettings(page); await page.locator('#room-light').click();
    await expect(page.locator('#room-light-brightness')).toHaveValue('68');
    await trigger.click(); await expect(menu).toBeHidden(); await expect(page.locator('#room-light-panel')).toBeHidden();
    await openRoomSettings(page);
    const chooser=page.waitForEvent('filechooser'); await page.locator('#choose-record').click(); await (await chooser).setFiles([]);
    const music=page.locator('#record-panel'); await expect(music).toBeVisible();
    await expect(async()=>{
      const result=await music.evaluate(element=>{
        const r=element.getBoundingClientRect(),room=document.querySelector('#room-ui')!.getBoundingClientRect();
        return {outside:r.left<0||r.top<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5,
          overlap:Math.min(r.right,room.right)>Math.max(r.left,room.left)&&Math.min(r.bottom,room.bottom)>Math.max(r.top,room.top)};
      });expect(result).toEqual({outside:false,overlap:false});
    }).toPass();
    await page.keyboard.press('Escape'); await expect(music).toBeHidden(); await expect(menu).toBeVisible();
    await expect(page.locator('#choose-record')).toBeFocused();
    await page.locator('#cozy-view').click(); await expect(menu).toBeHidden(); await finishSceneStep(page,'view');
    await openRoomSettings(page); await page.locator('#time-flow').click(); await page.locator('#time-flow-free').check();
    await page.locator('#cozy-view').click(); await finishSceneStep(page,'view');
    await expect(menu).toBeHidden(); await expect(page.locator('#time-flow-panel')).toBeHidden();
    await expect(page.locator('#room-ui')).toHaveJSProperty('offsetHeight',compact!.height);
  });
}

test('reading, background and renderer failure close the disclosure without resetting controls', async ({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'}); await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
  const menu=page.locator('#room-settings-menu');
  await openRoomSettings(page); await page.locator('#room-light').click(); await page.locator('#room-light-color').fill('#b8d7ff');
  await openFixtureBook(page); await expect(menu).toBeHidden(); await expect(page.locator('#room-light-panel')).toBeHidden();
  await closeFixtureBook(page); await expect(menu).toBeHidden();
  await openRoomSettings(page); await page.locator('#room-light').click(); await expect(page.locator('#room-light-color')).toHaveValue('#b8d7ff');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(menu).toBeHidden(); await expect(page.locator('#room-light-panel')).toBeHidden();
  await page.evaluate(()=>{delete (document as any).hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await openRoomSettings(page); await page.locator('#time-flow').click(); await page.evaluate(()=>(window as any).__experience.fail());
  await expect(menu).toBeHidden(); await expect(page.locator('#time-flow-panel')).toBeHidden(); await expect(page.locator('#room-settings')).toBeDisabled();
  await expect(page.locator('#fallback')).toBeVisible();
});
