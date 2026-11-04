import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

async function expectReaderReady(page: Page) {
  await expect(page.locator("#reader")).toBeVisible({ timeout: 20000 });
  // SwiftShader can take over a second per drawn frame; wait for the complete
  // camera journey without changing its frame-by-frame continuity checks.
  await expect(page.locator("#reader")).toHaveAttribute("data-phase", "ready", { timeout: 60000 });
  await expect(page.locator("#reader")).toHaveAttribute("aria-busy", "false");
}

test("desktop: deliberate entry, reading, chapter boundaries, sound and return", async ({
  page,
}) => {
  test.setTimeout(240000); // Includes continuous camera/cover transitions under software WebGL.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  // Record the short-lived guard in the click event, before a slow software
  // renderer can delay browser messages; clearing now waits for actual drawn
  // frames, with the same generous completion budget as the book journey.
  await page.evaluate(() => {
    const button = document.getElementById("enter") as HTMLButtonElement;
    button.addEventListener(
      "click",
      () => {
        const locked = button.disabled;
        button.click();
        (window as unknown as { __entryGuard: boolean }).__entryGuard =
          locked &&
          document.getElementById("room-ui")!.classList.contains("hidden");
      },
      { once: true },
    );
  });
  await page.locator("#enter").click();
  expect(
    await page.evaluate(
      () => (window as unknown as { __entryGuard: boolean }).__entryGuard,
    ),
  ).toBe(true);
  await expect(page.locator("#enter")).toHaveText("推开这扇门", {
    timeout: 60000,
  });
  await page.keyboard.press("Enter");
  await expect(page.locator("#room-ui")).toBeVisible({ timeout: 60000 });
  await page.locator("#sound").click();
  await expect(page.locator("#sound")).toHaveAttribute(
    "aria-label",
    "开启声音",
  );
  await page.locator("#sound").click();
  await expect(page.locator("#sound")).toHaveAttribute(
    "aria-label",
    "关闭声音",
  );
  await page.locator("#open-book").click();
  await expectReaderReady(page);
  await expect(page.locator("#chapter-title")).toHaveText("风经过的地方");
  await expect(page.locator("#prev")).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#chapter-title")).toHaveText("把日子过成夏天");
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "跳到第四章 · 此刻" }).click();
  await expect(page.locator("#chapter-title")).toHaveText("潮水会替我记得");
  await expect(page.locator("#next")).toBeDisabled();
  await page.waitForTimeout(700);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#chapter-title")).toHaveText("我们看过的远方");
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/desktop-reading.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#reader")).toBeHidden({ timeout: 60000 });
  await expect(page.locator("#room-ui")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#open-book")).toBeFocused();
  await page.locator("#quality").click();
  await expect(page.locator("#quality")).toHaveText("画质 · 省电");
  await page.waitForTimeout(1200);
  await page.locator("#open-book").click();
  await expectReaderReady(page);
  await expect(page.locator("#chapter-title")).toHaveText("我们看过的远方");
  expect(errors).toEqual([]);
});

test("mobile: small-screen layout, swipe chapters and reduced motion", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.screenshot({ path: "test-results/mobile-entry.png" });
  await page.locator("#enter").click();
  await expect(page.locator("#enter")).toBeEnabled({ timeout: 60000 });
  await page.locator("#enter").click();
  await expect(page.locator("#room-ui")).toBeVisible();
  await page.locator("#open-book").click();
  await expectReaderReady(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.locator("#book").evaluate((el) => {
    el.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [
          new Touch({ identifier: 1, target: el, clientX: 300, clientY: 300 }),
        ],
        targetTouches: [
          new Touch({ identifier: 1, target: el, clientX: 300, clientY: 300 }),
        ],
        changedTouches: [
          new Touch({ identifier: 1, target: el, clientX: 300, clientY: 300 }),
        ],
      }),
    );
    el.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [
          new Touch({ identifier: 1, target: el, clientX: 100, clientY: 300 }),
        ],
      }),
    );
  });
  await expect(page.locator("#chapter-title")).toHaveText("把日子过成夏天");
  await page.screenshot({ path: "test-results/mobile-reading.png" });
  await page.locator("#close-book").click();
  await expect(page.locator("#room-ui")).toBeVisible({ timeout: 60000 });
  expect(errors).toEqual([]);
  await context.close();
});

test("without WebGL: the complete album remains available", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return get.apply(this, [type, ...args] as never);
    } as typeof get;
  });
  await page.goto("/");
  await expect(page.locator("#fallback")).toBeVisible();
  await page.locator("#fallback-read").click();
  await expectReaderReady(page);
  await expect(page.locator("#art-holder canvas")).toBeVisible();
  await page.locator("#next").click();
  await expect(page.locator("#chapter-title")).toHaveText("把日子过成夏天");
  await context.close();
});

test("physical scene: enter through doorway, approach and open the album, then restore the room view", async ({
  page,
}) => {
  test.setTimeout(240000);
  type Sample = {
    p: number[];
    t: number[];
    fov: number;
    cover: number;
    leafHeight: number;
    leafVisible: boolean;
    flower: number[];
    scale: number[];
    visible: boolean;
    wall: boolean;
    door: number;
    waveTime: number;
    seaVertices: number;
    curtainTop: number[];
    curtainHem: number[];
    progress?: number;
    pageOpacity?: number[];
    readerBackground?: string;
    readerBlur?: string;
    shadowUpdate?: boolean;
  };
  type Probe = Window & {
    __cameraSamples: Sample[];
    __openingFrame?: string;
    __readingResize?: boolean;
    __readingResizePreserved?: boolean;
    __sceneSizes: Record<string, number[]>;
    __sceneStyle: {
      curtainAlpha: number;
      laceOpenwork: boolean;
      transparent: boolean;
      details: boolean[];
      calls: number;
    };
  };
  // Instrument the real rendered camera only in this test, without shipping a debug API.
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    expect(body).toContain("renderer.render(scene, camera);");
    expect(body).toContain("finishReadingFrame?.();");
    await route.fulfill({
      response,
      body: body.replace(
        "renderer.render(scene, camera);",
        `
      if(!window.__sceneSizes){
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const measure=(name)=>{
          const object=scene.getObjectByName(name),copy=object.clone();
          copy.position.set(0,0,0);copy.quaternion.identity();copy.scale.set(1,1,1);
          return new THREE.Box3().setFromObject(copy).getSize(new THREE.Vector3()).multiply(object.getWorldScale(new THREE.Vector3())).toArray();
        };
        const bounds=name=>new THREE.Box3().setFromObject(scene.getObjectByName(name));
        window.__sceneSizes={
          door:measure('door-leaf'),desk:measure('tabletop'),album:measure('album'),cup:measure('mug-body'),stool:measure('stool'),rug:measure('rug'),console:measure('console-top'),
          room:[measure('ceiling')[0],measure('side-left')[1],measure('ceiling')[2]],
          window:[bounds('back-right').min.x-bounds('back-left').max.x,bounds('back-above').min.y-bounds('back-below').max.y,bounds('back-below').max.y],
          surfaces:[bounds('tabletop').max.y,bounds('stool').max.y,bounds('console-top').max.y],
          handle:[scene.getObjectByName('door-handle').getWorldPosition(new THREE.Vector3()).y],
          doorScreenY:[new THREE.Vector3(D.door.centerX,D.door.threshold,front).project(camera).y,new THREE.Vector3(D.door.centerX,D.door.height+D.door.threshold,front).project(camera).y],
        };
      }
      const curtain=curtains.group.getObjectByName('left-voile-panel'),cloth=curtain.geometry.attributes.position;
      if(!window.__sceneStyle){
        const canvas=curtain.material.map.image,ctx=canvas.getContext('2d'),edge=ctx.getImageData(canvas.width-40,0,40,canvas.height).data;
        let open=false,thread=false;for(let i=3;i<edge.length;i+=4){open ||= edge[i]===0;thread ||= edge[i]>160;}
        window.__sceneStyle={curtainAlpha:ctx.getImageData(100,100,1,1).data[3],laceOpenwork:open&&thread,transparent:curtain.material.transparent,details:['santorini-exterior','mediterranean-furnishings','aged-cobalt-shutters','vintage-framed-seascape','woven-market-basket'].map(name=>!!scene.getObjectByName(name)),calls:renderer.info.render.calls};
      }
      window.__cameraSamples ??= [];
      const cover=scene.getObjectByName('album-cover-hinge'),leaf=scene.getObjectByName('album-opening-leaf');
      const leafPositions=leaf.geometry.attributes.position;let leafMin=Infinity,leafMax=-Infinity;for(let i=0;i<leafPositions.count;i++){leafMin=Math.min(leafMin,leafPositions.getY(i));leafMax=Math.max(leafMax,leafPositions.getY(i));}
      if(!window.__readingResize && readingMotion?.kind==='opening' && cover.rotation.z>.2 && cover.rotation.z<2.7){const beforeResize=readingMotion;window.__readingResize=true;window.dispatchEvent(new Event('resize'));window.__readingResizePreserved=readingMotion===beforeResize;}
      window.__cameraSamples.push({p: camera.position.toArray(), t: target.toArray(),fov:camera.fov,cover:cover.rotation.z,leafHeight:leafMax-leafMin,leafVisible:leaf.visible, flower: bouquet.position.toArray(), scale: bouquet.scale.toArray(), visible: bouquet.visible, wall: facade.visible, door: doorPivot.rotation.y, waveTime: seaMat.uniforms.time.value, seaVertices: ocean.geometry.attributes.position.count,shadowUpdate:sun.shadow.needsUpdate,curtainTop:[cloth.getX(0),cloth.getY(0),cloth.getZ(0)],curtainHem:[cloth.getX(cloth.count-1),cloth.getY(cloth.count-1),cloth.getZ(cloth.count-1)]});
      renderer.render(scene, camera);
      if(!window.__openingFrame && current==='book' && leaf.visible && leafMax-leafMin>.06)window.__openingFrame=renderer.domElement.toDataURL('image/png');
    `,
      ).replace("finishReadingFrame?.();", `
      if(updateReadingFrame){
        const sample=window.__cameraSamples.at(-1),reader=document.getElementById('reader');
        sample.progress=updateReadingFrame.progress;
        sample.pageOpacity=Array.from(reader.querySelectorAll('.page')).map(page=>Number(getComputedStyle(page).opacity));
        sample.readerBackground=getComputedStyle(reader).backgroundColor;
        sample.readerBlur=getComputedStyle(reader).backdropFilter;
      }
      finishReadingFrame?.();
      `),
    });
  });
  // Keep this frame-by-frame software-WebGL check within a bounded pixel
  // budget. The separate layout matrix still covers the 2560×1440 desktop.
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 60000 });
  await page.locator("#enter").click();
  await expect(page.locator("#enter")).toBeEnabled({ timeout: 60000 });
  const sizes = await page.evaluate(
    () => (window as unknown as Probe).__sceneSizes,
  );
  const style = await page.evaluate(
    () => (window as unknown as Probe).__sceneStyle,
  );
  expect(style.curtainAlpha).toBeGreaterThan(0);
  expect(style.curtainAlpha).toBeLessThan(180);
  expect(style.laceOpenwork).toBe(true);
  expect(style.transparent).toBe(true);
  expect(style.details.every(Boolean)).toBe(true);
  const expected: Record<string, number[]> = {
    door: [0.9, 2.1, 0.045],
    desk: [1.4, 0.035, 0.75],
    album: [0.32, 0.0351, 0.26],
    cup: [0.085, 0.095, 0.085],
    stool: [0.36, 0.45, 0.36],
    rug: [2, 0.008, 1.4],
    console: [0.9, 0.025, 0.32],
    room: [4.6, 2.7, 5.4],
    window: [3, 1.6, 0.85],
    surfaces: [0.75, 0.45, 0.78],
    handle: [1],
  };
  for (const [name, values] of Object.entries(expected))
    values.forEach((value, i) => expect(sizes[name][i]).toBeCloseTo(value, 4));
  expect(sizes.doorScreenY[0]).toBeGreaterThan(-0.95);
  expect(sizes.doorScreenY[1]).toBeLessThan(0.95);
  await page.evaluate(() => {
    (window as unknown as Probe).__cameraSamples = [];
  });
  await page.locator("#enter").click();
  await expect(page.locator("#room-ui")).toBeVisible({ timeout: 60000 });
  const entry = await page.evaluate(
    () => (window as unknown as Probe).__cameraSamples,
  );
  expect(entry.length).toBeGreaterThan(3);
  const final = entry.at(-1)!;
  expect(entry[0].p[2]).toBeGreaterThan(3.1);
  expect(final.p[2]).toBeLessThan(2);
  for (const sample of entry) {
    expect(sample.p[1]).toBeCloseTo(1.65, 6);
    expect(sample.wall).toBe(true);
    expect(sample.curtainTop).toEqual(entry[0].curtainTop);
    if (Math.abs(sample.p[2] - 2.7) < 0.3) {
      expect(sample.p[0]).toBeGreaterThan(0.28);
      expect(sample.p[0]).toBeLessThan(0.82);
      expect(sample.door).toBeLessThan(-1.25);
    }
  }
  const crossing = entry.findIndex(
    (sample, i) => i > 0 && sample.p[2] < 2.7 && entry[i - 1].p[2] >= 2.7,
  );
  expect(crossing).toBeGreaterThan(0);
  const before = entry[crossing - 1].p,
    after = entry[crossing].p;
  const fraction = (2.7 - before[2]) / (after[2] - before[2]);
  // Sparse software-rendered frames can straddle a curved section of the path.
  // The interpolated crossing must leave clearance for a person inside the opening.
  const crossX = before[0] + (after[0] - before[0]) * fraction;
  expect(crossX).toBeGreaterThan(0.28);
  expect(crossX).toBeLessThan(0.82);
  expect(final.seaVertices).toBeGreaterThan(10000);
  const seaA = await page.screenshot({
    clip: { x: 700, y: 330, width: 250, height: 80 },
  });
  await page.waitForTimeout(1000);
  const seaB = await page.screenshot({
    clip: { x: 700, y: 330, width: 250, height: 80 },
  });
  expect(seaB.equals(seaA)).toBe(false);
  const distance = (p: number[]) =>
    Math.hypot(...p.map((x, i) => x - final.p[i]));
  let previous = distance(entry[0].p);
  for (const sample of entry) {
    const next = distance(sample.p);
    expect(next).toBeLessThanOrEqual(previous + 1e-6);
    previous = next;
  }
  await page.evaluate(() => {
    (window as unknown as Probe).__cameraSamples = [];
  });
  const handoffScreenshot = page.waitForFunction(() => {
    const sample = (window as unknown as Probe).__cameraSamples.at(-1);
    return sample?.pageOpacity?.some(opacity => opacity > .35 && opacity < .85);
  }, undefined, { timeout: 60000 }).then(() =>
    page.screenshot({ path: 'test-results/album-handoff.png' }));
  await page.locator("#open-book").click();
  await handoffScreenshot;
  await expectReaderReady(page);
  const approach = await page.evaluate(
    () => (window as unknown as Probe).__cameraSamples,
  );
  expect(await page.evaluate(() => (window as unknown as Probe).__readingResize)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Probe).__readingResizePreserved)).toBe(true);
  for (let i = 1; i < approach.length; i++) expect(approach[i].cover).toBeGreaterThanOrEqual(approach[i - 1].cover - .00001);
  const closeView = approach.at(-1)!;
  const moved = (a: number[], b: number[]) => Math.hypot(...a.map((n, i) => n - b[i]));
  const opening = approach.filter(sample => sample.progress !== undefined);
  expect(opening.length).toBeGreaterThan(3);
  expect(opening[0].progress).toBe(0);
  expect(opening[0].p).toEqual(final.p);
  expect(opening[0].t).toEqual(final.t);
  expect(opening[0].fov).toBe(final.fov);
  for (let i = 1; i < opening.length; i++) {
    expect(opening[i].progress!).toBeGreaterThanOrEqual(opening[i - 1].progress!);
  }
  expect(opening.at(-1)!.progress).toBe(1);
  // DOM pages take over during the same camera journey, rather than beginning
  // another animation after the 3D scene has already stopped.
  const handoff = opening.filter(sample => sample.pageOpacity!.some(opacity => opacity > .01) && sample.progress! < .99);
  expect(handoff.length).toBeGreaterThan(1);
  expect(handoff.some(sample => moved(sample.p, closeView.p) > .001)).toBe(true);
  expect(moved(handoff[0].p, handoff.at(-1)!.p)).toBeGreaterThan(.001);
  const cameraOnly = opening.filter(sample => sample.progress! > .8 && sample.progress! < 1);
  expect(cameraOnly.some(sample => sample.shadowUpdate === false)).toBe(true);
  const finalReaderStyle = await page.locator('#reader').evaluate(reader => ({
    background: getComputedStyle(reader).backgroundColor,
    blur: getComputedStyle(reader).backdropFilter,
  }));
  expect(opening.at(-1)!.readerBackground).toBe(finalReaderStyle.background);
  expect(opening.at(-1)!.readerBlur).toBe(finalReaderStyle.blur);
  const cameraTravel = moved(final.p, closeView.p);
  expect(cameraTravel).toBeGreaterThan(.3);
  expect(approach.some(sample => moved(sample.p, final.p) > .05 && moved(sample.p, closeView.p) > .05)).toBe(true);
  expect(closeView.p[1]).toBeGreaterThan(1.0); // The eye stays safely above the tabletop.
  expect(closeView.t[1]).toBeGreaterThan(.75);
  expect(closeView.t[1]).toBeLessThan(.9);
  expect(closeView.fov).toBeLessThanOrEqual(final.fov);
  expect(closeView.cover).toBeCloseTo(Math.PI, 4);
  expect(approach.some(sample => sample.cover > .15 && sample.cover < Math.PI - .15)).toBe(true);
  expect(approach.some(sample => sample.leafVisible && sample.leafHeight > .06)).toBe(true);
  const openingFrame = await page.evaluate(() => (window as unknown as Probe).__openingFrame);
  expect(openingFrame).toMatch(/^data:image\/png;base64,/);
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/album-opening.png", Buffer.from(openingFrame!.split(",")[1], "base64"));
  await page.screenshot({ path: "test-results/album-reading.png" });
  // A frozen reading interval must not become motion time on the first return frame.
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    (window as unknown as Probe).__cameraSamples = [];
  });
  await page.locator("#close-book").click();
  await expect(page.locator("#room-ui")).toBeVisible({ timeout: 60000 });
  const retreat = await page.evaluate(
    () => (window as unknown as Probe).__cameraSamples,
  );
  const parked = retreat.at(-1)!;
  const closing = retreat.filter(sample => sample.progress !== undefined);
  expect(closing.length).toBeGreaterThan(3);
  expect(closing[0].progress).toBe(0);
  expect(closing[0].p).toEqual(closeView.p);
  expect(closing[0].t).toEqual(closeView.t);
  expect(closing[0].fov).toBe(closeView.fov);
  for (let i = 1; i < closing.length; i++) {
    expect(closing[i].progress!).toBeGreaterThanOrEqual(closing[i - 1].progress!);
  }
  expect(closing.at(-1)!.progress).toBe(1);
  expect(retreat.some(sample => moved(sample.p, final.p) > .05 && moved(sample.p, closeView.p) > .05)).toBe(true);
  expect(parked.p).toEqual(final.p);
  expect(parked.t).toEqual(final.t);
  expect(parked.fov).toEqual(final.fov);
  expect(parked.cover).toBeCloseTo(0, 6);
  for (const sample of [...approach, ...retreat]) {
    expect(sample.scale).toEqual(final.scale);
    expect(sample.visible).toBe(true);
    // The wrapped bouquet rests higher on the closed cover. Bound its lift
    // against both resting poses instead of the old unwrapped stem height.
    expect(sample.flower[1]).toBeGreaterThanOrEqual(Math.min(final.flower[1], parked.flower[1]) - .001);
    expect(sample.flower[1]).toBeLessThanOrEqual(Math.max(final.flower[1], parked.flower[1]) + .028);
  }
  expect(parked.flower[0]).toBeGreaterThan(final.flower[0] + 0.3);
  expect(parked.flower[0]).toBeLessThan(0.58);
  expect(parked.flower[2]).toBeLessThan(0.3);
  expect(parked.waveTime).toBeGreaterThan(final.waveTime);
  const hems = [...entry, ...approach, ...retreat].map((s) => s.curtainHem[2]);
  expect(Math.max(...hems) - Math.min(...hems)).toBeGreaterThan(0.005);
});
