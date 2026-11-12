import { chapters, artwork } from '../content';
import { newDocument, id, makePage, textElement, photoElement, type AlbumDocument } from '../album/document';
import type { AssetBlobs } from './storage';
/** Explicit author action only; the shipped four sample chapters are untouched. */
export async function copyLegacySamples(): Promise<{ document: AlbumDocument; assets: AssetBlobs }> {
  const document = newDocument(), assets: AssetBlobs = new Map(); document.title = '潮汐之间 · 示例副本'; document.chapters = [];
  for (const chapter of chapters) {
    const canvas = artwork(chapter.scene, 1000, 720), assetId = id();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法复制原插画')), 'image/png'));
    assets.set(assetId, blob); document.assets.push({ id: assetId, name: `${chapter.scene} 原创插画.png`, mime: 'image/png', width: canvas.width, height: canvas.height });
    const left = makePage('photo'), photo = left.elements.find(e => e.type === 'photo')!;
    if (photo.type === 'photo') { photo.assetId = assetId; photo.caption = chapter.caption; photo.alt = `${chapter.title}原创插画`; }
    const right = makePage('diary'); right.grid.kind = 'none';
    const title = textElement('title'); title.text = chapter.title;
    const poem = textElement(); poem.text = chapter.text; poem.align = 'center';
    const note = textElement(); note.text = chapter.note;
    right.elements = [title, poem, note];
    document.chapters.push({ id: id(), title: chapter.title, date: chapter.date, spreads: [{ id: id(), pages: [left, right] }] });
  }
  return { document, assets };
}
