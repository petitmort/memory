import { test, expect } from '@playwright/test';
import { createVesselJourney, getVesselSchedule, sampleVesselJourney, sampleVesselRoute, vesselExclusionZones, vesselKinds, vesselRoutes } from '../src/vessel-navigation';

test('all six sea lanes stay outside conservative land footprints and point their bow along actual travel', () => {
  for (const route of vesselRoutes) {
    const start = sampleVesselRoute(route, 0), end = sampleVesselRoute(route, 1);
    expect(Math.abs(start.x)).toBeGreaterThan(115);
    expect(Math.abs(end.x)).toBeGreaterThan(115);
    let clearance = Infinity, nearestZ = -Infinity, headingError = 0;
    for (let i = 0; i <= 1000; i++) {
      const point = sampleVesselRoute(route, i / 1000);
      // Seven metres is larger than the half-length of the largest ferry.
      for (const land of vesselExclusionZones)
        clearance = Math.min(clearance, Math.hypot((point.x - land.x) / (land.rx + 7), (point.z - land.z) / (land.rz + 7)));
      nearestZ = Math.max(nearestZ, point.z);
      const magnitude = Math.hypot(point.dx, point.dz);
      headingError = Math.max(headingError, Math.abs(Math.cos(point.yaw) - point.dx / magnitude), Math.abs(-Math.sin(point.yaw) - point.dz / magnitude));
    }
    expect(clearance, route).toBeGreaterThan(1);
    expect(nearestZ, route).toBeLessThan(-20);
    expect(headingError, route).toBeLessThan(1e-8);
  }
  expect(sampleVesselRoute('left-to-right', .5).dx).toBeGreaterThan(0);
  expect(sampleVesselRoute('right-to-left', .5).dx).toBeLessThan(0);
  expect(sampleVesselRoute('approach', .5).dz).toBeGreaterThan(0);
  expect(sampleVesselRoute('depart', .5).dz).toBeLessThan(0);
});

test('absolute departure slots preserve date-boundary continuity, speed differences, safe spacing and occasional quiet water', () => {
  const noon = Date.UTC(2026, 6, 10, 12), midnight = Date.UTC(2026, 6, 11);
  expect(getVesselSchedule(noon)).toEqual(getVesselSchedule(noon));
  const before = getVesselSchedule(midnight - 1), after = getVesselSchedule(midnight + 1);
  for (const journey of before) {
    const resumed = after.find(candidate => candidate.id === journey.id);
    if (!resumed) continue;
    const a = sampleVesselJourney(journey, midnight - 1), b = sampleVesselJourney(resumed, midnight + 1);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(.01);
  }
  const kinds = new Set<string>(); let empty = 0, maximum = 0, closest = Infinity;
  for (let minute = 0; minute < 1440; minute++) {
    const now = Date.UTC(2026, 6, 10) + minute * 60_000, scheduled = getVesselSchedule(now);
    maximum = Math.max(maximum, scheduled.length); if (!scheduled.length) empty++;
    for (const journey of scheduled) kinds.add(journey.kind);
    for (let a = 0; a < scheduled.length; a++) for (let b = a + 1; b < scheduled.length; b++) {
      const p = sampleVesselJourney(scheduled[a], now), q = sampleVesselJourney(scheduled[b], now);
      closest = Math.min(closest, Math.hypot(p.x - q.x, p.z - q.z));
    }
  }
  expect([...kinds].sort()).toEqual([...vesselKinds].sort());
  expect(maximum).toBeLessThanOrEqual(5); expect(empty).toBeGreaterThan(0); expect(closest).toBeGreaterThan(14);
  const options = { forcedRoute: 'left-to-right' as const };
  expect(createVesselJourney(20, { ...options, forcedKind: 'motor-yacht' }).speed)
    .toBeGreaterThan(createVesselJourney(20, { ...options, forcedKind: 'wood-sail' }).speed * 1.7);
});

test('pooled six-model traffic restores current positions, survives debug changes and releases shared resources once', async ({ page }) => {
  await page.route('**/__vessel_system', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Vessel system tests</title><body></body>' }));
  await page.goto('/__vessel_system');
  const result = await page.evaluate(async () => {
    const { createVesselController } = await import('/src/vessel-controller.ts');
    const { getVesselSchedule } = await import('/src/vessel-navigation.ts');
    const { sampleWaterHeight } = await import('/src/water-surface.ts');
    const options = { low: false, reduced: false, daylight: 1, windSpeed: 5, severity: 0, density: 2 };
    const controller = createVesselController(), fresh = createVesselController();
    const now = Date.UTC(2026, 6, 10, 12, 1);
    const resources = (root: any) => {
      const geometry = new Set<any>(), materials = new Set<any>();
      root.traverse((object: any) => {
        if (object.geometry) geometry.add(object.geometry);
        if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      return { geometry, materials };
    };
    const initial = resources(controller.group);
    controller.update(now, 17, options);
    const initialSnapshot = controller.snapshot();
    for (let i = 1; i <= 60; i++) controller.update(now + i * 16, 17 + i * .016, options);
    const resumeTime = now + 10 * 60_000;
    controller.update(resumeTime, 31, options); fresh.update(resumeTime, 31, options);
    const resumed = controller.snapshot(), refreshed = fresh.snapshot();
    const waterErrors = resumed.map((ship: any) => Math.abs(ship.position[1] - (-8 + sampleWaterHeight(ship.position[0], ship.position[2], 31) - .09)));
    const bounds: Record<string, any> = {};
    const { Box3 } = await import('/node_modules/.vite/deps/three.js');
    const actor = controller.group.children[0];
    for (const model of actor.children.filter((object: any) => object.userData.vesselKind)) {
      model.updateWorldMatrix(true, true);
      const box = new Box3().setFromObject(model, true);
      bounds[model.userData.vesselKind] = box.max.clone().sub(box.min).toArray();
    }
    // Same departure IDs with a different debug route must retire old routes.
    controller.update(resumeTime + 16, 31, { ...options, forcedRoute: 'left-to-right', forcedKind: 'fishing' });
    for (let i = 2; i <= 600; i++) controller.update(resumeTime + i * 16, 31 + i * .016, { ...options, forcedRoute: 'left-to-right', forcedKind: 'fishing' });
    const debugSnapshot = controller.snapshot();
    controller.update(resumeTime + 11_000, 40, { ...options, low: true, forcedRoute: 'left-to-right', forcedKind: 'fishing' });
    for (let i = 1; i <= 600; i++) controller.update(resumeTime + 11_000 + i * 16, 40 + i * .016, { ...options, low: true, forcedRoute: 'left-to-right', forcedKind: 'fishing' });
    const lowSnapshot = controller.snapshot();
    const after = resources(controller.group);
    const capacitiesStable = initial.geometry.size === after.geometry.size && initial.materials.size === after.materials.size;
    const warmModels = controller.warmObjects.filter((object: any) => object.userData.vesselKind && object.parent?.name.startsWith('pooled-vessel-')).length;
    let maxDisposals = 0;
    for (const resource of [...initial.geometry, ...initial.materials]) {
      let disposed = 0; resource.addEventListener('dispose', () => { disposed++; maxDisposals = Math.max(maxDisposals, disposed); });
    }
    controller.dispose(); controller.dispose(); fresh.dispose();
    return {
      initialSnapshot, resumed, refreshed, waterErrors, bounds, debugSnapshot, lowSnapshot, capacitiesStable, warmModels,
      geometries: initial.geometry.size, maxDisposals, emptyAfterDispose: controller.group.children.length === 0,
      schedule: getVesselSchedule(now).length,
    };
  });
  expect(result.initialSnapshot.length).toBeGreaterThan(0);
  expect(result.resumed).toEqual(result.refreshed);
  for (const error of result.waterErrors) expect(error).toBeLessThan(1e-8);
  expect(Object.keys(result.bounds)).toHaveLength(6);
  for (const size of Object.values(result.bounds) as number[][]) {
    expect(size.every(Number.isFinite)).toBe(true); expect(Math.max(...size)).toBeGreaterThan(4); expect(Math.max(...size)).toBeLessThan(17);
  }
  expect(result.debugSnapshot.length).toBeGreaterThan(0);
  expect(result.debugSnapshot.every((ship: any) => ship.route === 'left-to-right' && ship.kind === 'fishing')).toBe(true);
  expect(result.lowSnapshot.length).toBeLessThanOrEqual(3);
  expect(result.capacitiesStable).toBe(true); expect(result.warmModels).toBe(30);
  expect(result.geometries).toBeLessThan(80); expect(result.maxDisposals).toBe(1); expect(result.emptyAfterDispose).toBe(true);
});
