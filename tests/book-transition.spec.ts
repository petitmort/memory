import { test, expect } from '@playwright/test';

test('paper aligns with projected corners and the closed album retains its real dimensions', async ({ page }) => {
  await page.route('**/__paper_projection', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>',
  }));
  await page.goto('/__paper_projection');
  const result = await page.evaluate(async () => {
    const path = '/src/reader-transition.ts';
    const { paperTransform } = await import(path);
    const albumPath = '/src/album-model.ts', threePath = '/node_modules/.vite/deps/three.js';
    const [{ createAlbum }, THREE] = await Promise.all([import(albumPath), import(threePath)]);
    const album = createAlbum();
    const closedSize = new THREE.Box3().setFromObject(album.group, true).getSize(new THREE.Vector3()).toArray();
    album.setOpening(1, 1);
    album.group.updateMatrixWorld(true);
    const cover = album.hinge.children.find(child => child.geometry?.type === 'BoxGeometry');
    const coverBounds = new THREE.Box3().setFromObject(cover, true);
    const pageEdges = object => {
      const vertices = object.geometry.getAttribute('position');
      const points = Array.from({ length: vertices.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(object.matrixWorld));
      const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
      const average = edge => {
        const samples = points.filter(point => Math.abs(point.x - edge) < .00001);
        return { x: edge, y: samples.reduce((sum, point) => sum + point.y, 0) / samples.length };
      };
      return { outer: average(minX), inner: average(maxX) };
    };
    const leftPage = pageEdges(album.group.getObjectByName('album-left-page'));
    const settledLeaf = pageEdges(album.leaf);
    const open = { coverBottom: coverBounds.min.y, coverTop: coverBounds.max.y, leftPage, settledLeaf };
    // Reverse an actual partial turn before returning to the closed state.
    album.setOpening(.65, .3);
    album.setOpening(0, 0);
    const reclosedSize = new THREE.Box3().setFromObject(album.group, true).getSize(new THREE.Vector3()).toArray();
    const corners = [{ x: 310, y: 180 }, { x: 810, y: 205 }, { x: 858, y: 545 }, { x: 276, y: 573 }];
    const width = 920, height = 560, left = 64, top = 80;
    const paper = document.createElement('div');
    Object.assign(paper.style, {
      position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
      transformOrigin: '0 0', transform: paperTransform(width, height, { corners }, left, top),
    });
    document.body.append(paper);
    const actual = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => {
      const marker = document.createElement('span');
      Object.assign(marker.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: '0', height: '0' });
      paper.append(marker);
      const rect = marker.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    });
    const degenerate = paperTransform(width, height, { corners: Array(4).fill({ x: 4, y: 7 }) }, left, top);
    return { corners, actual, degenerate, closedSize, open, reclosedSize };
  });
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(result.actual[i].x - result.corners[i].x)).toBeLessThan(1);
    expect(Math.abs(result.actual[i].y - result.corners[i].y)).toBeLessThan(1);
  }
  expect(result.degenerate).toBeNull();
  [.32, .0351, .26].forEach((size, axis) => {
    expect(result.closedSize[axis]).toBeCloseTo(size, 4);
    expect(result.reclosedSize[axis]).toBeCloseTo(size, 4);
  });
  expect(result.open.coverBottom).toBeCloseTo(0, 5);
  const { coverTop, leftPage, settledLeaf } = result.open;
  expect(leftPage.outer.y - coverTop).toBeGreaterThanOrEqual(0);
  expect(leftPage.outer.y - coverTop).toBeLessThan(.001);
  expect(leftPage.inner.y - leftPage.outer.y).toBeGreaterThan(.02);
  for (const edge of ['outer', 'inner'] as const) {
    expect(settledLeaf[edge].x).toBeCloseTo(leftPage[edge].x, 4);
    expect(settledLeaf[edge].y - leftPage[edge].y).toBeGreaterThan(0);
    expect(settledLeaf[edge].y - leftPage[edge].y).toBeLessThan(.001);
  }
});
