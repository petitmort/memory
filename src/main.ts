import "./style.css";
import { chapters, artwork } from "./content";
import { createScene, SceneUnavailableError } from "./scene";
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
<section class="room-ui hidden" id="room-ui"><div class="eyebrow">SOMEWHERE, BY THE SEA</div><h2>海风如旧，<br>故事等你。</h2><p>猫咪在身旁睡着，海风替你翻开回忆。</p><button class="primary-button" id="open-book">把花放到一旁 · 打开纪念册 <span class="button-arrow">${svg("arrow")}</span></button><button class="cozy-view text-button" id="cozy-view" aria-pressed="false">看看睡着的小猫 <span aria-hidden="true">↖</span></button><a class="cozy-credit hidden" id="cozy-credit" href="credits.html" target="_blank" rel="noopener">猫咪模型鸣谢</a></section>
<div class="scene-hint hidden" id="scene-hint"><span class="pulse-dot"></span> 点击桌上的花束，或轻触按钮</div>
<div class="loading" id="loading" role="status"><span></span> 正在把海风装进房间</div>
<div class="fog" id="fog" aria-hidden="true"></div>
<section class="reader hidden" id="reader" role="dialog" aria-modal="true" aria-label="回忆纪念册" tabindex="-1"><div class="reader-top"><span class="eyebrow">THE THINGS WE KEEP</span><button id="close-book" class="text-button">回到房间 ${svg("close")}</button></div><div class="book-wrap"><div class="book" id="book"><article class="page page-left"><span class="page-kicker" id="chapter-date"></span><div class="print" id="art-holder"></div><p class="photo-caption" id="photo-caption"></p><span class="page-number" id="left-number"></span></article><article class="page page-right"><span class="page-kicker" id="chapter-subtitle"></span><div class="story"><span class="small-flower">✳&#xfe0e;</span><h2 id="chapter-title"></h2><p class="poem" id="chapter-text"></p><div class="small-rule"></div><p class="story-note" id="chapter-note"></p></div><span class="page-number" id="right-number"></span></article></div><button class="page-nav prev" id="prev" aria-label="上一章">${svg("arrow")}</button><button class="page-nav next" id="next" aria-label="下一章">${svg("arrow")}</button></div><div class="reader-bottom"><span id="chapter-count"></span><div class="chapter-dots" id="chapter-dots"></div><span class="keyboard-hint">← → 翻页 <span>·</span> ESC 返回</span></div></section>
</main>
<footer class="footer"><div class="journey"><span class="active" data-step="0">01 <i></i> 门前</span><b></b><span data-step="1">02 <i></i> 海边房间</span><b></b><span data-step="2">03 <i></i> 回忆</span></div><span class="footer-note">MADE OF MOMENTS <span>✦</span> KEPT BY THE SEA</span><button id="quality" class="quality-button" title="切换渲染画质">画质 · 自适应</button></footer>
<div class="toast" id="toast" role="status"></div><div class="fallback hidden" id="fallback"><h2>房间画面暂时无法显示</h2><p>纪念册仍可阅读，也可以重新载入房间。</p><button id="fallback-read" class="primary-button">阅读纪念册 ${svg("arrow")}</button><button id="reload-scene" class="text-button">重新载入房间</button></div>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let state: "fog" | "clearing" | "door" | "entering" | "room" | "opening" | "reading" | "closing" | "fallback" =
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
let sceneInvalidated = false;
let sceneVersion = 0;
let transitionVersion = 0;
let changingView = false;
let releaseSceneWait: () => void;
const sceneUnavailable = new Promise<void>(resolve => { releaseSceneWait = resolve; });

function setBackgroundInert(value: boolean) {
  document.querySelectorAll<HTMLElement>("#world,.header,.footer,main > :not(#reader),#fallback")
    .forEach(element => { element.inert = value; });
}
function showFallback() {
  state = "fallback";
  document.body.classList.remove("reading", "book-transition");
  el("loading").classList.add("hidden");
  el("intro").classList.add("hidden");
  el("room-ui").classList.add("hidden");
  el("scene-hint").classList.add("hidden");
  el("door-caption").classList.add("hidden");
  el("fog").classList.add("hidden");
  el("fallback").classList.remove("hidden");
  setBackgroundInert(false);
  el("fallback-read").focus({preventScroll:true});
  audioVolume();
}
function onSceneUnavailable(error?: unknown) {
  if (sceneInvalidated) return;
  sceneInvalidated = true;
  sceneAvailable = false;
  ++sceneVersion;
  releaseSceneWait();
  readingScene = undefined;
  if (error && !(error instanceof SceneUnavailableError)) console.error(error);
  el("world").classList.add("hidden");
  el("loading").classList.add("hidden");
  el("intro").classList.add("hidden");
  el("door-caption").classList.add("hidden");
  el("fog").classList.add("hidden");
  el("close-book").innerHTML = `返回纪念册入口 ${svg("close")}`;
  // Active transitions handle their own cleanup before releasing the dialog.
  if (!["opening", "closing", "reading"].includes(state)) showFallback();
}

async function prepareScenePaper(reader: HTMLElement, activeScene: NonNullable<typeof scene>, generation: number, operation: number) {
  // Loss must release this wait even when an optional photograph is still loading.
  // The decode may finish later, but can no longer write into a newer journey.
  const pages = await Promise.race([
    captureBookPages(reader).catch(() => undefined),
    sceneUnavailable.then(() => undefined),
  ]);
  const valid = sceneAvailable && !sceneInvalidated && generation === sceneVersion && operation === transitionVersion;
  if (pages && valid) activeScene.setBookPageCanvases(pages);
  return valid;
}

setBackgroundInert(true);
el("loading").inert = false;
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
  if (!sceneAvailable) return;
  const generation = sceneVersion;
  if (state === "fog") {
    if (soundEnabled) void unlockAudio();
    state = "clearing";
    el<HTMLButtonElement>("enter").disabled = true;
    el("enter-label").textContent = "风正在经过…";
    el("fog").classList.add("cleared");
    try {
      await scene?.clearFog();
    } catch (error) {
      onSceneUnavailable(error);
      return;
    }
    if (!sceneAvailable || generation !== sceneVersion || state !== "clearing") return;
    state = "door";
    el("fog").classList.add("hidden");
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
  try {
    await scene?.enterRoom();
  } catch (error) {
    onSceneUnavailable(error);
    showFallback();
    return;
  }
  if (!sceneAvailable || generation !== sceneVersion) return;
  state = "room";
  step(1);
  el("intro").classList.add("hidden");
  el("room-ui").classList.remove("hidden");
  el("scene-hint").classList.remove("hidden");
  audioVolume();
}
el("enter").onclick = enter;
let renderedContent = "";
function renderPage() {
  const focused = document.activeElement instanceof HTMLElement && el("reader").contains(document.activeElement)
    ? document.activeElement : null;
  const c = chapters[page];
  // Reopening an unchanged chapter can reuse its existing image and canvas.
  // Compare the content too, so editing or replacing a chapter still updates it.
  const contentKey = JSON.stringify([page,chapters.length,c.date,c.subtitle,c.title,c.text,c.note,c.caption,c.scene,c.image]);
  if (contentKey !== renderedContent) {
    el("chapter-date").textContent = c.date;
    el("chapter-subtitle").textContent = c.subtitle;
    el("chapter-title").textContent = c.title;
    el("chapter-text").textContent = c.text;
    el("chapter-note").textContent = c.note;
    el("photo-caption").textContent = c.caption;
    const makeArtwork = () => {
      const art = artwork(c.scene);
      art.setAttribute("role", "img");
      art.setAttribute("aria-label", `${c.title}：${c.scene === "mountain" ? "层叠青山" : "海岸风景"}原创插画`);
      return art;
    };
    if (c.image) {
      const photo = new Image();
      photo.alt = c.caption;
      photo.decoding = "async";
      photo.onerror = () => {
        if (renderedContent === contentKey && photo.parentElement === el("art-holder"))
          el("art-holder").replaceChildren(makeArtwork());
      };
      photo.src = c.image;
      el("art-holder").replaceChildren(photo);
    } else el("art-holder").replaceChildren(makeArtwork());
    el("left-number").textContent = String(page * 2 + 1).padStart(2, "0");
    el("right-number").textContent = String(page * 2 + 2).padStart(2, "0");
    el("chapter-count").textContent =
      `${String(page + 1).padStart(2, "0")} / ${String(chapters.length).padStart(2, "0")} 章`;
    renderedContent = contentKey;
  }
  el<HTMLButtonElement>("prev").disabled = page === 0;
  el<HTMLButtonElement>("next").disabled = page === chapters.length - 1;
  const dots = el("chapter-dots");
  if (dots.childElementCount !== chapters.length) {
    dots.replaceChildren(...chapters.map((chapter,index) => {
      const button = document.createElement("button");
      button.dataset.page = String(index);
      button.setAttribute("aria-label",`跳到${chapter.date}`);
      button.onclick = () => void turn(index);
      return button;
    }));
  }
  dots.querySelectorAll<HTMLButtonElement>("button").forEach((button,index) => {
    button.classList.toggle("selected",index === page);
    button.setAttribute("aria-current",String(index === page));
  });
  if (focused && (!focused.isConnected || focused.matches(":disabled")))
    dots.querySelector<HTMLButtonElement>(`[data-page="${page}"]`)?.focus({preventScroll:true});
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
    const source = el("book").querySelector(forward ? ".page-right" : ".page-left")!;
    const clone = source.cloneNode(true) as HTMLElement;
    const originals = source.querySelectorAll("canvas");
    clone.querySelectorAll("canvas").forEach((canvas,index) => {
      canvas.getContext("2d")!.drawImage(originals[index],0,0);
    });
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
  if (changingView || (state !== "room" && state !== "fallback")) return;
  lastFocus = document.activeElement as HTMLElement;
  const operation = ++transitionVersion;
  const generation = sceneVersion;
  state = "opening";
  const reader = el("reader");
  reader.dataset.phase = "opening";
  reader.setAttribute("aria-busy", "true");
  reader.inert = true;
  setBackgroundInert(true);
  el("fallback").classList.add("hidden");
  el<HTMLButtonElement>("open-book").disabled = true;
  document.body.classList.add("book-transition");
  step(2);
  el("room-ui").classList.add("hidden");
  el("scene-hint").classList.add("hidden");
  renderPage();
  readingScene = sceneAvailable ? scene : undefined;
  el("close-book").innerHTML = `${readingScene ? "回到房间" : "返回纪念册入口"} ${svg("close")}`;
  reader.classList.add("is-preparing");
  reader.classList.remove("hidden");
  el("book").scrollTop = 0;
  document.body.classList.add("reading");
  let journey: ReturnType<typeof createReaderJourney> | undefined;
  try {
    if (readingScene) {
      const activeScene = readingScene;
      activeScene.setBookChapter(page);
      const paperReady = (async () => {
        if (!await prepareScenePaper(reader,activeScene,generation,operation)) return;
        if (!sceneAvailable || generation !== sceneVersion || operation !== transitionVersion) return;
        journey = createReaderJourney(reader, true);
        journey.update({progress:0,projection:activeScene.getBookProjection()});
        reader.classList.remove("is-preparing");
      })();
      await activeScene.openBook(frame => journey?.update(frame), paperReady);
      journey?.finish();
    } else {
      reader.classList.remove("is-preparing");
      await transitionReader(reader, undefined, true, reduceMotion);
    }
  } catch (error) {
    onSceneUnavailable(error);
    journey?.finish();
    reader.classList.remove("is-preparing");
    // The room can fail at any point, while the current chapter stays readable.
    await transitionReader(reader, undefined, true, reduceMotion);
  }
  if (operation !== transitionVersion) return;
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
  const operation = ++transitionVersion;
  const generation = sceneVersion;
  const activeScene = sceneAvailable ? readingScene : undefined;
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
  let journey: ReturnType<typeof createReaderJourney> | undefined;
  try {
    if (activeScene) {
      activeScene.setBookChapter(page);
      if (!await prepareScenePaper(reader,activeScene,generation,operation)) throw new SceneUnavailableError();
      if (!sceneAvailable || generation !== sceneVersion || operation !== transitionVersion) throw new SceneUnavailableError();
      journey = createReaderJourney(reader, false);
      journey.update({progress:0,projection:activeScene.getBookProjection()});
      await activeScene.returnToRoom(frame => journey?.update(frame));
      journey.finish();
    } else await transitionReader(reader, undefined, false, reduceMotion);
  } catch (error) {
    onSceneUnavailable(error);
    journey?.finish();
    if (!reader.classList.contains("hidden")) await transitionReader(reader,undefined,false,reduceMotion);
  }
  if (operation !== transitionVersion) return;
  document.body.classList.remove("reading", "book-transition");
  readingScene = undefined;
  reader.dataset.phase = "closed";
  reader.setAttribute("aria-busy", "false");
  reader.inert = false;
  setBackgroundInert(false);
  el<HTMLButtonElement>("open-book").disabled = false;
  if (!sceneAvailable) {
    showFallback();
    return;
  }
  state = "room";
  el("room-ui").classList.remove("hidden");
  const cozyFocused = scene?.isCozyFocused?.() ?? false;
  el("cozy-view").setAttribute("aria-pressed",String(cozyFocused));
  el("cozy-credit").classList.toggle("hidden",!cozyFocused);
  el("cozy-view").innerHTML = cozyFocused ? '看回书桌 <span aria-hidden="true">↗</span>' : '看看睡着的小猫 <span aria-hidden="true">↖</span>';
  el("open-book").innerHTML = '继续翻阅纪念册 <span class="button-arrow">↗</span>';
  el("scene-hint").innerHTML = '<span class="pulse-dot"></span> 点击桌上的画册，继续我们的故事';
  el("scene-hint").classList.remove("hidden");
  el("room-ui").querySelector("p")!.textContent = "花留在桌边，故事还在画册里。";
  step(1);
  (lastFocus?.isConnected && !lastFocus.closest("[inert],.hidden") ? lastFocus : el("open-book")).focus({preventScroll:true});
}
el("open-book").onclick = openBook;
el("cozy-view").onclick = async () => {
  if (state !== "room" || !sceneAvailable || changingView) return;
  changingView = true;
  const button = el<HTMLButtonElement>("cozy-view");
  const open = el<HTMLButtonElement>("open-book");
  button.disabled = open.disabled = true;
  try {
    const focused = await scene!.focusCozyCorner(button.getAttribute("aria-pressed") !== "true");
    button.setAttribute("aria-pressed", String(focused));
    el("cozy-credit").classList.toggle("hidden",!focused);
    button.innerHTML = focused ? '看回书桌 <span aria-hidden="true">↗</span>' : '看看睡着的小猫 <span aria-hidden="true">↖</span>';
  } catch (error) {
    onSceneUnavailable(error);
  } finally {
    changingView = false;
    button.disabled = open.disabled = false;
  }
};
el("fallback-read").onclick = openBook;
el("reload-scene").onclick = () => window.location.reload();
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
let swipe: {identifier:number;x:number;y:number} | undefined;
el("book").addEventListener("touchstart",e => {
  if (state !== "reading" || e.touches.length !== 1) {
    swipe = undefined;
    return;
  }
  const touch = e.touches[0];
  swipe = {identifier:touch.identifier,x:touch.clientX,y:touch.clientY};
},{passive:true});
el("book").addEventListener("touchmove",e => {
  if (e.touches.length !== 1) swipe = undefined;
},{passive:true});
el("book").addEventListener("touchend",e => {
  const start = swipe;
  swipe = undefined;
  if (!start || e.touches.length) return;
  const touch = Array.from(e.changedTouches).find(item => item.identifier === start.identifier);
  if (!touch) return;
  const dx = touch.clientX-start.x, dy = touch.clientY-start.y;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)*1.25)
    void turn(page+(dx < 0 ? 1 : -1));
},{passive:true});
el("book").addEventListener("touchcancel",() => { swipe = undefined; },{passive:true});
let lowQuality = false;
el("quality").onclick = () => {
  lowQuality = !lowQuality;
  if (sceneAvailable) scene?.setQuality(lowQuality);
  el("quality").textContent = lowQuality ? "画质 · 省电" : "画质 · 自适应";
};
document.querySelector(".brand")!.addEventListener("click", (e) => {
  e.preventDefault();
  if (state === "reading" || state === "room" || state === "fallback") window.location.reload();
});
try {
  const generation = sceneVersion;
  scene = createScene(
    el("world"),
    () => {
      if (state === "room") void openBook();
      else if (state === "door" || state === "fog") void enter();
    },
    reduceMotion,
    () => onSceneUnavailable(),
  );
  scene.ready
    .then(() => {
      if (sceneInvalidated || generation !== sceneVersion) return;
      sceneAvailable = true;
      el("loading").classList.add("hidden");
      setBackgroundInert(false);
    })
    .catch(onSceneUnavailable);
} catch (error) {
  onSceneUnavailable(error);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    void audio?.suspend();
  } else if (soundEnabled) void audio?.resume();
});
