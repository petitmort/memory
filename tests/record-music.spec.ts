import { test, expect } from '@playwright/test';
import { createRecordMusic, type RecordMusicState } from '../src/record-music';

class MusicElement extends EventTarget {
  preload = '';
  autoplay = true;
  loop = true;
  volume = 1;
  muted = false;
  paused = true;
  ended = false;
  currentTime = 0;
  src = '';
  currentSrc = '';
  error: { code: number } | null = null;
  plays = 0;
  pauses = 0;
  loads = 0;
  automaticPlay = true;
  pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  play() {
    this.plays++;
    this.paused = false;
    this.ended = false;
    if (this.automaticPlay) {
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => this.pending.push({ resolve, reject }));
  }
  pause() {
    this.pauses++;
    const changed = !this.paused;
    this.paused = true;
    if (changed) this.dispatchEvent(new Event('pause'));
  }
  load() {
    this.loads++;
    this.currentSrc = this.src;
    this.currentTime = 0;
    this.ended = false;
    this.error = null;
    this.paused = true;
  }
  removeAttribute(name: string) { if (name === 'src') this.src = this.currentSrc = ''; }
  resolve(index: number, emitPlaying = true) {
    if (emitPlaying) {
      this.paused = false;
      this.dispatchEvent(new Event('playing'));
    }
    this.pending[index].resolve();
  }
  finish() {
    this.paused = true;
    this.ended = true;
    this.dispatchEvent(new Event('ended'));
  }
  get element() { return this as unknown as HTMLAudioElement; }
}

function fixture() {
  const media = new MusicElement(), changes: RecordMusicState[] = [];
  let allocations = 0;
  const music = createRecordMusic(state => changes.push(state), () => { allocations++; return media.element; });
  return { media, music, changes, allocations: () => allocations };
}

test('the record streams only after a gesture and resumes its position without another audio device', async () => {
  const { media, music, changes, allocations } = fixture();
  try {
    expect(music.getState().status).toBe('empty');
    expect(media.preload).toBe('none');
    expect(media.autoplay).toBe(false); expect(media.loop).toBe(false);
    expect(media.plays).toBe(0);
    music.load('/music/first.mp3', '我的音乐');
    expect(music.getState()).toEqual({ status: 'paused', title: '我的音乐' });
    const playing = music.toggle();
    expect(media.plays).toBe(1); // play() runs in the caller's native gesture task.
    await playing;
    expect(music.getState().status).toBe('playing');
    media.currentTime = 42.75;
    await music.toggle();
    expect(music.getState().status).toBe('paused');
    expect(media.currentTime).toBe(42.75);
    await music.toggle();
    expect(media.currentTime).toBe(42.75);
    expect(music.getState().status).toBe('playing');
    const notifications = changes.length;
    music.setMuted(true); expect(media.muted).toBe(true);
    music.setMuted(false); expect(media.muted).toBe(false);
    media.dispatchEvent(new Event('playing'));
    expect(changes).toHaveLength(notifications);
    expect(music.getState().status).toBe('playing');
    expect(media.plays).toBe(2); expect(allocations()).toBe(1);
    media.dispatchEvent(new Event('waiting'));
    expect(music.getState().status).toBe('loading');
    media.dispatchEvent(new Event('playing'));
    expect(music.getState().status).toBe('playing');

    media.currentTime = 180; media.finish();
    expect(music.getState().status).toBe('paused');
    expect(media.plays).toBe(2); // An ended record cannot start another track.
    await music.toggle();
    expect(media.currentTime).toBe(0);
    expect(media.plays).toBe(3);
  } finally { music.dispose(); }
});

test('rapid pause, replacement and stale play promises cannot restart or pause the newer record', async () => {
  const { media, music } = fixture(); media.automaticPlay = false;
  try {
    music.load('blob:first', 'First');
    const first = music.toggle();
    expect(music.getState().status).toBe('loading');
    await music.toggle();
    expect(music.getState().status).toBe('paused');
    media.resolve(0); await first;
    expect(media.paused).toBe(true); expect(music.getState().status).toBe('paused');

    const old = music.toggle();
    music.load('blob:second', 'Second');
    const current = music.toggle(), pausesBeforeOld = media.pauses;
    media.resolve(1, false); await old;
    expect(media.pauses).toBe(pausesBeforeOld);
    expect(music.getState()).toEqual({ status: 'loading', title: 'Second' });
    media.resolve(2); await current;
    expect(music.getState()).toEqual({ status: 'playing', title: 'Second' });
    expect(media.paused).toBe(false);
    const loads = media.loads;
    music.load('blob:second', 'Second');
    expect(media.loads).toBe(loads); // Refreshing the same configuration preserves playback.
  } finally { music.dispose(); }
});

test('hiding or disposing cancels pending music without autoplay on return or late completion', async () => {
  const { media, music, changes } = fixture(); media.automaticPlay = false;
  music.load('blob:local', 'Local record');
  const first = music.toggle(); media.currentTime = 13;
  music.setPageVisible(false);
  expect(media.paused).toBe(true); expect(media.currentTime).toBe(13);
  music.setPageVisible(true);
  expect(media.plays).toBe(1);
  media.resolve(0); await first;
  expect(media.paused).toBe(true); expect(media.currentTime).toBe(13);
  const second = music.toggle();
  music.dispose();
  const count = changes.length;
  media.resolve(1); await second;
  media.dispatchEvent(new Event('ended'));
  media.error = { code: 4 }; media.dispatchEvent(new Event('error'));
  await music.toggle(); music.load('blob:late', 'Late'); music.setPageVisible(true);
  expect(media.paused).toBe(true); expect(media.src).toBe('');
  expect(changes).toHaveLength(count); expect(media.plays).toBe(2);
  expect(music.getState().status).toBe('empty');
});

test('blocked and broken audio can be replaced without losing a usable player', async () => {
  const { media, music } = fixture(); media.automaticPlay = false;
  try {
    music.load('blob:blocked', 'Blocked');
    const blocked = music.toggle();
    media.pending[0].reject(new DOMException('User gesture needed', 'NotAllowedError'));
    await blocked;
    expect(music.getState()).toEqual({ status: 'error', title: 'Blocked', error: '请再轻触唱片机，开始播放。' });
    expect(media.paused).toBe(true);
    music.load('blob:valid', 'Valid');
    expect(music.getState()).toEqual({ status: 'paused', title: 'Valid' });
    const valid = music.toggle(); media.resolve(1); await valid;
    expect(music.getState().status).toBe('playing');
    media.error = { code: 3 }; media.dispatchEvent(new Event('error'));
    expect(music.getState().status).toBe('error'); expect(media.paused).toBe(true);
    expect(music.getState().error).toContain('重新放入');
    music.load('', 'No record');
    expect(music.getState()).toEqual({ status: 'empty', title: 'No record' });
    await music.toggle(); expect(media.plays).toBe(2);
  } finally { music.dispose(); }
});
