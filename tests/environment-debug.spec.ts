import { expect, test, type Page } from "@playwright/test";

async function isolatedPage(page: Page, search = "?debugEnv=1") {
  await page.route("**/__environment-debug*", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><title>Environment tools</title>",
  }));
  await page.goto(`/__environment-debug${search}`);
  await page.evaluate(async () => {
    const module = await import("/src/environment-debug.ts");
    const host = window as any;
    host.__readEnvironmentOptions = module.readEnvironmentOptions;
    host.__environmentChanges = [];
    host.__environmentOptions = module.readEnvironmentOptions();
    host.__environmentDebug = module.createEnvironmentDebug(host.__environmentOptions, patch => host.__environmentChanges.push(patch));
  });
}

test("environment overrides are inert for normal visitors and accept the complete explicit preview query", async ({ page }) => {
  await isolatedPage(page, "?debugEnv=true&envDate=2026-06-21T12:00&envWeather=snow&envPhase=.5&envQuality=low&envPaths=1");
  await expect(page.locator(".environment-debug")).toHaveCount(0);
  const normal = await page.evaluate(() => (window as any).__environmentOptions);
  expect(normal).toMatchObject({ enabled: false, timeMode: "local-clock", paths: false });
  expect(normal.timestamp).toBeUndefined(); expect(normal.weather).toBeUndefined(); expect(normal.quality).toBeUndefined();
  const complete = await page.evaluate(() => (window as any).__readEnvironmentOptions(
    "?debugEnv=1&envDate=2026-06-21T12:00&envTimeMode=scene&envWeather=heavy-rain&envPhase=.5&envCloud=.8&envWind=7&envDensity=1.4&envRoute=diagonal&envVessel=catamaran&envQuality=normal&envPaths=1"));
  expect(complete).toMatchObject({
    enabled: true, timestamp: Date.parse("2026-06-21T09:00:00Z"), timeMode: "scene", weather: "heavy-rain",
    moonPhase: .5, cloudCover: .8, windSpeed: 7, vesselDensity: 1.4, vesselRoute: "diagonal", vesselKind: "catamaran", quality: false, paths: true,
  });
});

test("preview links reject invalid dates, enums and nonfinite values and clamp bounded numeric controls", async ({ page }) => {
  await isolatedPage(page);
  const parsed = await page.evaluate(() => {
    const read = (window as any).__readEnvironmentOptions;
    return {
      bad: read("?debugEnv=1&envDate=2026-02-30T12:00&envWeather=%3Cscript%3E&envPhase=NaN&envCloud=Infinity&envWind=&envDensity=bad&envRoute=x&envVessel=x&envTimeMode=bad&envPaths=true&envQuality=bad"),
      bounded: read("?debugEnv=1&envPhase=4&envCloud=-1&envWind=400&envDensity=-3&envQuality=low"),
      auto: read("?debugEnv=1&envQuality=auto"),
    };
  });
  for (const key of ["timestamp", "weather", "moonPhase", "cloudCover", "windSpeed", "vesselDensity", "vesselRoute", "vesselKind", "quality"])
    expect(parsed.bad[key]).toBeUndefined();
  expect(parsed.bad.timeMode).toBe("local-clock"); expect(parsed.bad.paths).toBe(false);
  expect(parsed.bounded).toMatchObject({ moonPhase: 1, cloudCover: 0, windSpeed: 20, vesselDensity: 0, quality: true });
  expect(parsed.auto.quality).toBeUndefined();
  await expect(page.locator("script")).toHaveCount(0);
});

test("debug controls update only this preview, expose all modes and restore automatic state", async ({ page }) => {
  await isolatedPage(page);
  await page.getByText("环境调试", { exact: true }).click();
  await page.locator("#env-date").fill("2026-12-21T18:30");
  await page.locator("#env-date").dispatchEvent("change");
  await page.locator("#env-time-mode").selectOption("scene");
  await page.locator("#env-weather").selectOption("snow");
  await page.locator("#env-phase").selectOption("0.5");
  await page.locator("#env-phase-range").fill("0.615");
  await page.locator("#env-phase-range").dispatchEvent("change");
  await page.locator("#env-cloud").fill("0.7"); await page.locator("#env-cloud").dispatchEvent("change");
  await page.locator("#env-wind").fill("8"); await page.locator("#env-wind").dispatchEvent("change");
  await page.locator("#env-density").fill("1.8"); await page.locator("#env-density").dispatchEvent("change");
  await page.locator("#env-vessel").selectOption("ferry");
  await page.locator("#env-route").selectOption("arc");
  await page.locator("#env-paths").check();
  await page.locator("#env-quality").selectOption("low");
  expect(await page.evaluate(() => Object.assign({}, ...(window as any).__environmentChanges))).toMatchObject({
    timestamp: Date.parse("2026-12-21T16:30:00Z"), timeMode: "scene", weather: "snow", moonPhase: .615,
    cloudCover: .7, windSpeed: 8, vesselDensity: 1.8, vesselKind: "ferry", vesselRoute: "arc", paths: true, quality: true,
  });
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await page.getByRole("button", { name: "恢复真实时间与自动环境" }).click();
  expect(await page.evaluate(() => {
    const patches = (window as any).__environmentChanges, patch = patches.at(-1);
    return { mode: patch.timeMode, paths: patch.paths, cleared: ["timestamp", "weather", "moonPhase", "cloudCover", "windSpeed", "vesselDensity", "vesselRoute", "vesselKind", "quality"].every(key => Object.hasOwn(patch, key) && patch[key] === undefined) };
  })).toEqual({ mode: "local-clock", paths: false, cleared: true });
  await expect(page.locator("#env-weather")).toHaveValue(""); await expect(page.locator("#env-quality")).toHaveValue("auto");
  await expect(page.locator("#env-date")).toHaveValue("");
});

test("debug UI is mobile safe, hides while reading and disposes its controls without leaking handlers", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await isolatedPage(page, "?debugEnv=1&envPhase=.5");
  await page.getByText("环境调试", { exact: true }).click();
  await page.evaluate(() => (window as any).__environmentDebug.update({
    timestamp: Date.parse("2026-06-21T09:00:00Z"), timeZone: "Europe/Athens", weather: "clear", sunAltitude: Math.PI / 4, moonPhase: .5, vessels: 2, low: true,
  }));
  await expect(page.locator(".environment-debug-status")).toContainText("模拟天气：晴天");
  await expect(page.locator(".environment-debug-status")).toContainText("太阳高度 45.0°");
  await expect(page.locator("#env-date")).toHaveValue("2026-06-21T12:00");
  const box = await page.locator(".environment-debug").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  for (const state of ["reading", "book-transition"]) {
    await page.evaluate(state => document.body.classList.add(state), state);
    await expect(page.locator(".environment-debug")).toBeHidden();
    await page.evaluate(state => document.body.classList.remove(state), state);
  }
  const changes = await page.evaluate(() => {
    const host = window as any, saved = document.getElementById("env-weather") as HTMLSelectElement;
    host.__environmentDebug.dispose(); host.__environmentDebug.dispose();
    saved.value = "rain"; saved.dispatchEvent(new Event("change"));
    host.__environmentDebug.update({ timestamp: Date.now(), timeZone: "Europe/Athens", weather: "rain", sunAltitude: 0, moonPhase: .5, vessels: 0, low: false });
    return host.__environmentChanges.length;
  });
  expect(changes).toBe(0); await expect(page.locator(".environment-debug")).toHaveCount(0);
});
