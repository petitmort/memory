import '../style.css';
import { mountAppView } from '../app-view';
import { createReaderController } from '../reader-controller';
import { loadAlbumContent } from '../album/runtime';
mountAppView();
document.title = '纪念册阅读预览 · 潮汐之间';
const reader = document.getElementById('reader')!;
// Preview owns only the book: room loading overlays and ambient UI never mount here.
document.body.replaceChildren(reader); reader.classList.remove('hidden'); document.body.classList.add('reading');
const close = document.getElementById('close-book')!; close.textContent = '返回工作台';
const returnToEditor = () => { if (window.parent !== window) window.parent.postMessage({ type: 'tides-close-preview' }, location.origin); else location.href = './editor.html'; };
try {
  const content = await loadAlbumContent(null, new URLSearchParams(location.search).get('albumPreview'));
  const controller = createReaderController({ content, reducedMotion: matchMedia('(prefers-reduced-motion:reduce)').matches, canRead: () => true, onClose: returnToEditor });
  controller.render(); reader.dataset.phase = 'ready'; reader.focus();
  close.onclick = returnToEditor;
  window.addEventListener('pagehide', event => { if (!event.persisted) controller.dispose(); });
} catch (error) {
  reader.replaceChildren(); const message = document.createElement('p'); message.style.color = '#fff9e9'; message.textContent = (error as Error).message; const link = document.createElement('a'); link.href = './editor.html'; link.textContent = '返回工作台重新预览'; link.style.color = '#fff9e9'; reader.append(message, link);
}
