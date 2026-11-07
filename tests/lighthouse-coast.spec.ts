import { roomComposition } from '../src/room-composition';
import { test, expect } from "@playwright/test";
import * as THREE from "three";
import { createLighthouseCoast, lighthouseSite, LIGHTHOUSE_HEIGHT, sampleLighthousePath } from "../src/lighthouse-coast";
import { distanceToPier, PIER_DECK_HEIGHT, PIER_FOOT_WIDTH, PIER_LENGTH, PIER_PLATFORM_RADIUS, PIER_SEA_LEVEL, PIER_WIDTH, samplePierEdge, samplePierPath } from "../src/pier-layout";
import { sampleVesselRoute, vesselRoutes } from "../src/vessel-navigation";

test("the level stone pier has continuous paving and submerged structural support across its full width", () => {
  const coast = createLighthouseCoast(); coast.group.updateMatrixWorld(true);
  const support = coast.group.getObjectByName("lighthouse-coast-support") as THREE.Mesh;
  const paving = coast.group.getObjectByName("cliff-path") as THREE.Mesh;
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  expect(PIER_DECK_HEIGHT - PIER_SEA_LEVEL).toBeCloseTo(1.85);
  let previous = sampleLighthousePath(0);
  for (let i = 0; i <= 160; i++) {
    const p = sampleLighthousePath(i / 160);
    expect(p.y).toBe(PIER_DECK_HEIGHT);
    expect(p.z).toBeLessThanOrEqual(previous.z);
    if (i) expect(Math.hypot(p.x - previous.x, p.z - previous.z)).toBeCloseTo(PIER_LENGTH / 160);
    for (const lateral of [-PIER_WIDTH / 2 + .15, 0, PIER_WIDTH / 2 - .15]) {
      const origin = new THREE.Vector3(p.x + p.normalX * lateral, 8, p.z + p.normalZ * lateral);
      ray.set(origin, down);
      const deck = ray.intersectObject(paving, false)[0];
      expect(deck, `deck ${i}/${lateral}`).toBeDefined();
      expect(deck.point.y).toBeGreaterThanOrEqual(PIER_DECK_HEIGHT - .001);
      expect(deck.point.y).toBeLessThanOrEqual(PIER_DECK_HEIGHT + .027);
      expect(deck.face!.normal.y).toBeGreaterThan(.99);
      const structural = ray.intersectObject(support, false)[0];
      expect(structural, `support ${i}/${lateral}`).toBeDefined();
      expect(structural.point.y).toBeCloseTo(PIER_DECK_HEIGHT - .18, 3);
    }
    previous = p;
  }
  const end = sampleLighthousePath(1);
  expect(end.x).toBe(lighthouseSite.x); expect(end.y).toBe(lighthouseSite.y); expect(end.z).toBe(lighthouseSite.z);
  const bounds = new THREE.Box3().setFromObject(support, true);
  expect(bounds.min.y).toBeLessThan(PIER_SEA_LEVEL - 2);
  expect(coast.group.getObjectByName("lighthouse-coast-rock")).toBeUndefined();
  expect(coast.group.userData.kind).toBe("regular-breakwater-pier");
  coast.dispose();
});

test("both wave-impact edges and navigation clearance share the exact oriented pier footprint", () => {
  for (const t of [0, .1, .5, .9, 1]) {
    const center = samplePierPath(t), left = samplePierEdge(t, -1), right = samplePierEdge(t, 1);
    expect(Math.hypot(center.tangentX, center.tangentZ)).toBeCloseTo(1);
    expect(Math.hypot(center.normalX, center.normalZ)).toBeCloseTo(1);
    expect(center.normalX * center.tangentX + center.normalZ * center.tangentZ).toBeCloseTo(0);
    expect(center.normalX * (.55 - center.x) + center.normalZ * (1.7 - center.z), "positive normal faces the study").toBeGreaterThan(0);
    expect(Math.hypot(right.x - left.x, right.z - left.z)).toBeCloseTo(PIER_WIDTH);
    expect((left.x + right.x) / 2).toBeCloseTo(center.x);
    expect((left.z + right.z) / 2).toBeCloseTo(center.z);
    expect(distanceToPier(center.x, center.z)).toBe(0);
  }
  const middle = samplePierPath(.5);
  expect(distanceToPier(middle.x + middle.normalX * (PIER_FOOT_WIDTH / 2 + 3), middle.z + middle.normalZ * (PIER_FOOT_WIDTH / 2 + 3))).toBeCloseTo(3);
  expect(distanceToPier(lighthouseSite.x, lighthouseSite.z - PIER_PLATFORM_RADIUS - 2.2)).toBeCloseTo(2);
  expect(samplePierPath(-3)).toEqual(samplePierPath(0));
  expect(samplePierPath(4)).toEqual(samplePierPath(1));
});

test("all six sailing lanes clear the diagonal pier and lighthouse landing by seven metres", () => {
  for (const route of vesselRoutes) {
    let minimum = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const p = sampleVesselRoute(route, i / 2000);
      minimum = Math.min(minimum, distanceToPier(p.x, p.z));
    }
    expect(minimum, route).toBeGreaterThan(7);
  }
});

test("the tower and entire pier stay in the right pane while the approach enters from its bottom-right", () => {
  const coast = createLighthouseCoast(); coast.group.updateMatrixWorld(true);
  const towerPoints: THREE.Vector3[] = [];
  for (const child of coast.group.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const position = child.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(position, i);
      if (Math.hypot(p.x - lighthouseSite.x, p.z - lighthouseSite.z) < 1.3 && p.y >= lighthouseSite.y + .3) towerPoints.push(p);
    }
  }
  expect(towerPoints.length).toBeGreaterThan(1000);
  expect(Math.max(...towerPoints.map(p => p.y)) - lighthouseSite.y).toBeLessThanOrEqual(LIGHTHOUSE_HEIGHT);
  for (const [width, height] of [[1280, 800], [390, 844], [844, 390]]) {
    const mobile = width < 760, camera = new THREE.PerspectiveCamera(50, width / height, .1, 500);
    const composition = roomComposition(mobile);
    camera.position.copy(composition.p); camera.lookAt(composition.t); camera.updateMatrixWorld(true);
    const portal = (p: THREE.Vector3) => camera.position.clone().lerp(p, (-2.7 - camera.position.z) / (p.z - camera.position.z));
    const paneX: number[] = [], paneY: number[] = [], screenX: number[] = [], screenY: number[] = [];
    for (const p of towerPoints) {
      const pane = portal(p), screen = p.clone().project(camera);
      paneX.push(pane.x); paneY.push(pane.y); screenX.push(Math.abs(screen.x)); screenY.push(Math.abs(screen.y));
    }
    expect(Math.min(...paneX), `${width} mullion`).toBeGreaterThan(.20);
    expect(Math.max(...paneX), `${width} right frame`).toBeLessThan(1.47);
    expect(Math.min(...paneY), `${width} sill`).toBeGreaterThan(.85);
    expect(Math.max(...paneY), `${width} lintel`).toBeLessThan(2.45);
    expect(Math.max(...screenX)).toBeLessThan(.98); expect(Math.max(...screenY)).toBeLessThan(.98);
    const roadPanes: { x: number; y: number; progress: number }[] = [];
    for (let i = 0; i <= 100; i++) {
      const p = sampleLighthousePath(i / 100), world = new THREE.Vector3(p.x, p.y + .03, p.z), pane = portal(world), screen = world.clone().project(camera);
      if (Math.abs(pane.x) < 1.47 && pane.y > .85 && pane.y < 2.45 && Math.abs(screen.x) < .98 && Math.abs(screen.y) < .98) roadPanes.push({ x: pane.x, y: pane.y, progress: i / 100 });
    }
    // Judge the receding approach in metres, rather than the old camera's
    // incidental sample count. A continuous half-pier remains visible on the
    // wider room composition; mobile retains its original framing.
    expect(roadPanes.length).toBeGreaterThan(1);
    expect((roadPanes.at(-1)!.progress - roadPanes[0].progress) * PIER_LENGTH,
      `${width} visible approach in metres`).toBeGreaterThan(mobile ? 12 : 20);
    for (let i = 1; i < roadPanes.length; i++)
      expect(roadPanes[i].progress - roadPanes[i - 1].progress, `${width} continuous approach`).toBeCloseTo(.01, 8);
    expect(Math.min(...roadPanes.map(p => p.x)), `${width} right-pane approach`).toBeGreaterThan(.20);
    expect(roadPanes[0].x, `${width} approach enters from right`).toBeGreaterThan(roadPanes.at(-1)!.x + .20);
    expect(roadPanes[0].y, `${width} approach enters near sill`).toBeLessThan(1.0);
    expect(roadPanes[0].y, `${width} pier recedes upward`).toBeLessThan(roadPanes.at(-1)!.y - .15);
    const physicalPaneX: number[] = [];
    for (const child of coast.group.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const positions = child.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, i), pane = portal(p), screen = p.clone().project(camera);
        if (Math.abs(pane.x) < 1.47 && pane.y > .85 && pane.y < 2.45 && Math.abs(screen.x) < .98 && Math.abs(screen.y) < .98) physicalPaneX.push(pane.x);
      }
    }
    expect(physicalPaneX.length).toBeGreaterThan(1000);
    expect(Math.min(...physicalPaneX), `${width} left pane remains free of all pier geometry`).toBeGreaterThan(.12);
  }
  coast.dispose();
});

test("six fixed masonry batches include glazed lantern details without textures, lights or duplicate disposal", () => {
  const coast = createLighthouseCoast(), resources = new Set<THREE.BufferGeometry | THREE.Material>();
  // The rotating dusk beacon owns a separate child group and its own shader.
  const masonry = coast.group.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
  let triangles = 0;
  expect(masonry).toHaveLength(6);
  coast.group.traverse(object => expect(object instanceof THREE.Light).toBe(false));
  for (const object of masonry) {
    const geometry = object.geometry as THREE.BufferGeometry, material = object.material as THREE.MeshStandardMaterial;
    expect(geometry.index).not.toBeNull();
    expect(Array.from(geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    expect(Array.from(geometry.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
    expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
    expect(material.map).toBeNull(); expect(material.normalMap).toBeNull(); expect(object.castShadow).toBe(false);
    triangles += geometry.index!.count / 3; resources.add(geometry); resources.add(material);
  }
  expect(triangles).toBeLessThan(22000); expect(resources.size).toBe(12);
  const glass = (coast.group.getObjectByName("lighthouse-coast-glass") as THREE.Mesh).material as THREE.MeshStandardMaterial;
  expect(glass.transparent).toBe(true); expect(glass.depthWrite).toBe(false); expect(glass.opacity).toBeLessThan(.3);
  const lantern = (coast.group.getObjectByName("lighthouse-coast-lantern") as THREE.Mesh).material as THREE.MeshStandardMaterial;
  coast.update(1); expect(lantern.emissiveIntensity).toBe(0);
  coast.update(0); expect(lantern.emissiveIntensity).toBeCloseTo(1.15);
  const night = lantern.emissiveIntensity;
  coast.update(.25); expect(lantern.emissiveIntensity).toBeGreaterThan(0); expect(lantern.emissiveIntensity).toBeLessThan(night);
  for (let i = 0; i < 500; i++) coast.update(i / 500);
  expect(coast.group.children.filter(object => object instanceof THREE.Mesh)).toHaveLength(6);
  const disposals = new Map<unknown, number>();
  for (const resource of resources) resource.addEventListener("dispose", () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  coast.dispose(); coast.dispose(); coast.update(0);
  expect(coast.group.children).toHaveLength(0); expect(disposals.size).toBe(12);
  expect([...disposals.values()].every(count => count === 1)).toBe(true);
});
