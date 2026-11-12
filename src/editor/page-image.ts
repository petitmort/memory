import type { AlbumSpread } from '../album/document';
import { renderAlbumPage, waitForAlbumImages, type AssetResolver } from '../album/renderer';
import { captureBookPages } from '../page-raster';
/** Render a clean print, never editor handles, margin guides or placeholders. */
export async function pageImage(spread: AlbumSpread, side: number, resolveAsset: AssetResolver, firstNumber: number): Promise<Blob> {
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:720px;display:grid;grid-template-columns:360px 360px;pointer-events:none;';
  for (const [index, page] of spread.pages.entries()) { const element = document.createElement('article'); element.className = index ? 'page-right' : 'page-left'; renderAlbumPage(element, page, { resolveAsset, number: firstNumber + index }); host.append(element); }
  document.body.append(host);
  try {
    await waitForAlbumImages(host); const pages = await captureBookPages(host);
    return await new Promise<Blob>((resolve, reject) => pages[side].toBlob(blob => blob ? resolve(blob) : reject(new Error('图片导出失败')), 'image/png'));
  } finally { host.remove(); }
}
