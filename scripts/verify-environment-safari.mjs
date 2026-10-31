import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Desktop Safari smoke test. Requires Safari automation and an unlocked, awake desktop.
// Usage: project-node scripts/verify-environment-safari.mjs --url=http://127.0.0.1:4173/ --output=/tmp/memory-safari
// This script owns one safaridriver process and one WebDriver session. It never changes Safari preferences.
const allowed = new Set(['url', 'output', 'port', 'width', 'height', 'timeout', 'click', 'help']);
const options = {};
for (const argument of process.argv.slice(2)) {
  const match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
  if (!match || !allowed.has(match[1]) || (match[1] !== 'help' && !match[2])) throw new Error(`Unknown or incomplete option: ${argument}`);
  options[match[1]] = match[2] ?? true;
}
if (options.help) {
  process.stdout.write('Desktop Safari environment smoke test\nRequires an unlocked, awake macOS desktop and existing Safari automation access.\nOptions: --url=URL --output=DIRECTORY --port=4793 --width=1280 --height=900 --timeout=120000 --click=element|actions\nNative click modes are explicit; neither mode uses JavaScript click().\n');
  process.exit(0);
}
const integer = (name, fallback, minimum, maximum) => {
  const value = Number(options[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid --${name}: expected ${minimum}–${maximum}`);
  return value;
};
const baseURL = new URL(options.url ?? 'http://127.0.0.1:4173/');
if (!['http:', 'https:'].includes(baseURL.protocol)) throw new Error('--url must use HTTP or HTTPS');
const port = integer('port', 4793, 1024, 65535), timeout = integer('timeout', 120000, 1000, 600000);
const clickMode = options.click ?? 'element';
if (!['element', 'actions'].includes(clickMode)) throw new Error('--click must be element or actions');
const windowSize = { width: integer('width', 1280, 640, 7680), height: integer('height', 900, 480, 4320) };
const output = resolve(options.output ?? `.work/environment-safari/${new Date().toISOString().replaceAll(':', '-')}`);
const endpoint = `http://127.0.0.1:${port}`;
const elementKey = 'element-6066-11e4-a52e-4f735466cecf';
const interruption = new AbortController();
let driver, session, ownedHandle, driverOutput = '', driverExit, stopSignal;
const report = {
  schema: 1, startedAt: new Date().toISOString(), status: 'running',
  scope: 'Desktop macOS Safari via safaridriver; no iPhone, iPad or mobile Safari emulation.',
  environment: { platform: process.platform, architecture: process.arch, node: process.version, url: baseURL.href, windowSize, clickMode },
  steps: [], screenshots: [], diagnostics: [], clicks: [], cleanupErrors: [],
};
const stopped = signal => {
  stopSignal = signal;
  interruption.abort(new Error(`Interrupted by ${signal}`));
};
const onInterrupt = () => stopped('SIGINT'), onTerminate = () => stopped('SIGTERM');
process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);
const check = (condition, message) => { if (!condition) throw new Error(message); };

async function request(method, path, body, { cleanup = false, timeoutMs = 15000 } = {}) {
  const timed = AbortSignal.timeout(timeoutMs);
  const response = await fetch(`${endpoint}${path}`, {
    method, headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: cleanup ? timed : AbortSignal.any([timed, interruption.signal]),
  });
  const data = await response.json();
  if (!response.ok || data.value?.error)
    throw new Error(`WebDriver ${method} ${path}: ${data.value?.error ?? response.status} — ${data.value?.message ?? response.statusText}`);
  return data.value;
}
const command = (method, path, body, settings) => request(method, `/session/${session}${path}`, body, settings);
const execute = (script, ...args) => command('POST', '/execute/sync', { script, args });
const pause = milliseconds => delay(milliseconds, undefined, { signal: interruption.signal });

async function poll(label, predicate, duration = timeout) {
  const deadline = Date.now() + duration;
  let lastValue;
  do {
    lastValue = await predicate();
    if (lastValue) return;
    await pause(200);
  } while (Date.now() < deadline);
  const diagnostic = session ? await diagnose(`Timeout: ${label}`) : undefined;
  throw new Error(`Timed out waiting for ${label}; last result=${JSON.stringify(lastValue)}; DOM/state=${JSON.stringify(diagnostic?.page ?? diagnostic)}`);
}
async function dom(label, script, ...args) {
  await poll(label, () => execute(script, ...args));
}
async function click(selector) {
  await dom(`${selector} to become visible and enabled`, `
    const el=document.querySelector(arguments[0]);
    if(!el||el.disabled||el.closest('[inert]'))return false;
    const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    return rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&style.display!=='none'&&Number(style.opacity)>.95;
  `, selector);
  // Switching only our own WebDriver handle is a standard native activation,
  // without changing Safari preferences or touching unrelated user windows.
  const handles = await command('GET', '/window/handles');
  check(handles.includes(ownedHandle), `The verifier's Safari window no longer exists: ${ownedHandle}`);
  await command('POST', '/window', { handle: ownedHandle });
  const beforeActivation = await diagnose(`Before native ${clickMode} click`, selector);
  if (beforeActivation.page?.hidden) {
    // W3C Set Window Rect restores the owned window before setting its bounds.
    await command('POST', '/window/rect', windowSize);
    await command('POST', '/window', { handle: ownedHandle });
    await diagnose('After restoring the hidden owned window', selector);
  }
  const element = await command('POST', '/element', { using: 'css selector', value: selector });
  check(element?.[elementKey], `No W3C element returned for ${selector}`);
  const start = await execute('const qa=window.__safariEnvironmentQA;qa.expectedSelector=arguments[0];return qa.clicks.length;', selector);
  const record = { selector, mode: clickMode, startedAt: new Date().toISOString(), before: beforeActivation };
  report.clicks.push(record);
  try {
    // Both protocol modes preserve native user activation. Never silently use
    // DOM click() when Safari returns success without dispatching a gesture.
    if (clickMode === 'actions') {
      let actionError;
      try {
        await command('POST', '/actions', { actions: [{ type: 'pointer', id: 'safari-verifier-mouse', parameters: { pointerType: 'mouse' }, actions: [
          { type: 'pointerMove', duration: 100, origin: element, x: 0, y: 0 },
          { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 80 }, { type: 'pointerUp', button: 0 },
        ] }] });
      } catch (error) { actionError = error; }
      try { await command('DELETE', '/actions'); }
      catch (error) { record.actionReleaseError = error.message; actionError ??= error; }
      if (actionError) throw actionError;
    } else await command('POST', `/element/${element[elementKey]}/click`, {});
    record.commandReturnedAt = new Date().toISOString();
    await poll(`a real trusted click on ${selector} within 10 seconds`, () => execute(`
      return window.__safariEnvironmentQA.clicks.slice(arguments[0]).some(event=>event.trusted&&event.matches&&event.selector===arguments[1]);
    `, start, selector), 10000);
    record.status = 'delivered';
    record.after = await diagnose('Trusted native click delivered', selector);
  } catch (error) {
    record.status = 'failed'; record.error = error.message;
    record.after = await diagnose('Native click failed or was not delivered', selector);
    throw error;
  }
}

/** No renderer calls: inspect visibility, hit testing and the exact application DOM. */
function pageDiagnostic(selector) {
  const describe = el => el ? { tag: el.tagName, id: el.id, classes: String(el.className?.baseVal ?? el.className ?? '') } : null;
  const inspect = selector => {
    const el = document.querySelector(selector); if (!el) return { selector, exists: false };
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
    const x = Math.floor((Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2);
    const y = Math.floor((Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2);
    const hit = document.elementFromPoint(x, y);
    return { selector, exists: true, ...describe(el), text: el.textContent?.trim().slice(0, 180), disabled: !!el.disabled,
      inertAncestor: describe(el.closest('[inert]')), ariaPressed: el.getAttribute('aria-pressed'), ariaBusy: el.getAttribute('aria-busy'),
      phase: el.dataset.phase, busy: el.dataset.busy, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      style: { display: style.display, visibility: style.visibility, opacity: style.opacity, pointerEvents: style.pointerEvents },
      center: { x, y }, hit: describe(hit), hitInsideTarget: !!hit && (el === hit || el.contains(hit)),
      hitStack: document.elementsFromPoint(x, y).slice(0, 6).map(describe) };
  };
  const selectors = [...new Set([selector, '#enter', '#intro', '#loading', '#room-ui', '#open-book', '#cozy-view', '#pet-cat', '#reader', '#fallback', '.environment-debug'])].filter(Boolean);
  return { url: location.href, title: document.title, readyState: document.readyState, hidden: document.hidden,
    visibilityState: document.visibilityState, focused: document.hasFocus(), bodyClasses: document.body?.className,
    activeElement: describe(document.activeElement), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    window: { x: screenX, y: screenY, width: outerWidth, height: outerHeight },
    screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
    environment: document.querySelector('.environment-debug-status')?.textContent,
    controls: selectors.map(inspect), clickEvents: window.__safariEnvironmentQA?.clicks ?? [],
    pointerEvents: window.__safariEnvironmentQA?.events ?? [], errors: window.__safariEnvironmentQA?.errors ?? [] };
}
async function diagnose(reason, selector) {
  const result = { reason, selector, at: new Date().toISOString(), ownedHandle };
  for (const [key, collect] of [
    ['page', () => execute(`return (${pageDiagnostic.toString()})(arguments[0]);`, selector ?? null)],
    ['url', () => command('GET', '/url')], ['handle', () => command('GET', '/window')],
    ['handles', () => command('GET', '/window/handles')], ['windowRect', () => command('GET', '/window/rect')],
  ]) {
    try { result[key] = await collect(); }
    catch (error) { result[`${key}Error`] = error.message; }
  }
  report.diagnostics.push(result); return result;
}
async function screenshot(name) {
  const data = await command('GET', '/screenshot');
  const path = resolve(output, `${name}.png`);
  const png = Buffer.from(data, 'base64');
  check(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Safari screenshot was not a PNG.');
  await writeFile(path, png);
  report.screenshots.push({ name, path });
  return path;
}
async function snapshot() {
  return execute(`
    const visible=selector=>{const el=document.querySelector(selector);if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
    const canvas=document.querySelector('#world canvas'),gl=canvas?.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return {title:document.title,url:location.href,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
      hidden:document.hidden,visibilityState:document.visibilityState,focused:document.hasFocus(),bodyClasses:document.body?.className,
      renderer:gl?gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER):null,
      room:visible('#room-ui'),fallback:visible('#fallback'),reader:visible('#reader'),readerPhase:document.querySelector('#reader')?.dataset.phase,
      chapter:document.querySelector('#chapter-title')?.textContent,quality:document.querySelector('#quality')?.textContent,
      muted:document.querySelector('#sound')?.getAttribute('aria-pressed')==='false',
      environment:document.querySelector('.environment-debug-status')?.textContent,
      errors:window.__safariEnvironmentQA?.errors??[],trustedClicks:window.__safariEnvironmentQA?.clicks??[]};
  `);
}
async function step(name, action) {
  const record = { name, status: 'running', startedAt: new Date().toISOString() };
  report.steps.push(record); const start = performance.now();
  process.stdout.write(`${name} …\n`);
  try {
    const value = await action(); record.status = 'passed';
    if (value !== undefined) record.result = value;
  } catch (error) {
    record.status = 'failed'; record.error = error.message;
    if (session && !interruption.signal.aborted) record.diagnostic = await diagnose(`Step failed: ${name}`);
    throw error;
  } finally { record.durationMs = Math.round(performance.now() - start); }
}
async function debugValue(selector, value) {
  await execute(`
    const el=document.querySelector(arguments[0]);if(!el)throw new Error('Missing debug control '+arguments[0]);
    el.value=arguments[1];el.dispatchEvent(new Event('change',{bubbles:true}));
  `, selector, value);
}
async function debugOpen(open) {
  const actual = await execute("return document.querySelector('.environment-debug')?.open;");
  if (actual !== open) await click('.environment-debug summary');
}

await mkdir(output, { recursive: true });
try {
  check(process.platform === 'darwin', 'This verifier runs against real macOS Safari and requires macOS.');
  // Refuse a busy port instead of attaching to or stopping another task's driver.
  let busy = false;
  try { await fetch(`${endpoint}/status`, { signal: AbortSignal.timeout(1000) }); busy = true; }
  catch (error) { if (error.cause?.code !== 'ECONNREFUSED') throw new Error(`Cannot verify ownership of Safari driver port ${port}: ${error.message}`); }
  check(!busy, `Port ${port} is already in use; choose another --port. No existing driver was touched.`);
  driver = spawn('/usr/bin/safaridriver', ['--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  driverExit = new Promise(resolveExit => {
    driver.once('exit', (code, signal) => resolveExit({ code, signal }));
    driver.once('error', error => resolveExit({ error: error.message }));
  });
  for (const stream of [driver.stdout, driver.stderr]) stream.on('data', data => { driverOutput = (driverOutput + data.toString()).slice(-64000); });
  await poll('the owned safaridriver to start', async () => {
    if (driver.exitCode !== null || driver.signalCode) throw new Error(`safaridriver exited: ${driverOutput}`);
    try { await request('GET', '/status', undefined, { timeoutMs: 1000 }); return true; }
    catch (error) { if (interruption.signal.aborted) throw error; return false; }
  }, 15000);
  const created = await request('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari', pageLoadStrategy: 'eager' } } }, { timeoutMs: timeout });
  session = created.sessionId; check(session, 'Safari did not return a WebDriver session ID.');
  report.environment.capabilities = created.capabilities;
  ownedHandle = await command('GET', '/window');
  report.environment.ownedHandle = ownedHandle;
  await command('POST', '/timeouts', { implicit: 0, pageLoad: timeout, script: 15000 });
  await command('POST', '/window/rect', windowSize);

  await step('Load sunny production room and retain browser error observations', async () => {
    const url = new URL(baseURL);
    for (const [key, value] of Object.entries({ debugEnv: '1', envTimeMode: 'scene', envDate: '2026-06-21T12:00', envWeather: 'clear' })) url.searchParams.set(key, value);
    await command('POST', '/url', { url: url.href }, { timeoutMs: timeout });
    await execute(`
      window.__safariEnvironmentQA={errors:[],clicks:[],events:[],expectedSelector:null};
      addEventListener('error',event=>window.__safariEnvironmentQA.errors.push(event.message));
      addEventListener('unhandledrejection',event=>window.__safariEnvironmentQA.errors.push(String(event.reason)));
      for(const type of ['pointerdown','pointerup','mousedown','mouseup','click']) document.addEventListener(type,event=>{
        const qa=window.__safariEnvironmentQA,el=event.target.closest?.('button,summary');
        const entry={type,id:el?.id||el?.tagName||event.target.tagName,trusted:event.isTrusted,x:event.clientX,y:event.clientY,
          selector:qa.expectedSelector,matches:!!el&&!!qa.expectedSelector&&el.matches(qa.expectedSelector),at:performance.now()};
        qa.events.push(entry);if(qa.events.length>120)qa.events.shift();
        if(type==='click'&&el)qa.clicks.push(entry);
      },true);
    `);
    await dom('production loading to finish', "const el=document.querySelector('#loading');return !!el&&getComputedStyle(el).display==='none';");
    const initial = await snapshot();
    check(!initial.fallback, 'The production room entered WebGL fallback.');
    check(initial.renderer, 'No active WebGL2 renderer was reported by Safari.');
    return { ...initial, diagnostic: await diagnose('Production load completed') };
  });
  await step('Disperse fog and enter through two native clicks', async () => {
    await click('#enter');
    await dom('the separate door action', "const el=document.querySelector('#enter');return !!el&&!el.disabled&&el.textContent.includes('推开这扇门');");
    await click('#enter');
    await dom('room controls after entry', "const el=document.querySelector('#open-book');return !!el&&!el.disabled&&el.getBoundingClientRect().width>0&&Number(getComputedStyle(document.querySelector('#room-ui')).opacity)>.95;");
    await screenshot('sunny-noon-room'); return snapshot();
  });
  await step('Read the live calendar and simulated weather panel', async () => {
    await debugOpen(true);
    await dom('sunny calendar status', "const text=document.querySelector('.environment-debug-status')?.textContent??'';return text.includes('2026-06-21')&&text.includes('模拟天气：晴天');");
    const value = await execute("return {date:document.querySelector('#env-date').value,weather:document.querySelector('#env-weather').value,status:document.querySelector('.environment-debug-status').textContent};");
    check(value.date.startsWith('2026-06-21T12:'), 'Debug date does not match the sunny preview.');
    check(value.weather === 'clear', 'Debug weather selector did not preserve the preview choice.');
    await debugOpen(false); return value;
  });
  await step('Approach the cat, pet it and return to the desk', async () => {
    await click('#cozy-view');
    await dom('cat camera arrival', "const view=document.querySelector('#cozy-view'),pet=document.querySelector('#pet-cat');return view?.getAttribute('aria-pressed')==='true'&&!view.disabled&&!!pet&&!pet.disabled&&pet.getBoundingClientRect().width>0;");
    await screenshot('cat-camera');
    await click('#pet-cat');
    await dom('the cat response to start', "return document.querySelector('#pet-cat')?.dataset.busy==='true';");
    await dom('the cat response to complete', "const pet=document.querySelector('#pet-cat');return !!pet&&!pet.disabled&&pet.dataset.busy!=='true';");
    await click('#cozy-view');
    await dom('desk camera return', "const view=document.querySelector('#cozy-view'),book=document.querySelector('#open-book');return view?.getAttribute('aria-pressed')==='false'&&!view.disabled&&!!book&&!book.disabled&&book.getBoundingClientRect().width>0;");
    return { hint: await execute("return document.querySelector('#pet-hint')?.textContent;") };
  });
  await step('Open the album, turn a chapter and close it continuously', async () => {
    await click('#open-book');
    await dom('the reader to become ready', "return document.querySelector('#reader')?.dataset.phase==='ready'&&document.querySelector('#reader')?.getAttribute('aria-busy')==='false';");
    const hidden = await execute("return getComputedStyle(document.querySelector('.environment-debug')).display==='none';");
    check(hidden, 'Environment debug tools overlap the reading interface.');
    const before = await execute("return document.querySelector('#chapter-title')?.textContent;");
    await click('#next');
    await dom('the next chapter', "const next=document.querySelector('#next'),title=document.querySelector('#chapter-title')?.textContent;return !!title&&title!==arguments[0]&&!next.disabled;", before);
    const after = await execute("return document.querySelector('#chapter-title')?.textContent;");
    await screenshot('album-next-chapter');
    await click('#close-book');
    await dom('the reader to close and room controls to return', "const reader=document.querySelector('#reader'),book=document.querySelector('#open-book');return reader?.dataset.phase==='closed'&&!!book&&!book.disabled&&book.getBoundingClientRect().width>0;");
    return { before, after };
  });
  await step('Switch the live calendar to simulated rain at dusk', async () => {
    await debugOpen(true);
    await debugValue('#env-date', '2026-10-01T18:45');
    await debugValue('#env-weather', 'rain');
    await dom('rainy dusk state', "const text=document.querySelector('.environment-debug-status')?.textContent??'';return text.includes('2026-10-01')&&text.includes('模拟天气：中雨');");
    // The label changes halfway through the six-second blend; capture the finished scene.
    await pause(3500);
    const value = await snapshot(); await debugOpen(false);
    await screenshot('rainy-dusk-room'); return value;
  });
  await step('Mute and restore audio using native gestures, then select low quality', async () => {
    await click('#sound');
    await dom('the muted state', "return document.querySelector('#sound')?.getAttribute('aria-pressed')==='false'&&document.querySelector('#sound')?.getAttribute('aria-label')==='开启声音';");
    await click('#sound');
    await dom('sound to restore', "return document.querySelector('#sound')?.getAttribute('aria-pressed')==='true';");
    await click('#quality');
    await dom('manual low quality', "return document.querySelector('#quality')?.getAttribute('aria-pressed')==='true'&&document.querySelector('#world canvas')?.dataset.quality==='low';");
    await screenshot('rainy-dusk-low-quality'); return snapshot();
  });
  await step('Verify the room remains available without captured errors and clicks were trusted', async () => {
    const final = await snapshot();
    check(final.room && !final.reader && !final.fallback, 'The final page did not return to the 3D room.');
    check(final.errors.length === 0, `Safari captured browser errors: ${final.errors.join('; ')}`);
    const required = ['enter', 'cozy-view', 'pet-cat', 'open-book', 'next', 'close-book', 'sound', 'quality'];
    for (const id of required) check(final.trustedClicks.some(click => click.id === id && click.trusted), `No trusted native click was recorded for #${id}`);
    check(final.trustedClicks.every(click => click.trusted), 'An untrusted DOM click was used in a gesture-sensitive flow.');
    return final;
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack ?? error.message;
  process.exitCode = stopSignal ? 130 : 1;
  if (session && !interruption.signal.aborted) {
    try { report.failureSnapshot = await snapshot(); } catch (captureError) { report.cleanupErrors.push(`Failure snapshot: ${captureError.message}`); }
    try { await screenshot('failure'); } catch (captureError) { report.cleanupErrors.push(`Failure screenshot: ${captureError.message}`); }
  }
} finally {
  if (session) {
    try { await command('DELETE', '', undefined, { cleanup: true, timeoutMs: 10000 }); }
    catch (error) { report.cleanupErrors.push(`Closing owned session: ${error.message}`); }
  }
  if (driver) {
    if (driver.exitCode === null && !driver.signalCode) driver.kill('SIGTERM');
    let exited = await Promise.race([driverExit, delay(2000, null)]);
    if (!exited && driver.exitCode === null && !driver.signalCode) {
      driver.kill('SIGKILL'); exited = await Promise.race([driverExit, delay(2000, null)]);
    }
    report.driverExit = exited;
  }
  report.completedAt = new Date().toISOString();
  report.errorObservation = 'Window errors and unhandled rejections collected after navigation returned; no claim of complete browser-console capture.';
  if (report.cleanupErrors.length && report.status === 'passed') {
    report.status = 'failed'; report.failure = 'Browser checks passed but owned-session cleanup failed; inspect cleanupErrors.'; process.exitCode = 1;
  }
  if (stopSignal) report.interruptedBy = stopSignal;
  await writeFile(resolve(output, 'driver.log'), driverOutput);
  await writeFile(resolve(output, 'diagnostics.json'), JSON.stringify(report.diagnostics, null, 2) + '\n');
  await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  const failureSummary = report.failure?.split('; DOM/state=')[0].split('\n')[0];
  process.stdout.write(JSON.stringify({ status: report.status, output, result: resolve(output, 'result.json'), screenshots: report.screenshots.length, failure: failureSummary }, null, 2) + '\n');
  process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
}
