import * as THREE from "three";

function visibleMesh(object: THREE.Object3D) {
  if (!(object instanceof THREE.Mesh)) return false;
  return visibleAncestry(object);
}

function visibleAncestry(object: THREE.Object3D | null) {
  for (let ancestor = object; ancestor; ancestor = ancestor.parent)
    if (!ancestor.visible) return false;
  return true;
}

function within(object: THREE.Object3D, root: THREE.Object3D) {
  for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent)
    if (ancestor === root) return true;
  return false;
}

/** Exact visible-mesh queries for the room's existing Three.js geometry. */
export function createInteractionRaycast(ray: THREE.Raycaster) {
  const hits: THREE.Intersection[] = [];
  let nearest: number | undefined;

  function visit(object: THREE.Object3D, excluded: THREE.Object3D | undefined, firstOnly: boolean): boolean {
    // Raycaster itself visits hidden pooled models. Their ordinary geometry
    // can only report hidden hits, and an excluded candidate cannot block itself.
    if (!object.visible || object === excluded) return false;
    let propagate = true;
    if (object.layers.test(ray.layers)) {
      hits.length = 0;
      const result: unknown = object.raycast(ray, hits);
      propagate = result !== false;
      for (const hit of hits) {
        // Instanced/LOD/custom raycasts may report a different object. Keep the
        // original hit-object visibility and ancestry rules, not the caller's.
        if (!visibleMesh(hit.object) || excluded && within(hit.object, excluded)) continue;
        if (firstOnly) return true;
        if (nearest === undefined || hit.distance < nearest) nearest = hit.distance;
      }
    }
    // Layers restrict this node, not its descendants. A custom false return
    // still prevents recursion exactly as Three's recursive Raycaster does.
    if (propagate) for (const child of object.children)
      if (visit(child, excluded, firstOnly)) return true;
    return false;
  }

  return {
    nearestVisible(root: THREE.Object3D) {
      nearest = undefined;
      try {
        if (visibleAncestry(root.parent)) visit(root, undefined, false);
        return nearest;
      } finally { hits.length = 0; }
    },
    isBlocked(roots: readonly THREE.Object3D[], excluded: THREE.Object3D) {
      try {
        for (const root of roots) {
          if (within(root, excluded) || !visibleAncestry(root.parent)) continue;
          if (visit(root, excluded, true)) return true;
        }
        return false;
      } finally { hits.length = 0; }
    },
  };
}
