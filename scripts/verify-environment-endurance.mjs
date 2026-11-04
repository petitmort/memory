import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Real wall-clock endurance run, using the project's existing Playwright/Chrome.
// project-node scripts/verify-environment-endurance.mjs --check
// project-node scripts/verify-environment-endurance.mjs --duration=180 --gc --output=/tmp/memory-endurance
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowed = new Set(['duration', 'url', 'output', 'gc', 'width', 'height', 'check', 'help']);
const options = {};
for (let index = 2; index < process.argv.length; index++) {
  const argument = process.argv[index], match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
  if (!match || !allowed.has(match[1])) throw new Error(`Unknown option: ${argument}`);
  const flag = ['gc', 'check', 'help'].includes(match[1]);
  const value = match[2] ?? (flag ? 'true' : process.argv[++index]);
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${match[1]}`);
  options[match[1]] = value;
}
if (options.help) {
  process.stdout.write('Chrome environment endurance experiment\n'
    + 'Options: --duration=180 (seconds, minimum 180) --url=http://127.0.0.1:5173/\n'
    + '         --output=DIRECTORY --gc[=true|false] --width=960 --height=640 --check\n'
    + 'No dependency installation, server startup, source edits or production deployment.\n');
  process.exit(0);
}
const integer = (name, fallback, minimum, maximum) => {
  const value = Number(options[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid --${name}: expected ${minimum}–${maximum}`);
  return value;
};
const boolean = (name, fallback = false) => {
  const value = options[name];
  if (value === undefined) return fallback;
  if (value !== 'true' && value !== 'false') throw new Error(`Invalid --${name}: expected true or false`);
  return value === 'true';
};
const durationMs = integer('duration', 180, 180, 86400) * 1000;
const viewport = { width: integer('width', 960, 320, 7680), height: integer('height', 640, 320, 4320) };
const collectGarbage = boolean('gc'), checkOnly = boolean('check');
const url = new URL(options.url ?? 'http://127.0.0.1:5173/');
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('--url must use HTTP or HTTPS');
const output = resolve(options.output ?? join(root, '.work/environment-endurance', new Date().toISOString().replaceAll(':', '-')));
const executablePath = process.env.CHROMIUM_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium');
const probeMarker = 'const ray = new THREE.Raycaster();';
const tickMarker = 'function tick(now) {';
const renderMarker = 'renderer.render(scene, camera);';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const log = message => process.stdout.write(`${new Date().toISOString()} ${message}\n`);

async function sourceFingerprint() {
  const paths = [];
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) await visit(path); else if (item.isFile()) paths.push(path);
    }
  }
  await visit(join(root, 'src'));
  const hash = createHash('sha256');
  for (const path of paths.sort()) hash.update(relative(root, path)).update('\0').update(await readFile(path)).update('\0');
  return { files: paths.length, sha256: hash.digest('hex') };
}

await access(executablePath, constants.R_OK | constants.X_OK);
const source = await sourceFingerprint();
if (checkOnly) {
  const response = await fetch(new URL('/src/scene.ts', url), { signal: AbortSignal.timeout(10000) });
  assert(response.ok, `Vite scene module returned HTTP ${response.status}`);
  const module = await response.text();
  for (const marker of [probeMarker, tickMarker, renderMarker]) assert(module.includes(marker), `Missing transformed scene marker: ${marker}`);
  assert(module.includes('environment.snapshot') || module.includes('createEnvironmentController'), 'No calendar environment controller in scene module');
  process.stdout.write(JSON.stringify({ status: 'checked', browserLaunched: false, root, executablePath,
    url: url.href, durationSeconds: durationMs / 1000, sampleSeconds: 15, cpuThrottleSecondHalf: 4,
    collectGarbage, source, output, instrumentationMarkers: 'present' }, null, 2) + '\n');
  process.exit(0);
}

const report = {
  schema: 1, status: 'running', startedAt: new Date().toISOString(),
  environment: { platform: process.platform, architecture: process.arch, node: process.version,
    browserExecutable: executablePath, url: url.href, viewport, dpr: 1, reducedMotion: true,
    requestedDurationMs: durationMs, sampleIntervalMs: 15000, cpuThrottleSecondHalf: 4, collectGarbage },
  limitations: [
    'Desktop Chrome with CDP CPU throttling is a laboratory experiment, not a physical phone, Safari or thermal/battery measurement.',
    'Background cycles dispatch the existing visibilitychange path with an overridden document.hidden; they do not suspend the operating-system process.',
    'CDP JS heap excludes GPU and browser-process memory. Raw and optional post-GC heaps are observations without an invented pass/fail size limit.',
    'Resource plateau checks cover this finite repeated-state run and cannot prove the absence of all long-term leaks.',
    'Source interception adds constant counters only; no per-frame arrays, fake clock or fast-forwarded environment time are used.',
  ],
  sourceBefore: source, steps: [], samples: [], references: [], errors: [], consoleErrors: [], requestFailures: [], cleanupErrors: [],
};
let browser, context, page, cdp, start, cpuRate = 1, stopped;
const interruption = new AbortController();
const interrupt = signal => { stopped = signal; interruption.abort(new Error(`Interrupted by ${signal}`)); };
const onInterrupt = () => interrupt('SIGINT'), onTerminate = () => interrupt('SIGTERM');
process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);
const pause = milliseconds => delay(milliseconds, undefined, { signal: interruption.signal });
const elapsed = () => start === undefined ? null : Math.round(performance.now() - start);

async function snapshot() {
  return page.evaluate(() => window.__environmentEndurance.snapshot());
}
async function metrics() {
  const response = await cdp.send('Performance.getMetrics');
  const values = Object.fromEntries(response.metrics.map(metric => [metric.name, metric.value]));
  return { jsHeapUsedBytes: values.JSHeapUsedSize ?? null, jsHeapTotalBytes: values.JSHeapTotalSize ?? null,
    taskDurationSeconds: values.TaskDuration ?? null, scriptDurationSeconds: values.ScriptDuration ?? null,
    ...await cdp.send('Memory.getDOMCounters') };
}
async function sample(label, { gc = false } = {}) {
  const currentSource = await sourceFingerprint();
  assert(currentSource.sha256 === source.sha256, 'Source files changed during the endurance run; restart with an unchanged checkout');
  const state = await snapshot(), memory = await metrics();
  const record = { label, elapsedMs: elapsed(), at: new Date().toISOString(), cpuRate, state, memory };
  const previous = report.samples.at(-1);
  if (previous) {
    const wallMs = record.elapsedMs - previous.elapsedMs, drawnFrames = state.frames - previous.state.frames;
    record.interval = { wallMs, drawnFrames,
      drawnFramesPerSecondIncludingPauses: wallMs > 0 ? drawnFrames * 1000 / wallMs : null,
      averageCpuSubmitMs: drawnFrames > 0 ? (state.submitMs - previous.state.submitMs) / drawnFrames : null,
      environmentUpdates: state.environment.updates - previous.state.environment.updates };
  }
  if (gc && collectGarbage) {
    await cdp.send('HeapProfiler.collectGarbage');
    record.afterGarbageCollection = await metrics();
  }
  report.samples.push(record);
  log(`sample ${label} t=${record.elapsedMs}ms CPU=${cpuRate}× resources=${JSON.stringify(state.resources)} heap=${memory.jsHeapUsedBytes} updates=${state.environment.updates}`);
  return record;
}
async function step(name, action) {
  interruption.signal.throwIfAborted();
  const record = { name, elapsedMs: elapsed(), startedAt: new Date().toISOString(), status: 'running' };
  report.steps.push(record); log(`begin ${name}`);
  const before = performance.now();
  try {
    const value = await action(); if (value !== undefined) record.result = value;
    record.status = 'passed';
  } catch (error) { record.status = 'failed'; record.error = error.message; throw error; }
  finally { record.durationMs = Math.round(performance.now() - before); log(`${record.status} ${name} (${record.durationMs}ms)`); }
}
async function waitUntil(target) {
  while (performance.now() - start < target) await pause(Math.min(1000, target - (performance.now() - start)));
}
async function debugValue(selector, value) {
  await page.evaluate(({ selector, value }) => {
    const control = document.querySelector(selector);
    if (!control) throw new Error(`Missing environment control ${selector}`);
    control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, value });
}
async function environment(date, weather, vessel, route) {
  for (const [selector, value] of Object.entries({ '#env-date': date, '#env-weather': weather, '#env-vessel': vessel, '#env-route': route }))
    await debugValue(selector, value);
  await page.waitForFunction(({ date, weather }) => {
    const state = window.__environmentEndurance.snapshot().environment;
    return document.querySelector('#env-date').value.startsWith(date.slice(0, 16)) && state.weather.kind === weather;
  }, { date, weather }, { timeout: 30000 });
}
async function readingCycle() {
  await page.locator('#open-book').click();
  await page.locator('#reader').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#reader').dataset.phase === 'ready' && window.__environmentEndurance.snapshot().environment.paused);
  const before = await snapshot(); await pause(1600); const after = await snapshot();
  assert(after.environment.updates === before.environment.updates, 'Environment updated while the reader was paused');
  assert(after.frames === before.frames && after.callbacks === before.callbacks, '3D rendering continued while the reader was paused');
  await page.locator('#next').click();
  await pause(400);
  await page.locator('#close-book').click();
  await page.locator('#room-ui').waitFor({ state: 'visible' });
  await page.waitForFunction(previous => {
    const state = window.__environmentEndurance.snapshot().environment;
    return !state.paused && state.updates > previous.updates && state.timestamp > previous.timestamp;
  }, before.environment);
  const resumed = await snapshot();
  return { before: { updates: before.environment.updates, frames: before.frames, timestamp: before.environment.timestamp },
    paused: { updates: after.environment.updates, frames: after.frames },
    resumed: { updates: resumed.environment.updates, timestamp: resumed.environment.timestamp }, wallTimeAdvancedMs: resumed.environment.timestamp - before.environment.timestamp };
}
async function backgroundCycle() {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const before = await snapshot();
  assert(before.environment.paused, 'The visibilitychange path did not pause the environment');
  await pause(1700); const after = await snapshot();
  assert(after.environment.updates === before.environment.updates, 'Environment updated during synthetic background pause');
  assert(after.frames === before.frames && after.callbacks === before.callbacks, '3D rendering continued during synthetic background pause');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(previous => {
    const state = window.__environmentEndurance.snapshot().environment;
    return !state.paused && state.updates > previous.updates && state.timestamp > previous.timestamp;
  }, before.environment);
  const resumed = await snapshot();
  return { updatesBefore: before.environment.updates, updatesWhileHidden: after.environment.updates,
    resumedUpdates: resumed.environment.updates, wallTimeAdvancedMs: resumed.environment.timestamp - before.environment.timestamp };
}

await mkdir(output, { recursive: true });
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  page = await context.newPage(); page.setDefaultTimeout(90000);
  page.on('pageerror', error => report.errors.push({ elapsedMs: elapsed(), message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ elapsedMs: elapsed(), message: message.text() }); });
  page.on('requestfailed', request => report.requestFailures.push({ elapsedMs: elapsed(), url: request.url(), error: request.failure()?.errorText }));
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(); let module = await response.text();
    for (const marker of [probeMarker, tickMarker, renderMarker]) assert(module.includes(marker), `Missing transformed scene marker: ${marker}`);
    module = module.replace(probeMarker, `
      window.__environmentEndurance = {
        callbacks: 0, frames: 0, submitMs: 0, maxSubmitMs: 0,
        draw(milliseconds) { this.frames++; this.submitMs += milliseconds; this.maxSubmitMs = Math.max(this.maxSubmitMs, milliseconds); },
        snapshot() { return {
          callbacks: this.callbacks, frames: this.frames, submitMs: this.submitMs, maxSubmitMs: this.maxSubmitMs,
          resources: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length },
          render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() },
          environment: environment.snapshot(), waterTime: seaMat.uniforms.time.value,
          stage: current, animating, readerBackdropFrozen, hidden: document.hidden,
          viewport: { width: innerWidth, height: innerHeight }, contextLost: renderer.getContext().isContextLost(),
        }; },
      };
      ${probeMarker}`);
    module = module.replace(tickMarker, `${tickMarker} window.__environmentEndurance.callbacks++;`);
    module = module.replaceAll(renderMarker, `{ const enduranceSubmitStart = performance.now(); ${renderMarker} window.__environmentEndurance?.draw(performance.now() - enduranceSubmitStart); }`);
    await route.fulfill({ response, body: module });
  });
  cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  report.environment.browser = browser.version();
  for (const [key, value] of Object.entries({ debugEnv: '1', envTimeMode: 'scene', envDate: '2026-06-21T12:00', envWeather: 'clear', envQuality: 'normal', envDensity: '1' })) url.searchParams.set(key, value);
  report.environment.loadedURL = url.href;
  await step('Load Vite scene and enter through the two separate actions', async () => {
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.locator('#loading').waitFor({ state: 'hidden', timeout: 120000 });
    assert(await page.evaluate(() => !!window.__environmentEndurance), 'The scene probe was not loaded; use the Vite development server');
    await page.locator('#enter').click();
    await page.waitForFunction(() => { const button = document.querySelector('#enter'); return !button.disabled && button.textContent.includes('推开这扇门'); });
    await page.locator('#enter').click();
    await page.locator('#room-ui').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.__environmentEndurance.snapshot().stage === 'room');
    return page.evaluate(() => {
      const gl = document.querySelector('#world canvas').getContext('webgl2'), extension = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      return { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemoryGiB: navigator.deviceMemory ?? null,
        renderer, softwareRendererDetected: /swiftshader|llvmpipe|softpipe|swrast|software rasterizer/i.test(renderer) };
    });
  });
  start = performance.now(); report.continuousRunStartedAt = new Date().toISOString();
  await sample('initial-room');
  const events = [], cycleMs = durationMs / 3;
  const kinds = ['wood-sail', 'twin-mast', 'fishing', 'catamaran', 'motor-yacht', 'ferry'];
  for (let cycle = 0; cycle < 3; cycle++) {
    const event = (fraction, name, action) => events.push({ at: cycle * cycleMs + fraction * cycleMs, name: `cycle ${cycle + 1}: ${name}`, action });
    event(0, 'sunny summer and first boat type', () => environment('2026-06-21T12:00', 'clear', kinds[cycle * 2], 'left-to-right'));
    event(.12, 'rainy autumn dusk and second boat type', () => environment('2026-10-01T18:45', 'rain', kinds[cycle * 2 + 1], 'diagonal'));
    event(.25, 'read, turn a chapter, close and restore actual time', readingCycle);
    event(.40, 'background pause and restore actual time', backgroundCycle);
    event(.52, 'winter snow and approaching traffic', () => environment('2026-01-15T12:00', 'snow', kinds[cycle * 2], 'approach'));
    event(.66, 'portrait/landscape resizing', async () => {
      await page.setViewportSize({ width: 390, height: 844 }); await pause(350);
      await page.setViewportSize({ width: 844, height: 390 }); await pause(350);
      await page.setViewportSize(viewport); await pause(350);
      assert(!(await snapshot()).contextLost, 'WebGL context was lost while resizing');
    });
    event(.73, 'low quality', async () => { await debugValue('#env-quality', 'low'); await page.waitForFunction(() => window.__environmentEndurance.snapshot().environment.low); });
    event(.82, 'restore identical reference sky and automatic boat types', async () => {
      await environment('2026-06-21T12:00', 'clear', '', '');
      await debugValue('#env-quality', 'normal');
      await page.waitForFunction(() => !window.__environmentEndurance.snapshot().environment.low);
    });
    event(.98, 'record repeated reference state', async () => {
      const reference = await sample(`reference-${cycle + 1}`, { gc: true }); report.references.push(reference);
    });
  }
  events.push({ at: durationMs / 2, name: 'Enable CDP CPU rate 4 for the second half', action: async () => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); cpuRate = 4;
    return { rate: cpuRate, note: 'Desktop CPU stress only; not a physical-device measurement.' };
  } });
  for (let at = 15000; at <= durationMs; at += 15000)
    events.push({ at, name: `periodic ${Math.round(at / 1000)}s`, sampling: true });
  events.sort((a, b) => a.at - b.at);
  for (const event of events) {
    await waitUntil(event.at);
    if (event.sampling) await sample(event.name); else await step(event.name, event.action);
    assert(report.errors.length === 0, 'Page errors were captured; inspect result.json');
    assert(report.consoleErrors.length === 0, 'Browser console errors were captured; inspect result.json');
  }
  await waitUntil(durationMs);
  report.actualContinuousDurationMs = elapsed();
  assert(report.actualContinuousDurationMs >= durationMs, 'The real continuous run ended before the requested wall-clock duration');
  const final = await sample('final', { gc: true });
  assert(final.state.stage === 'room' && !final.state.environment.paused && !final.state.contextLost, 'The final scene was not an active room');
  const resourceKeys = ['geometries', 'textures', 'programs'];
  const settled = report.references.at(-1), prior = report.references.slice(0, -1);
  report.resourcePlateau = Object.fromEntries(resourceKeys.map(key => {
    const previousMaximum = Math.max(...prior.map(reference => reference.state.resources[key]));
    return [key, { references: report.references.map(reference => reference.state.resources[key]), previousMaximum,
      final: settled.state.resources[key], plateau: settled.state.resources[key] <= previousMaximum }];
  }));
  assert(Object.values(report.resourcePlateau).every(resource => resource.plateau), 'Repeated identical-state renderer resources kept increasing in the final cycle');
  const heaps = report.samples.map(item => item.memory.jsHeapUsedBytes).filter(Number.isFinite);
  report.heapObservations = { samples: heaps.length, initialBytes: heaps[0], finalBytes: heaps.at(-1), minimumBytes: Math.min(...heaps), maximumBytes: Math.max(...heaps),
    finalMinusInitialBytes: heaps.at(-1) - heaps[0],
    postGCReferences: report.references.filter(item => item.afterGarbageCollection).map(item => ({ label: item.label, elapsedMs: item.elapsedMs, jsHeapUsedBytes: item.afterGarbageCollection.jsHeapUsedBytes })),
    judgment: 'Recorded factual raw/optional post-GC ranges and repeated-state deltas; no arbitrary heap-size pass threshold.' };
  report.sourceAfter = await sourceFingerprint();
  assert(report.sourceAfter.sha256 === source.sha256, 'Source files changed during the run');
  report.finalScreenshot = join(output, 'final.png');
  await page.screenshot({ path: report.finalScreenshot });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack ?? error.message;
  process.exitCode = stopped ? 130 : 1;
  if (page && !page.isClosed()) {
    try { report.failureState = await snapshot(); } catch (captureError) { report.cleanupErrors.push(`Failure snapshot: ${captureError.message}`); }
    try { report.failureScreenshot = join(output, 'failure.png'); await page.screenshot({ path: report.failureScreenshot, timeout: 10000 }); }
    catch (captureError) { report.cleanupErrors.push(`Failure screenshot: ${captureError.message}`); }
  }
} finally {
  if (cdp) try { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); } catch (error) { report.cleanupErrors.push(`Restore owned CDP session: ${error.message}`); }
  if (context) try { await context.close(); } catch (error) { report.cleanupErrors.push(`Close owned context: ${error.message}`); }
  if (browser) try { await browser.close(); } catch (error) { report.cleanupErrors.push(`Close owned browser: ${error.message}`); }
  if (report.cleanupErrors.length && report.status === 'passed') { report.status = 'failed'; process.exitCode = 1; }
  if (stopped) report.interruptedBy = stopped;
  report.completedAt = new Date().toISOString();
  report.totalDurationMs = Date.now() - Date.parse(report.startedAt);
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ status: report.status, output, result: join(output, 'result.json'),
    actualContinuousDurationMs: report.actualContinuousDurationMs, resourcePlateau: report.resourcePlateau,
    heapObservations: report.heapObservations, pageErrors: report.errors.length, consoleErrors: report.consoleErrors.length,
    failure: report.failure }, null, 2) + '\n');
  process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
}
