import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { BIRD_KINDS, createBirdJourney, getBirdSchedule, sampleBirdFlight } from '../src/bird-controller';
import { coastalReefs, createCoastalEnvironment } from '../src/coastal-environment';

function windowProjection(point: ReturnType<typeof sampleBirdFlight>, mobile: boolean) {
  const width = mobile ? 390 : 1280, height = mobile ? 844 : 800;
  const camera = new THREE.PerspectiveCamera(50, width / height, .1, 500);
  camera.position.set(mobile ? .55 : 1.1, 1.65, mobile ? 1.15 : .75);
  camera.lookAt(mobile ? .15 : -.2, mobile ? 1.05 : .95, mobile ? -1.4 : -1.5);
  camera.updateMatrixWorld(true);
  const world = new THREE.Vector3(point.x, point.y, point.z);
  const portal = camera.position.clone().lerp(world, (-2.7 - camera.position.z) / (point.z - camera.position.z));
  const projected = world.clone().project(camera);
  return { x: projected.x * width / 2, y: projected.y * height / 2,
    visible: point.alpha > .2 && Math.abs(portal.x) < 1.45 && portal.y > .9 && portal.y < 2.4
      && Math.abs(projected.x) < .98 && Math.abs(projected.y) < .98 };
}

test('gliding visitors cross the real desktop and phone window instead of resting along an eye ray', async () => {
  const evidence: { kind: string; mobile: boolean; samples: number; minimumPixelsPerSecond: number }[] = [];
  for (const mobile of [false, true]) for (const kind of BIRD_KINDS) {
    const motion: number[] = []; let glides = 0, checked = 0;
    for (let id = 8_000_000; id < 8_000_600 && checked < 25; id++) {
      const journey = createBirdJourney(id);
      if (journey.kind !== kind || !getBirdSchedule(journey.startMs + 1).length) continue;
      checked++;
      for (let progress = .1; progress < .85; progress += .01) {
        const timestamp = journey.startMs + progress * journey.durationMs;
        const a = sampleBirdFlight(journey, timestamp), b = sampleBirdFlight(journey, timestamp + 1000);
        const before = windowProjection(a, mobile), after = windowProjection(b, mobile);
        if (!before.visible || !after.visible) continue;
        const displacement = Math.hypot(after.x - before.x, after.y - before.y);
        motion.push(displacement);
        expect(displacement).toBeGreaterThan(5);
        if (kind !== 'small-bird' && Math.abs(a.flap - .055) < 1e-6) {
          glides++;
          expect(displacement).toBeGreaterThan(5);
        }
      }
    }
    expect(checked).toBe(25); expect(motion.length).toBeGreaterThan(50);
    if (kind !== 'small-bird') expect(glides).toBeGreaterThan(20);
    evidence.push({ kind, mobile, samples: motion.length, minimumPixelsPerSecond: Math.min(...motion) });
  }
  await test.info().attach('window-bird-motion', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});

test('coast has no permanent birds and uses one submerged low-cost far-island batch behind the reefs', () => {
  const coast = createCoastalEnvironment(); coast.group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [], geometries = new Set<THREE.BufferGeometry>();
  coast.group.traverse(object => { if (object instanceof THREE.Mesh) { meshes.push(object); geometries.add(object.geometry); } });
  expect(meshes.some(mesh => /gull|bird/i.test(mesh.name))).toBe(false);
  expect(geometries.size).toBe(5);
  const far = coast.group.getObjectByName('far-horizon-archipelago') as THREE.Mesh;
  expect(far.userData.kind).toBe('far-islands');
  const bounds = new THREE.Box3().setFromObject(far, true);
  expect(bounds.max.z).toBeLessThan(-210); expect(bounds.min.z).toBeGreaterThan(-243);
  expect(bounds.min.y).toBeLessThan(-9); expect(bounds.max.y).toBeGreaterThan(-6);
  expect(far.geometry.index!.count / 3).toBe(2880);
  for (const [index, reef] of coastalReefs.entries()) {
    const root = coast.group.getObjectByName(`sea-reef-${index + 1}`)!;
    expect(root.position.toArray()).toEqual([reef.x, -8, reef.z]);
    const stone = root.children[0] as THREE.Mesh, position = stone.geometry.getAttribute('position');
    const stoneBounds = new THREE.Box3().setFromObject(stone, true);
    expect(stoneBounds.min.y).toBeLessThan(-9.5);
    expect(stoneBounds.max.y).toBeGreaterThan(-7);
    expect(stoneBounds.max.y).toBeLessThan(-5.5);
    expect(stoneBounds.max.x - stoneBounds.min.x).toBeLessThan(reef.radius * 2);
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    expect(stone.geometry.getAttribute('color').count).toBe(position.count);
  }
  coast.update(123, false); coast.update(456, true);
  expect(meshes.some(mesh => /gull|bird/i.test(mesh.name))).toBe(false);
});
