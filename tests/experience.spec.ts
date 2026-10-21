import { test, expect } from "@playwright/test";

test("desktop: deliberate entry, reading, chapter boundaries, sound and return", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#enter").click();
  await expect(page.locator("#enter")).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(page.locator("#room-ui")).toBeHidden();
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
