import "./style.css";
import "./experience.css";
import { mountAppView, svg, byId as el } from "./app-view";
import { createRoomController } from "./room-controller";
import { createReaderController } from "./reader-controller";
import { createSoundController } from "./sound-controller";
import { createExplorationGuide } from "./exploration-guide";
import { createScene, SceneUnavailableError } from "./scene";
import { createReaderJourney, transitionReader } from "./reader-transition";
import { captureBookPages } from "./page-raster";


mountAppView();

const flow = createRoomController();
let lastFocus: HTMLElement | null = null;
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
let scene: ReturnType<typeof createScene> | undefined;
let sceneAvailable = false;
let readingScene: ReturnType<typeof createScene> | undefined;
let changingView = false;
let cozyViewRequested = false;
let catIntentVersion = 0;
let roomObservation: { remaining: number; startedAt: number; interacted: boolean; timer?: number } | undefined;
let inputRevealTimer: number | undefined;
const observationPointers = new Set<number>();

function pauseRoomObservation() {
  if (!roomObservation || roomObservation.timer === undefined) return;
  window.clearTimeout(roomObservation.timer);
  roomObservation.timer = undefined;
  roomObservation.remaining = Math.max(0, roomObservation.remaining - (performance.now() - roomObservation.startedAt));
}
function cancelRoomObservation() {
  if (roomObservation) window.clearTimeout(roomObservation.timer);
  window.clearTimeout(inputRevealTimer);
  inputRevealTimer = undefined;
  roomObservation = undefined;
  observationPointers.clear();
}
function finishRoomObservation(active = false) {
  if (!roomObservation) return;
  if (active) {
    roomObservation.interacted = true;
    exploration.dismiss();
  }
  if (document.hidden || (active && observationPointers.size > 0)) {
    pauseRoomObservation();
    return;
  }
  cancelRoomObservation();
  if (flow.disposed || !sceneAvailable || flow.getState() !== "room") return;
  el("room-ui").classList.toggle("room-arriving", !active && !reduceMotion);
  el("room-ui").classList.remove("hidden");
  syncControls();
}
function resumeRoomObservation() {
  if (!roomObservation || document.hidden || flow.disposed || roomObservation.timer !== undefined) return;
  roomObservation.startedAt = performance.now();
  roomObservation.timer = window.setTimeout(() => finishRoomObservation(), roomObservation.remaining);
}

function setBackgroundInert(value: boolean) {
  document.querySelectorAll<HTMLElement>("#world,.header,.footer,main > :not(#reader),#fallback")
    .forEach(element => { element.inert = value; });
}
function showFallback() {
  if (flow.disposed) return;
  cancelRoomObservation();
  flow.transition("fallback");
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
  sound.updateContext();
}
function onSceneUnavailable(error?: unknown) {
  if (!flow.invalidateScene()) return;
  cancelRoomObservation();
  sceneAvailable = false;
  sound.updateContext();
  readingScene = undefined;
  if (error && !(error instanceof SceneUnavailableError)) console.error(error);
  el("world").classList.add("hidden");
  el("loading").classList.add("hidden");
  el("intro").classList.add("hidden");
  el("door-caption").classList.add("hidden");
  el("fog").classList.add("hidden");
  el("close-book").innerHTML = `返回纪念册入口 ${svg("close")}`;
  // Active transitions handle their own cleanup before releasing the dialog.
  if (!["opening", "closing", "reading"].includes(flow.getState())) showFallback();
}

async function prepareScenePaper(reader: HTMLElement, activeScene: NonNullable<typeof scene>, generation: number, operation: number) {
  // Loss must release this wait even when an optional photograph is still loading.
  // The decode may finish later, but can no longer write into a newer journey.
  const pages = await Promise.race([
    captureBookPages(reader).catch(() => undefined),
    flow.sceneUnavailable.then(() => undefined),
  ]);
  const valid = sceneAvailable && !flow.sceneInvalidated && generation === flow.sceneVersion && operation === flow.transitionVersion;
  if (pages && valid) activeScene.setBookPageCanvases(pages);
  return valid;
}

setBackgroundInert(true);
el("loading").inert = false;
let toastTimer: number | undefined;
function toast(message: string) {
  el("toast").textContent = message;
  el("toast").classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el("toast").classList.remove("show"), 3200);
}
function step(n: number) {
  document.querySelectorAll("[data-step]").forEach((element, index) => element.classList.toggle("active", index <= n));
}
const sound = createSoundController({
  getState: () => flow.getState(),
  getSceneAvailable: () => sceneAvailable,
  onRecordPlaying: playing => {
    scene?.setRecordPlaying?.(playing);
    if (playing) scene?.markInteractionUsed?.("record");
  },
  toast,
});
let retryChapter = 0;
try {
  retryChapter = Number(sessionStorage.getItem("tideline-retry-chapter")) || 0;
  sessionStorage.removeItem("tideline-retry-chapter");
} catch {}
const readerController = createReaderController({
  canRead: () => flow.getState() === "reading",
  reducedMotion: reduceMotion,
  initialChapter: retryChapter,
  onClose: () => void closeBook(),
});
const exploration = createExplorationGuide();
function viewingCat() {
  return cozyViewRequested || (sceneAvailable && (scene?.isCozyFocused?.() ?? false));
}
function syncControls() {
  const inRoom = flow.getState() === "room" && !changingView;
  const catContext = viewingCat();
  for (const id of ["open-book", "cozy-view", "pet-cat", "choose-record", "record-toggle"])
    el<HTMLButtonElement>(id).disabled = !inRoom || (id === "open-book" && catContext) || (id === "pet-cat" && el(id).dataset.busy === "true");
  el("open-book").classList.toggle("hidden", catContext);
  // The single delayed invitation owns exploration text. Keep the legacy row
  // hidden so it cannot repeat the same instructions above the room buttons.
  el("scene-hint").classList.add("hidden");
  const interactive = !changingView && ["fog", "door", "room"].includes(flow.getState());
  scene?.setInteractionEnabled?.(interactive);
  if (!interactive) scene?.clearInteractionFeedback?.();
  if (!inRoom) exploration.hide();
  document.body.dataset.stage = flow.getState();
  el("enter").setAttribute("aria-busy", String(["clearing", "entering"].includes(flow.getState())));
  const status = changingView ? "视线正缓缓移向另一处…" : ({
    clearing: "风正在吹散迷雾…", entering: "轻轻推开门，走进房间…",
    opening: "把花留在桌边，慢慢翻开回忆…", closing: "合上画册，回到海风里…",
  } as Record<string, string>)[flow.getState()];
  el("journey-status").textContent = status ?? "";
  el("journey-status").classList.toggle("hidden", !status);
}
flow.subscribe(syncControls);
syncControls();
flow.own(() => exploration.dispose());
flow.own(() => readerController.dispose());
flow.own(() => sound.dispose());
flow.own(() => scene?.dispose());
flow.own(() => window.clearTimeout(toastTimer));
flow.own(cancelRoomObservation);
for (const id of ["room-ui", "scene-hint"]) el(id).addEventListener("animationend", event => {
  if (event.animationName === "room-arriving") el(id).classList.remove("room-arriving");
}, { signal: flow.signal });
window.addEventListener("pagehide", event => { if (!event.persisted) flow.dispose(); }, { signal: flow.signal });
document.addEventListener("visibilitychange", () => {
  // A paused approach may resume, but its pet must not play later on return.
  if (document.hidden) {
    ++catIntentVersion;
    pauseRoomObservation();
    window.clearTimeout(inputRevealTimer);
    inputRevealTimer = undefined;
    observationPointers.clear();
  } else if (roomObservation?.interacted) finishRoomObservation(true);
  else resumeRoomObservation();
}, { signal: flow.signal });
// Keep the original pointer target through the entire gesture. Inserting the
// room buttons on pointerdown could place a new control under its pointerup.
document.addEventListener("pointerdown", event => {
  if (!roomObservation || flow.getState() !== "room") return;
  window.clearTimeout(inputRevealTimer);
  inputRevealTimer = undefined;
  roomObservation.interacted = true;
  observationPointers.add(event.pointerId);
  pauseRoomObservation();
  exploration.dismiss();
}, { capture: true, passive: true, signal: flow.signal });
for (const type of ["pointerup", "pointercancel"] as const) document.addEventListener(type, event => {
  if (!roomObservation || !observationPointers.delete(event.pointerId) || observationPointers.size) return;
  inputRevealTimer = window.setTimeout(() => finishRoomObservation(true), 0);
}, { capture: true, passive: true, signal: flow.signal });
document.addEventListener("click", () => {
  if (roomObservation && flow.getState() === "room" && !observationPointers.size) finishRoomObservation(true);
}, { capture: true, signal: flow.signal });
document.addEventListener("keydown", () => {
  if (roomObservation && flow.getState() === "room") finishRoomObservation(true);
}, { capture: true, signal: flow.signal });
function updateCozyControls(focused: boolean) {
  cozyViewRequested = focused;
  el("cozy-view").setAttribute("aria-pressed",String(focused));
  el("pet-cat").classList.toggle("hidden",!focused);
  el("cozy-details").classList.toggle("hidden",!focused);
  el("cozy-view").innerHTML = focused ? '看回书桌 <span aria-hidden="true">↗</span>' : '看看睡着的小猫 <span aria-hidden="true">↖</span>';
}
el("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("当前浏览器不支持全屏，可直接继续体验");
  }
};
async function enter() {
  if (flow.disposed || !sceneAvailable) return;
  const generation = flow.sceneVersion;
  if (flow.getState() === "fog") {
    flow.transition("clearing");
    el<HTMLButtonElement>("enter").disabled = true;
    el("enter-label").textContent = "风正在经过…";
    el("fog").classList.add("cleared");
    try {
      const clearing = scene?.clearFog();
      void sound.unlock();
      await clearing;
    } catch (error) {
      onSceneUnavailable(error);
      return;
    }
    if (!sceneAvailable || generation !== flow.sceneVersion || flow.getState() !== "clearing") return;
    flow.transition("door");
    el("fog").classList.add("hidden");
    el<HTMLButtonElement>("enter").disabled = false;
    el("enter-label").textContent = "推开这扇门";
    el("enter").classList.add("door-ready");
    el("enter-note").textContent = "门的另一边，是一整个夏天";
    if (document.activeElement === document.body)
      el("enter").focus({ preventScroll: true });
    return;
  }
  if (flow.getState() !== "door") return;
  flow.transition("entering");
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
  if (!sceneAvailable || generation !== flow.sceneVersion) return;
  roomObservation = { remaining: 2000, startedAt: performance.now(), interacted: false };
  flow.transition("room");
  exploration.enterRoom();
  step(1);
  el("record-toggle").classList.remove("hidden");
  el("intro").classList.add("hidden");
  resumeRoomObservation();
  sound.updateContext();
}
el("enter").onclick = enter;
async function openBook() {
  if (flow.disposed || changingView || (sceneAvailable && viewingCat()) || (flow.getState() !== "room" && flow.getState() !== "fallback")) return;
  exploration.dismiss();
  finishRoomObservation(true);
  scene?.markInteractionUsed?.("book");
  scene?.markInteractionUsed?.("bouquet");
  el("room-ui").classList.remove("room-arriving");
  el("scene-hint").classList.remove("room-arriving");
  lastFocus = document.activeElement as HTMLElement;
  const operation = flow.beginTransition();
  const generation = flow.sceneVersion;
  flow.transition("opening");
  sound.updateContext();
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
  readerController.render();
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
      activeScene.setBookChapter(readerController.getChapter());
      const paperReady = (async () => {
        if (!await prepareScenePaper(reader,activeScene,generation,operation)) return;
        if (!sceneAvailable || generation !== flow.sceneVersion || operation !== flow.transitionVersion) return;
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
    journey?.finish();
    if (flow.disposed) return;
    onSceneUnavailable(error);
    reader.classList.remove("is-preparing");
    // The room can fail at any point, while the current chapter stays readable.
    await transitionReader(reader, undefined, true, reduceMotion);
  }
  if (operation !== flow.transitionVersion) return;
  flow.transition("reading");
  reader.dataset.phase = "ready";
  reader.setAttribute("aria-busy", "false");
  reader.inert = false;
  document.body.classList.remove("book-transition");
  reader.focus();
  sound.updateContext();
}
async function closeBook() {
  if (flow.disposed || flow.getState() !== "reading") return;
  const operation = flow.beginTransition();
  const generation = flow.sceneVersion;
  const activeScene = sceneAvailable ? readingScene : undefined;
  flow.transition("closing");
  readerController.cancelTurn();
  readerController.closeContents();
  const reader = el("reader");
  reader.dataset.phase = "closing";
  reader.setAttribute("aria-busy", "true");
  reader.inert = true;
  document.body.classList.add("book-transition");
  let journey: ReturnType<typeof createReaderJourney> | undefined;
  try {
    if (activeScene) {
      activeScene.setBookChapter(readerController.getChapter());
      if (!await prepareScenePaper(reader,activeScene,generation,operation)) throw new SceneUnavailableError();
      if (!sceneAvailable || generation !== flow.sceneVersion || operation !== flow.transitionVersion) throw new SceneUnavailableError();
      journey = createReaderJourney(reader, false);
      journey.update({progress:0,projection:activeScene.getBookProjection()});
      await activeScene.returnToRoom(frame => journey?.update(frame));
      journey.finish();
    } else await transitionReader(reader, undefined, false, reduceMotion);
  } catch (error) {
    journey?.finish();
    if (flow.disposed) return;
    onSceneUnavailable(error);
    if (!reader.classList.contains("hidden")) await transitionReader(reader,undefined,false,reduceMotion);
  }
  if (operation !== flow.transitionVersion) return;
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
  flow.transition("room");
  sound.updateContext();
  el("room-ui").classList.remove("hidden");
  const cozyFocused = scene?.isCozyFocused?.() ?? false;
  updateCozyControls(cozyFocused);
  el("open-book").innerHTML = '继续翻阅纪念册 <span class="button-arrow">↗</span>';
  el("room-ui").querySelector("p")!.textContent = "花留在桌边，故事还在画册里。";
  step(1);
  syncControls();
  (lastFocus?.isConnected && !lastFocus.closest("[inert],.hidden") ? lastFocus : el("open-book")).focus({preventScroll:true});
}
el("open-book").onclick = openBook;
async function changeCozyView(focus: boolean, petAfter = false) {
  if (flow.disposed || document.hidden || flow.getState() !== "room" || !sceneAvailable || changingView) return;
  exploration.dismiss();
  finishRoomObservation(true);
  const activeScene = scene!;
  const generation = flow.sceneVersion;
  const intent = ++catIntentVersion;
  let focused = false;
  cozyViewRequested = focus;
  changingView = true;
  syncControls();
  sound.stopCat();
  try {
    focused = await activeScene.focusCozyCorner(focus);
    if (!flow.disposed && sceneAvailable && generation === flow.sceneVersion)
      updateCozyControls(focused);
  } catch (error) {
    onSceneUnavailable(error);
  } finally {
    cozyViewRequested = focused;
    changingView = false;
    if (!flow.disposed) syncControls();
  }
  if (petAfter && focused && intent === catIntentVersion && !flow.disposed && !document.hidden &&
      sceneAvailable && generation === flow.sceneVersion && flow.getState() === "room")
    activeScene.petCat();
}
function requestCatPet() {
  if (flow.disposed || document.hidden || flow.getState() !== "room" || !sceneAvailable || changingView) return false;
  if (scene!.isCozyFocused()) return scene!.petCat();
  // Resume the prepared audio during the original gesture; sound starts only
  // after arrival, through the same pet/audio clock used by the nearby button.
  void sound.unlock();
  void changeCozyView(true, true);
  return true;
}
el("cozy-view").onclick = () => {
  void changeCozyView(el("cozy-view").getAttribute("aria-pressed") !== "true");
};
el("pet-cat").onclick = requestCatPet;
el("fallback-read").onclick = openBook;
el("reload-scene").onclick = () => {
  try { sessionStorage.setItem("tideline-retry-chapter", String(readerController.getChapter())); } catch {}
  window.location.reload();
};
el("close-book").onclick = () => void closeBook();
let lowQuality = false;
function updateQualityLabel(autoLow = false) {
  el("quality").textContent = lowQuality ? "画质 · 省电" : autoLow ? "画质 · 自适应省电" : "画质 · 自适应";
  el("quality").setAttribute("aria-pressed", String(lowQuality));
  el("quality").title = lowQuality ? "切换为自适应画质" : "切换为省电画质";
}
el("quality").onclick = () => {
  lowQuality = !lowQuality;
  if (sceneAvailable) scene?.setQuality(lowQuality);
  updateQualityLabel(scene?.getQuality?.().low);
  toast(lowQuality ? "已切换为省电画质" : "已恢复自适应画质");
};
document.querySelector(".brand")!.addEventListener("click", (e) => {
  e.preventDefault();
  if (flow.getState() === "reading" || flow.getState() === "room" || flow.getState() === "fallback") window.location.reload();
});
try {
  const generation = flow.sceneVersion;
  scene = createScene(
    el("world"),
    () => {
      if (flow.getState() === "room") void openBook();
      else if (flow.getState() === "door" || flow.getState() === "fog") void enter();
    },
    reduceMotion,
    () => onSceneUnavailable(),
    sound.onCatPet,
    sound.onRecord,
    low => updateQualityLabel(low),
    requestCatPet,
    visible => exploration.setFeedbackActive(visible),
    sound.updateEnvironment,
  );
  // Prepare alongside GPU loading, before continuous scene drawing starts.
  // Browsers requiring gesture-time construction retain the lazy fallback.
  sound.prepare();
  scene.ready
    .then(() => {
      if (flow.sceneInvalidated || generation !== flow.sceneVersion) return;
      sceneAvailable = true;
      el("loading").classList.add("hidden");
      setBackgroundInert(false);
      syncControls();
      updateQualityLabel(scene?.getQuality?.().low);
    })
    .catch(onSceneUnavailable);
} catch (error) {
  onSceneUnavailable(error);
}
