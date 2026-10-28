import * as THREE from "three";

/** Upload hidden room resources once, under the loading screen, at native quality. */
export async function warmSceneResources(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  revealGroups: readonly THREE.Object3D[],
  requireAvailable: () => void,
): Promise<void> {
  requireAvailable();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  requireAvailable();
  // A render target can select different colour/output shader variants. Warm
  // the normal canvas programs, matching the first interactive room frame.
  if (renderer.getRenderTarget() !== null)
    throw new Error("Scene warmup requires the default framebuffer");

  const viewport = renderer.getViewport(new THREE.Vector4());
  const scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest();
  const visibility = new Map(revealGroups.map(object => [object, object.visible]));
  const culling = new Map<THREE.Object3D, boolean>();
  const shadows: THREE.LightShadow[] = [];
  scene.traverse(object => {
    const renderable = object as THREE.Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
    if (renderable.isMesh || renderable.isPoints || renderable.isLine || renderable.isSprite)
      culling.set(object, object.frustumCulled);
    const light = object as THREE.DirectionalLight;
    if (light.isLight && light.castShadow && light.shadow) shadows.push(light.shadow);
  });
  try {
    for (const object of visibility.keys()) object.visible = true;
    for (const object of culling.keys()) object.frustumCulled = false;
    // Sixteen physical canvas pixels per side; pixel ratio and all material,
    // tone-mapping, texture and shadow-map quality settings stay untouched.
    const size = 16 / Math.max(renderer.getPixelRatio(), .001);
    renderer.setViewport(0, 0, size, size);
    renderer.setScissor(0, 0, size, size);
    renderer.setScissorTest(true);
    renderer.shadowMap.needsUpdate = true;
    for (const shadow of shadows) shadow.needsUpdate = true;
    requireAvailable();
    renderer.render(scene, camera);
    requireAvailable();
  } finally {
    // Even a context loss must restore the doorway's real visibility/culling.
    // Do not attach or recreate anything if the scene was disposed while drawing.
    for (const [object, visible] of visibility) object.visible = visible;
    for (const [object, frustumCulled] of culling) object.frustumCulled = frustumCulled;
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    // The cached depth map contains the temporarily revealed room. Redraw it
    // once with the restored courtyard before presenting the first visible frame.
    renderer.shadowMap.needsUpdate = true;
    for (const shadow of shadows) shadow.needsUpdate = true;
  }
}
