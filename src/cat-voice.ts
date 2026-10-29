import voiceUrl from "./assets/cat-purr.mp3";

/** One prepared purr-then-meow recording sharing the room's audio context. */
export function createCatVoice(context: AudioContext) {
  const controller = new AbortController();
  let buffer: AudioBuffer | null = null;
  let enabled = true, disposed = false;
  type Voice = { source: AudioBufferSourceNode; gain: GainNode; stopping: boolean; released: boolean };
  let active: Voice | null = null;

  function release(voice: Voice) {
    if (voice.released) return;
    voice.released = true;
    voice.source.onended = null;
    try { voice.source.disconnect(); } catch { /* A closed context has no graph. */ }
    try { voice.gain.disconnect(); } catch { /* A closed context has no graph. */ }
    if (active === voice) active = null;
  }
  function stopImmediately() {
    const voice = active;
    if (!voice) return;
    try { voice.source.stop(); } catch { /* It may already have ended. */ }
    release(voice);
  }
  function stop() {
    const voice = active;
    if (!voice) return;
    // Stopping the shared recording also cancels its trailing meow; nothing
    // can resume later when the page becomes visible or sound is re-enabled.
    if (context.state !== "running" || (typeof document !== "undefined" && document.hidden)) {
      stopImmediately();
      return;
    }
    if (voice.stopping) return;
    voice.stopping = true;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + .06);
    try { voice.source.stop(now + .07); } catch { release(voice); }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    enabled = false;
    buffer = null;
    controller.abort();
    stopImmediately();
    context.removeEventListener("statechange", stateChanged);
  }
  function stateChanged() {
    if (context.state === "closed") dispose();
    else if (context.state !== "running") stopImmediately();
  }
  context.addEventListener("statechange", stateChanged);

  // Decoding is allowed while suspended. Nothing starts here, and neither a
  // late success nor an optional download failure queues a future vocalization.
  const ready: Promise<void> = fetch(voiceUrl, { signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error(`Cat voice: HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then(data => {
      if (disposed || context.state === "closed") return null;
      return context.decodeAudioData(data);
    })
    .then(decoded => {
      if (!disposed && context.state !== "closed") buffer = decoded;
    })
    .catch(() => { /* The room and sea remain usable without this optional sound. */ });

  return {
    ready,
    play() {
      if (disposed || !enabled || !buffer || active || context.state !== "running") return false;
      let voice: Voice | undefined;
      try {
        const source = context.createBufferSource(), gain = context.createGain();
        const currentVoice: Voice = { source, gain, stopping: false, released: false };
        voice = currentVoice;
        const now = context.currentTime, duration = buffer.duration;
        source.buffer = buffer;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(.5, now + Math.min(.045, duration / 4));
        gain.gain.setValueAtTime(.5, now + Math.max(duration / 4, duration - .15));
        gain.gain.linearRampToValueAtTime(0, now + duration);
        source.connect(gain); gain.connect(context.destination);
        source.onended = () => release(currentVoice);
        active = currentVoice;
        source.start(now);
        return true;
      } catch {
        if (voice) release(voice);
        return false;
      }
    },
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) stop();
    },
    stop,
    dispose,
  };
}
