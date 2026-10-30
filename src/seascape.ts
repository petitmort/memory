import * as THREE from "three";
import { sampleWaterHeight } from "./water-surface";
import { createSailingShip } from "./sailing-ship";
import { createCoastalEnvironment } from "./coastal-environment";

// Metres in the world; positions are composed through the study's real window.
export const seaComposition = {
  ship: new THREE.Vector3(-13, -8, -54),
  sun: new THREE.Vector3(-18, 9.5, -145),
};

export function createSeascape() {
  const group = new THREE.Group();
  group.name = "aegean-seascape";
  const ship = createSailingShip();
  ship.position.copy(seaComposition.ship);
  ship.rotation.y = ship.userData.recommendedYaw ?? -.1;
  group.add(ship);
  const coast = createCoastalEnvironment();
  group.add(coast.group);

  const helios = new THREE.Group(); helios.name = "helios-radiant-sun";
  helios.position.copy(seaComposition.sun); group.add(helios);
  // A simple sun disc: the light itself is the subject, with no sculpted face or rays.
  const solarDisc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), new THREE.MeshBasicMaterial({
    color: "#fffdf3", fog: false, toneMapped: false,
  }));
  helios.add(solarDisc);
  solarDisc.name = "solar-disc";
  const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 256;
  const gc = glowCanvas.getContext("2d")!, gradient = gc.createRadialGradient(128, 128, 26, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,248,217,.95)");
  gradient.addColorStop(.22, "rgba(255,235,181,.8)");
  gradient.addColorStop(.48, "rgba(255,215,135,.32)");
  gradient.addColorStop(.76, "rgba(255,201,105,.075)");
  gradient.addColorStop(1, "rgba(255,201,105,0)");
  gc.fillStyle = gradient; gc.fillRect(0, 0, 256, 256);
  const glowMap = new THREE.CanvasTexture(glowCanvas);
  const auraMaterial = new THREE.SpriteMaterial({
    map: glowMap, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: .38,
  });
  const aura = new THREE.Sprite(auraMaterial);
  aura.name = "solar-outer-glow"; aura.scale.set(14.4, 14.4, 1); aura.position.z = -4.5; helios.add(aura);
  const corona = new THREE.Sprite(auraMaterial.clone());
  corona.name = "solar-inner-corona"; corona.material.opacity = .34;
  corona.scale.set(7.8, 7.8, 1); corona.position.z = -3.5; helios.add(corona);
  helios.lookAt(new THREE.Vector3(1.1, 1.65, .75));

  return { group, update(t: number, reduced: boolean) {
    const a = reduced ? t * .12 : t;
    const waterTime = t * (reduced ? .15 : 1);
    const waterline = sampleWaterHeight(ship.position.x, ship.position.z, waterTime);
    const offsetX = Math.cos(ship.rotation.y) * 4, offsetZ = -Math.sin(ship.rotation.y) * 4;
    const bow = sampleWaterHeight(ship.position.x + offsetX, ship.position.z + offsetZ, waterTime);
    const stern = sampleWaterHeight(ship.position.x - offsetX, ship.position.z - offsetZ, waterTime);
    ship.position.y = seaComposition.ship.y + waterline - .12;
    ship.rotation.z = Math.max(-.045, Math.min(.045, (bow - stern) / 8)) * .7;
    ship.rotation.x = Math.sin(a * .41) * .009;
    coast.update(t, reduced);
  } };
}
