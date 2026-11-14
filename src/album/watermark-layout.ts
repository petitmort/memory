import type { PageStyle, WatermarkMix } from './document';

type Watermark = PageStyle['watermark'];
export type WatermarkTile = { x: number; y: number; assetId: string; rotation: number };

/** Created only by an explicit author action; legacy pages are never migrated. */
export function newWatermarkMix(w: Watermark): WatermarkMix {
  return { enabled: true, items: w.assetId ? [{ assetId: w.assetId }] : [], seed: 0, angleRange: 28, upright: .35 };
}

// Independent integer hashes keep images stable while the angle controls move.
function random(seed: number, index: number, salt: number) {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b9) ^ salt) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad); n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

/** Pure, viewport-independent layout shared by every reader and export path. */
export function watermarkTiles(w: Watermark): WatermarkTile[] {
  const positions: [number, number][] = [];
  if (w.mode === 'single') positions.push([w.x, w.y]);
  if (w.mode === 'corner') positions.push([10, 9], [90, 91]);
  if (w.mode === 'border') for (let i = 0; i <= w.density * 2; i++) { const a = 8 + 84 * i / (w.density * 2); positions.push([a, 6], [a, 94]); if (i > 0 && i < w.density * 2) positions.push([6, a], [94, a]); }
  if (w.mode === 'repeat') for (let y = 0; y < w.density * 2; y++) for (let x = 0; x < w.density; x++) positions.push([(x + .5 + (y % 2 ? .25 : 0)) * 100 / w.density, (y + .5) * 100 / (w.density * 2)]);
  const mix = w.mix;
  if (!mix?.enabled) return positions.map(([x, y]) => ({ x, y, assetId: w.assetId, rotation: w.rotation }));
  if (!mix.items.length) return [];
  const count = positions.length;
  const ranks = positions.map((_, i) => i).sort((a, b) => random(mix.seed, a, 0x1b873593) - random(mix.seed, b, 0x1b873593));
  let uprightCount = Math.round(count * mix.upright);
  if (count > 1 && mix.upright > 0 && mix.upright < 1) uprightCount = Math.max(1, Math.min(count - 1, uprightCount));
  const upright = new Set(ranks.slice(0, uprightCount));
  let deck: number[] = [], previous = -1;
  return positions.map(([x, y], index) => {
    const slot = index % mix.items.length, cycle = Math.floor(index / mix.items.length);
    if (!slot) {
      deck = mix.items.map((_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random(mix.seed, cycle * 16 + i, 0x85ebca6b) * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      if (deck.length > 1 && deck[0] === previous) [deck[0], deck[1]] = [deck[1], deck[0]];
    }
    previous = deck[slot]; const item = mix.items[previous];
    const angle = (random(mix.seed, index, 0xc2b2ae35) * 2 - 1) * mix.angleRange;
    const scattered = mix.angleRange >= 2 && Math.abs(angle) < 2 ? (angle < 0 ? -2 : 2) : angle;
    const rotation = item.rotation ?? (upright.has(index) ? 0 : Math.round(scattered * 10) / 10);
    return { x, y, assetId: item.assetId, rotation };
  });
}
