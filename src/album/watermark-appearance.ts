import type { PageStyle } from './document';

/** Optional schema-1 fields leave old pages and source image bytes unchanged. */
export function watermarkAppearance(w: PageStyle['watermark']) {
  const hue = w.hue ?? 0, saturation = w.saturation ?? 1, brightness = w.brightness ?? 1;
  return {
    mirror: w.flipX || w.flipY ? ` scale(${w.flipX ? -1 : 1},${w.flipY ? -1 : 1})` : '',
    filter: hue || saturation !== 1 || brightness !== 1 ? `hue-rotate(${hue}deg) saturate(${saturation}) brightness(${brightness})` : '',
  };
}
