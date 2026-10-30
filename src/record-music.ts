export type RecordMusicState = {
  status: "empty" | "paused" | "loading" | "playing" | "error";
  title: string;
  error?: string;
};

/** A streaming music element, separate from the already prepared room effects. */
export function createRecordMusic(
  onChange: (state: RecordMusicState) => void,
  createAudio: () => HTMLAudioElement = () => new Audio(),
) {
  const audio = createAudio();
  audio.preload = "none";
  audio.autoplay = false;
  audio.loop = false;
  audio.volume = .55;
  let state: RecordMusicState = { status: "empty", title: "" };
  let source = "", attached = false, wanted = false, visible = true, disposed = false, version = 0;

  function publish(status: RecordMusicState["status"], error?: string) {
    if (disposed || (state.status === status && state.error === error)) return;
    state = { status, title: state.title, ...(error ? { error } : {}) };
    onChange({ ...state });
  }
  function currentResource() {
    // A resource-selection event queued for the previous source cannot change
    // the new record while the browser is still switching its currentSrc.
    return attached && !!source && (!audio.currentSrc || audio.currentSrc === audio.src);
  }
  function pause() {
    if (disposed) return;
    wanted = false;
    ++version;
    audio.pause();
    if (source && state.status !== "error") publish("paused");
  }
  function failed(message: string) {
    wanted = false;
    ++version;
    // Publish first so a synchronous pause event cannot erase the error.
    publish("error", message);
    audio.pause();
  }
  const events: [string, EventListener][] = [
    ["playing", () => {
      if (disposed || !wanted || !visible) { audio.pause(); return; }
      if (currentResource() && !audio.paused) publish("playing");
    }],
    ["waiting", () => {
      if (!disposed && wanted && visible && currentResource() && !audio.paused) publish("loading");
    }],
    ["pause", () => {
      if (disposed || !audio.paused || !currentResource()) return;
      wanted = false;
      ++version;
      if (state.status !== "error") publish("paused");
    }],
    ["ended", () => {
      if (disposed || !currentResource() || !audio.ended) return;
      wanted = false;
      ++version;
      publish("paused");
    }],
    ["error", () => {
      if (!disposed && currentResource() && audio.error)
        failed("这张唱片暂时无法播放，请重新放入音频文件。");
    }],
  ];
  for (const [name, listener] of events) audio.addEventListener(name, listener);

  return {
    load(nextSource: string, title: string, options: { deferSource?: boolean } = {}) {
      if (disposed) return;
      const trimmedSource = nextSource.trim();
      if (trimmedSource === source && title === state.title && state.status !== "error") return;
      wanted = false;
      ++version;
      source = "";
      attached = false;
      audio.pause();
      state = { status: "empty", title };
      source = trimmedSource;
      if (source && !options.deferSource) { audio.src = source; attached = true; }
      else audio.removeAttribute("src");
      audio.load();
      state = { status: source ? "paused" : "empty", title };
      onChange({ ...state });
    },
    async toggle() {
      if (disposed || !source || !visible) return;
      if (wanted || !audio.paused) { pause(); return; }
      const operation = ++version;
      wanted = true;
      publish("loading");
      try {
        // preload="none" alone still permits a browser to request metadata.
        // The bundled record has no native source until this trusted gesture.
        if (!attached) { audio.src = source; attached = true; audio.load(); }
        if (audio.ended) audio.currentTime = 0;
        // Keep play() in this native click/touch task. Awaiting preparation
        // first would lose user activation on mobile browsers.
        await audio.play();
        if (operation !== version || disposed) {
          if (disposed || !wanted || !visible) audio.pause();
          return;
        }
        if (!wanted || !visible) { pause(); return; }
        publish(audio.paused ? "paused" : "playing");
      } catch (error) {
        if (operation !== version || disposed) return;
        if ((error as { name?: string })?.name === "AbortError") pause();
        else failed((error as { name?: string })?.name === "NotAllowedError"
          ? "请再轻触唱片机，开始播放。"
          : "这张唱片暂时无法播放，请重新放入音频文件。");
      }
    },
    pause,
    setMuted(muted: boolean) { if (!disposed) audio.muted = muted; },
    setPageVisible(nextVisible: boolean) {
      if (disposed) return;
      visible = nextVisible;
      if (!visible) pause();
    },
    getState(): RecordMusicState { return { ...state }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      wanted = false;
      source = "";
      attached = false;
      ++version;
      for (const [name, listener] of events) audio.removeEventListener(name, listener);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      state = { status: "empty", title: "" };
    },
  };
}
