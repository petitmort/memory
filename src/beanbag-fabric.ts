import * as THREE from "three";
import albedoUrl from "./assets/beanbag-cotton-albedo.webp";
import normalUrl from "./assets/beanbag-cotton-normal.webp";
import roughnessUrl from "./assets/beanbag-cotton-roughness.webp";

/** Fine cotton cover: UVs have two units per metre, one tile is 12 cm. */
export function createBeanbagFabric() {
  const textures: THREE.Texture[] = [], loads: Promise<void>[] = [];
  let disposed = false;
  function clothMap(url: string, colour = false) {
    let complete!: () => void, fail!: (error: unknown) => void;
    loads.push(new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; }));
    const texture = new THREE.TextureLoader().load(url, loaded => {
      // A late download must not retain or revive a lost scene.
      if (disposed) { loaded.dispose(); loaded.image = null; }
      complete();
    }, undefined, fail);
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(.5 / .12, .5 / .12);
    texture.anisotropy = 4;
    textures.push(texture);
    return texture;
  }
  const shell = new THREE.MeshPhysicalMaterial({
    map: clothMap(albedoUrl, true), normalMap: clothMap(normalUrl),
    normalScale: new THREE.Vector2(.65, .65),
    roughnessMap: clothMap(roughnessUrl), roughness: .98,
    color: "#ffffff", metalness: 0, clearcoat: 0, ior: 1.46,
    specularIntensity: .25, sheen: .32, sheenRoughness: .95,
    sheenColor: new THREE.Color("#eee0c4"),
  });
  shell.name = "ochre-cotton-canvas-cover";
  const cushion = shell.clone();
  cushion.name = "soft-stretch-cotton-seat";
  cushion.normalScale.set(.52, .52);
  cushion.sheen = .36;
  const seam = new THREE.MeshStandardMaterial({ color: "#b58c42", roughness: 1 });
  seam.name = "cotton-cover-sewing-thread";
  return {
    shell, cushion, seam,
    ready: Promise.all(loads).then(() => undefined),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const texture of textures) { texture.dispose(); texture.image = null; }
      shell.dispose(); cushion.dispose(); seam.dispose();
    },
  };
}
