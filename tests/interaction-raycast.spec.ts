import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createInteractionRaycast } from '../src/interaction-raycast';

// Frozen predicates and public Three raycast calls from scene.ts at 7b2afaf.
// Keep this independent of the optimized walk and its early-return policy.
function visibleMesh(object: THREE.Object3D) {
  if (!(object instanceof THREE.Mesh)) return false;
  for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent)
    if (!ancestor.visible) return false;
  return true;
}
function within(object: THREE.Object3D, root: THREE.Object3D) {
  for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent)
    if (ancestor === root) return true;
  return false;
}
const oldNearest = (ray: THREE.Raycaster, root: THREE.Object3D) =>
  ray.intersectObject(root, true).find(hit => visibleMesh(hit.object))?.distance;
const oldBlocked = (ray: THREE.Raycaster, roots: THREE.Object3D[], excludedRoot: THREE.Object3D) =>
  ray.intersectObjects(roots, true).some(hit => visibleMesh(hit.object) && !within(hit.object, excludedRoot));

function release(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
      geometries.add(object.geometry);
      const values = Array.isArray(object.material) ? object.material : [object.material];
      for (const value of values) if (value) materials.add(value);
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  for (const value of geometries) value.dispose();
  for (const value of materials) value.dispose();
}

test('visible mesh picking matches frozen native queries through transforms, nesting, layers and bounded rays', async ({}, testInfo) => {
  const scene = new THREE.Scene(), ray = new THREE.Raycaster(), pick = createInteractionRaycast(ray);
  const geometry = new THREE.SphereGeometry(.32, 16, 8), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const roots = Array.from({ length: 4 }, (_, index) => {
    const root = new THREE.Group(); root.position.set((index - 1.5) * .7, index % 2 * .15, -4 - index * .2);
    const nested = new THREE.Group(); nested.rotation.set(.12 * index, .19 * index, .07 * index);
    const mesh = new THREE.Mesh(geometry, material); mesh.scale.set(1, 1 + index * .1, 1);
    nested.add(mesh); root.add(nested); scene.add(root); return root;
  });
  const hiddenAncestor = new THREE.Group(); scene.remove(roots[3]); hiddenAncestor.add(roots[3]); scene.add(hiddenAncestor);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(.18, .7, .16), material); blocker.position.set(.18, 0, -2.8); scene.add(blocker);
  let seed = 0x12345678, comparisons = 0, nearestHits = 0, blocked = 0;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  try {
    for (let state = 0; state < 5; state++) {
      hiddenAncestor.visible = state !== 1;
      roots[1].children[0].visible = state !== 2;
      roots[2].layers.set(state === 3 ? 2 : 0); // Parent layers never suppress its descendants.
      blocker.visible = state !== 4;
      scene.updateMatrixWorld(true);
      for (let index = 0; index < 72; index++) {
        ray.ray.set(new THREE.Vector3(), new THREE.Vector3((random() - .5) * .6, (random() - .5) * .16, -1).normalize());
        ray.near = index % 5 === 0 ? 3.2 : 0; ray.far = index % 7 === 0 ? 3.5 : 8;
        const bounds = [ray.near, ray.far];
        for (const root of roots) {
          const expected = oldNearest(ray, root);
          expect(pick.nearestVisible(root)).toBe(expected);
          if (expected !== undefined) nearestHits++;
          comparisons++;
        }
        const excluded = roots[index % roots.length], expected = oldBlocked(ray, scene.children, excluded);
        expect(pick.isBlocked(scene.children, excluded)).toBe(expected);
        if (expected) blocked++;
        expect([ray.near, ray.far]).toEqual(bounds); comparisons++;
      }
    }
    expect(comparisons).toBe(1800); expect(nearestHits).toBeGreaterThan(30); expect(blocked).toBeGreaterThan(30);
    await testInfo.attach('interaction-raycast-equivalence', { body: JSON.stringify({ comparisons, nearestHits, blocked, seed: '0x12345678', nativeBoundsUnchanged: true }), contentType: 'application/json' });
  } finally { release(scene); }
});

test('points and lines stay nonblocking while their mesh children, instancing and LOD retain native hit identity', () => {
  const scene = new THREE.Scene(), ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)), pick = createInteractionRaycast(ray);
  const material = new THREE.MeshBasicMaterial(), geometry = new THREE.BoxGeometry(1, 1, 1);
  const positions = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -.1, -1), new THREE.Vector3(0, .1, -1)]);
  const points = new THREE.Points(positions, new THREE.PointsMaterial()), line = new THREE.Line(positions, new THREE.LineBasicMaterial());
  const pointChild = new THREE.Mesh(geometry, material); pointChild.position.z = -4; points.add(pointChild);
  const lineChild = new THREE.Mesh(geometry, material); lineChild.position.z = -6; line.add(lineChild);
  const excluded = new THREE.Group(); scene.add(points, line, excluded); scene.updateMatrixWorld(true);
  try {
    for (const root of [points, line]) expect(pick.nearestVisible(root)).toBe(oldNearest(ray, root));
    expect(pick.isBlocked([points, line], excluded)).toBe(true);
    pointChild.visible = lineChild.visible = false;
    expect(pick.isBlocked([points, line], excluded)).toBe(false);
    expect(oldBlocked(ray, [points, line], excluded)).toBe(false);

    const instances = new THREE.InstancedMesh(geometry, material, 3);
    for (let i = 0; i < 3; i++) instances.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i - 1, 0, -4 - i));
    scene.add(instances); scene.updateMatrixWorld(true);
    expect(ray.intersectObject(instances)[0].object).toBe(instances);
    expect(pick.nearestVisible(instances)).toBe(oldNearest(ray, instances));
    expect(pick.isBlocked([instances], instances)).toBe(false);
    instances.visible = false;
    expect(pick.nearestVisible(instances)).toBeUndefined();

    const lod = new THREE.LOD(), near = new THREE.Mesh(geometry, material), far = new THREE.Mesh(geometry, material);
    far.scale.setScalar(.5); lod.position.z = -4; lod.addLevel(near, 0); lod.addLevel(far, 10); scene.add(lod);
    const camera = new THREE.PerspectiveCamera(); camera.position.z = 20; camera.updateMatrixWorld(true); scene.updateMatrixWorld(true); lod.update(camera);
    // LOD.raycast selects by ray origin, while visibility was last selected by
    // another camera position. Filter the actual hit object, including here.
    expect(near.visible).toBe(false); expect(far.visible).toBe(true);
    expect(pick.nearestVisible(lod)).toBe(oldNearest(ray, lod));
    expect(pick.isBlocked([lod], excluded)).toBe(oldBlocked(ray, [lod], excluded));

    const missing = new THREE.Mesh(geometry, material); missing.position.z = -2; (missing as any).material = undefined; scene.add(missing); scene.updateMatrixWorld(true);
    expect(pick.nearestVisible(missing)).toBe(oldNearest(ray, missing));
    expect(pick.isBlocked([missing], excluded)).toBe(false);
  } finally { release(scene); }
});

test('custom recursion gates and foreign hit objects preserve visibility and exclusion predicates', () => {
  const scene = new THREE.Scene(), ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)), pick = createInteractionRaycast(ray);
  const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshBasicMaterial();
  const gate = new THREE.Group(), child = new THREE.Mesh(geometry, material); child.position.z = -4; gate.add(child); scene.add(gate);
  gate.raycast = () => false;
  const excluded = new THREE.Group(); scene.add(excluded); scene.updateMatrixWorld(true);
  try {
    expect(pick.nearestVisible(gate)).toBe(oldNearest(ray, gate)); expect(pick.nearestVisible(gate)).toBeUndefined();
    gate.layers.set(2);
    expect(pick.nearestVisible(gate)).toBe(oldNearest(ray, gate)); expect(pick.nearestVisible(gate)).toBe(3.5);
    expect(pick.isBlocked([gate], excluded)).toBe(true);

    const foreignSource = new THREE.Group(), hidden = new THREE.Mesh(geometry, material), inside = new THREE.Mesh(geometry, material), outside = new THREE.Mesh(geometry, material);
    hidden.visible = false; excluded.add(inside); scene.add(hidden, outside, foreignSource);
    let reportOutside = false;
    foreignSource.raycast = (_ray, hits) => {
      hits.push({ distance: 1, point: new THREE.Vector3(0, 0, -1), object: hidden });
      hits.push({ distance: 2, point: new THREE.Vector3(0, 0, -2), object: inside });
      if (reportOutside) hits.push({ distance: 3, point: new THREE.Vector3(0, 0, -3), object: outside });
    };
    expect(pick.nearestVisible(foreignSource)).toBe(oldNearest(ray, foreignSource)); expect(pick.nearestVisible(foreignSource)).toBe(2);
    expect(pick.isBlocked([foreignSource], excluded)).toBe(oldBlocked(ray, [foreignSource], excluded)); expect(pick.isBlocked([foreignSource], excluded)).toBe(false);
    reportOutside = true;
    expect(pick.isBlocked([foreignSource], excluded)).toBe(oldBlocked(ray, [foreignSource], excluded)); expect(pick.isBlocked([foreignSource], excluded)).toBe(true);
  } finally { release(scene); }
});

test('equal candidates, nested exclusions and the original one millimetre boundary keep their exact results', () => {
  const scene = new THREE.Scene(), ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)), pick = createInteractionRaycast(ray);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), geometry = new THREE.PlaneGeometry(1, 1);
  const first = new THREE.Group(), second = new THREE.Group();
  for (const root of [first, second]) { const mesh = new THREE.Mesh(geometry, material); mesh.position.z = -4.5; root.add(mesh); scene.add(root); }
  const wrapper = new THREE.Group(); scene.remove(first); wrapper.add(first); scene.add(wrapper); scene.updateMatrixWorld(true);
  try {
    const winner = (optimized: boolean) => [first, second].map((root, index) => ({ index, distance: optimized ? pick.nearestVisible(root) : oldNearest(ray, root) }))
      .filter(value => value.distance !== undefined).sort((a, b) => a.distance! - b.distance!)[0]?.index;
    expect(winner(true)).toBe(winner(false)); expect(winner(true)).toBe(0);
    for (const [near, far] of [[0, 4.5], [4.5, 4.5], [4.5 + 1e-8, 6], [0, 4.5 - 1e-8]]) {
      ray.near = near; ray.far = far;
      expect(pick.nearestVisible(first)).toBe(oldNearest(ray, first));
    }
    ray.near = 0; ray.far = 4.5 - .001;
    const blocker = new THREE.Mesh(geometry, material); scene.add(blocker);
    for (const distance of [4.499 - 1e-8, 4.499, 4.499 + 1e-8]) {
      blocker.position.z = -distance; scene.updateMatrixWorld(true);
      expect(pick.isBlocked(scene.children, first)).toBe(oldBlocked(ray, scene.children, first));
    }
    expect(pick.isBlocked([wrapper], first)).toBe(false);
    wrapper.visible = false;
    expect(pick.nearestVisible(first)).toBe(oldNearest(ray, first)); expect(pick.nearestVisible(first)).toBeUndefined();
  } finally { release(scene); }
});

test('queries skip hidden and excluded mesh work and stop after the first real blocker', async ({}, testInfo) => {
  const scene = new THREE.Scene(), ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)), pick = createInteractionRaycast(ray);
  const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshBasicMaterial();
  const hidden = new THREE.Group(), excluded = new THREE.Group(), first = new THREE.Mesh(geometry, material), later = new THREE.Mesh(geometry, material);
  hidden.visible = false; const hiddenMesh = new THREE.Mesh(geometry, material), excludedMesh = new THREE.Mesh(geometry, material);
  hidden.add(hiddenMesh); excluded.add(excludedMesh); first.position.z = -2; later.position.z = -3;
  scene.add(hidden, excluded, first, later); scene.updateMatrixWorld(true);
  const calls = { hidden: 0, excluded: 0, first: 0, later: 0 };
  for (const [key, mesh] of [['hidden', hiddenMesh], ['excluded', excludedMesh], ['first', first], ['later', later]] as const) {
    const native = mesh.raycast;
    mesh.raycast = function (ray, hits) { calls[key]++; return native.call(this, ray, hits); };
  }
  try {
    expect(pick.isBlocked(scene.children, excluded)).toBe(true);
    expect(calls).toEqual({ hidden: 0, excluded: 0, first: 1, later: 0 });
    expect(pick.nearestVisible(hiddenMesh)).toBeUndefined(); expect(calls.hidden).toBe(0);
    const optimizedCalls = { ...calls };
    expect(oldBlocked(ray, scene.children, excluded)).toBe(true);
    expect(calls.hidden).toBe(1); expect(calls.excluded).toBe(1); expect(calls.later).toBe(1);
    await testInfo.attach('interaction-raycast-work-avoidance', { body: JSON.stringify({ optimizedCalls, afterLegacyCalls: calls, nativeBounds: [ray.near, ray.far] }), contentType: 'application/json' });
  } finally { release(scene); }
});
