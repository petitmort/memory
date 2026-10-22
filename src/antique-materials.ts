import * as THREE from "three";

function surface(draw: (ctx: CanvasRenderingContext2D, random: () => number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  let seed = 18741;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  draw(canvas.getContext("2d")!, random);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
}

/** Muted old brass, with oxidation held in recesses rather than a bright gold toy finish. */
export function createAntiqueBronze() {
  const map = surface((ctx, random) => {
    ctx.fillStyle = "#a38a61"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 320; i++) {
      ctx.fillStyle = i % 3 ? `rgba(68,83,70,${.025 + random() * .06})` : `rgba(221,193,137,${random() * .09})`;
      ctx.beginPath(); ctx.ellipse(random() * 512, random() * 512, 4 + random() * 37, 3 + random() * 29, random() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 12000; i++) {
      ctx.fillStyle = random() > .5 ? "rgba(43,39,30,.09)" : "rgba(248,225,176,.12)";
      ctx.fillRect(random() * 512, random() * 512, .4 + random() * 1.3, .4 + random() * 1.3);
    }
    ctx.strokeStyle = "rgba(242,216,163,.17)"; ctx.lineWidth = .6;
    for (let i = 0; i < 170; i++) { const x = random() * 512, y = random() * 512; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 14, y + random() * 4); ctx.stroke(); }
  });
  return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .002, metalness: .58, roughness: .61, color: "#d4c4a5" });
}

export function createAgedTimber() {
  const map = surface((ctx, random) => {
    ctx.fillStyle = "#665443"; ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) {
      ctx.fillStyle = y % 128 ? "rgba(175,145,107,.1)" : "rgba(43,34,27,.08)"; ctx.fillRect(0, y, 512, 63);
      ctx.fillStyle = "rgba(28,24,20,.4)"; ctx.fillRect(0, y, 512, 1);
    }
    for (let i = 0; i < 720; i++) {
      const y = random() * 512, x = random() * 512;
      ctx.strokeStyle = i % 3 ? `rgba(34,28,22,${random() * .16})` : `rgba(202,178,137,${random() * .17})`;
      ctx.lineWidth = .35 + random() * 1.4; ctx.beginPath(); ctx.moveTo(x - 80, y);
      ctx.bezierCurveTo(x, y + random() * 7, x + 75, y - random() * 7, x + 180, y + random() * 3); ctx.stroke();
    }
  });
  return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .009, color: "#b5a791", roughness: .91 });
}
