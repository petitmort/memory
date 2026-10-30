import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// A repeatable development-server measurement, separate from semantic tests.
// Usage: node scripts/measure-performance.mjs --cpu=4 --output=benchmark/local.json
const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, ...value] = argument.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));
const number = (key, fallback) => {
  const value = Number(options[key] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --${key}`);
  return value;
};
const viewport = { width: number('width', 960), height: number('height', 640) };
const scale = number('dpr', 1), cpu = number('cpu', 1), sampleMs = number('sample-ms', 5000);
const url = options.url || 'http://127.0.0.1:5173/';
const output = resolve(options.output || '.work/performance/latest.json');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport, deviceScaleFactor: scale, hasTouch: true, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(120000);
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await cdp.send('Performance.enable');
const failures = [];
page.on('pageerror', error => failures.push(error.message));
await page.addInitScript(() => {
  window.__benchmarkInputs = { events: [], pointerDispatchMs: [] };
  document.addEventListener('pointerdown', event => {
    window.__benchmarkInputs.pointerDispatchMs.push(Math.max(0, performance.now() - event.timeStamp));
  }, { capture: true });
  if (PerformanceObserver.supportedEntryTypes.includes('event')) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__benchmarkInputs.events.push({
        name: entry.name, durationMs: entry.duration,
        inputDelayMs: entry.processingStart - entry.startTime,
        processingMs: entry.processingEnd - entry.processingStart,
      });
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  }
});
await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
  const response = await route.fetch();
  let source = await response.text();
  const marker = 'const ray = new THREE.Raycaster();';
  if (!source.includes(marker)) throw new Error('Scene instrumentation marker missing');
  source = source.replace(marker, `
    window.__roomBenchmark = {
      frames: [], enabled: false,
      frame(start, end) { if (this.enabled) this.frames.push({ start, submitMs: end-start }); },
      snapshot() { return {
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        programs: renderer.info.programs.length, pixelRatio: renderer.getPixelRatio(), low,
      }; },
    };
    ${marker}
  `);
  source = source.replaceAll('renderer.render(scene, camera);', `{
    const benchmarkStart = performance.now();
    renderer.render(scene, camera);
    window.__roomBenchmark?.frame(benchmarkStart, performance.now());
  }`);
  await route.fulfill({ response, body: source });
});
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
};
const result = {
  schema: 1, environment: {
    viewport, deviceScaleFactor: scale, cpuThrottle: cpu, sampleMs,
    browser: browser.version(), reducedMotion: true,
    note: 'Chromium with SwiftShader in a cloud Linux container; CPU throttling is a lab stress condition, not a physical phone measurement. JS heap excludes GPU and browser-process memory. Frame submission time is CPU work, not GPU completion.',
  },
  errors: failures,
};
try {
  const navigationStart = performance.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('#loading').waitFor({ state: 'hidden' });
  result.loadingMs = performance.now() - navigationStart;
  if (!await page.evaluate(() => !!window.__roomBenchmark)) throw new Error('Run against the Vite development server, not a bundled production page');
  result.environment.device = await page.evaluate(() => {
    const canvas = document.querySelector('#world canvas');
    const gl = canvas?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigator.deviceMemory ?? null,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
  const enteringStart = performance.now();
  await page.locator('#enter').tap();
  await page.waitForFunction(() => !document.querySelector('#enter').disabled);
  await page.locator('#enter').tap();
  await page.locator('#room-ui').waitFor({ state: 'visible' });
  result.entryMs = performance.now() - enteringStart;
  // Skip the immediate reveal; a later automatic change is reported in warnings.
  await page.waitForTimeout(1000);
  result.before = await page.evaluate(() => {
    window.__roomBenchmark.frames.length = 0;
    window.__roomBenchmark.enabled = true;
    return window.__roomBenchmark.snapshot();
  });
  await page.waitForTimeout(sampleMs);
  const sample = await page.evaluate(() => {
    window.__roomBenchmark.enabled = false;
    return { frames: window.__roomBenchmark.frames, render: window.__roomBenchmark.snapshot() };
  });
  const frames = sample.frames;
  const intervals = frames.slice(1).map((frame, index) => frame.start - frames[index].start);
  result.room = {
    ...sample.render, drawnFrames: frames.length,
    measuredFps: intervals.length ? 1000 * intervals.length / intervals.reduce((sum, value) => sum + value, 0) : null,
    frameIntervalMedianMs: percentile(intervals, .5), frameIntervalP95Ms: percentile(intervals, .95),
    frameSubmitP95Ms: percentile(frames.map(frame => frame.submitMs), .95),
  };
  result.warnings = [];
  if (frames.length < 10) result.warnings.push('Fewer than ten drawn frames were collected; frame quantiles have a small sample. Use a longer --sample-ms for timing comparisons.');
  if (result.before.pixelRatio !== result.room.pixelRatio || result.before.low !== result.room.low)
    result.warnings.push('Automatic quality changed during the sample; resource counts are comparable but this is not a stable-quality frame-rate sample.');
  await page.locator('#cozy-view').tap();
  await page.waitForFunction(() => !document.querySelector('#cozy-view').disabled);
  result.input = await page.evaluate(() => ({
    ...window.__benchmarkInputs,
    events: window.__benchmarkInputs.events.filter(event => ['pointerdown', 'click', 'keydown', 'touchstart'].includes(event.name)),
  }));
  const metrics = await cdp.send('Performance.getMetrics');
  result.memory = {
    jsHeapUsedBytes: metrics.metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? null,
    jsHeapTotalBytes: metrics.metrics.find(metric => metric.name === 'JSHeapTotalSize')?.value ?? null,
    ...await cdp.send('Memory.getDOMCounters'),
  };
} catch (error) {
  result.failure = error.message;
  process.exitCode = 1;
} finally {
  await context.close(); await browser.close();
  if (failures.length) process.exitCode = 1;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ output, loadingMs: result.loadingMs, room: result.room, errors: failures, failure: result.failure }, null, 2) + '\n');
}
