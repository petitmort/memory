export type DeviceHints = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  saveData?: boolean;
};

/** Rendering policy only: no timers, DOM reads, or work on a sleeping scene. */
export function createQualityPolicy(hints: DeviceHints = {}) {
  const memory = hints.deviceMemory && hints.deviceMemory > 0 ? hints.deviceMemory : undefined;
  const cores = hints.hardwareConcurrency && hints.hardwareConcurrency > 0 ? hints.hardwareConcurrency : undefined;
  const initialLow = hints.saveData === true || (memory !== undefined && memory <= 2)
    || (memory !== undefined && memory <= 4 && cores !== undefined && cores <= 2);
  let low = initialLow;
  let manual: boolean | undefined;
  let frames = 0, average = 1000 / 60, slow = 0, severeFrames = 0;

  function resetSamples() {
    frames = 0;
    average = 1000 / 60;
    slow = 0;
    severeFrames = 0;
  }

  return {
    initialLow,
    get low() { return low; },
    get manual() { return manual; },
    /** Explicit choices win over automatic adaptation until auto is restored. */
    setManual(value?: boolean) {
      manual = value;
      low = value ?? initialLow;
      resetSamples();
    },
    resetSamples,
    /** Call for an actual drawn frame; return true only on a new downgrade. */
    sample(deltaMs: number, options: { eligible?: boolean } = {}) {
      if (manual !== undefined || low) return false;
      if (options.eligible === false) { resetSamples(); return false; }
      // Compilation, resize and tab wakeups are isolated stalls, not a frame rate.
      if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
        severeFrames = 0;
        slow = 0;
        return false;
      }
      if (deltaMs > 350) {
        // A single stalled task is harmless; continuously unusable rendering
        // must still adapt, rather than falling outside the normal estimator.
        if (++severeFrames < 8) return false;
        low = true;
        return true;
      }
      severeFrames = 0;
      frames++;
      average += (deltaMs - average) * .08;
      if (frames <= 24) return false;
      slow = average > 45 ? slow + 1 : Math.max(0, slow - 2);
      if (slow < 24) return false;
      low = true;
      return true;
    },
  };
}
