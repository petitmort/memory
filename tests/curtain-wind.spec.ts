import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createCurtains } from '../src/curtains';

/** Geometry tests need no renderer; only the unchanged decorative canvas is stubbed. */
function cloth() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const noop = () => {};
  const context = new Proxy(Object.create(null), { get: (target, key) => key in target ? target[key] : noop });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`Unexpected element ${tag}`);
      return { width: 0, height: 0, getContext: () => context };
    },
  } });
  try {
    const curtain = createCurtains({ width: 3.4, height: 1.72, sill: .72, back: -2 });
    const panels = curtain.group.children as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>[];
    const rest = panels.map(panel => new Float32Array(panel.geometry.getAttribute('position').array));
    return { ...curtain, panels, rest, dispose() {
      for (const panel of panels) panel.geometry.dispose();
      panels[0].material.map!.dispose(); panels[0].material.dispose();
    } };
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}

type Cloth = ReturnType<typeof cloth>;
function displacement(curtain: Cloth, hemOnly = false) {
  let sum = 0, count = 0, max = 0;
  curtain.panels.forEach((panel, side) => {
    const positions = panel.geometry.getAttribute('position');
    const start = hemOnly ? positions.count - 29 : 0;
    for (let i = start; i < positions.count; i++) {
      const offset = i * 3, rest = curtain.rest[side];
      const distance = Math.hypot(positions.getX(i) - rest[offset], positions.getY(i) - rest[offset + 1], positions.getZ(i) - rest[offset + 2]);
      sum += distance * distance; count++; max = Math.max(max, distance);
    }
  });
  return { sum, count, max };
}

function energy(curtain: Cloth, speed: number, reduced = false) {
  let sum = 0, count = 0, max = 0;
  // Warm the cloth inertia, then sample the real hem through unequal gusts.
  for (let i = 1; i <= 760; i++) {
    curtain.update(i / 20, reduced, speed);
    if (i < 160) continue;
    const sample = displacement(curtain, true);
    sum += sample.sum; count += sample.count; max = Math.max(max, sample.max);
  }
  return { rms: Math.sqrt(sum / count), max };
}

test('real hems gain wind energy without moving their top anchors or replacing cloth buffers', () => {
  const curtains = [cloth(), cloth(), cloth()];
  const identities = curtains.map(curtain => curtain.panels.map(panel => ({
    position: panel.geometry.getAttribute('position'), normal: panel.geometry.getAttribute('normal'),
    array: panel.geometry.getAttribute('position').array, texture: panel.material.map,
  })));
  try {
    const [breeze, fresh, gale] = curtains.map((curtain, index) => energy(curtain, [2, 6, 20][index]));
    expect(breeze.rms).toBeGreaterThan(.001);
    expect(fresh.rms).toBeGreaterThan(breeze.rms * 1.5);
    expect(gale.rms).toBeGreaterThan(fresh.rms * 1.25);
    expect(gale.max).toBeLessThan(.1);
    for (let index = 0; index < curtains.length; index++) curtains[index].panels.forEach((panel, side) => {
      const positions = panel.geometry.getAttribute('position');
      expect(Array.from(positions.array.slice(0, 29 * 3))).toEqual(Array.from(curtains[index].rest[side].slice(0, 29 * 3)));
      expect(positions === identities[index][side].position).toBe(true);
      expect(positions.array === identities[index][side].array).toBe(true);
      expect(panel.geometry.getAttribute('normal') === identities[index][side].normal).toBe(true);
      expect(panel.material.map === identities[index][side].texture).toBe(true);
      expect(panel.material.transparent).toBe(true);
    });
  } finally { curtains.forEach(curtain => curtain.dispose()); }
});

test('wind changes keep cloth inertia, held scene time does not advance it, and a calm settles to an unchanged mesh', () => {
  const curtain = cloth();
  try {
    for (let i = 1; i <= 300; i++) curtain.update(i / 60, false, 20);
    expect(displacement(curtain).max).toBeGreaterThan(.005);
    const moving = curtain.panels.map(panel => new Float32Array(panel.geometry.getAttribute('position').array));
    // This is the held clock used by a reading/background pause, even if the
    // weather target has changed before the next active frame is drawn.
    for (let i = 0; i < 50; i++) curtain.update(5, false, 0);
    curtain.panels.forEach((panel, side) => expect(Array.from(panel.geometry.getAttribute('position').array)).toEqual(Array.from(moving[side])));
    curtain.update(5 + 1 / 60, false, 0);
    let largestStep = 0;
    curtain.panels.forEach((panel, side) => {
      const positions = panel.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const offset = i * 3;
        largestStep = Math.max(largestStep, Math.hypot(positions.getX(i) - moving[side][offset], positions.getY(i) - moving[side][offset + 1], positions.getZ(i) - moving[side][offset + 2]));
      }
    });
    expect(largestStep).toBeGreaterThan(0); expect(largestStep).toBeLessThan(.01);
    for (let i = 2; i <= 600; i++) curtain.update(5 + i / 60, false, 0);
    expect(displacement(curtain).max).toBe(0);
    const versions = curtain.panels.map(panel => [panel.geometry.getAttribute('position').version, panel.geometry.getAttribute('normal').version]);
    for (let i = 1; i <= 120; i++) curtain.update(15 + i / 60, false, 0);
    expect(curtain.panels.map(panel => [panel.geometry.getAttribute('position').version, panel.geometry.getAttribute('normal').version])).toEqual(versions);
  } finally { curtain.dispose(); }
});

test('reduced motion stays restrained and wind inputs remain finite and capped on the actual cloth', () => {
  const normal = cloth(), reduced = cloth(), capped = cloth(), invalid = cloth();
  try {
    const regularEnergy = energy(normal, 20), reducedEnergy = energy(reduced, 20, true);
    expect(reducedEnergy.rms).toBeGreaterThan(0);
    expect(reducedEnergy.max).toBeLessThan(regularEnergy.max * .25);
    expect(reducedEnergy.max).toBeLessThan(.015);
    energy(capped, 200);
    capped.panels.forEach((panel, side) => expect(Array.from(panel.geometry.getAttribute('position').array)).toEqual(Array.from(normal.panels[side].geometry.getAttribute('position').array)));
    for (const [index, speed] of [NaN, Infinity, -Infinity, -5, 0].entries()) invalid.update(index + 1, false, speed);
    expect(displacement(invalid).max).toBe(0);
    for (const curtain of [normal, reduced, capped, invalid]) expect(curtain.panels.every(panel => Array.from(panel.geometry.getAttribute('position').array).every(Number.isFinite))).toBe(true);
  } finally { [normal, reduced, capped, invalid].forEach(curtain => curtain.dispose()); }
});

test('animated cloth normals match Three area-weighted normals byte for byte through wind and motion changes', () => {
  const curtain = cloth();
  const references = curtain.panels.map(panel => panel.geometry.clone());
  try {
    for (let frame = 1; frame <= 240; frame++) {
      curtain.update(frame / 30, frame >= 180, frame < 60 ? 2 : frame < 120 ? 20 : frame < 180 ? 0 : 9);
      curtain.panels.forEach((panel, index) => {
        const reference = references[index];
        (reference.getAttribute('position').array as Float32Array).set(panel.geometry.getAttribute('position').array);
        reference.computeVertexNormals();
        const actual = panel.geometry.getAttribute('normal').array;
        const expected = reference.getAttribute('normal').array;
        // Buffer equality catches Float32 accumulation and normalization changes
        // that a loose angular tolerance could hide in grazing cloth light.
        expect(Buffer.from(actual.buffer).equals(Buffer.from(expected.buffer)), `frame ${frame}, panel ${index}`).toBe(true);
      });
    }
  } finally {
    references.forEach(geometry => geometry.dispose());
    curtain.dispose();
  }
});
