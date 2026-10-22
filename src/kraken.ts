import * as THREE from "three";

/** The hidden animal stays below the vortex; only its deforming arms break the water. */
export function createKraken(position: { x: number; y: number; z: number }) {
  const group = new THREE.Group();
  group.name = "distant-kraken";
  group.position.set(position.x, position.y, position.z);

  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#485854"; ctx.fillRect(0, 0, 512, 512);
  let seed = 317;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 2300; i++) {
    ctx.fillStyle = i % 3 ? `rgba(24,43,42,${random() * .22})` : `rgba(156,152,125,${random() * .18})`;
    ctx.beginPath(); ctx.ellipse(random() * 512, random() * 512, 1 + random() * 8, 1 + random() * 4, random() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  const skinMap = new THREE.CanvasTexture(canvas); skinMap.colorSpace = THREE.SRGBColorSpace;
  skinMap.wrapS = skinMap.wrapT = THREE.RepeatWrapping;
  const skin = new THREE.MeshStandardMaterial({ map: skinMap, bumpMap: skinMap, bumpScale: .1, color: "#88958e", roughness: .6, metalness: .03 });
  const suckerMaterial = new THREE.MeshStandardMaterial({ color: "#9b9b85", roughness: .84 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), skin);
  body.name = "submerged-kraken-body";
  body.position.y = -5.5; body.scale.set(1.7, 1.5, 1.4); group.add(body);

  // Each root and its first control point remain fixed deep inside the funnel.
  const profiles = [
    [[-.8, -4.8, .1], [-1.4, -2.8, .1], [-2.8, .4, .3], [-4.6, 3.3, .7], [-4.9, 5.6, 1.1], [-3.6, 6.2, 1.2], [-2.8, 5.3, 1], [-3.4, 4.6, 1.1]],
    [[.8, -4.7, 0], [1.4, -2.6, .3], [2.6, .6, .5], [4.2, 3.5, .7], [5.5, 5.6, .7], [6.5, 4.9, .2], [5.9, 3.9, 0], [5.2, 4.3, .2]],
    [[0, -4.9, -1], [-.3, -2.7, -1.2], [-.9, .5, -1.6], [-2, 4.2, -2.1], [-1.3, 6.7, -1.2], [.1, 7.1, -.6], [.7, 6.2, -.5]],
    [[0, -4.8, 1], [.8, -2.7, 1.3], [2.8, .3, 2.3], [4.9, 1.8, 3.1], [5.6, 3.4, 3], [4.6, 4, 3.1], [4, 3.2, 3.2]],
    [[-1, -4.8, .8], [-1.5, -2.5, 1.2], [-3, .1, 1.9], [-5.6, 1.3, 2.5], [-6.8, 2.9, 2.1], [-6.3, 3.9, 2.2], [-5.5, 3.6, 2.3]],
  ];
  const segments = 48, radial = 12, cupRows = 20;
  const cupGeometry = new THREE.TorusGeometry(1, .3, 6, 10);
  const unitZ = new THREE.Vector3(0, 0, 1);
  const scratch = new THREE.Vector3(), forward = new THREE.Vector3(), side = new THREE.Vector3(), normal = new THREE.Vector3();
  const stamp = new THREE.Object3D();

  const arms = profiles.map((profile, armIndex) => {
    const base = profile.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const controls = base.map(p => p.clone());
    const path = new THREE.CatmullRomCurve3(controls);
    const geometry = new THREE.TubeGeometry(path, segments, 1, radial, false);
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    positions.setUsage(THREE.DynamicDrawUsage);
    (geometry.attributes.normal as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geometry, skin);
    mesh.name = `kraken-tentacle-${armIndex}`;
    mesh.frustumCulled = false; // Its curl moves beyond the initial CPU bounding sphere.
    group.add(mesh);
    const cups = new THREE.InstancedMesh(cupGeometry, suckerMaterial, cupRows * 2);
    cups.name = `kraken-suckers-${armIndex}`;
    cups.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cups.frustumCulled = false;
    group.add(cups);
    const centers = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
    const tangents = centers.map(() => new THREE.Vector3());
    const normals = centers.map(() => new THREE.Vector3());
    const binormals = centers.map(() => new THREE.Vector3());
    const radiusAt = (t: number) => (.85 * Math.pow(1 - t, 1.05) + .035) * (1 + .055 * Math.sin(t * 21 + armIndex));

    function deform(time: number, amplitude: number) {
      const phase = armIndex * 1.43, speed = .66 + armIndex * .041;
      for (let i = 0; i < controls.length; i++) {
        const t = i < 2 ? 0 : (i - 1) / (controls.length - 2);
        const flexibility = Math.pow(t, 1.25) * amplitude;
        controls[i].copy(base[i]);
        controls[i].x += Math.sin(time * speed - t * 2.9 + phase) * .92 * flexibility;
        controls[i].y += Math.sin(time * .73 - t * 2.4 + phase * .7) * .48 * flexibility;
        controls[i].z += Math.cos(time * .59 - t * 3.1 + phase) * .64 * flexibility;
      }
      for (let i = 0; i <= segments; i++) path.getPoint(i / segments, centers[i]);
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Keep the entire first ring, not just its centre, anchored below the funnel.
        if (i === 0) tangents[i].subVectors(base[1], base[0]).normalize();
        else tangents[i].subVectors(centers[Math.min(segments, i + 1)], centers[i - 1]).normalize();
        const n = normals[i], tangent = tangents[i];
        n.copy(i ? normals[i - 1] : unitZ).addScaledVector(tangent, -(i ? normals[i - 1] : unitZ).dot(tangent));
        if (n.lengthSq() < .0001) n.set(1, 0, 0).addScaledVector(tangent, -tangent.x);
        n.normalize(); binormals[i].crossVectors(tangent, n).normalize();
        const radius = radiusAt(t), aspect = .8 + .05 * Math.sin(t * 11);
        for (let j = 0; j <= radial; j++) {
          const a = j / radial * Math.PI * 2;
          scratch.copy(centers[i]).addScaledVector(n, -Math.cos(a) * radius).addScaledVector(binormals[i], Math.sin(a) * radius * aspect);
          positions.setXYZ(i * (radial + 1) + j, scratch.x, scratch.y, scratch.z);
        }
      }
      positions.needsUpdate = true; geometry.computeVertexNormals();
      for (let i = 0; i < cupRows; i++) {
        const t = .2 + i * .038, ring = Math.min(segments - 1, Math.floor(t * segments)), f = t * segments - ring;
        scratch.lerpVectors(centers[ring], centers[ring + 1], f);
        side.lerpVectors(tangents[ring], tangents[ring + 1], f).normalize();
        forward.copy(unitZ).addScaledVector(side, -unitZ.dot(side));
        if (forward.lengthSq() < .0001) forward.copy(normals[ring]);
        forward.normalize(); side.crossVectors(side, forward).normalize();
        for (let row = 0; row < 2; row++) {
          normal.copy(forward).addScaledVector(side, row ? .29 : -.29).normalize();
          const cn = normal.dot(normals[ring]), cb = normal.dot(binormals[ring]);
          const aspect = .8 + .05 * Math.sin(t * 11);
          const r = radiusAt(t) / Math.sqrt(cn * cn + cb * cb / (aspect * aspect));
          stamp.position.copy(scratch).addScaledVector(normal, r);
          stamp.quaternion.setFromUnitVectors(unitZ, normal);
          stamp.scale.setScalar(.155 * (1 - t * .9)); stamp.updateMatrix();
          cups.setMatrixAt(i * 2 + row, stamp.matrix);
        }
      }
      cups.instanceMatrix.needsUpdate = true;
    }
    deform(0, 0);
    return { deform };
  });

  let lastUpdate = -Infinity;
  return { group, update(time: number, reduced: boolean) {
    if (time >= lastUpdate && time - lastUpdate < (reduced ? .16 : .05)) return;
    lastUpdate = time;
    const slowTime = reduced ? time * .15 : time;
    for (const arm of arms) arm.deform(slowTime, reduced ? .22 : 1);
  } };
}
