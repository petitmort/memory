import type { WeatherState } from "./weather-controller";
import type { StormFrame } from "./storm-controller";

export type EnvironmentSoundFrame = { timestamp: number; weather: WeatherState; storm: StormFrame; active: boolean };
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** A strike must actually be observed; resume/seek/unmute never replays missed thunder. */
export function createThunderGate() {
  let previous: number | undefined, observed: string | null = null, played: string | null = null;
  return {
    update(frame: EnvironmentSoundFrame, enabled: boolean): boolean {
      const before = previous; previous = frame.timestamp;
      if (!enabled || !frame.active || before === undefined || frame.timestamp < before || frame.timestamp - before > 2000) {
        observed = null; return false;
      }
      const storm = frame.storm;
      if (storm.eventId && before < storm.strikeTime && frame.timestamp >= storm.strikeTime) observed = storm.eventId;
      if (!storm.eventId || observed !== storm.eventId || played === storm.eventId || frame.timestamp < storm.thunderTime
        || before >= storm.thunderTime || frame.timestamp - storm.thunderTime > 250) return false;
      played = storm.eventId; return true;
    },
    reset() { previous = undefined; observed = null; },
  };
}

/** Shared noise buffer and the room's existing device; no network audio or timer. */
export function createWeatherSoundscape(context: BaseAudioContext, buffer: AudioBuffer) {
  const nodes: AudioNode[] = [], sources: AudioBufferSourceNode[] = [], offsets: number[] = [];
  const own = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };
  const release = () => {
    for (const source of sources) { try { source.stop(); } catch { /* Unstarted, ended or closed. */ } }
    for (const node of nodes) { try { node.disconnect(); } catch { /* Release the remaining partial graph too. */ } }
    sources.length = nodes.length = offsets.length = 0;
  };
  const gate = createThunderGate();
  let disposed = false, audible = false, playingMusic = false, inRoom = false, updates = 0, thunders = 0;
  let targetRain = 0, targetWind = 0, lastMix = -Infinity;
  const loop = (filters: readonly [BiquadFilterType, number][], offset: number) => {
    // Track every allocation before a property assignment or connection can fail.
    const source = own(context.createBufferSource()); sources.push(source); offsets.push(offset);
    source.buffer = buffer; source.loop = true;
    let previous: AudioNode = source;
    for (const [type, frequency] of filters) {
      const filter = own(context.createBiquadFilter()); filter.type = type; filter.frequency.value = frequency; filter.Q.value = .55;
      previous.connect(filter); previous = filter;
    }
    const gain = own(context.createGain()); gain.gain.value = 0; previous.connect(gain);
    return gain;
  };
  let master: GainNode, rain: GainNode, wind: GainNode, thunder: GainNode, pan: StereoPannerNode;
  try {
    master = own(context.createGain()); master.gain.value = 0; master.connect(context.destination);
    rain = loop([["highpass", 650], ["lowpass", 5600]], 1.3);
    wind = loop([["lowpass", 380]], 3.7);
    thunder = loop([["lowpass", 180]], 5.1);
    rain.connect(master); wind.connect(master);
    pan = own(context.createStereoPanner()); thunder.connect(pan); pan.connect(master);
    // Optional device features must succeed before any source becomes live.
    const start = context.currentTime;
    for (let index = 0; index < sources.length; index++) sources[index].start(start, offsets[index] % buffer.duration);
  } catch (error) {
    release();
    throw error;
  }
  const target = (parameter: AudioParam, value: number, seconds: number) => {
    parameter.cancelScheduledValues(context.currentTime); parameter.setTargetAtTime(value, context.currentTime, seconds);
  };
  function quietThunder() { target(thunder.gain, 0, .035); gate.reset(); }
  return {
    setContext(enabled: boolean, music: boolean, room: boolean) {
      if (disposed) return;
      const changed = enabled !== audible || music !== playingMusic || room !== inRoom;
      audible = enabled; playingMusic = music; inRoom = room;
      if (changed) target(master.gain, enabled ? (music ? .075 : room ? .16 : .09) : 0, enabled ? .7 : .045);
      if (!enabled || !room) quietThunder();
    },
    update(frame: EnvironmentSoundFrame) {
      if (disposed) return;
      updates++;
      // AudioParams smooth the low-frequency control samples; no audio-rate JS loop.
      if (Math.abs(frame.timestamp - lastMix) >= 100) {
        lastMix = frame.timestamp;
        const wet = frame.weather.precipitation * (1 - frame.weather.snow);
        const gust = .88 + .08 * Math.sin(frame.timestamp / 4300) + .04 * Math.sin(frame.timestamp / 1700);
        targetRain = Math.pow(clamp(wet), .8) * .85;
        targetWind = Math.pow(clamp((frame.weather.windSpeed - 1.5) / 12), 1.3) * .6 * gust;
        target(rain.gain, targetRain, .65); target(wind.gain, targetWind, 1.1);
      }
      if (gate.update(frame, audible && inRoom && context.state === "running")) {
        thunders++;
        const now = context.currentTime, strength = .5 + frame.storm.energy * .45;
        pan.pan.setValueAtTime(Math.sin(frame.storm.direction) * .45, now);
        thunder.gain.cancelScheduledValues(now);
        thunder.gain.setValueAtTime(0, now);
        thunder.gain.linearRampToValueAtTime(strength, now + .12);
        thunder.gain.exponentialRampToValueAtTime(Math.max(.001, strength * .35), now + 1.4);
        thunder.gain.linearRampToValueAtTime(strength * .42, now + 2.1);
        thunder.gain.exponentialRampToValueAtTime(.001, now + 6.5);
        thunder.gain.linearRampToValueAtTime(0, now + 7);
      }
    },
    snapshot() { return { audible, inRoom, playingMusic, targetRain, targetWind, updates, thunders, sources: sources.length, disposed }; },
    dispose() {
      if (disposed) return;
      disposed = true; gate.reset();
      release();
    },
  };
}
