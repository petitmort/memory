import "./sound.css";
import { prepareAmbientNoise } from "./ambient-audio";
import { createCatVoice } from "./cat-voice";
import { CAT_REACTION_DURATION } from "./cat-choreography";
import { createRecordMusic, type RecordMusicState } from "./record-music";
import { createRecordStorage } from "./record-storage";

type SoundOptions = {
  getState: () => string;
  getSceneAvailable: () => boolean;
  onRecordPlaying: (playing: boolean) => void;
  toast: (message: string) => void;
};

const icons = {
  sound: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M8 6a7 7 0 0 0-3 6m11 6a7 7 0 0 0 3-6"/>',
  play: '<path d="m9 5 10 7-10 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
};
const svg = (name: keyof typeof icons) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const statusLabels: Record<RecordMusicState["status"], string> = {
  empty: "未选择音乐", loading: "加载中", playing: "播放中", paused: "已暂停", error: "播放失败",
};
const defaultRecord = {
  title: "Merry Christmas Mr. Lawrence — 坂本龍一",
  source: new URL("./assets/default-record.mp3", import.meta.url).href,
};

/** The room's single effects device and native music player, with one lifecycle. */
export function createSoundController(options: SoundOptions) {
  const { toast } = options;
  const events = new AbortController();
  const listen = (target: EventTarget, type: string, listener: EventListener) =>
    target.addEventListener(type, listener, { signal: events.signal });
  let disposed = false, soundEnabled = true, audioUnlocked = false;
  let audio: AudioContext | undefined, gain: GainNode | undefined;
  let audioPreparation: Promise<void> | undefined;
  let catVoice: ReturnType<typeof createCatVoice> | undefined;
  const nodes: AudioNode[] = [], sources: AudioScheduledSourceNode[] = [];
  let recordState: RecordMusicState = { status: "empty", title: "我的音乐" };
  let recordObjectUrl: string | undefined, recordSelectionVersion = 0;
  let restoreAllowed = true, customRecord = false;
  let petHintTimer: number | undefined;
  const storage = createRecordStorage();

  // Filename and state share one row, leaving small-screen object hotspots clear.
  const row = document.createElement("div");
  row.className = "record-music-row";
  const visibleStatus = document.createElement("span");
  visibleStatus.id = "record-state";
  const emptyNote = document.createElement("span");
  emptyNote.className = "record-empty-note";
  emptyNote.textContent = "可只听海浪";
  el("record-track").before(row);
  row.append(el("record-track"), visibleStatus, emptyNote);
  // More explanation appears only while choosing music or recovering an error.
  const panel = document.createElement("div");
  panel.id = "record-panel";
  panel.className = "record-panel hidden";
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "唱片机");
  panel.innerHTML = `<div class="record-panel-content"><span class="record-panel-heading">桌上的唱片机</span><button type="button" class="record-panel-close" id="record-panel-close" aria-label="收起唱片机说明">×</button><span class="record-description" id="record-description">也可以只听海浪。</span><button type="button" class="record-panel-action" id="record-panel-toggle">播放唱片</button><button type="button" class="record-panel-action hidden" id="restore-record">恢复默认唱片</button><span class="record-storage-note">默认唱片随房间提供；你更换的音乐仅保存在当前浏览器。清除网站数据后会恢复默认唱片。</span></div>`;
  row.append(panel);
  const recordMusic = createRecordMusic(onRecordState);
  recordMusic.load(defaultRecord.source, defaultRecord.title, { deferSource: true });
  updateSoundControl();

  function updateSoundControl() {
    const button = el<HTMLButtonElement>("sound");
    button.innerHTML = svg(soundEnabled ? "sound" : "mute");
    button.setAttribute("aria-label", soundEnabled ? "关闭声音" : "开启声音");
    button.setAttribute("aria-pressed", String(soundEnabled));
    button.title = soundEnabled ? "关闭声音" : "开启声音";
    updateVisibleStatus();
  }
  function updateVisibleStatus() {
    el("record-state").textContent = `${statusLabels[recordState.status]}${!soundEnabled && recordState.status !== "empty" ? " · 静音" : ""}`;
    panel.dataset.status = recordState.status;
    row.dataset.status = recordState.status;
    emptyNote.classList.toggle("hidden", recordState.status !== "empty" && (customRecord || recordState.status !== "paused"));
    el("restore-record").classList.toggle("hidden", !customRecord);
  }
  function updateContext() {
    if (disposed) return;
    const state = options.getState(), available = options.getSceneAvailable();
    catVoice?.setEnabled(soundEnabled && available && state === "room" && !document.hidden);
    recordMusic.setMuted(!soundEnabled);
    if (!available && (recordState.status === "playing" || recordState.status === "loading")) recordMusic.pause();
    if (state !== "room") panel.classList.add("hidden");
    if (!audio || !gain || audio.state === "closed") return;
    gain.gain.cancelScheduledValues(audio.currentTime);
    gain.gain.setTargetAtTime(
      soundEnabled && available && ["room", "opening", "reading", "closing"].includes(state)
        ? (recordState.status === "playing" ? .032 : .065) : 0,
      audio.currentTime, 1.2,
    );
  }
  function onRecordState(next: RecordMusicState) {
    if (disposed) return;
    recordState = next;
    const playing = next.status === "playing";
    const pending = playing || next.status === "loading";
    const action = next.status === "empty" ? "上传音乐" : pending ? "暂停唱片" : "播放唱片";
    const button = el<HTMLButtonElement>("record-toggle");
    button.innerHTML = svg(next.status === "empty" ? "record" : pending ? "pause" : "play");
    button.setAttribute("aria-label", action);
    button.setAttribute("aria-pressed", String(pending));
    button.title = next.status === "empty" ? "上传音乐，选择你喜欢的本地音频" : `${action} · ${next.title}`;
    el("choose-record").textContent = next.status === "empty" ? "上传音乐" : "更换音乐";
    el("choose-record").title = next.status === "empty" ? "选择本地音频，自动保存在此浏览器" : next.title;
    el("record-track").textContent = next.title;
    el("record-track").title = next.title;
    el("record-track").classList.toggle("hidden", next.status === "empty");
    el("record-status").textContent = next.error ?? (next.status === "empty"
      ? "上传一首你喜欢的音乐，轻触唱片机播放。"
      : `${next.title} · ${playing ? "播放中" : next.status === "loading" ? "正在落针" : "已暂停"}`);
    el("record-panel-toggle").textContent = next.status === "error" ? "重试播放" : action;
    el("record-description").textContent = next.error ?? (next.status === "empty"
      ? "不放唱片，也可以只听海浪。"
      : next.status === "loading" ? "正在落针，音乐就要响起。"
      : `${next.title} · ${playing ? "轻触唱片机可暂停" : "轻触唱片机继续播放"}`);
    updateVisibleStatus();
    options.onRecordPlaying(playing);
    updateContext();
    if (next.error) { panel.classList.toggle("hidden", options.getState() !== "room"); toast(next.error); }
  }
  function chooseRecord() {
    if (disposed || !["room", "fallback"].includes(options.getState())) return;
    restoreAllowed = false;
    panel.classList.remove("hidden");
    const input = el<HTMLInputElement>("record-file");
    input.value = "";
    input.click();
  }
  function onRecord() {
    if (disposed || options.getState() !== "room") return;
    restoreAllowed = false;
    if (recordState.status === "empty") chooseRecord();
    else void recordMusic.toggle();
  }
  function loadRecordFile(file: File) {
    const previous = recordObjectUrl;
    recordObjectUrl = URL.createObjectURL(file);
    customRecord = true;
    const title = file.name.replace(/\.[^.]+$/, "").trim() || "我的音乐";
    recordMusic.load(recordObjectUrl, title);
    if (previous) URL.revokeObjectURL(previous);
  }
  function fileChanged() {
    const file = el<HTMLInputElement>("record-file").files?.[0];
    if (!file || disposed || options.getState() !== "room") return;
    if (!file.size) { toast("这份音频是空的，请换一份文件。"); return; }
    const selection = ++recordSelectionVersion;
    restoreAllowed = false;
    loadRecordFile(file);
    panel.classList.add("hidden");
    // Keep native play inside the file-selection gesture; storage runs separately.
    void recordMusic.toggle();
    void storage.save(file).then(() => {
      if (!disposed && selection === recordSelectionVersion)
        toast("音乐已保存到此浏览器，下次无需重新上传。");
    }).catch(() => {
      if (!disposed && selection === recordSelectionVersion)
        toast("这首音乐暂未保存，本次仍可播放；请检查浏览器存储空间。");
    });
  }
  void storage.read().then(file => {
    if (file && !disposed && restoreAllowed && recordSelectionVersion === 0) loadRecordFile(file);
  }).catch(() => { /* Local playback remains available when storage is blocked. */ });

  function restoreDefaultRecord() {
    if (disposed || options.getState() !== "room") return;
    const selection = ++recordSelectionVersion;
    restoreAllowed = false;
    customRecord = false;
    const previous = recordObjectUrl;
    recordObjectUrl = undefined;
    recordMusic.load(defaultRecord.source, defaultRecord.title, { deferSource: true });
    if (previous) URL.revokeObjectURL(previous);
    panel.classList.add("hidden");
    void recordMusic.toggle();
    void storage.clear().then(() => {
      if (!disposed && selection === recordSelectionVersion) toast("已换回默认唱片。");
    }).catch(() => {
      if (!disposed && selection === recordSelectionVersion) toast("本次已换回默认唱片，但暂未记住这个选择。");
    });
  }

  function prepare() {
    // Optional Web Audio support must never decide whether the 3D room works.
    try { prepareEffects(); }
    catch {
      catVoice?.dispose(); catVoice = undefined;
      for (const node of nodes) { try { node.disconnect(); } catch { /* Partial setup. */ } }
      nodes.length = sources.length = 0;
      const partial = audio;
      audio = undefined; gain = undefined; audioPreparation = undefined;
      if (partial && partial.state !== "closed") void partial.close().catch(() => {});
    }
  }
  function prepareEffects() {
    if (disposed || audio || !soundEnabled) return;
    const context = new AudioContext();
    audio = context;
    const destination = context.createGain();
    gain = destination;
    destination.gain.value = 0;
    destination.connect(context.destination);
    nodes.push(destination);
    const suspended = context.suspend();
    catVoice = createCatVoice(context);
    catVoice.setEnabled(false);
    audioPreparation = Promise.all([prepareAmbientNoise(context), suspended]).then(([buffer]) => {
      if (disposed || context.state === "closed") throw new DOMException("Audio preparation stopped", "AbortError");
      const source = context.createBufferSource(), filter = context.createBiquadFilter();
      source.buffer = buffer;
      source.loop = true;
      filter.type = "lowpass";
      filter.frequency.value = 650;
      source.connect(filter);
      filter.connect(destination);
      nodes.push(source, filter); sources.push(source);
      source.start();
      const lfo = context.createOscillator(), depth = context.createGain();
      lfo.frequency.value = .09;
      depth.gain.value = 240;
      lfo.connect(depth);
      depth.connect(filter.frequency);
      nodes.push(lfo, depth); sources.push(lfo);
      lfo.start();
    });
    void audioPreparation.catch(() => {});
  }
  async function unlock() {
    if (disposed || !soundEnabled) return;
    try {
      prepare();
      const context = audio!;
      const resumed = context.resume().then(() => { if (!disposed) audioUnlocked = true; });
      await Promise.all([resumed, audioPreparation]);
      updateContext();
    } catch {
      if (disposed) return;
      toast("此浏览器暂时无法播放环境声");
      audioUnlocked = false;
      catVoice?.setEnabled(false);
    }
  }
  function stopCat() {
    catVoice?.stop();
  }
  function onCatPet(): (() => number) | undefined {
    if (disposed) return;
    el("pet-hint").textContent = "小猫舒服地蹭了蹭";
    el<HTMLButtonElement>("pet-cat").disabled = true;
    el("pet-cat").dataset.busy = "true";
    window.clearTimeout(petHintTimer);
    petHintTimer = window.setTimeout(() => {
      el("pet-hint").textContent = "轻触或轻划小猫";
      delete el("pet-cat").dataset.busy;
      if (!disposed && options.getState() === "room" && options.getSceneAvailable())
        el<HTMLButtonElement>("pet-cat").disabled = false;
    }, (CAT_REACTION_DURATION + .2) * 1000);
    if (!soundEnabled || options.getState() !== "room" || !options.getSceneAvailable()) return;
    try {
      prepare();
      if (audio?.state === "running" && catVoice?.play()) return catVoice.captureClock();
      if (audio?.state !== "running") void unlock();
    } catch { /* A silent cat reaction remains available. */ }
  }
  async function toggleSound() {
    if (disposed) return;
    soundEnabled = !soundEnabled;
    updateSoundControl();
    updateContext();
    if (!soundEnabled) { toast("声音已关闭，音乐保留当前播放进度。"); return; }
    await unlock();
    if (disposed || !soundEnabled || !audioUnlocked) return;
    toast(["fog", "clearing", "door", "entering"].includes(options.getState())
      ? "海浪声将在进入房间后响起" : "声音已开启");
  }
  function visibilityChanged() {
    if (disposed) return;
    recordMusic.setPageVisible(!document.hidden);
    if (document.hidden) {
      updateContext(); stopCat(); panel.classList.add("hidden");
      void audio?.suspend().catch(() => {});
    } else {
      updateContext();
      if (soundEnabled && audioUnlocked) void audio?.resume().catch(() => {
        audioUnlocked = false;
        catVoice?.setEnabled(false);
      });
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    ++recordSelectionVersion;
    events.abort();
    window.clearTimeout(petHintTimer);
    delete el("pet-cat").dataset.busy;
    recordMusic.dispose();
    catVoice?.dispose();
    if (recordObjectUrl) URL.revokeObjectURL(recordObjectUrl);
    recordObjectUrl = undefined;
    for (const source of sources) { try { source.stop(); } catch { /* Already ended. */ } }
    for (const node of nodes) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
    sources.length = nodes.length = 0;
    if (audio && audio.state !== "closed") void audio.close().catch(() => {});
    row.before(el("record-track"));
    row.remove();
  }
  listen(el("record-toggle"), "click", onRecord);
  listen(el("choose-record"), "click", chooseRecord);
  listen(el("record-file"), "change", fileChanged);
  listen(el("record-panel-toggle"), "click", onRecord);
  listen(el("restore-record"), "click", restoreDefaultRecord);
  listen(el("record-panel-close"), "click", () => {
    panel.classList.add("hidden");
    el("choose-record").focus({ preventScroll: true });
  });
  listen(el("sound"), "click", () => { void toggleSound(); });
  listen(document, "keydown", event => {
    if ((event as KeyboardEvent).key === "Escape" && !panel.classList.contains("hidden")) {
      event.preventDefault(); event.stopPropagation();
      panel.classList.add("hidden");
      el("choose-record").focus({ preventScroll: true });
    }
  });
  listen(document, "pointerdown", event => {
    if (event.target instanceof Node && !panel.contains(event.target)) panel.classList.add("hidden");
  });
  listen(document, "visibilitychange", visibilityChanged);
  listen(window, "pagehide", event => {
    recordMusic.setPageVisible(false); stopCat();
    if (!(event as PageTransitionEvent).persisted) dispose();
  });
  listen(window, "pageshow", () => { if (!disposed) recordMusic.setPageVisible(!document.hidden); });
  return { prepare, unlock, updateContext, onCatPet, stopCat, onRecord, dispose };
}
