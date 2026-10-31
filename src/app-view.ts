const icons = {
  play: '<path d="m9 5 10 7-10 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M8 6a7 7 0 0 0-3 6m11 6a7 7 0 0 0 3-6"/>',
  sound:
    '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
};
export const svg = (name: keyof typeof icons) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
export function mountAppView() {
document.querySelector("#app")!.innerHTML = `
<div id="world" aria-label="海边房间互动场景"></div>
<div class="vignette"></div><div class="grain"></div>
<header class="header"><a href="#" class="brand" aria-label="潮汐之间首页"><span class="brand-mark">≈</span><span>潮汐之间<small>BETWEEN THE TIDES</small></span></a><div class="header-right"><span class="private-note">一间房间，一些值得珍藏的时光</span><button class="icon-button hidden" id="record-toggle" aria-label="上传音乐" aria-pressed="false" aria-describedby="record-status">${svg("record")}</button><button class="icon-button" id="sound" aria-label="开启海浪声" title="开启海浪声">${svg("mute")}</button><button class="icon-button" id="fullscreen" aria-label="全屏浏览" title="全屏浏览">${svg("fullscreen")}</button></div></header>
<input type="file" id="record-file" accept="audio/*,.mp3,.m4a,.ogg,.wav,.flac" hidden><span id="record-status" class="sr-only" role="status" aria-live="polite"></span>
<main>
<section class="intro" id="intro"><div class="eyebrow"><span></span> A LITTLE PLACE FOR OUR MEMORIES</div><h1>把时光，<br>留在<span>潮汐之间。</span></h1><p class="intro-copy">有些瞬间，值得慢慢想起。<br>推开这扇门，让海风替你翻开回忆。</p><button id="enter" class="primary-button"><span id="enter-label">让风吹散迷雾</span><span class="button-arrow">${svg("arrow")}</span></button><p class="enter-note" id="enter-note">戴上耳机，给自己一小段安静的时间</p></section>
<div class="door-caption" id="door-caption"><span class="tiny-star">✦</span><span>回忆一直都在<br><small>只等你轻轻推开</small></span></div>
<section class="room-ui hidden" id="room-ui"><div class="eyebrow">SOMEWHERE, BY THE SEA</div><h2>海风如旧，<br>故事等你。</h2><p>猫咪在身旁睡着，海风替你翻开回忆。</p><div class="scene-hint hidden" id="scene-hint"><span aria-hidden="true">·</span> 点击桌上的花束，或轻触按钮</div><button class="primary-button" id="open-book">把花放到一旁 · 打开纪念册 <span class="button-arrow">${svg("arrow")}</span></button><div class="cozy-actions"><button class="cozy-view text-button" id="cozy-view" aria-pressed="false">看看睡着的小猫 <span aria-hidden="true">↖</span></button><button class="cozy-view text-button hidden" id="pet-cat" aria-describedby="pet-hint">抚摸小猫</button><button class="cozy-view text-button" id="choose-record">上传音乐</button><button class="cozy-view text-button" id="room-light">室内灯光</button></div><div class="record-track hidden" id="record-track" aria-hidden="true"></div><div class="cozy-notes hidden" id="cozy-details"><span id="pet-hint" role="status" aria-live="polite">轻触或轻划小猫</span><a class="cozy-credit" id="cozy-credit" href="credits.html" target="_blank" rel="noopener">猫咪素材鸣谢</a></div></section>
<aside id="explore-guide" class="explore-guide hidden" role="status" aria-live="polite"><strong>这是一间可以探索的房间</strong><p>轻触花束、小猫或唱片机，慢慢看看。<br>也可以只听海浪，停留一会儿。</p></aside>
<div class="loading" id="loading" role="status"><span></span> 正在把海风装进房间</div>
<div class="fog" id="fog" aria-hidden="true"></div>
<section class="reader hidden" id="reader" role="dialog" aria-modal="true" aria-label="回忆纪念册" tabindex="-1"><div class="reader-top"><span class="eyebrow">THE THINGS WE KEEP</span><button id="close-book" class="text-button">回到房间 ${svg("close")}</button></div><div class="book-wrap"><div class="book" id="book"><article class="page page-left"><span class="page-kicker" id="chapter-date"></span><div class="print" id="art-holder"></div><p class="photo-caption" id="photo-caption"></p><span class="page-number" id="left-number"></span></article><article class="page page-right"><span class="page-kicker" id="chapter-subtitle"></span><div class="story"><span class="small-flower">✳&#xfe0e;</span><h2 id="chapter-title"></h2><p class="poem" id="chapter-text"></p><div class="small-rule"></div><p class="story-note" id="chapter-note"></p></div><span class="page-number" id="right-number"></span></article></div><button class="page-nav prev" id="prev" aria-label="上一章">${svg("arrow")}</button><button class="page-nav next" id="next" aria-label="下一章">${svg("arrow")}</button></div><div class="reader-bottom"><span id="chapter-count"></span><div class="chapter-dots" id="chapter-dots"></div><span class="keyboard-hint">← → 切换章节 <span>·</span> ESC 返回</span></div></section>
</main>
<footer class="footer"><div class="journey"><span class="active" data-step="0">01 <i></i> 门前</span><b></b><span data-step="1">02 <i></i> 海边房间</span><b></b><span data-step="2">03 <i></i> 回忆</span></div><span class="footer-note">MADE OF MOMENTS <span>✦</span> KEPT BY THE SEA</span><button id="quality" class="quality-button" title="切换渲染画质">画质 · 自适应</button></footer>
<span id="journey-status" class="journey-status hidden" role="status" aria-live="polite"></span><div class="toast" id="toast" role="status"></div><div class="fallback hidden" id="fallback"><h2>房间画面暂时无法显示</h2><p>纪念册仍可阅读，也可以重新载入房间。</p><button id="fallback-read" class="primary-button">阅读纪念册 ${svg("arrow")}</button><button id="reload-scene" class="text-button">重新载入房间</button></div>`;

}

export const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
