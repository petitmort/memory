import './workbench.css';
import published from '../album/published.json';
import { copy, id, newDocument, makeSpread, duplicateSpread, textElement, photoElement, stickerElement, applyTemplate, flatten, validateDocument, type AlbumDocument, type AlbumPage, type AlbumElement, type PageStyle, type StickerElement } from '../album/document';
import { updateAlbumPage } from '../album/renderer';
import { createProperties, refreshProperties } from './properties';
import { AlbumHistory } from './history';
import { readDraft, saveDraft, savePreview, watchDraft, AlbumConflictError, type AssetBlobs } from './storage';
import { contentHash, exportPackage, importPackage, importImage, optimizeAssets, download } from './packages';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const app = $('#editor-app');
app.innerHTML = `<header class="editor-header"><a class="editor-brand" href="./"><span>BETWEEN THE TIDES</span><strong>纪念手帐</strong></a><label class="editor-book-title"><span class="sr-only">纪念册名称</span><input id="document-title" maxlength="150" aria-label="纪念册名称"></label><div class="editor-save"><span id="save-status" role="status" aria-live="polite">读取本机草稿…</span><button id="retry-save" hidden>重试保存</button><button id="reload-draft" hidden>读取最新草稿</button></div><div class="editor-actions"><button id="undo" title="撤销（⌘Z）">↶ 撤销</button><button id="redo" title="重做（⌘⇧Z）">↷ 重做</button><details class="editor-export"><summary>项目与备份</summary><div><button id="export-backup">下载可编辑备份</button><button id="import-backup">导入可编辑备份</button><button id="export-content">生成网站内容包</button><p>本机保存和下载不会公开发布。</p></div></details><button class="editor-primary" id="preview">阅读预览 ↗</button></div></header>
<div class="editor-narrow-note">电脑适合精细排版；小屏可以查看、备份和阅读预览，完整创作请使用电脑。</div>
<main class="editor-workspace"><aside class="editor-library" aria-label="章节与跨页"><div class="editor-section-heading"><span>我的纪念册</span><button id="add-chapter" aria-label="添加章节">＋ 章</button></div><div id="chapter-list"></div><button id="add-spread" class="editor-wide-button">＋ 新增跨页</button><details class="editor-help"><summary>从哪里开始？</summary><p>先选模板，点击纸上的文字直接输入。选中照片后替换、裁切、换框；贴纸可以拖动、缩放和旋转。</p><p>草稿仅保存在这个浏览器，请定期下载可编辑备份。公开更新需另行应用内容包。</p><button id="copy-samples">复制现有示例到草稿</button><button id="new-project">新建空白项目</button></details></aside>
<section class="editor-center" aria-label="双页编辑画布"><div class="editor-canvas-top"><div><span class="editor-overline">慢慢写，留住那些小事</span><h1 id="spread-name">新章节</h1></div><span id="page-label" class="editor-page-label">当前编辑：左页</span></div><div class="editor-insertbar"><button id="add-title">＋ 标题</button><button id="add-text">＋ 文字</button><button id="add-photo">＋ 照片</button><button id="add-sticker">✿ 贴纸</button><button id="select-page">纸张与版式</button><label class="editor-guide-toggle"><input type="checkbox" id="guides" checked>参考边距</label></div><div id="canvas-stage" class="editor-stage"><div id="paper-frame"><div id="paper-spread" class="editor-paper"><article class="album-page editor-page" data-side="0" aria-label="左页"></article><article class="album-page editor-page" data-side="1" aria-label="右页"></article></div></div></div><footer class="editor-canvas-bottom"><span id="canvas-note">图文随模板排列 · 贴纸可自由拼贴</span><label>缩放 <input id="zoom" type="range" aria-label="画布缩放" min="50" max="120" step="5" value="90"></label><button id="fit-canvas">适合窗口</button></footer></section>
<aside class="editor-inspector" aria-label="属性设置"><div class="editor-section-heading"><span id="inspector-title">页面与元素</span><button id="other-page">切换到右页</button></div><div id="properties"></div></aside></main>
<div class="editor-notice" id="editor-notice" role="status" aria-live="polite" hidden></div><input type="file" id="image-input" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden><input type="file" id="project-input" accept=".json,application/json" hidden>
<dialog id="preview-dialog" class="editor-preview-dialog"><div class="editor-preview-toolbar"><strong>阅读预览</strong><button id="preview-desktop">电脑</button><button id="preview-mobile">手机</button><button id="preview-room">进入房间预览</button><button id="close-preview">关闭预览</button></div><div class="editor-preview-stage"><iframe title="纪念册阅读预览" id="preview-frame"></iframe></div><p>这是本机快照；继续编辑后重新打开预览即可更新。</p></dialog>`;

let doc = newDocument(), blobs: AssetBlobs = new Map(), chapterIndex = 0, spreadIndex = 0, side = 0, selectedId = '', scope = 'page';
let storageVersion = 0, sequence = 0, savedSequence = 0, saveError: Error | undefined, saveTask: Promise<void> | undefined, saveTimer = 0, noticeTimer = 0;
let continuousBefore: AlbumDocument | undefined, previewFrame = 0;
let inspector: { document: AlbumDocument; page: AlbumPage; selected?: AlbumElement; key: string; host: HTMLElement } | undefined;
let libraryDocument: AlbumDocument | undefined, libraryKey = '';
let composing = false, textBefore: AlbumDocument | undefined, textDirty = false, previewToken = '', initialized = false;
const history = new AlbumHistory(), urls = new Map<string, string>(), viewport = $('#canvas-stage');
const exportImage = document.createElement('button'); exportImage.textContent = '导出当前单页 PNG'; exportImage.id = 'export-page-image'; $('#export-content').after(exportImage);
exportImage.onclick = async () => {
  finishContinuous(); finishText(); const spread = doc.chapters[chapterIndex].spreads[spreadIndex], number = flatten(doc).findIndex(v => v.spread.id === spread.id) * 2 + 1;
  try { const { pageImage } = await import('./page-image'); download(await pageImage(copy(spread), side, resolveAsset, number), `memory-page-${number + side}.png`); notify('单页图片已下载；如需继续编辑，请另存可编辑备份。'); }
  catch (error) { notify((error as Error).message); }
};
const page = () => doc.chapters[chapterIndex].spreads[spreadIndex].pages[side];
const selected = () => page().elements.find(e => e.id === selectedId);
const resolveAsset = (assetId: string) => {
  if (!urls.has(assetId)) { const blob = blobs.get(assetId); if (blob) urls.set(assetId, URL.createObjectURL(blob)); }
  return urls.get(assetId);
};
const releaseUrls = () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); };
function notify(message: string) { window.clearTimeout(noticeTimer); $('#editor-notice').textContent = message; $('#editor-notice').hidden = false; noticeTimer = window.setTimeout(() => { $('#editor-notice').hidden = true; }, 7000); }
function saveStatus() {
  const status = $('#save-status');
  status.textContent = saveError ? `保存失败 · ${saveError.message}` : saveTask ? '正在保存…' : sequence !== savedSequence || continuousBefore ? '待保存…' : '✓ 已保存到本机';
  status.dataset.state = saveError ? 'error' : saveTask || sequence !== savedSequence || continuousBefore ? 'pending' : 'saved';
  $('#retry-save').hidden = !saveError || saveError instanceof AlbumConflictError;
  $('#reload-draft').hidden = !saveError;
  $<HTMLButtonElement>('#undo').disabled = !history.canUndo;
  $<HTMLButtonElement>('#redo').disabled = !history.canRedo;
}
const channel = watchDraft(() => { if (!initialized) return; saveError = new AlbumConflictError(); saveStatus(); });
function dirty() {
  sequence++; doc.revision++; doc.updatedAt = new Date().toISOString();
  window.clearTimeout(saveTimer);
  if (!composing && !(saveError instanceof AlbumConflictError)) saveTimer = window.setTimeout(() => { void flushSave(); }, 550);
  saveStatus();
}
async function flushSave() {
  finishContinuous(); window.clearTimeout(saveTimer);
  if (saveTask) { await saveTask; return; }
  if (sequence === savedSequence || composing || saveError instanceof AlbumConflictError) return;
  const savingSequence = sequence, snapshot = copy(doc), assets = new Map(blobs);
  saveError = undefined;
  saveTask = (async () => {
    try { storageVersion = await saveDraft(snapshot, assets, storageVersion); savedSequence = savingSequence; channel.changed(); }
    catch (error) { saveError = error instanceof Error ? error : new Error('请下载备份并重试'); }
  })();
  saveStatus(); await saveTask; saveTask = undefined; saveStatus();
  if (sequence !== savedSequence && !saveError) await flushSave();
}
function finishText() {
  if (!textBefore) return;
  if (textDirty) history.remember(textBefore);
  textBefore = undefined; textDirty = false; composing = false; saveStatus();
}
function cancelPreviewFrame() { if (previewFrame) cancelAnimationFrame(previewFrame); previewFrame = 0; }
function previewChange(action: () => void) {
  finishText();
  if (!continuousBefore) { continuousBefore = copy(doc); window.clearTimeout(saveTimer); saveStatus(); }
  action();
  if (!previewFrame) previewFrame = requestAnimationFrame(() => { previewFrame = 0; render(); });
}
function finishContinuous() { if (continuousBefore) commit(() => {}); }
function commit(action: () => void) {
  finishText(); cancelPreviewFrame(); const before = continuousBefore ?? copy(doc); continuousBefore = undefined;
  try { action(); validateDocument(doc); }
  catch (error) { doc = before; notify((error as Error).message); render(); return; }
  if (JSON.stringify(before) !== JSON.stringify(doc)) { history.remember(before); dirty(); }
  render();
}
function renderProperties() {
  const currentPage = page(), currentElement = selected();
  const key = JSON.stringify([scope, doc.assets.map(a => [a.id, a.name]), currentPage.watermark.assetId]);
  if (inspector?.document === doc && inspector.page === currentPage && inspector.selected === currentElement && inspector.key === key) { refreshProperties(inspector.host); return; }
  const expanded = new Map(Array.from($('#properties').querySelectorAll('details')).map(details => [details.querySelector('summary')!.textContent, details.open]));
  const properties = createProperties({ document: doc, page: currentPage, selected: currentElement, scope,
    onScope(value) { finishContinuous(); scope = value; renderProperties(); },
    change(action, preview) { if (preview) previewChange(action); else commit(action); },
    style(key, value, preview) {
      const update = () => {
        const pages = scope === 'book' ? flatten(doc).flatMap(v => v.spread.pages) : scope === 'spread' ? doc.chapters[chapterIndex].spreads[spreadIndex].pages : [currentPage];
        for (const p of pages) { const template = p.layout.template; (p as any)[key] = copy(value); if (key === 'layout' && template !== p.layout.template) applyTemplate(p, p.layout.template); }
      };
      if (preview) previewChange(update); else commit(update);
    }, upload: chooseImages,
  });
  properties.querySelectorAll('details').forEach(details => { const value = expanded.get(details.querySelector('summary')!.textContent); if (value !== undefined) details.open = value; });
  $('#properties').replaceChildren(properties); inspector = { document: doc, page: currentPage, selected: currentElement, key, host: properties };
}
function selectElement(host: HTMLElement | null) {
  const article = host?.closest<HTMLElement>('[data-side]'); if (article) side = Number(article.dataset.side);
  selectedId = host?.dataset.element ?? '';
  $('#page-label').textContent = `当前编辑：${side === 0 ? '左' : '右'}页`;
  $('#other-page').textContent = `切换到${side === 0 ? '右' : '左'}页`;
  markSelection(); renderProperties();
}
function markSelection() {
  $('#paper-spread').querySelectorAll<HTMLElement>('.album-element').forEach(element => {
    const active = element.dataset.element === selectedId; element.classList.toggle('editor-selected', active);
    const handles = element.querySelectorAll('.editor-transform-handle');
    const transform = active && selected()?.type === 'sticker' && !(selected() as StickerElement).locked;
    if (!transform) handles.forEach(handle => handle.remove());
    if (transform && !handles.length) {
      for (const [operation, label, glyph] of [['resize', '缩放贴纸', '↗'], ['rotate', '旋转贴纸', '↻']]) {
        const handle = document.createElement('button'); handle.className = `editor-transform-handle editor-${operation}`; handle.dataset.operation = operation; handle.setAttribute('aria-label', label); handle.textContent = glyph; element.append(handle);
      }
    }
  });
  document.querySelectorAll<HTMLElement>('.editor-page').forEach((element, index) => element.classList.toggle('editor-active-page', index === side));
}
function renderLibrary() {
  const list = $('#chapter-list');
  const key = JSON.stringify([chapterIndex, spreadIndex, doc.chapters.map(c => [c.id, c.title, c.date, c.spreads.map(s => s.id)])]);
  if (libraryDocument === doc && libraryKey === key) {
    const pages = flatten(doc).flatMap(v => v.spread.pages);
    list.querySelectorAll<HTMLElement>('.editor-spread-thumb span').forEach((leaf, i) => {
      const p = pages[i], signature = `${p.paper.tint}:${p.elements.some(e => e.type === 'photo' && e.assetId)}`;
      if (leaf.dataset.preview !== signature) { leaf.style.background = p.paper.tint; leaf.textContent = signature.endsWith('true') ? '▧' : '≋'; leaf.dataset.preview = signature; }
    }); return;
  }
  libraryDocument = doc; libraryKey = key; list.replaceChildren();
  doc.chapters.forEach((chapter, ci) => {
    const group = document.createElement('section'); group.className = 'editor-chapter';
    const title = document.createElement('input'); title.value = chapter.title; title.maxLength = 150; title.setAttribute('aria-label', `第${ci + 1}章标题`); title.onchange = () => commit(() => { chapter.title = title.value; });
    const date = document.createElement('input'); date.value = chapter.date; date.maxLength = 100; date.placeholder = '日期或章节说明'; date.setAttribute('aria-label', `第${ci + 1}章日期`); date.onchange = () => commit(() => { chapter.date = date.value; });
    group.append(title, date);
    chapter.spreads.forEach((spread, si) => {
      const button = document.createElement('button'); button.className = 'editor-spread-link'; button.classList.toggle('current', ci === chapterIndex && si === spreadIndex); button.setAttribute('aria-current', ci === chapterIndex && si === spreadIndex ? 'page' : 'false');
      const thumbnail = document.createElement('span'); thumbnail.className = 'editor-spread-thumb';
      for (const p of spread.pages) { const leaf = document.createElement('span'); leaf.style.background = p.paper.tint; leaf.textContent = p.elements.some(e => e.type === 'photo' && e.assetId) ? '▧' : '≋'; thumbnail.append(leaf); }
      button.append(thumbnail, document.createTextNode(`跨页 ${si + 1}`));
      button.onclick = () => { finishContinuous(); finishText(); chapterIndex = ci; spreadIndex = si; selectedId = ''; render(); };
      group.append(button);
    }); list.append(group);
  });
  const actions = document.createElement('div'); actions.className = 'editor-page-actions';
  const button = (label: string, action: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = action; actions.append(b); };
  button('复制跨页', () => commit(() => { const spreads = doc.chapters[chapterIndex].spreads; spreads.splice(spreadIndex + 1, 0, duplicateSpread(spreads[spreadIndex])); spreadIndex++; }));
  button('上移跨页', () => commit(() => { if (!spreadIndex) return; const spreads = doc.chapters[chapterIndex].spreads; [spreads[spreadIndex - 1], spreads[spreadIndex]] = [spreads[spreadIndex], spreads[spreadIndex - 1]]; spreadIndex--; }));
  button('下移跨页', () => commit(() => { const spreads = doc.chapters[chapterIndex].spreads; if (spreadIndex >= spreads.length - 1) return; [spreads[spreadIndex + 1], spreads[spreadIndex]] = [spreads[spreadIndex], spreads[spreadIndex + 1]]; spreadIndex++; }));
  button('删除跨页', () => commit(() => { const spreads = doc.chapters[chapterIndex].spreads; if (spreads.length === 1) { notify('每章至少保留一个跨页。'); return; } spreads.splice(spreadIndex, 1); spreadIndex = Math.max(0, spreadIndex - 1); selectedId = ''; }));
  button('上移章节', () => commit(() => { if (chapterIndex > 0) { [doc.chapters[chapterIndex - 1], doc.chapters[chapterIndex]] = [doc.chapters[chapterIndex], doc.chapters[chapterIndex - 1]]; chapterIndex--; } }));
  button('下移章节', () => commit(() => { if (chapterIndex < doc.chapters.length - 1) { [doc.chapters[chapterIndex + 1], doc.chapters[chapterIndex]] = [doc.chapters[chapterIndex], doc.chapters[chapterIndex + 1]]; chapterIndex++; } }));
  button('删除章节', () => commit(() => { if (doc.chapters.length === 1) { notify('纪念册至少保留一章。'); return; } doc.chapters.splice(chapterIndex, 1); chapterIndex = Math.max(0, chapterIndex - 1); spreadIndex = 0; selectedId = ''; }));
  list.append(actions);
}
function render() {
  const retained = history.retainedAssets(); doc.assets.forEach(asset => retained.add(asset.id));
  for (const key of blobs.keys()) if (!retained.has(key)) { blobs.delete(key); const url = urls.get(key); if (url) URL.revokeObjectURL(url); urls.delete(key); }
  chapterIndex = Math.min(chapterIndex, doc.chapters.length - 1); spreadIndex = Math.min(spreadIndex, doc.chapters[chapterIndex].spreads.length - 1);
  $<HTMLInputElement>('#document-title').value = doc.title;
  $('#spread-name').textContent = doc.chapters[chapterIndex].title || '未命名章节';
  const offset = flatten(doc).findIndex(v => v.spread.id === doc.chapters[chapterIndex].spreads[spreadIndex].id) * 2;
  document.querySelectorAll<HTMLElement>('.editor-page').forEach((host, i) => {
    updateAlbumPage(host, doc.chapters[chapterIndex].spreads[spreadIndex].pages[i], { resolveAsset, editable: true, number: offset + i + 1 });
    host.querySelectorAll<HTMLElement>('.album-element').forEach(element => { if (!element.classList.contains('album-text')) { element.tabIndex = 0; element.removeAttribute('aria-hidden'); element.setAttribute('aria-label', element.classList.contains('album-sticker') ? '装饰贴纸，方向键微调位置' : '照片，点击编辑'); } });
    if (!host.querySelector('.editor-page-guide')) { const guide = document.createElement('div'); guide.className = 'editor-page-guide'; guide.setAttribute('aria-hidden', 'true'); host.append(guide); }
  });
  renderLibrary(); selectElement(selectedId ? $('#paper-spread').querySelector<HTMLElement>(`[data-element="${selectedId}"]`) : null); saveStatus();
  const length = page().elements.filter(e => e.type === 'text').reduce((n, e) => n + e.text.length, 0);
  $('#canvas-note').textContent = length > 650 ? '本页文字较长，页面会延展；建议拆分跨页，阅读时可纵向滚动。' : '图文随模板排列 · 贴纸可自由拼贴';
}
function fitHeight() {
  const scale = Number($<HTMLInputElement>('#zoom').value) / 100, paper = $('#paper-spread');
  paper.style.transform = `scale(${scale})`; $('#paper-frame').style.width = `${720 * scale}px`; $('#paper-frame').style.height = `${paper.offsetHeight * scale}px`;
}
function fitCanvas() { const zoom = $<HTMLInputElement>('#zoom'); zoom.value = String(Math.max(50, Math.min(100, Math.floor((viewport.clientWidth - 52) / 720 * 100 / 5) * 5))); fitHeight(); }
const paperObserver = new ResizeObserver(fitHeight), viewportObserver = new ResizeObserver(fitCanvas);
paperObserver.observe($('#paper-spread')); viewportObserver.observe(viewport);
function addElement(element: AlbumElement) { commit(() => { page().elements.push(element); selectedId = element.id; }); }
$('#add-title').onclick = () => addElement(textElement('title'));
$('#add-text').onclick = () => addElement(textElement());
$('#add-sticker').onclick = () => addElement(stickerElement());
$('#add-photo').onclick = () => chooseImages('photo');
$('#select-page').onclick = () => { finishContinuous(); selectedId = ''; selectElement(null); };
$('#other-page').onclick = () => { finishContinuous(); side = side ? 0 : 1; selectedId = ''; render(); };
$('#add-spread').onclick = () => commit(() => { doc.chapters[chapterIndex].spreads.push(makeSpread()); spreadIndex = doc.chapters[chapterIndex].spreads.length - 1; selectedId = ''; });
$('#add-chapter').onclick = () => commit(() => { doc.chapters.push({ id: id(), title: '新章节', date: '', spreads: [makeSpread()] }); chapterIndex = doc.chapters.length - 1; spreadIndex = 0; selectedId = ''; });
$<HTMLInputElement>('#document-title').onchange = event => commit(() => { doc.title = (event.target as HTMLInputElement).value; });
$('#zoom').oninput = fitHeight; $('#fit-canvas').onclick = fitCanvas;
$<HTMLInputElement>('#guides').onchange = event => $('#paper-spread').classList.toggle('editor-no-guides', !(event.target as HTMLInputElement).checked);
$('#paper-spread').addEventListener('click', event => { const target = event.target as HTMLElement; if (!target.closest('[data-operation]')) { selectElement(target.closest<HTMLElement>('[data-element]') ?? target.closest<HTMLElement>('[data-side]')); if (target.closest('.album-photo-empty')) chooseImages('photo'); } });
$('#paper-spread').addEventListener('focusin', event => {
  const target = event.target as HTMLElement;
  if (target.matches('[data-text]')) { finishContinuous(); finishText(); textBefore = copy(doc); selectElement(target.closest('[data-element]')); }
});
$('#paper-spread').addEventListener('input', event => {
  const target = event.target as HTMLElement; if (!target.matches('[data-text]')) return;
  const e = selected(); if (e?.type !== 'text') return;
  e.text = target.innerText.replace(/\r/g, ''); textDirty = true; dirty();
});
$('#paper-spread').addEventListener('compositionstart', () => { composing = true; window.clearTimeout(saveTimer); });
$('#paper-spread').addEventListener('compositionend', () => { composing = false; window.clearTimeout(saveTimer); saveTimer = window.setTimeout(() => { void flushSave(); }, 550); });
$('#paper-spread').addEventListener('focusout', event => { if ((event.target as HTMLElement).matches('[data-text]')) finishText(); });

function goHistory(redo: boolean) { finishContinuous(); finishText(); const previous = redo ? history.redo(doc) : history.undo(doc); if (previous) { previous.revision = doc.revision; doc = previous; selectedId = ''; dirty(); render(); } }
$('#undo').onclick = () => goHistory(false); $('#redo').onclick = () => goHistory(true);
window.addEventListener('keydown', event => {
  const typing = (event.target as HTMLElement).closest('input,textarea,[contenteditable]');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); finishText(); void flushSave(); }
  if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); goHistory(event.shiftKey); }
  if (!typing && selected()?.type === 'sticker' && event.key.startsWith('Arrow')) {
    event.preventDefault(); const e = selected() as StickerElement; if (e.locked) return;
    commit(() => { const step = event.shiftKey ? 2 : .5; e.x = Math.max(0, Math.min(100, e.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0))); e.y = Math.max(0, Math.min(100, e.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))); });
  }
});
$('#paper-spread').addEventListener('pointerdown', event => {
  const target = event.target as HTMLElement, element = target.closest<HTMLElement>('.album-sticker'), article = element?.closest<HTMLElement>('[data-side]');
  if (!element || !article || event.button !== 0) return;
  finishContinuous(); finishText(); selectElement(element); const e = selected(); if (e?.type !== 'sticker' || e.locked) return;
  event.preventDefault(); const before = copy(doc), start = copy(e), rect = article.getBoundingClientRect(), initial = { x: event.clientX, y: event.clientY }, operation = target.dataset.operation;
  const cx = rect.left + rect.width * e.x / 100, cy = rect.top + rect.height * e.y / 100;
  const angle = Math.atan2(initial.y - cy, initial.x - cx), distance = Math.max(1, Math.hypot(initial.x - cx, initial.y - cy));
  element.setPointerCapture(event.pointerId);
  const move = (ev: PointerEvent) => {
    if (operation === 'resize') e.width = Math.max(4, Math.min(55, start.width * Math.hypot(ev.clientX - cx, ev.clientY - cy) / distance));
    else if (operation === 'rotate') { const value = start.rotation + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - angle) * 180 / Math.PI; e.rotation = ((value + 540) % 360) - 180; }
    else { e.x = Math.max(0, Math.min(100, start.x + (ev.clientX - initial.x) / rect.width * 100)); e.y = Math.max(0, Math.min(100, start.y + (ev.clientY - initial.y) / rect.height * 100)); }
    Object.assign(element.style, { left: `${e.x}%`, top: `${e.y}%`, width: `${e.width}%`, transform: `translate(-50%,-50%) rotate(${e.rotation}deg)` });
  };
  const end = (ev: PointerEvent) => {
    element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', end); element.removeEventListener('pointercancel', end);
    if (ev.type === 'pointercancel') doc = before;
    else if (JSON.stringify(start) !== JSON.stringify(e)) { history.remember(before); dirty(); }
    render();
  };
  element.addEventListener('pointermove', move); element.addEventListener('pointerup', end); element.addEventListener('pointercancel', end);
});

let uploadTarget: { kind: 'photo' | 'watermark' | 'sticker'; pageId: string; elementId: string };
function chooseImages(kind: 'photo' | 'watermark' | 'sticker') { finishContinuous(); uploadTarget = { kind, pageId: page().id, elementId: selectedId }; const input = $<HTMLInputElement>('#image-input'); input.value = ''; input.multiple = kind === 'photo'; input.click(); }
$<HTMLInputElement>('#image-input').onchange = async event => {
  const files = Array.from((event.target as HTMLInputElement).files ?? []), target = uploadTarget; if (!files.length) return;
  try {
    const bytes = doc.assets.reduce((sum, asset) => sum + (blobs.get(asset.id)?.size ?? 0), 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (bytes > 120 * 1024 * 1024 || doc.assets.length + files.length > 300) throw new Error('本册素材上限120MB / 300张，请缩小照片或另建分册，以便完整备份。');
    const imported: Awaited<ReturnType<typeof importImage>>[] = []; for (const file of files) imported.push(await importImage(file));
    commit(() => {
      const p = flatten(doc).flatMap(v => v.spread.pages).find(p => p.id === target.pageId); if (!p) throw new Error('原页面已删除，请重新导入。');
      imported.forEach(({ asset, blob }, index) => {
        blobs.set(asset.id, blob); doc.assets.push(asset);
        if (target.kind === 'watermark') { p.watermark.assetId = asset.id; p.watermark.opacity = .12; }
        else if (target.kind === 'sticker') { const existing = p.elements.find(e => e.id === target.elementId && e.type === 'sticker'); const sticker = existing?.type === 'sticker' ? existing : stickerElement(); sticker.assetId = asset.id; if (!existing) p.elements.push(sticker); selectedId = sticker.id; }
        else {
          const existing = index === 0 ? p.elements.find(e => e.id === target.elementId && e.type === 'photo') ?? p.elements.find(e => e.type === 'photo' && !e.assetId) : undefined;
          const photo = existing?.type === 'photo' ? existing : photoElement(); photo.assetId = asset.id; if (!existing) p.elements.push(photo); if (!index) selectedId = photo.id;
        }
      });
    }); notify(`已导入${files.length}张图片，原图保留在本机草稿与可编辑备份。`);
  } catch (error) { notify((error as Error).message); }
};
async function output(publish: boolean) {
  finishContinuous(); finishText(); notify(publish ? '正在优化照片并生成内容包…' : '正在生成可继续编辑的备份…');
  try { const blob = await exportPackage(copy(doc), new Map(blobs), publish, await contentHash(published)); download(blob, publish ? 'album-content.json' : 'memory.tides.json'); notify(publish ? '内容包已下载；它不会自动发布。应用方法见使用说明。' : '备份已下载，包含页面和原始素材。'); }
  catch (error) { notify((error as Error).message); }
}
$('#export-backup').onclick = () => { void output(false); }; $('#export-content').onclick = () => { void output(true); };
$('#import-backup').onclick = () => { const input = $<HTMLInputElement>('#project-input'); input.value = ''; input.click(); };
$<HTMLInputElement>('#project-input').onchange = async event => {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  try {
    const imported = await importPackage(file);
    // Imported packages can reuse IDs; isolate their originals from the undo history.
    for (const asset of imported.document.assets) if (blobs.has(asset.id)) {
      const previous = asset.id, fresh = id(); asset.id = fresh; imported.assets.set(fresh, imported.assets.get(previous)!); imported.assets.delete(previous);
      for (const { spread } of flatten(imported.document)) for (const p of spread.pages) { if (p.watermark.assetId === previous) p.watermark.assetId = fresh; for (const e of p.elements) if ('assetId' in e && e.assetId === previous) e.assetId = fresh; }
    }
    commit(() => { doc = imported.document; for (const [key, blob] of imported.assets) blobs.set(key, blob); releaseUrls(); chapterIndex = spreadIndex = side = 0; selectedId = ''; }); notify('项目已恢复，可继续编辑；可撤销这次导入。');
  }
  catch (error) { notify(`导入失败，原稿保留：${(error as Error).message}`); }
};
$('#new-project').onclick = () => commit(() => { doc = newDocument(); chapterIndex = spreadIndex = side = 0; selectedId = ''; });
$('#copy-samples').onclick = async () => {
  const { copyLegacySamples } = await import('./samples'); const source = await copyLegacySamples();
  commit(() => { doc = source.document; for (const [key, blob] of source.assets) blobs.set(key, blob); chapterIndex = spreadIndex = side = 0; selectedId = ''; }); notify('已把原四章复制为可编辑草稿，网站原内容未改动。');
};
$('#retry-save').onclick = () => { saveError = undefined; void flushSave(); };
$('#reload-draft').onclick = async () => {
  try { if (saveTask) await saveTask; const stored = await readDraft(); if (!stored) throw new Error('没有已保存的草稿'); history.remember(doc); doc = stored.document; for (const [key, blob] of stored.assets) blobs.set(key, blob); storageVersion = stored.version; sequence = savedSequence = 0; saveError = undefined; chapterIndex = spreadIndex = side = 0; selectedId = ''; releaseUrls(); render(); notify('已读取最新草稿；可撤销恢复刚才的页面内容。'); }
  catch (error) { notify((error as Error).message); }
};
$('#preview').onclick = async () => {
  finishContinuous(); finishText(); try { const preview = await optimizeAssets(copy(doc), new Map(blobs)); previewToken = await savePreview(preview.document, preview.assets); $('#preview-frame').setAttribute('src', `./album-preview.html?albumPreview=${previewToken}`); $('#preview-frame').style.width = '100%'; $<HTMLDialogElement>('#preview-dialog').showModal(); }
  catch (error) { notify(`无法建立预览：${(error as Error).message}`); }
};
$('#preview-desktop').onclick = () => { $('#preview-frame').style.width = '100%'; };
$('#preview-mobile').onclick = () => { $('#preview-frame').style.width = '390px'; };
$('#preview-room').onclick = () => { if (previewToken) window.open(`./?albumPreview=${previewToken}`, '_blank', 'noopener'); };
$('#close-preview').onclick = () => $<HTMLDialogElement>('#preview-dialog').close();
$('#preview-dialog').addEventListener('close', () => $('#preview-frame').setAttribute('src', 'about:blank'));
window.addEventListener('message', event => { if (event.origin === location.origin && event.source === $<HTMLIFrameElement>('#preview-frame').contentWindow && event.data?.type === 'tides-close-preview') $<HTMLDialogElement>('#preview-dialog').close(); });
window.addEventListener('beforeunload', event => { if (sequence !== savedSequence || saveTask || continuousBefore) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', event => { if (!event.persisted) { cancelPreviewFrame(); channel.close(); releaseUrls(); paperObserver.disconnect(); viewportObserver.disconnect(); } });
document.addEventListener('focusout', event => { if ((event.target as HTMLElement).matches('input[type=range],input[type=color]')) finishContinuous(); });
window.addEventListener('blur', finishContinuous);
document.addEventListener('visibilitychange', () => { if (document.hidden) { finishText(); void flushSave(); } });
try {
  const stored = await readDraft();
  if (stored) { doc = stored.document; blobs = stored.assets; storageVersion = stored.version; }
  else { doc.baseCommit = typeof __ALBUM_BASE_COMMIT__ === 'string' ? __ALBUM_BASE_COMMIT__ : ''; dirty(); }
} catch (error) { saveError = error instanceof Error ? error : new Error('无法读取本机存储，请使用备份'); }
initialized = true; render(); fitCanvas();
