import catalog from './watermarks/catalog.json';

export type WatermarkPreset = { key: string; name: string; file: string; sha256: string; width: number; height: number; category: string; kind: string; color: string; details: string[]; url: string; assetId: string };
// Only the authoring entry imports this library. Reader / backup images use the
// document's ordinary embedded assets, with no dependency on this catalog.
const urls = import.meta.glob('./watermarks/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const WATERMARK_PRESETS: WatermarkPreset[] = (catalog as Omit<WatermarkPreset, 'url' | 'assetId'>[]).map(item => ({ ...item, url: urls[`./watermarks/${item.file}`], assetId: `wm-${item.sha256}` }));
export const WATERMARK_CATEGORIES = { all: '全部图案', cats: '猫咪', flowers: '花朵', seaside: '海边', stars: '星星', leaves: '枝叶', sentiments: '心意' };
export const watermarkCategory = (key: string) => WATERMARK_PRESETS.find(preset => preset.key === key)?.category ?? 'all';
export type WatermarkFilter = { category: string; query: string; kind?: string; color?: string; detail?: string };
export function watermarkOptions(category: string, dimension: 'kind' | 'color' | 'detail') {
  const values = WATERMARK_PRESETS.filter(p => category === 'all' || p.category === category).flatMap(p => dimension === 'detail' ? p.details : [p[dimension]]);
  return Object.fromEntries(['all', ...new Set(values)].map(value => [value, value === 'all' ? '不限' : value]));
}
export function matchesWatermark(preset: WatermarkPreset, filter: WatermarkFilter) {
  return (filter.category === 'all' || preset.category === filter.category)
    && (!filter.kind || filter.kind === 'all' || preset.kind === filter.kind)
    && (!filter.color || filter.color === 'all' || preset.color === filter.color)
    && (!filter.detail || filter.detail === 'all' || preset.details.includes(filter.detail))
    && `${preset.name} ${preset.key} ${preset.kind} ${preset.color} ${preset.details.join(' ')}`.toLocaleLowerCase().includes(filter.query.trim().toLocaleLowerCase());
}
const loaded = new Map<string, Promise<File>>();
export async function imageHash(blob: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function loadWatermark(preset: WatermarkPreset): Promise<File> {
  let task = loaded.get(preset.key);
  if (!task) {
    task = (async () => {
      const response = await fetch(preset.url);
      if (!response.ok) throw new Error('图案暂时没有载入，请再点一次；原稿保留。');
      const blob = await response.blob();
      if (await imageHash(blob) !== preset.sha256) throw new Error('图案文件未完整载入，请刷新后重试；原稿保留。');
      return new File([blob], `水印·${preset.name}.webp`, { type: 'image/webp' });
    })();
    loaded.set(preset.key, task);
    task.catch(() => { if (loaded.get(preset.key) === task) loaded.delete(preset.key); });
  }
  return task;
}
