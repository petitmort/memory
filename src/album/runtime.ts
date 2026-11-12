import { flatten, validateDocument, type AlbumDocument } from './document';
import { renderAlbumPage, waitForAlbumImages } from './renderer';
import type { ReaderContent } from '../reader-controller';

export function createAlbumContent(document: AlbumDocument, resolve: (id: string) => string | undefined, dispose?: () => void): ReaderContent {
  const pages = flatten(document);
  return {
    revision: `${document.id}:${document.revision}`,
    items: pages.map(({ chapter, spread }) => ({ date: chapter.date, title: chapter.spreads.length > 1 ? `${chapter.title} · ${chapter.spreads.indexOf(spread) + 1}` : chapter.title })),
    paint(scope, index) {
      const spread = pages[index].spread;
      for (const [side, selector] of ['.page-left', '.page-right'].entries()) {
        const host = scope.querySelector<HTMLElement>(selector)!;
        renderAlbumPage(host, spread.pages[side], { resolveAsset: resolve, number: index * 2 + side + 1 });
      }
      return waitForAlbumImages(scope);
    }, dispose,
  };
}
export async function loadAlbumContent(published: unknown, token: string | null): Promise<ReaderContent> {
  if (token) {
    const { readPreview } = await import('../editor/storage');
    const snapshot = await readPreview(token), urls = new Map<string, string>();
    for (const [key, blob] of snapshot.assets) urls.set(key, URL.createObjectURL(blob));
    return createAlbumContent(snapshot.document, id => urls.get(id), () => { urls.forEach(url => URL.revokeObjectURL(url)); });
  }
  const document = validateDocument(published);
  return createAlbumContent(document, id => document.assets.find(asset => asset.id === id)?.src);
}
