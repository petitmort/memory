// Exact visibleMesh/within/resolveInteraction source from scene.ts at 7b2afaf.
// Keep this original slice unchanged; it is only compiled inside the native test fixture.
export const interactionRaycastReference = String.raw`  function visibleMesh(object: THREE.Object3D) {
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
  function resolveInteraction(e: Pick<PointerEvent, "clientX" | "clientY">): InteractionKind | undefined {
    if (!canInteract()) return;
    const roots: [InteractionKind, THREE.Object3D][] = current === "entry"
      ? [["door", door]]
      : [["cat", cat.group], ["record", recordPlayer.group]];
    if (current === "room" && !nookFocused) roots.push(bouquetParked ? ["book", book] : ["bouquet", bouquet]);
    pointRay(e);
    // Hover, press, release and cat strokes share the same nearest visible
    // mesh rule. A candidate hidden behind furniture remains unreachable.
    const candidates = roots.flatMap(([kind, root]) => {
      const hit = ray.intersectObject(root, true).find(hit => visibleMesh(hit.object));
      return hit ? [{ kind, root, distance: hit.distance }] : [];
    }).sort((a, b) => a.distance - b.distance);
    const candidate = candidates[0];
    if (!candidate) return;
    // The entry door keeps its existing two-click route through the visual
    // courtyard fog. Furniture occlusion applies once the room is entered.
    if (current === "entry") return candidate.kind;
    ray.far = Math.max(0, candidate.distance - .001);
    const blocked = ray.intersectObjects(scene.children, true).some(hit => visibleMesh(hit.object) && !within(hit.object, candidate.root));
    ray.far = Infinity;
    return blocked ? undefined : candidate.kind;
  }
`;
