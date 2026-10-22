import { test, expect } from "@playwright/test";

test("desktop: deliberate entry, reading, chapter boundaries, sound and return", async ({
  page,
}) => {
  test.setTimeout(120000); // Full 3D workflow also runs under CPU-only Chromium.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  // Record the short-lived guard in the click event, before a slow software
  // renderer can delay the browser protocol beyond the 1.85 s fog transition.
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
    timeout: 10000,
  });
  await page.keyboard.press("Enter");
  await expect(page.locator("#room-ui")).toBeVisible({ timeout: 15000 });
  await page.locator("#sound").click();
  await expect(page.locator("#sound")).toHaveAttribute(
    "aria-label",
    "开启海浪声",
  );
  await page.locator("#sound").click();
  await expect(page.locator("#sound")).toHaveAttribute(
    "aria-label",
    "关闭海浪声",
  );
  await page.locator("#open-book").click();
  await expect(page.locator("#reader")).toBeVisible();
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
  await expect(page.locator("#reader")).toBeHidden();
  await expect(page.locator("#room-ui")).toBeVisible();
  await expect(page.locator("#open-book")).toBeFocused();
  await page.locator("#quality").click();
  await expect(page.locator("#quality")).toHaveText("画质 · 省电");
  await page.waitForTimeout(1200);
  await page.locator("#open-book").click();
  await expect(page.locator("#reader")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile: small-screen layout, swipe chapters and reduced motion", async ({
  browser,
}) => {
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
  await page.screenshot({ path: "test-results/mobile-entry.png" });
  await page.locator("#enter").click();
  await expect(page.locator("#enter")).toBeEnabled();
  await page.locator("#enter").click();
  await expect(page.locator("#room-ui")).toBeVisible();
  await page.locator("#open-book").click();
  await expect(page.locator("#reader")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.locator("#book").evaluate((el) => {
    el.dispatchEvent(
      new TouchEvent("touchstart", {
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
  await expect(page.locator("#room-ui")).toBeVisible();
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
  await expect(page.locator("#reader")).toBeVisible();
  await expect(page.locator("#art-holder canvas")).toBeVisible();
  await page.locator("#next").click();
  await expect(page.locator("#chapter-title")).toHaveText("把日子过成夏天");
  await context.close();
});

test("physical scene: walk through doorway, park flowers, preserve view and animate sea", async ({
  page,
}) => {
  test.setTimeout(120000);
  type Sample = {
    p: number[];
    t: number[];
    flower: number[];
    scale: number[];
    visible: boolean;
    wall: boolean;
    door: number;
    waveTime: number;
    seaVertices: number;
    curtainTop: number[];
    curtainHem: number[];
  };
  type Probe = Window & {
    __cameraSamples: Sample[];
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
      window.__cameraSamples.push({p: camera.position.toArray(), t: target.toArray(), flower: bouquet.position.toArray(), scale: bouquet.scale.toArray(), visible: bouquet.visible, wall: facade.visible, door: doorPivot.rotation.y, waveTime: seaMat.uniforms.time.value, seaVertices: ocean.geometry.attributes.position.count,curtainTop:[cloth.getX(0),cloth.getY(0),cloth.getZ(0)],curtainHem:[cloth.getX(cloth.count-1),cloth.getY(cloth.count-1),cloth.getZ(cloth.count-1)]});
      renderer.render(scene, camera);
    `,
      ),
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#enter").click();
  await expect(page.locator("#enter")).toBeEnabled();
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
  await expect(page.locator("#room-ui")).toBeVisible({ timeout: 15000 });
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
  await page.locator("#open-book").click();
  await expect(page.locator("#reader")).toBeVisible();
  await page.locator("#close-book").click();
  await expect(page.locator("#room-ui")).toBeVisible();
  await page.waitForTimeout(400);
  const reading = await page.evaluate(
    () => (window as unknown as Probe).__cameraSamples,
  );
  expect(reading.length).toBeGreaterThan(0);
  for (const sample of reading) {
    expect(sample.p).toEqual(final.p);
    expect(sample.t).toEqual(final.t);
    expect(sample.scale).toEqual(final.scale);
    expect(sample.visible).toBe(true);
    expect(sample.flower[1]).toBeGreaterThanOrEqual(0.764);
    expect(sample.flower[1]).toBeLessThanOrEqual(0.837);
  }
  const parked = reading.at(-1)!;
  expect(parked.flower[0]).toBeGreaterThan(final.flower[0] + 0.3);
  expect(parked.flower[0]).toBeLessThan(0.58);
  expect(parked.flower[2]).toBeLessThan(0.3);
  expect(parked.waveTime).toBeGreaterThan(final.waveTime);
  const hems = [...entry, ...reading].map((s) => s.curtainHem[2]);
  expect(Math.max(...hems) - Math.min(...hems)).toBeGreaterThan(0.005);
});
