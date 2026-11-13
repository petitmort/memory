import catalog from './watermarks/catalog.json';

export type WatermarkPreset = { key: string; name: string; file: string; sha256: string; width: number; height: number; url: string; assetId: string };
// Only the authoring entry imports this library. Reader / backup images use the
// document's ordinary embedded assets, with no dependency on this catalog.
const urls = import.meta.glob('./watermarks/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const WATERMARK_PRESETS: WatermarkPreset[] = (catalog as Omit<WatermarkPreset, 'url' | 'assetId'>[]).map(item => ({ ...item, url: urls[`./watermarks/${item.file}`], assetId: `wm-${item.sha256}` }));
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
