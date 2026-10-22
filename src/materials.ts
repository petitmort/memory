import * as THREE from "three";

// Local texture studies: limewash, honed limestone, weathered paint, old oak.
// No remote assets; the deterministic surfaces are shared between objects.
function canvasTexture(
  draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void,
  size = 512,
) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  let seed = 5723;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  draw(ctx, rand);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
export function createPalette() {
  const lime = canvasTexture((ctx, r) => {
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 230; i++) {
      ctx.fillStyle = `rgba(166,154,128,${r() * 0.018})`;
      ctx.beginPath();
      ctx.ellipse(
        r() * 512,
        r() * 512,
        12 + r() * 65,
        8 + r() * 20,
        r() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    for (let i = 0; i < 42000; i++) {
      const light = r() > 0.45;
      ctx.fillStyle = light ? "rgba(255,255,250,.2)" : "rgba(110,98,78,.065)";
      ctx.fillRect(r() * 512, r() * 512, r() * 2 + 0.3, r() * 2 + 0.3);
    }
  });
  lime.repeat.set(2, 2);
  const stone = canvasTexture((ctx, r) => {
    ctx.fillStyle = "#d9ceba";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1400; i++) {
      ctx.strokeStyle = `rgba(155,140,111,${r() * 0.04})`;
      ctx.lineWidth = r() * 3 + 0.3;
      const x = r() * 512,
        y = r() * 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + 30,
        y + r() * 20,
        x + 70,
        y - r() * 20,
        x + 100,
        y + 2,
      );
      ctx.stroke();
    }
    for (let i = 0; i < 14000; i++) {
      ctx.fillStyle =
        r() > 0.5 ? "rgba(245,237,213,.12)" : "rgba(99,90,70,.07)";
      ctx.fillRect(r() * 512, r() * 512, r() * 2 + 0.2, 0.5 + r());
    }
    ctx.strokeStyle = "#bfb5a3";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 510, 510);
  });
  stone.repeat.set(7.67, 16);
  const timber = canvasTexture((ctx, r) => {
    ctx.fillStyle = "#947252";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 950; i++) {
      const x = r() * 512;
      ctx.strokeStyle =
        r() > 0.5
          ? `rgba(53,37,24,${r() * 0.11})`
          : `rgba(242,221,175,${r() * 0.09})`;
      ctx.lineWidth = 0.2 + r() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + Math.sin(x) * 7, 180, x - 7, 320, x + 4, 512);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(60,37,21,.09)";
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.ellipse(340, 240, 2 + i * 2, 10 + i * 11, 0.07, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  const painted = canvasTexture((ctx, r) => {
    ctx.fillStyle = "#276190";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1000; i++) {
      const x = r() * 512;
      ctx.strokeStyle =
        r() > 0.8 ? "rgba(199,204,181,.12)" : "rgba(7,34,71,.06)";
      ctx.lineWidth = 0.3 + r();
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 3, 180, x - 4, 320, x + 1, 512);
      ctx.stroke();
    }
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = "rgba(190,178,137,.13)";
      ctx.fillRect(r() * 512, r() * 512, r() * 1.5 + 1, r() * 18);
    }
  });
  const weave = canvasTexture((ctx, r) => {
    ctx.fillStyle = "#cdbb98";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 256; i++) {
      ctx.strokeStyle = i % 2 ? "#c1ac87" : "#e5d8b8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, i * 2);
      ctx.lineTo(512, i * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(97,78,44,${0.08 + r() * 0.08})`;
      ctx.beginPath();
      ctx.moveTo(i * 2, 0);
      ctx.lineTo(i * 2, 512);
      ctx.stroke();
    }
    ctx.strokeStyle = "#517482";
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, 476, 476);
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 452, 452);
  });
  return {
    plaster: new THREE.MeshStandardMaterial({
      map: lime,
      bumpMap: lime,
      bumpScale: 0.0018,
      roughness: 0.97,
    }),
    trim: new THREE.MeshStandardMaterial({ color: "#f8f5eb", roughness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({
      map: stone,
      bumpMap: stone,
      bumpScale: 0.003,
      roughness: 0.84,
    }),
    wood: new THREE.MeshStandardMaterial({
      map: timber,
      bumpMap: timber,
      bumpScale: 0.001,
      roughness: 0.66,
    }),
    blue: new THREE.MeshStandardMaterial({
      map: painted,
      bumpMap: painted,
      bumpScale: 0.0015,
      roughness: 0.74,
    }),
    rug: new THREE.MeshStandardMaterial({
      map: weave,
      bumpMap: weave,
      bumpScale: 0.001,
      roughness: 1,
    }),
  };
}
