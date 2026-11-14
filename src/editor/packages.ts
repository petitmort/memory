import { copy, id, validateDocument, type AlbumDocument, type AlbumAsset } from '../album/document';
import type { AssetBlobs } from './storage';
export const MAX_PACKAGE_BYTES = 170 * 1024 * 1024;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
export type AlbumPackage = { format: 'tides-album-project' | 'tides-album-content'; version: 1; baseContentHash: string; document: AlbumDocument; assets: { id: string; data: string }[] };
const readData = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
export async function contentHash(value: unknown) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function inspectImage(blob: Blob): Promise<{ width: number; height: number }> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.type) || !blob.size || blob.size > MAX_ASSET_BYTES) throw new Error('请选择20MB以内的 PNG、JPEG、WebP或GIF图片；SVG请先转成PNG。');
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height }; bitmap.close();
  if (!size.width || !size.height || size.width * size.height > 40000000) throw new Error('图片超过4000万像素，请先缩小后导入。');
  return size;
}
export async function importImage(file: File): Promise<{ asset: AlbumAsset; blob: Blob }> {
  const size = await inspectImage(file);
  return { asset: { id: id(), name: file.name.slice(0, 200), mime: file.type, ...size }, blob: file };
}
export function usedAssets(doc: AlbumDocument): Set<string> {
  const refs = new Set<string>();
  for (const chapter of doc.chapters) for (const spread of chapter.spreads) for (const page of spread.pages) {
    if (page.watermark.assetId) refs.add(page.watermark.assetId);
    for (const item of page.watermark.mix?.items ?? []) refs.add(item.assetId);
    for (const e of page.elements) if ('assetId' in e && e.assetId) refs.add(e.assetId);
  }
  return refs;
}
export async function optimizeAssets(doc: AlbumDocument, blobs: AssetBlobs) {
  const document = copy(doc), assets: AssetBlobs = new Map(), used = usedAssets(document);
  document.assets = document.assets.filter(asset => used.has(asset.id));
  for (const asset of document.assets) {
    const original = blobs.get(asset.id); if (!original) throw new Error(`找不到照片：${asset.name}`);
    const image = await createImageBitmap(original), scale = Math.min(1, 2000 / Math.max(image.width, image.height));
    const canvas = globalThis.document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const optimized = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('照片优化失败')), 'image/webp', .88));
    asset.width = canvas.width; asset.height = canvas.height; asset.mime = optimized.type; delete asset.src; assets.set(asset.id, optimized);
  }
  return { document, assets };
}
export async function exportPackage(doc: AlbumDocument, blobs: AssetBlobs, publish: boolean, baseContentHash: string): Promise<Blob> {
  const source = publish ? await optimizeAssets(doc, blobs) : { document: copy(doc), assets: blobs };
  source.document.assets.forEach(asset => { delete asset.src; });
  validateDocument(source.document);
  const pack: AlbumPackage = { format: publish ? 'tides-album-content' : 'tides-album-project', version: 1, baseContentHash, document: source.document, assets: [] };
  let total = 0;
  for (const asset of source.document.assets) {
    const blob = source.assets.get(asset.id); if (!blob) throw new Error(`缺少原素材：${asset.name}`);
    total += blob.size; if (total > 120 * 1024 * 1024) throw new Error('整本原素材超过120MB，请将大照片缩小或分册备份。');
    pack.assets.push({ id: asset.id, data: await readData(blob) });
  }
  return new Blob([JSON.stringify(pack)], { type: 'application/json' });
}
export async function importPackage(file: Blob): Promise<{ document: AlbumDocument; assets: AssetBlobs }> {
  if (file.size > MAX_PACKAGE_BYTES) throw new Error('项目包超过170MB，无法导入。');
  const pack = JSON.parse(await file.text());
  if (pack.format !== 'tides-album-project' || pack.version !== 1 || !Array.isArray(pack.assets)) throw new Error('请选择可编辑项目备份（.tides.json），不是公开内容包。');
  const document = validateDocument(pack.document), assets: AssetBlobs = new Map();
  if (pack.assets.length !== document.assets.length) throw new Error('项目包素材数量不一致');
  let bytes = 0;
  for (const item of pack.assets) {
    const meta = document.assets.find(a => a.id === item.id);
    if (!meta || assets.has(item.id) || typeof item.data !== 'string' || !item.data.startsWith(`data:${meta.mime};base64,`)) throw new Error('项目包图片格式错误');
    const encoded = item.data.split(',')[1];
    if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded) || encoded.length > MAX_ASSET_BYTES * 1.34) throw new Error('项目包图片数据错误');
    const raw = atob(encoded), blob = new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))], { type: meta.mime });
    bytes += blob.size; if (bytes > 120 * 1024 * 1024) throw new Error('项目包图片总量过大');
    const size = await inspectImage(blob);
    if (size.width !== meta.width || size.height !== meta.height) throw new Error('图片尺寸与清单不一致');
    delete meta.src; assets.set(meta.id, blob);
  }
  return { document, assets };
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
