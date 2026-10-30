import { test, expect } from '@playwright/test';
import { createRoomController } from '../src/room-controller';

test('journey guards reject repeated and out-of-order commands and allow reader recovery', () => {
  const room = createRoomController();
  const stages: string[] = [];
  room.subscribe(state => stages.push(state));
  expect(room.transition('reading')).toBe(false);
  for (const state of ['clearing', 'door', 'entering', 'room', 'opening', 'reading', 'closing', 'room', 'opening', 'reading'] as const) {
    expect(room.transition(state)).toBe(true);
    expect(room.transition(state)).toBe(false);
  }
  expect(stages).toHaveLength(10);
  room.invalidateScene();
  expect(room.transition('closing')).toBe(true);
  expect(room.transition('fallback')).toBe(true);
  expect(room.transition('opening')).toBe(true);
  expect(room.transition('reading')).toBe(true);
});

test('scene loss releases pending work once and disposal invalidates every async token', async () => {
  const room = createRoomController();
  const scene = room.sceneVersion, operation = room.beginTransition();
  let released = 0, cleaned = 0, events = 0;
  void room.sceneUnavailable.then(() => { released++; });
  const source = new EventTarget();
  source.addEventListener('change', () => { events++; }, { signal: room.signal });
  room.own(() => { cleaned++; throw new Error('Optional resource failed'); });
  room.own(() => { cleaned++; });
  expect(room.invalidateScene()).toBe(true);
  expect(room.invalidateScene()).toBe(false);
  await room.sceneUnavailable;
  expect(room.sceneVersion).not.toBe(scene);
  // The active reader transition can still settle using its DOM fallback.
  expect(room.transitionVersion).toBe(operation);
  source.dispatchEvent(new Event('change'));
  room.dispose(); room.dispose();
  source.dispatchEvent(new Event('change'));
  expect(room.transitionVersion).not.toBe(operation);
  expect(released).toBe(1); expect(cleaned).toBe(2); expect(events).toBe(1);
  expect(room.transition('fallback')).toBe(false);
});
