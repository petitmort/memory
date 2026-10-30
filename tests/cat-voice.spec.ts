import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the real voice module in Node. Only Vite's binary-asset import is
// substituted; each selected profile still uses one decoded recording/source.
const compiled = ts.transpileModule(
  readFileSync(new URL('../src/cat-voice.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const voiceModule: { exports: Record<string, any> } = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  (name: string) => {
    if (!name.endsWith('.mp3')) throw new Error(`Unexpected module: ${name}`);
    return { default: '/' + name.split('/').at(-1) };
  }, voiceModule, voiceModule.exports,
);
const createCatVoice = voiceModule.exports.createCatVoice as typeof import('../src/cat-voice').createCatVoice;

class RecordingSource {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  disconnected = false;
  startedAt: number | undefined;
  stoppedAt = Infinity;
  ended = false;
  constructor(private context: RecordingContext) {}
  connect() {}
  disconnect() { this.disconnected = true; }
  start(at = this.context.currentTime) { this.startedAt = at; this.context.starts++; }
  stop(at = this.context.currentTime) { this.stoppedAt = Math.min(at, this.stoppedAt); }
  tick() {
    if (this.ended || this.startedAt === undefined || !this.buffer) return;
    if (this.context.currentTime < Math.min(this.stoppedAt, this.startedAt + this.buffer.duration)) return;
    this.ended = true;
    this.onended?.();
  }
  get audible() { return this.startedAt !== undefined && !this.ended && !this.disconnected; }
}
class RecordingContext extends EventTarget {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};
  starts = 0;
  decodes = 0;
  sources: RecordingSource[] = [];
  async decodeAudioData(_data?: ArrayBuffer): Promise<{ duration: number }> { this.decodes++; return { duration: 3.6 }; }
  createBufferSource() { const source = new RecordingSource(this); this.sources.push(source); return source; }
  createGain() {
    return { connect() {}, disconnect() {}, gain: {
      value: .5, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {},
    } };
  }
  advance(seconds: number) { this.currentTime += seconds; for (const source of this.sources) source.tick(); }
  changeState(state: AudioContextState) { this.state = state; this.dispatchEvent(new Event('statechange')); }
  get audible() { return this.sources.filter(source => source.audible).length; }
  get audio() { return this as unknown as AudioContext; }
}

test('a complete purr-and-meow is one optional voice; interrupted pets cannot leave a delayed meow', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const visibility = { hidden: false };
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  }) as typeof fetch;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: visibility });
  const context = new RecordingContext(), voice = createCatVoice(context.audio);
  try {
    expect(voice.captureClock()).toBeUndefined();
    expect(voice.play()).toBe(false);
    await voice.ready;
    expect(voice.captureClock()).toBeUndefined();
    expect(context.starts).toBe(0);
    expect(voice.play()).toBe(false); // Preparing in a suspended context is silent.
    context.changeState('running');
    expect(voice.play()).toBe(true);
    expect(voice.play()).toBe(false); // Repeated pets cannot overlap the recording.
    context.advance(2.9); // The tail belongs to that same source, after the purr.
    expect(context.audible).toBe(1);
    expect(context.sources).toHaveLength(1);
    context.advance(.8);
    expect(context.audible).toBe(0);
    expect(context.starts).toBe(1);

    expect(voice.play()).toBe(true);
    context.advance(1); // Mute or enter reading while the purr is still playing.
    voice.setEnabled(false);
    context.advance(.1);
    expect(context.audible).toBe(0);
    voice.setEnabled(true);
    context.advance(5);
    expect(context.starts).toBe(2); // Re-enabling cannot play the cancelled meow.

    expect(voice.play()).toBe(true);
    context.advance(.5);
    voice.setEnabled(false); // Hide during an already scheduled mute fade.
    visibility.hidden = true;
    voice.stop();
    expect(context.audible).toBe(0);
    context.changeState('suspended');
    visibility.hidden = false;
    context.changeState('running');
    voice.setEnabled(true);
    context.advance(5);
    expect(context.starts).toBe(3);

    expect(voice.play()).toBe(true);
    context.changeState('suspended'); // Audio-device interruptions also cancel it.
    expect(context.audible).toBe(0);
    context.changeState('running');
    context.advance(5);
    expect(context.starts).toBe(4);
    expect(requests).toBe(6);
    expect(context.decodes).toBe(6);
  } finally {
    voice.dispose();
    globalThis.fetch = originalFetch;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('unavailable or late voice preparation never starts or queues a pet sound', async () => {
  const originalFetch = globalThis.fetch;
  const contexts: RecordingContext[] = [];
  const voices: ReturnType<typeof createCatVoice>[] = [];
  const create = () => {
    const context = new RecordingContext(); context.changeState('running'); contexts.push(context);
    const voice = createCatVoice(context.audio); voices.push(voice); return { context, voice };
  };
  try {
    globalThis.fetch = (async () => { throw new Error('Optional recording is offline'); }) as typeof fetch;
    const offline = create(); await offline.voice.ready;
    expect(offline.voice.play()).toBe(false);
    expect(offline.voice.captureClock()).toBeUndefined();
    offline.voice.setEnabled(false); offline.voice.setEnabled(true);

    globalThis.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as typeof fetch;
    const context = new RecordingContext(); context.changeState('running'); contexts.push(context);
    const finishDecode: ((buffer: { duration: number }) => void)[] = [];
    context.decodeAudioData = () => new Promise(resolve => { finishDecode.push(resolve); });
    const late = createCatVoice(context.audio); voices.push(late);
    // Wait for the asynchronous fetch/arrayBuffer pipeline, not a wall-clock timer.
    for (let turn = 0; finishDecode.length < 6 && turn < 20; turn++) await Promise.resolve();
    expect(finishDecode).toHaveLength(6);
    expect(late.play()).toBe(false);
    expect(late.captureClock()).toBeUndefined();
    late.dispose();
    finishDecode.forEach(finish => finish({ duration: 3.6 })); await late.ready;
    expect(late.play()).toBe(false);
    for (const owner of contexts) { owner.advance(10); expect(owner.starts).toBe(0); }
  } finally {
    for (const voice of voices) voice.dispose();
    globalThis.fetch = originalFetch;
  }
});

test('a captured reaction clock follows its own sound through the quiet settle and a later pet', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as typeof fetch;
  const context = new RecordingContext();
  context.currentTime = 12;
  context.changeState('running');
  const voice = createCatVoice(context.audio);
  try {
    await voice.ready;
    expect(voice.captureClock()).toBeUndefined();
    expect(voice.play()).toBe(true);
    const first = voice.captureClock()!;
    expect(first()).toBe(0);
    context.advance(2.8);
    expect(first()).toBeCloseTo(2.8, 8);
    expect(voice.play()).toBe(false);
    expect(first()).toBeCloseTo(2.8, 8);

    context.advance(.9); // Natural source.onended occurs before the pose settles.
    expect(context.audible).toBe(0);
    expect(voice.captureClock()).toBeUndefined();
    expect(first()).toBeCloseTo(3.7, 8);

    expect(voice.play()).toBe(true);
    const second = voice.captureClock()!;
    expect(second()).toBe(0);
    context.advance(.2);
    expect(first()).toBeCloseTo(3.9, 8);
    expect(second()).toBeCloseTo(.2, 8);
    expect(context.starts).toBe(2);
    expect(context.decodes).toBe(6);
  } finally {
    voice.dispose();
    globalThis.fetch = originalFetch;
  }
});

test('a device interruption lets the captured pose settle monotonically without restarting audio', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Object.getOwnPropertyDescriptor(performance, 'now');
  globalThis.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as typeof fetch;
  const context = new RecordingContext(); context.changeState('running');
  const voice = createCatVoice(context.audio);
  let wallTime = 10000;
  try {
    await voice.ready;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => wallTime });
    expect(voice.play()).toBe(true);
    const clock = voice.captureClock()!;
    context.advance(1.2);
    expect(clock()).toBeCloseTo(1.2, 8);
    context.changeState('suspended');
    expect(context.audible).toBe(0);
    expect(clock()).toBeCloseTo(1.2, 8);
    wallTime += 250;
    expect(clock()).toBeCloseTo(1.45, 8);

    context.changeState('running');
    context.advance(.01); // Resuming the device cannot rewind the quiet settle.
    wallTime += 550;
    expect(clock()).toBeCloseTo(2, 8);
    wallTime += 2200;
    expect(clock()).toBeCloseTo(4.2, 8);
    expect(context.starts).toBe(1);
  } finally {
    voice.dispose();
    globalThis.fetch = originalFetch;
    if (originalNow) Object.defineProperty(performance, 'now', originalNow);
    else Reflect.deleteProperty(performance, 'now');
  }
});

test('the requested mood selects its actual decoded buffer and immutable playback identity', async () => {
  const originalFetch = globalThis.fetch;
  const files = ['cat-purr.mp3', 'cat-curious.mp3', 'cat-affectionate.mp3', 'cat-sleepy.mp3', 'cat-playful.mp3', 'cat-stretch.mp3'];
  const ids = ['content', 'curious', 'affectionate', 'sleepy', 'playful', 'stretch'] as const;
  globalThis.fetch = (async input => {
    const index = files.indexOf(String(input).split('/').at(-1)!);
    expect(index).toBeGreaterThanOrEqual(0);
    return { ok: true, arrayBuffer: async () => new Uint8Array([index]).buffer };
  }) as typeof fetch;
  const context = new RecordingContext(); context.changeState('running');
  context.decodeAudioData = async data => {
    context.decodes++;
    return { duration: 3.6, recording: new Uint8Array(data!)[0] };
  };
  const voice = createCatVoice(context.audio);
  try {
    await voice.ready;
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      expect(voice.isReady(id)).toBe(true);
      expect(voice.play(id)).toBe(true);
      expect(voice.getActiveProfile()).toBe(id);
      expect((context.sources.at(-1)!.buffer as any).recording).toBe(index);
      const clock = voice.captureClock()!;
      context.advance(.2); expect(clock()).toBeCloseTo(.2, 8);
      expect(voice.play(ids[(index + 1) % ids.length])).toBe(false);
      expect(voice.getActiveProfile()).toBe(id);
      context.advance(3.5);
      expect(voice.getActiveProfile()).toBeUndefined();
      expect(clock()).toBeCloseTo(3.7, 8);
    }
    expect(context.starts).toBe(6); expect(context.decodes).toBe(6);
  } finally { voice.dispose(); globalThis.fetch = originalFetch; }
});

test('one missing mood stays silent without replacing it with a mismatched ready voice', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async input => ({
    ok: !String(input).includes('curious'), status: 404,
    arrayBuffer: async () => new ArrayBuffer(8),
  })) as typeof fetch;
  const context = new RecordingContext(); context.changeState('running');
  const voice = createCatVoice(context.audio);
  try {
    await voice.ready;
    expect(voice.isReady('curious')).toBe(false);
    expect(voice.isReady('playful')).toBe(true);
    expect(voice.play('curious')).toBe(false);
    expect(voice.getActiveProfile()).toBeUndefined(); expect(context.starts).toBe(0);
    expect(voice.play('playful')).toBe(true);
    expect(voice.getActiveProfile()).toBe('playful');
    voice.dispose();
    expect(voice.isReady('playful')).toBe(false);
    expect(voice.getActiveProfile()).toBeUndefined();
  } finally { voice.dispose(); globalThis.fetch = originalFetch; }
});

test('a late individual mood decode neither blocks the ready moods nor starts a queued meow', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async input => ({ ok: true,
    arrayBuffer: async () => new Uint8Array([String(input).includes('curious') ? 1 : 0]).buffer,
  })) as typeof fetch;
  const context = new RecordingContext(); context.changeState('running');
  let finishCurious!: (buffer: { duration: number }) => void;
  context.decodeAudioData = data => new Uint8Array(data!)[0] === 1
    ? new Promise(resolve => { finishCurious = resolve; }) : Promise.resolve({ duration: 3.6 });
  const voice = createCatVoice(context.audio);
  try {
    for (let turn = 0; (!voice.isReady('content') || !finishCurious) && turn < 30; turn++) await Promise.resolve();
    expect(voice.isReady('content')).toBe(true); expect(finishCurious).toBeDefined();
    expect(voice.play('curious')).toBe(false); expect(context.starts).toBe(0);
    expect(voice.play('content')).toBe(true);
    finishCurious({ duration: 3.6 }); await voice.ready;
    expect(context.starts).toBe(1); expect(voice.getActiveProfile()).toBe('content');
    context.advance(4);
    expect(context.starts).toBe(1); expect(voice.getActiveProfile()).toBeUndefined();
    expect(voice.play('curious')).toBe(true); expect(voice.getActiveProfile()).toBe('curious');
  } finally { voice.dispose(); globalThis.fetch = originalFetch; }
});
