import { test, expect } from '@playwright/test';

test('square sail is crosswise and attached; coastal land and basket are physically seated', async ({ page }) => {
  await page.route('**/__coastal_geometry', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/__coastal_geometry');
  const result = await page.evaluate(async () => {
    const threePath = '/node_modules/.vite/deps/three.js';
    const shipPath = '/src/sailing-ship.ts', coastPath = '/src/coastal-environment.ts';
    const decorPath = '/src/decor.ts', waterPath = '/src/water-surface.ts', seaPath = '/src/seascape.ts';
    const THREE = await import(threePath);
    const [{ createSailingShip }, { createCoastalEnvironment }, { createDecor }, { sampleWaterHeight }, { createSeascape }] = await Promise.all([
      import(shipPath), import(coastPath), import(decorPath), import(waterPath), import(seaPath),
    ]);
    const ship = createSailingShip();
    ship.updateMatrixWorld(true);
    const sail = ship.getObjectByName('single-billowing-square-sail');
    const position = sail.geometry.getAttribute('position'), uv = sail.geometry.getAttribute('uv');
    const corners: any[] = [];
    for (let i = 0; i < position.count; i++) {
      if (uv.getY(i) === 1 && (uv.getX(i) === 0 || uv.getX(i) === 1)) {
        corners.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(sail.matrixWorld));
      }
    }
    const span = corners[1].clone().sub(corners[0]).normalize();
    const yardAxes = ['square-yard-port', 'square-yard-starboard'].map(name => {
      const yard = ship.getObjectByName(name);
      yard.geometry.computeBoundingBox();
      const bounds = yard.geometry.boundingBox;
      return new THREE.Line3(
        new THREE.Vector3(0, bounds.min.y, 0).applyMatrix4(yard.matrixWorld),
        new THREE.Vector3(0, bounds.max.y, 0).applyMatrix4(yard.matrixWorld),
      );
    });
    const attachmentGaps = corners.map(p => Math.min(...yardAxes.map(axis =>
      axis.closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p))));
    const coast = createCoastalEnvironment();
    coast.group.updateMatrixWorld(true);
    const land: { name: string; min: number; max: number }[] = [];
    coast.group.traverse(object => {
      if (!['natural-island', 'submerged-reef', 'far-islands'].includes(object.userData.kind)) return;
      const bounds = new THREE.Box3().setFromObject(object, true);
      land.push({ name: object.name, min: bounds.min.y, max: bounds.max.y });
    });
    const decor = createDecor();
    const basket = decor.getObjectByName('woven-market-basket');
    decor.updateMatrixWorld(true);
    const basketBounds = new THREE.Box3().setFromObject(basket, true);
    const body = basket.children.find(child => child.geometry?.type === 'LatheGeometry');
    const profile = body.geometry.parameters.points;
    const liner = basket.getObjectByName('folded-basket-linen').geometry.getAttribute('position');
    let clearance = Infinity;
    for (let i = 0; i < liner.count; i++) {
      const x = liner.getX(i), y = liner.getY(i), z = liner.getZ(i);
      // The descending half of the lathe profile describes the actual inner wall.
      for (let j = 1; j < profile.length; j++) {
        const a = profile[j - 1], b = profile[j];
        if (a.y <= b.y || y > a.y || y < b.y) continue;
        const radius = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
        clearance = Math.min(clearance, radius - Math.hypot(x, z));
      }
    }
    const heights = Array.from({ length: 500 }, (_, i) => sampleWaterHeight(-31, -112, i * .83));
    const seascape = createSeascape();
    seascape.update(0, false);
    seascape.group.updateMatrixWorld(true);
    const shipBounds = new THREE.Box3().setFromObject(seascape.group.getObjectByName('mythic-sailing-ship'), true);
    const clearOfReefs = ['sea-reef-1', 'sea-reef-2'].every(name =>
      !shipBounds.intersectsBox(new THREE.Box3().setFromObject(seascape.group.getObjectByName(name), true)));
    return {
      crosswise: Math.abs(span.x), attachmentGaps, land, clearance, clearOfReefs,
      farIslandCount: coast.group.getObjectByName('far-horizon-archipelago').userData.islandCount,
      permanentBirdsRemoved: !coast.group.children.some(object => /gull|bird/i.test(object.name)),
      basket: { min: basketBounds.min.toArray(), max: basketBounds.max.toArray() },
      meanWater: heights.reduce((sum, h) => sum + h, 0) / heights.length,
      waterRange: Math.max(...heights) - Math.min(...heights),
      removed: ['distant-kraken', 'whirlpool'].every(name => !seascape.group.getObjectByName(name)),
    };
  });
  expect(result.crosswise).toBeLessThan(.5);
  for (const gap of result.attachmentGaps) expect(gap).toBeLessThan(.15);
  expect(result.land.filter(o => o.name.startsWith('distant-island'))).toHaveLength(2);
  expect(result.land.filter(o => o.name.startsWith('sea-reef'))).toHaveLength(2);
  expect(result.land.filter(o => o.name === 'far-horizon-archipelago')).toHaveLength(1);
  expect(result.farIslandCount).toBe(3); expect(result.permanentBirdsRemoved).toBe(true);
  for (const land of result.land) {
    expect(land.min).toBeLessThan(-9);
    expect(land.max).toBeGreaterThan(-7.5);
  }
  expect(result.clearance).toBeGreaterThan(.005);
  expect(result.clearance).toBeLessThan(.1);
  expect(result.basket.min[1]).toBeCloseTo(.001, 4);
  expect(result.basket.min[2]).toBeGreaterThan(2.7);
  expect(result.basket.max[0]).toBeLessThan(-.35);
  expect(Math.abs(result.meanWater)).toBeLessThan(.08);
  expect(result.waterRange).toBeGreaterThan(1);
  expect(result.removed).toBe(true);
  expect(result.clearOfReefs).toBe(true);
});
