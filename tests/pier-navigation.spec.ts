import { test, expect } from '@playwright/test';
import { distanceToPier } from '../src/pier-layout';
import { createVesselJourney, sampleVesselJourney, sampleVesselRoute, vesselExclusionZones,
  vesselKinds, vesselRoutes } from '../src/vessel-navigation';

test('all six lanes keep complete ferry-sized hulls clear of the right-pane pier, tower landing and existing reefs', () => {
  // A 7 m circle contains the largest hull at every heading. Another 1.5 m
  // leaves room for its small wave-driven roll rather than grazing the quay.
  const hullRadius = 7;
  for (const route of vesselRoutes) {
    let pierGap = Infinity, reefGap = Infinity, nearestZ = -Infinity;
    for (let i = 0; i <= 2000; i++) {
      const p = sampleVesselRoute(route, i / 2000);
      pierGap = Math.min(pierGap, distanceToPier(p.x, p.z) - hullRadius);
      nearestZ = Math.max(nearestZ, p.z);
      for (const land of vesselExclusionZones) reefGap = Math.min(reefGap,
        Math.hypot((p.x - land.x) / (land.rx + hullRadius), (p.z - land.z) / (land.rz + hullRadius)));
    }
    expect(pierGap, `${route}: clearance outside the full hull`).toBeGreaterThan(1.5);
    expect(reefGap, `${route}: legacy island and reef margins`).toBeGreaterThan(1);
    expect(nearestZ, `${route}: no foreground boats enter the room shore`).toBeLessThanOrEqual(-21);
    expect(Math.abs(sampleVesselRoute(route, 0).x), `${route}: offscreen departure`).toBeGreaterThan(115);
    expect(Math.abs(sampleVesselRoute(route, 1).x), `${route}: offscreen arrival`).toBeGreaterThan(115);
  }
  expect(sampleVesselRoute('left-to-right', .5).dx).toBeGreaterThan(0);
  expect(sampleVesselRoute('right-to-left', .5).dx).toBeLessThan(0);
  expect(sampleVesselRoute('approach', .5).dz).toBeGreaterThan(0);
  expect(sampleVesselRoute('depart', .5).dz).toBeLessThan(0);
  const diagonalNear = sampleVesselRoute('diagonal', .85), diagonalFar = sampleVesselRoute('diagonal', .15);
  expect(diagonalNear.z - diagonalFar.z).toBeGreaterThan(70);
});

test('wind-selected, reversed and forced voyages retain safe positions and headings after absolute-time restoration', () => {
  for (const kind of vesselKinds) for (let windIndex = 0; windIndex < 16; windIndex++) {
    const wind = { windSpeed: 6, windDirection: windIndex * Math.PI / 8 };
    for (const forcedRoute of [undefined, ...vesselRoutes]) {
      const options = { ...wind, forcedKind: kind, forcedRoute };
      const voyage = createVesselJourney(19_822_211, options);
      const restored = createVesselJourney(voyage.id, options);
      expect(restored).toEqual(voyage);
      let clearance = Infinity, headingError = 0;
      for (let step = 1; step < 100; step++) {
        const at = voyage.startMs + voyage.durationMs * step / 100;
        const p = sampleVesselJourney(voyage, at), later = sampleVesselJourney(voyage, at + 1);
        clearance = Math.min(clearance, distanceToPier(p.x, p.z));
        const distance = Math.hypot(later.x - p.x, later.z - p.z);
        headingError = Math.max(headingError,
          Math.abs(Math.cos(p.yaw) - (later.x - p.x) / distance),
          Math.abs(-Math.sin(p.yaw) - (later.z - p.z) / distance));
        if (step % 25 === 0) expect(sampleVesselJourney(restored, at)).toEqual(p);
      }
      expect(clearance, `${kind} / ${voyage.route} / wind ${windIndex}`).toBeGreaterThan(8.5);
      expect(headingError, `${kind}: forward and reverse bow alignment`).toBeLessThan(.0001);
    }
  }
});
