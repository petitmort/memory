import "./style.css";
import { chapters, artwork } from "./content";
import { createScene } from "./scene";
import { createReaderJourney, transitionReader } from "./reader-transition";
import { captureBookPages } from "./page-raster";

const icons = {
  sound:
    '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
};
const svg = (name: keyof typeof icons) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
document.querySelector("#app")!.innerHTML = `
<div id="world" aria-label="海边房间互动场景"></div>
<div class="vignette"></div><div class="grain"></div>
<header class="header"><a href="#" class="brand" aria-label="潮汐之间首页"><span class="brand-mark">≈</span><span>潮汐之间<small>BETWEEN THE TIDES</small></span></a><div class="header-right"><span class="private-note">一间房间，一些值得珍藏的时光</span><button class="icon-button" id="sound" aria-label="开启海浪声" title="开启海浪声">${svg("mute")}</button><button class="icon-button" id="fullscreen" aria-label="全屏浏览" title="全屏浏览">${svg("fullscreen")}</button></div></header>
<main>
<section class="intro" id="intro"><div class="eyebrow"><span></span> A LITTLE PLACE FOR OUR MEMORIES</div><h1>把时光，<br>留在<span>潮汐之间。</span></h1><p class="intro-copy">有些瞬间，值得慢慢想起。<br>推开这扇门，让海风替你翻开回忆。</p><button id="enter" class="primary-button"><span id="enter-label">让风吹散迷雾</span><span class="button-arrow">${svg("arrow")}</span></button><p class="enter-note" id="enter-note">戴上耳机，给自己一小段安静的时间</p></section>
<div class="door-caption" id="door-caption"><span class="tiny-star">✦</span><span>回忆一直都在<br><small>只等你轻轻推开</small></span></div>
<section class="room-ui hidden" id="room-ui"><div class="eyebrow">SOMEWHERE, BY THE SEA</div><h2>海风如旧，<br>故事等你。</h2><p>把花束放到一旁，翻开属于我们的时光。</p><button class="primary-button" id="open-book">把花放到一旁 · 打开纪念册 <span class="button-arrow">${svg("arrow")}</span></button></section>
<div class="scene-hint hidden" id="scene-hint"><span class="pulse-dot"></span> 点击桌上的花束，或轻触按钮</div>
<div class="loading" id="loading"><span></span> 正在把海风装进房间</div>
<div class="fog" id="fog"></div>
<section class="reader hidden" id="reader" role="dialog" aria-modal="true" aria-label="回忆纪念册" tabindex="-1"><div class="reader-top"><span class="eyebrow">THE THINGS WE KEEP</span><button id="close-book" class="text-button">回到房间 ${svg("close")}</button></div><div class="book-wrap"><div class="book" id="book"><article class="page page-left"><span class="page-kicker" id="chapter-date"></span><div class="print" id="art-holder"></div><p class="photo-caption" id="photo-caption"></p><span class="page-number" id="left-number"></span></article><article class="page page-right"><span class="page-kicker" id="chapter-subtitle"></span><div class="story"><span class="small-flower">✳&#xfe0e;</span><h2 id="chapter-title"></h2><p class="poem" id="chapter-text"></p><div class="small-rule"></div><p class="story-note" id="chapter-note"></p></div><span class="page-number" id="right-number"></span></article></div><button class="page-nav prev" id="prev" aria-label="上一章">${svg("arrow")}</button><button class="page-nav next" id="next" aria-label="下一章">${svg("arrow")}</button></div><div class="reader-bottom"><span id="chapter-count"></span><div class="chapter-dots" id="chapter-dots"></div><span class="keyboard-hint">← → 翻页 <span>·</span> ESC 返回</span></div></section>
</main>
<footer class="footer"><div class="journey"><span class="active" data-step="0">01 <i></i> 门前</span><b></b><span data-step="1">02 <i></i> 海边房间</span><b></b><span data-step="2">03 <i></i> 回忆</span></div><span class="footer-note">MADE OF MOMENTS <span>✦</span> KEPT BY THE SEA</span><button id="quality" class="quality-button" title="切换渲染画质">画质 · 自适应</button></footer>
<div class="toast" id="toast" role="status"></div><div class="fallback hidden" id="fallback"><h2>这间房间需要 WebGL 支持</h2><p>你仍然可以打开纪念册，慢慢阅读。</p><button id="fallback-read" class="primary-button">阅读纪念册 ${svg("arrow")}</button></div>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let state: "fog" | "clearing" | "door" | "entering" | "room" | "opening" | "reading" | "closing" =
  "fog";
let page = 0,
  turning = false,
  lastFocus: HTMLElement | null = null;
let pageTurnVersion = 0;
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
let scene: ReturnType<typeof createScene> | undefined;
let sceneAvailable = false;
let readingScene: ReturnType<typeof createScene> | undefined;
let soundEnabled = true,
  audio: AudioContext | undefined,
  gain: GainNode | undefined;
el("sound").innerHTML = svg("sound");
el("sound").setAttribute("aria-label", "关闭海浪声");
el("sound").title = "关闭海浪声";
function toast(message: string) {
  el("toast").textContent = message;
  el("toast").classList.add("show");
  window.setTimeout(() => el("toast").classList.remove("show"), 2600);
}
function step(n: number) {
  document
    .querySelectorAll("[data-step]")
    .forEach((e, i) => e.classList.toggle("active", i <= n));
}
function audioVolume() {
  if (!audio || !gain) return;
  gain.gain.cancelScheduledValues(audio.currentTime);
  gain.gain.setTargetAtTime(
    soundEnabled && ["room", "opening", "reading", "closing"].includes(state) ? 0.16 : 0,
    audio.currentTime,
    1.2,
  );
}
async function unlockAudio() {
  try {
    if (!audio) {
      audio = new AudioContext();
      gain = audio.createGain();
      gain.gain.value = 0;
      gain.connect(audio.destination);
      const buffer = audio.createBuffer(
        1,
        audio.sampleRate * 8,
        audio.sampleRate,
      );
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + Math.random() * 0.04 - 0.02) / 1.02;
        data[i] = brown * 5;
      }
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 650;
      source.connect(filter);
      filter.connect(gain);
      source.start();
      const lfo = audio.createOscillator();
      const depth = audio.createGain();
      lfo.frequency.value = 0.09;
      depth.gain.value = 240;
      lfo.connect(depth);
      depth.connect(filter.frequency);
      lfo.start();
    }
    await audio.resume();
    audioVolume();
  } catch {
    toast("此浏览器暂时无法播放环境声");
    soundEnabled = false;
  }
}
el("sound").onclick = async () => {
  soundEnabled = !soundEnabled;
  await unlockAudio();
  el("sound").innerHTML = svg(soundEnabled ? "sound" : "mute");
  el("sound").setAttribute(
    "aria-label",
    soundEnabled ? "关闭海浪声" : "开启海浪声",
  );
  el("sound").title = soundEnabled ? "关闭海浪声" : "开启海浪声";
  if (soundEnabled && ["fog", "clearing", "door", "entering"].includes(state))
    toast("海浪声将在进入房间后响起");
};
el("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("当前浏览器不支持全屏，可直接继续体验");
  }
};
async function enter() {
  if (state === "fog") {
    if (soundEnabled) void unlockAudio();
    state = "clearing";
    el<HTMLButtonElement>("enter").disabled = true;
    el("enter-label").textContent = "风正在经过…";
    el("fog").classList.add("cleared");
    scene?.clearFog();
    await new Promise((r) => setTimeout(r, reduceMotion ? 100 : 1850));
    state = "door";
    el<HTMLButtonElement>("enter").disabled = false;
    el("enter-label").textContent = "推开这扇门";
    el("enter-note").textContent = "门的另一边，是一整个夏天";
    if (document.activeElement === document.body)
      el("enter").focus({ preventScroll: true });
    return;
  }
  if (state !== "door") return;
  state = "entering";
  el("intro").classList.add("leaving");
  el("door-caption").classList.add("hidden");
  el<HTMLButtonElement>("enter").disabled = true;
  await scene?.enterRoom();
  state = "room";
  step(1);
  el("intro").classList.add("hidden");
  el("room-ui").classList.remove("hidden");
  el("scene-hint").classList.remove("hidden");
  audioVolume();
}
el("enter").onclick = enter;
function renderPage() {
  const c = chapters[page];
  el("chapter-date").textContent = c.date;
  el("chapter-subtitle").textContent = c.subtitle;
  el("chapter-title").textContent = c.title;
  el("chapter-text").textContent = c.text;
  el("chapter-note").textContent = c.note;
  el("photo-caption").textContent = c.caption;
  const art = artwork(c.scene);
  art.setAttribute("role", "img");
  art.setAttribute(
    "aria-label",
    `${c.title}：${c.scene === "mountain" ? "层叠青山" : "海岸风景"}原创插画`,
  );
  if (c.image) {
    const photo = new Image();
    photo.alt = c.caption;
    photo.src = c.image;
    photo.decoding = "async";
    photo.onerror = () => {
      if (chapters[page] === c) el("art-holder").replaceChildren(art);
    };
    el("art-holder").replaceChildren(photo);
  } else el("art-holder").replaceChildren(art);
  el("left-number").textContent = String(page * 2 + 1).padStart(2, "0");
  el("right-number").textContent = String(page * 2 + 2).padStart(2, "0");
  el("chapter-count").textContent =
    `${String(page + 1).padStart(2, "0")} / ${String(chapters.length).padStart(2, "0")} 章`;
  el<HTMLButtonElement>("prev").disabled = page === 0;
  el<HTMLButtonElement>("next").disabled = page === chapters.length - 1;
  el("chapter-dots").innerHTML = chapters
    .map(
      (c, i) =>
        `<button aria-label="跳到${c.date}" aria-current="${i === page ? "true" : "false"}" data-page="${i}" class="${i === page ? "selected" : ""}"></button>`,
    )
    .join("");
  el("chapter-dots")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((b) => (b.onclick = () => turn(Number(b.dataset.page))));
}
async function turn(target: number) {
  if (state !== "reading" || turning || target < 0 || target >= chapters.length || target === page)
    return;
  turning = true;
  const version = ++pageTurnVersion;
  const forward = target > page;
  const desktop = innerWidth >= 760;
  const leaf = document.createElement("div");
  if (desktop && !reduceMotion) {
    leaf.className = `turn-leaf ${forward ? "forward" : "backward"}`;
    const front = document.createElement("div");
    front.className = "leaf-front";
    const clone = el("book")
      .querySelector(forward ? ".page-right" : ".page-left")!
      .cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
    front.appendChild(clone);
    leaf.setAttribute("aria-hidden", "true");
    const back = document.createElement("div");
    back.className = "leaf-back";
    leaf.append(front, back);
    el("book").appendChild(leaf);
  } else el("book").classList.add("turning");
  await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 260));
  if (version !== pageTurnVersion) return;
  page = target;
  renderPage();
  await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 340));
  if (version !== pageTurnVersion) return;
  leaf.remove();
  el("book").classList.remove("turning");
  el("book").scrollTo({
    top: 0,
    behavior: reduceMotion ? "instant" : "smooth",
  });
  turning = false;
}
async function openBook() {
  if (state !== "room" && !el("fallback").classList.contains("hidden"))
    el("fallback").classList.add("hidden");
  else if (state !== "room") return;
  lastFocus = document.activeElement as HTMLElement;
  state = "opening";
  const reader = el("reader");
  reader.dataset.phase = "opening";
  reader.setAttribute("aria-busy", "true");
  reader.inert = true;
  el<HTMLButtonElement>("open-book").disabled = true;
  document.body.classList.add("book-transition");
  step(2);
  el("room-ui").classList.add("hidden");
  el("scene-hint").classList.add("hidden");
  renderPage();
  readingScene = sceneAvailable ? scene : undefined;
  readingScene?.setBookChapter(page);
  reader.classList.add("is-preparing");
  reader.classList.remove("hidden");
  el("book").scrollTop = 0;
  document.body.classList.add("reading");
  if (readingScene) {
    const activeScene = readingScene;
    let journey: ReturnType<typeof createReaderJourney>;
    const paperReady = (async () => {
      try {
        activeScene.setBookPageCanvases(await captureBookPages(reader));
      } catch {
        // An unavailable external photo keeps the locally generated paper usable.
      }
      journey = createReaderJourney(reader, true);
      journey.update({progress:0,projection:activeScene.getBookProjection()});
      reader.classList.remove("is-preparing");
    })();
    await activeScene.openBook(frame => journey.update(frame), paperReady);
    journey!.finish();
  } else {
    reader.classList.remove("is-preparing");
    await transitionReader(reader, undefined, true, reduceMotion);
  }
  state = "reading";
  reader.dataset.phase = "ready";
  reader.setAttribute("aria-busy", "false");
  reader.inert = false;
  document.body.classList.remove("book-transition");
  reader.focus();
  audioVolume();
}
async function closeBook() {
  if (state !== "reading") return;
  state = "closing";
  ++pageTurnVersion;
  turning = false;
  el("book").querySelectorAll(".turn-leaf").forEach(leaf => leaf.remove());
  el("book").classList.remove("turning");
  const reader = el("reader");
  reader.dataset.phase = "closing";
  reader.setAttribute("aria-busy", "true");
  reader.inert = true;
  document.body.classList.add("book-transition");
  readingScene?.setBookChapter(page);
  if (readingScene) {
    try {
      readingScene.setBookPageCanvases(await captureBookPages(reader));
    } catch {
      // Keep the fallback paper if a user-supplied photo cannot be rasterized.
    }
    const journey = createReaderJourney(reader, false);
    journey.update({progress:0,projection:readingScene.getBookProjection()});
    await readingScene.returnToRoom(frame => journey.update(frame));
    journey.finish();
  } else {
    await transitionReader(reader, undefined, false, reduceMotion);
  }
  document.body.classList.remove("reading");
  readingScene = undefined;
  state = "room";
  reader.dataset.phase = "closed";
  reader.setAttribute("aria-busy", "false");
  reader.inert = false;
  document.body.classList.remove("book-transition");
  el("room-ui").classList.remove("hidden");
  el<HTMLButtonElement>("open-book").disabled = false;
  el("open-book").innerHTML = '继续翻阅纪念册 <span class="button-arrow">↗</span>';
  el("scene-hint").innerHTML = '<span class="pulse-dot"></span> 点击桌上的画册，继续我们的故事';
  el("scene-hint").classList.remove("hidden");
  el("room-ui").querySelector("p")!.textContent = "花留在桌边，故事还在画册里。";
  step(1);
  (lastFocus?.isConnected ? lastFocus : el("open-book")).focus();
}
el("open-book").onclick = openBook;
el("fallback-read").onclick = openBook;
el("close-book").onclick = () => void closeBook();
el("prev").onclick = () => turn(page - 1);
el("next").onclick = () => turn(page + 1);
el("reader").addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    const buttons = Array.from(
      el("reader").querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const first = buttons[0],
      last = buttons.at(-1)!;
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === el("reader"))
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener("keydown", (e) => {
  if (state === "reading") {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      void turn(page + 1);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      void turn(page - 1);
    }
    if (e.key === "Escape") closeBook();
  }
});
let touchX = 0;
el("book").addEventListener(
  "touchstart",
  (e) => (touchX = e.changedTouches[0].clientX),
  { passive: true },
);
el("book").addEventListener(
  "touchend",
  (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 55) void turn(page + (dx < 0 ? 1 : -1));
  },
  { passive: true },
);
let lowQuality = false;
el("quality").onclick = () => {
  lowQuality = !lowQuality;
  scene?.setQuality(lowQuality);
  el("quality").textContent = lowQuality ? "画质 · 省电" : "画质 · 自适应";
};
document.querySelector(".brand")!.addEventListener("click", (e) => {
  e.preventDefault();
  if (state === "reading" || state === "room") window.location.reload();
});
try {
  scene = createScene(
    el("world"),
    () => {
      if (state === "room") void openBook();
      else if (state === "door" || state === "fog") void enter();
    },
    reduceMotion,
  );
  scene.ready
    .then(() => {
      sceneAvailable = true;
      el("loading").classList.add("hidden");
    })
    .catch((error) => {
      console.error(error);
      el("loading").classList.add("hidden");
      el("intro").classList.add("hidden");
      el("fallback").classList.remove("hidden");
    });
} catch (error) {
  console.error(error);
  el("loading").classList.add("hidden");
  el("intro").classList.add("hidden");
  el("fallback").classList.remove("hidden");
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    void audio?.suspend();
  } else if (soundEnabled) void audio?.resume();
});
