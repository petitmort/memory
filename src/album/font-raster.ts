const fontUrl = new URL('./assets/LongCang-Regular.ttf', import.meta.url).href;
let embeddedFont: Promise<string> | undefined;
/** foreignObject images cannot consult the surrounding document's font-face. */
export async function albumFontRule(page: HTMLElement): Promise<string> {
  if (!page.querySelector('[data-font="hand"]')) return '';
  embeddedFont ??= (async () => {
    const response = await fetch(fontUrl); if (!response.ok) throw new Error('手写字体未能加载');
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
  })();
  return `@font-face{font-family:'Tides Hand';src:url('${await embeddedFont}') format('truetype');font-weight:400 700;}`;
}
