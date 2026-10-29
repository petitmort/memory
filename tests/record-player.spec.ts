import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createRecordPlayer } from '../src/record-player';

// The model's small original textures need only a drawing surface in this
// geometry test; real rasterization and picking are exercised in the room.
function withCanvas<T>(run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvas = () => {
    const surface: any = { width: 0, height: 0 };
    const gradient = { addColorStop() {} };
    const drawing = new Proxy({} as Record<string, any>, {
      get(target, key) {
        if (key in target) return target[key as string];
        if (key === 'canvas') return surface;
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
        if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
        return () => {};
      },
    });
    surface.getContext = () => drawing;
    return surface;
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: canvas } });
  try { return run(); }
  finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}

test('the vintage turntable has a grounded portable case, playable-size vinyl and an open dust lid', () => withCanvas(() => {
  const player = createRecordPlayer();
  try {
    player.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(player.group, true);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeGreaterThanOrEqual(-.0005);
    expect(bounds.min.y).toBeLessThan(.002);
    expect(size.x).toBeGreaterThan(.38); expect(size.x).toBeLessThan(.43);
    expect(size.z).toBeGreaterThan(.33); expect(size.z).toBeLessThan(.41);
    expect(size.y).toBeGreaterThan(.34); expect(size.y).toBeLessThan(.45);
    const disc = player.group.getObjectByName('record-disc')!;
    const discSize = new THREE.Box3().setFromObject(disc, true).getSize(new THREE.Vector3());
    expect(discSize.x).toBeCloseTo(.30, 2);
    expect(discSize.z).toBeCloseTo(.30, 2);
    expect(player.group.getObjectByName('record-player-dust-lid')).toBeDefined();
    let meshes = 0, triangles = 0;
    player.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(16);
    expect(triangles).toBeLessThan(20000);
  } finally { player.dispose(); }
}));

test('the record spins at 33⅓ rpm, pauses in place and reuses static shadows after the arm settles', () => withCanvas(() => {
  const player = createRecordPlayer();
  const disc = player.group.getObjectByName('record-disc')!;
  try {
    player.update(0, false);
    const initialAngle = disc.rotation.y;
    player.setPlaying(true);
    player.update(1, false);
    expect(THREE.MathUtils.euclideanModulo(disc.rotation.y - initialAngle, Math.PI * 2))
      .toBeCloseTo(THREE.MathUtils.euclideanModulo(-Math.PI * 10 / 9, Math.PI * 2), 8);
    for (let frame = 1; frame <= 20; frame++) player.update(1 + frame / 10, false);
    expect(player.update(3.1, false)).toBe(false);
    const pausedAngle = disc.rotation.y;
    player.setPlaying(false);
    for (let frame = 1; frame <= 20; frame++) player.update(3.1 + frame / 10, false);
    expect(disc.rotation.y).toBe(pausedAngle);
    expect(player.update(5.2, false)).toBe(false);

    player.setPlaying(true);
    player.update(5.3, true);
    expect(player.update(6.3, true)).toBe(false);
    expect(disc.rotation.y).toBe(pausedAngle);
    player.setPlaying(false);
    player.update(6.4, true);
    expect(player.update(7.4, true)).toBe(false);
  } finally { player.dispose(); }
}));
