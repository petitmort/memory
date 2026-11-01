import { test, expect } from "@playwright/test";
import * as THREE from "three";
import { createLighthouseCoast, lighthouseSite, sampleLighthousePath } from "../src/lighthouse-coast";
import { sampleVesselRoute, vesselRoutes } from "../src/vessel-navigation";

test("the continuous descending path and tower platform stand on connected rock above the sea", () => {
  const coast = createLighthouseCoast(); coast.group.updateMatrixWorld(true);
  const rock = coast.group.getObjectByName("lighthouse-coast-rock") as THREE.Mesh;
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let previous = sampleLighthousePath(0);
  for (let i = 0; i <= 200; i++) {
    const p = sampleLighthousePath(i / 200);
    expect(p.z).toBeLessThanOrEqual(previous.z);
    expect(p.y).toBeLessThanOrEqual(previous.y);
    if (i) expect(Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z)).toBeLessThan(.16);
    ray.set(new THREE.Vector3(p.x, 8, p.z - (i === 0 ? .001 : 0)), down);
    const hit = ray.intersectObject(rock, false)[0];
    expect(hit, `path support at ${i}`).toBeDefined();
    expect(Math.abs(hit.point.y - p.y)).toBeLessThan(.002);
    expect(hit.face!.normal.y).toBeGreaterThan(.9);
    previous = p;
  }
  const end = sampleLighthousePath(1);
  expect(end.x).toBeCloseTo(lighthouseSite.x); expect(end.y).toBeCloseTo(lighthouseSite.y); expect(end.z).toBe(lighthouseSite.z);
  const bounds = new THREE.Box3().setFromObject(rock, true);
  expect(bounds.min.y).toBeLessThan(-9); expect(bounds.max.y).toBeGreaterThan(-.3);
  const path = coast.group.getObjectByName("cliff-path") as THREE.Mesh;
  const pathBounds = new THREE.Box3().setFromObject(path, true);
  expect(pathBounds.max.z).toBeGreaterThan(-5.1); expect(pathBounds.min.z).toBeLessThan(-32);
  coast.dispose();
});

test("the entire headland keeps a seven-metre largest-hull margin from every sailing lane", () => {
  const coast = createLighthouseCoast();
  const rock = coast.group.getObjectByName("lighthouse-coast-rock")!;
  const bounds = new THREE.Box3().setFromObject(rock, true);
  for (const route of vesselRoutes) {
    let minimum = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const p = sampleVesselRoute(route, i / 2000);
      const x = THREE.MathUtils.clamp(p.x, bounds.min.x, bounds.max.x);
      const z = THREE.MathUtils.clamp(p.z, bounds.min.z, bounds.max.z);
      minimum = Math.min(minimum, Math.hypot(p.x - x, p.z - z));
    }
    expect(minimum, route).toBeGreaterThan(7);
  }
  coast.dispose();
});

test("the natural shoreline has irregular shoulders and a broad sloping fractured face beyond the paving", () => {
  const coast = createLighthouseCoast(); coast.group.updateMatrixWorld(true);
  const rock = coast.group.getObjectByName("lighthouse-coast-rock") as THREE.Mesh;
  const margins: number[] = [], slopes: number[] = [];
  for (let i = 2; i < 44; i += 3) {
    const p = sampleLighthousePath(i / 48), hits: number[] = [];
    for (const depth of [.3, 5]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(-40, p.y - depth, p.z), new THREE.Vector3(1, 0, 0));
      const hit = ray.intersectObject(rock, false)[0];
      expect(hit).toBeDefined(); hits.push(hit.point.x);
    }
    margins.push(p.x - p.width / 2 - hits[0]); slopes.push(hits[0] - hits[1]);
  }
  expect(Math.max(...margins) - Math.min(...margins)).toBeGreaterThan(1.2);
  expect(Math.min(...margins)).toBeGreaterThan(1.2);
  expect(slopes.filter(value => value > 1).length).toBeGreaterThan(10);
  expect((rock.material as THREE.MeshStandardMaterial).flatShading).toBe(true);
  coast.dispose();
});

test("tower and most of the approach remain inside the actual desktop and phone window rays", () => {
  for (const [width, height] of [[1280, 800], [390, 844], [844, 390]]) {
    const mobile = width < 760, camera = new THREE.PerspectiveCamera(50, width / height, .1, 500);
    camera.position.set(mobile ? .55 : 1.1, 1.65, mobile ? 1.7 : .75);
    camera.lookAt(mobile ? 0 : -.2, mobile ? 1.05 : .95, mobile ? -1.4 : -1.5);
    camera.updateMatrixWorld(true);
    const visible = (p: THREE.Vector3) => {
      const portal = camera.position.clone().lerp(p, (-2.7 - camera.position.z) / (p.z - camera.position.z));
      const screen = p.clone().project(camera);
      return Math.abs(portal.x) < 1.47 && portal.y > .85 && portal.y < 2.45 && Math.abs(screen.x) < .98 && Math.abs(screen.y) < .98;
    };
    expect(visible(new THREE.Vector3(lighthouseSite.x, lighthouseSite.y + .2, lighthouseSite.z)), `${width} base`).toBe(true);
    expect(visible(new THREE.Vector3(lighthouseSite.x, lighthouseSite.y + 6.445, lighthouseSite.z)), `${width} tip`).toBe(true);
    let roadVisible = 0;
    for (let i = 0; i <= 100; i++) {
      const p = sampleLighthousePath(i / 100);
      if (visible(new THREE.Vector3(p.x, p.y + .09, p.z))) roadVisible++;
    }
    expect(roadVisible, `${width} road samples`).toBeGreaterThan(45);
  }
});

test("seven fixed batches need no textures or lights and follow daylight without allocating or double disposal", () => {
  const coast = createLighthouseCoast(), resources = new Set<THREE.BufferGeometry | THREE.Material>();
  let triangles = 0;
  expect(coast.group.children).toHaveLength(7);
  coast.group.traverse(object => {
    expect(object instanceof THREE.Light).toBe(false);
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry, material = object.material as THREE.MeshStandardMaterial;
    expect(geometry.index).not.toBeNull();
    expect(Array.from(geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    expect(Array.from(geometry.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
    expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
    expect(material.map).toBeNull(); expect(material.normalMap).toBeNull(); expect(object.castShadow).toBe(false);
    triangles += geometry.index!.count / 3; resources.add(geometry); resources.add(material);
  });
  expect(triangles).toBeLessThan(11000); expect(resources.size).toBe(13);
  const lantern = (coast.group.getObjectByName("lighthouse-coast-lantern") as THREE.Mesh).material as THREE.MeshStandardMaterial;
  coast.update(1); expect(lantern.emissiveIntensity).toBe(0);
  coast.update(0); expect(lantern.emissiveIntensity).toBeCloseTo(.95);
  const day = lantern.emissiveIntensity;
  coast.update(.25); expect(lantern.emissiveIntensity).toBeGreaterThan(0); expect(lantern.emissiveIntensity).toBeLessThan(day);
  for (let i = 0; i < 500; i++) coast.update(i / 500);
  expect(coast.group.children).toHaveLength(7);
  const disposals = new Map<unknown, number>();
  for (const resource of resources) resource.addEventListener("dispose", () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  coast.dispose(); coast.dispose(); coast.update(0);
  expect(coast.group.children).toHaveLength(0); expect(disposals.size).toBe(13);
  expect([...disposals.values()].every(count => count === 1)).toBe(true);
});
