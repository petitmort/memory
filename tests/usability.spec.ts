import { test, expect, type Page } from '@playwright/test';

async function blockWebGL(page: Page) {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type: string, ...args: unknown[]) {
      return type.includes('webgl') ? null : get.apply(this,[type,...args] as never);
    } as typeof get;
  });
}

async function ready(page: Page) {
  await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:10000});
  await expect(page.locator('#reader')).toHaveAttribute('aria-busy','false');
}

test('reading preserves keyboard focus, printed artwork and intentional touch gestures',async ({page}) => {
  await blockWebGL(page);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await page.locator('#fallback-read').click();
  await ready(page);
  const dot=page.locator('#chapter-dots button').nth(1);
  await dot.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
  await page.waitForTimeout(380);
  await expect(dot).toBeFocused();
  expect(await page.locator('.header').evaluate(el=>el.inert)).toBe(true);
  for(let index=0;index<10;index++) {
    await page.keyboard.press('Tab');
    expect(await page.locator('#reader').evaluate(el=>el.contains(document.activeElement))).toBe(true);
  }
  await page.locator('#prev').click();
  const printed=await page.evaluate(() => {
    const source=document.querySelector<HTMLCanvasElement>('#art-holder canvas')!;
    const clone=document.querySelector<HTMLCanvasElement>('.turn-leaf canvas')!;
    return {source:source.toDataURL(),clone:clone?.toDataURL()};
  });
  expect(printed.clone).toBe(printed.source);
  await expect(page.locator('#chapter-title')).toHaveText('风经过的地方');
  await page.waitForTimeout(380);
  expect(await page.locator('#reader').evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.setViewportSize({width:390,height:844});
  const gesture=async (kind: 'diagonal'|'horizontal'|'cancel'|'multiple') => {
    await page.locator('#book').evaluate((el,kind) => {
      const touch=(identifier:number,x:number,y:number)=>new Touch({identifier,target:el,clientX:x,clientY:y});
      const start=touch(1,300,200), other=touch(2,260,200);
      const touches=kind==='multiple'?[start,other]:[start];
      el.dispatchEvent(new TouchEvent('touchstart',{touches,targetTouches:touches,changedTouches:touches}));
      if(kind==='cancel') el.dispatchEvent(new TouchEvent('touchcancel',{changedTouches:[start]}));
      const end=touch(1,230,kind==='diagonal'?520:205);
      el.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[end]}));
    },kind);
    await page.waitForTimeout(650);
  };
  for(const kind of ['diagonal','cancel','multiple'] as const) {
    await gesture(kind);
    await expect(page.locator('#chapter-title')).toHaveText('风经过的地方');
  }
  await gesture('horizontal');
  await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
  const typography=await page.locator('.story-note').evaluate(el=>({font:parseFloat(getComputedStyle(el).fontSize),color:getComputedStyle(el).color}));
  expect(typography.font).toBeGreaterThanOrEqual(13);
  expect(typography.color).toBe('rgb(93, 107, 90)');
  await page.setViewportSize({width:844,height:390});
  const landscape=await page.evaluate(() => {
    const rect=(selector:string)=>document.querySelector(selector)!.getBoundingClientRect().toJSON();
    const book=document.querySelector<HTMLElement>('#book')!;
    return {close:rect('#close-book'),navigation:rect('.reader-bottom'),height:innerHeight,client:book.clientHeight,scroll:book.scrollHeight};
  });
  expect(landscape.close.top).toBeGreaterThanOrEqual(0);
  expect(landscape.close.bottom).toBeLessThanOrEqual(landscape.height);
  expect(landscape.navigation.bottom).toBeLessThanOrEqual(landscape.height);
  expect(landscape.scroll).toBeGreaterThan(landscape.client);
  await page.locator('#book').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await page.screenshot({path:'test-results/landscape-reading.png'});
  await page.locator('#close-book').click();
  await expect(page.locator('#fallback')).toBeVisible();
  await page.locator('#fallback-read').click();
  await ready(page);
  await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
});

// Use the real UI and paper transitions with controllable scene promises. This
// exercises every failure phase without starting a GPU renderer for each one.
function mockScene(_container: HTMLElement,_interact: () => void,_reduced: boolean,onUnavailable: () => void) {
  const host=window as any;
  const mode=new URL(location.href).searchParams.get('review');
  let lost=false, rejectLoss: (reason: Error) => void;
  const loss=new Promise<never>((_,reject)=>{rejectLoss=reject;});
  void loss.catch(()=>{});
  let resolveReady: () => void;
  const initial=mode==='initializing'||mode==='late-ready'?new Promise<void>(resolve=>{resolveReady=resolve;}):Promise.resolve();
  let complete: (() => void)|undefined;
  const probe=host.__sceneProbe={phase:'idle',pending:'',opens:0,complete:()=>complete?.(),completeReady:()=>resolveReady?.(),fail:()=>{
    if(lost)return; lost=true; onUnavailable(); rejectLoss(new SceneUnavailableError());
  }};
  const assert=()=>{if(lost)throw new SceneUnavailableError();};
  const wait=(phase:string)=>{probe.phase=phase;probe.pending=phase;return Promise.race([new Promise<void>(resolve=>{complete=resolve;}),loss]);};
  const projection=()=>{
    const x=innerWidth*.35,y=innerHeight*.5,w=innerWidth*.15,h=innerHeight*.2;
    const left={corners:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]};
    const right={corners:left.corners.map(point=>({x:point.x+w,y:point.y}))};
    return {corners:[left.corners[0],right.corners[1],right.corners[2],left.corners[3]],pages:[left,right]};
  };
  return {
    ready:mode==='late-ready'?initial:Promise.race([initial,loss]),
    clearFog(){},setQuality(){},setBookChapter(){},setBookPageCanvases(){},setBookVisibility(){},dispose(){},
    getBookProjection:projection,
    async enterRoom(){assert();await wait('entering');},
    async openBook(onFrame:any,paperReady?:Promise<void>){
      assert();probe.opens++;probe.phase='opening';
      await Promise.race([paperReady??Promise.resolve(),loss]);assert();
      onFrame?.({progress:.65,projection:projection()});await wait('opening');
      onFrame?.({progress:1,projection:projection()});return projection();
    },
    async returnToRoom(onFrame:any){assert();onFrame?.({progress:.1,projection:projection()});await wait('closing');onFrame?.({progress:1,projection:projection()});},
  };
}
class SceneUnavailableError extends Error {}

async function mockRenderer(page: Page, delayedCapture=false) {
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'application/javascript',
    body:'export class SceneUnavailableError extends Error {};export const createScene='+mockScene.toString()+';'}));
  if(delayedCapture) await page.route(/\/src\/page-raster\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'application/javascript',body:
    'export function captureBookPages(){return new Promise(resolve=>{window.__releaseCapture=()=>resolve([document.createElement("canvas"),document.createElement("canvas")]);});}'}));
}

async function enterMockRoom(page: Page) {
  await page.locator('#enter').click();
  await expect(page.locator('#enter')).toBeEnabled();
  await page.locator('#enter').click();
  await page.waitForFunction(()=>(window as any).__sceneProbe.pending==='entering');
  await page.evaluate(()=>(window as any).__sceneProbe.complete());
  await expect(page.locator('#room-ui')).toBeVisible();
}

test('scene failure settles pending UI states and keeps the current album usable',async ({browser}) => {
  test.setTimeout(60000);
  const context=await browser.newContext({viewport:{width:1024,height:768},reducedMotion:'reduce'});
  try {
    for(const phase of ['initializing','late-ready','room','entering','opening','reading','closing']) {
      const page=await context.newPage(); const errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      await mockRenderer(page);
      await page.goto('/?review='+phase);
      await page.waitForFunction(()=>Boolean((window as any).__sceneProbe));
      if(phase==='entering') {
        await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
        await page.waitForFunction(()=>(window as any).__sceneProbe.pending==='entering');
      } else if(!['initializing','late-ready'].includes(phase)) {
        await enterMockRoom(page);
        if(['opening','reading','closing'].includes(phase)) {
          await page.locator('#open-book').click();await page.waitForFunction(()=>(window as any).__sceneProbe.pending==='opening');
          if(phase!=='opening') {
            await page.evaluate(()=>(window as any).__sceneProbe.complete());await ready(page);
            await page.locator('#next').click();await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
            if(phase==='closing') {await page.locator('#close-book').click();await page.waitForFunction(()=>(window as any).__sceneProbe.pending==='closing');}
          }
        }
      }
      await page.evaluate(()=>(window as any).__sceneProbe.fail());
      if(phase==='late-ready') await page.evaluate(()=>(window as any).__sceneProbe.completeReady());
      if(phase==='opening'||phase==='reading') {await ready(page);await page.locator('#close-book').click();}
      await expect(page.locator('#fallback')).toBeVisible();
      await expect(page.locator('#reader')).not.toHaveAttribute('aria-busy','true');
      await page.locator('#fallback-read').click();await ready(page);
      await expect(page.locator('#chapter-title')).toHaveText(['reading','closing'].includes(phase)?'把日子过成夏天':'风经过的地方');
      expect(await page.locator('#reader').evaluate(el=>!el.inert&&!el.classList.contains('is-tracking')&&!el.classList.contains('is-preparing'))).toBe(true);
      if(phase==='late-ready') expect(await page.evaluate(()=>(window as any).__sceneProbe.opens)).toBe(0);
      expect(errors,phase).toEqual([]);
      await page.close();
    }
  } finally {await context.close();}
});

test('a late paper capture cannot restart a failed 3D transition',async ({browser}) => {
  const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();
  try {
    await mockRenderer(page,true);await page.goto('/');await enterMockRoom(page);
    await page.locator('#open-book').click();await page.waitForFunction(()=>Boolean((window as any).__releaseCapture));
    await page.evaluate(()=>(window as any).__sceneProbe.fail());await ready(page);
    await page.evaluate(()=>(window as any).__releaseCapture());await page.waitForTimeout(100);
    await ready(page);
    expect(await page.locator('#reader').evaluate(el=>!el.inert&&!el.classList.contains('is-tracking')&&!el.classList.contains('is-preparing'))).toBe(true);
    expect(await page.locator('.page').evaluateAll(pages=>pages.map(el=>(el as HTMLElement).style.transform))).toEqual(['','']);
  } finally {await context.close();}
});

test('losing the actual WebGL context during opening preserves a usable album',async ({browser}) => {
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width:640,height:480},reducedMotion:'reduce'});
  const page=await context.newPage();const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();
    await page.locator('#enter').click();await expect(page.locator('#room-ui')).toBeVisible({timeout:30000});
    expect(await page.locator('#world canvas').evaluate(el=>Boolean((el as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')))).toBe(true);
    await page.locator('#open-book').evaluate(el=>el.addEventListener('click',()=>setTimeout(()=>{
      document.querySelector<HTMLCanvasElement>('#world canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
    },0),{once:true}));
    await page.locator('#open-book').click();await ready(page);
    await expect(page.locator('#world')).toBeHidden();
    await page.locator('#next').click();await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    await page.locator('#close-book').click();await expect(page.locator('#fallback')).toBeVisible();
    await expect(page.locator('#reload-scene')).toBeVisible();
    await page.locator('#fallback-read').click();await ready(page);
    await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    await page.screenshot({path:'test-results/recovered-reading.png'});
    expect(errors).toEqual([]);
  } finally {await context.close();}
});
