export type RoomState = "fog" | "clearing" | "door" | "entering" | "room" | "opening" | "reading" | "closing" | "fallback";

const nextStates: Record<RoomState, readonly RoomState[]> = {
  fog: ["clearing", "fallback"], clearing: ["door", "fallback"],
  door: ["entering", "fallback"], entering: ["room", "fallback"],
  room: ["opening", "fallback"], opening: ["reading", "fallback"],
  reading: ["closing", "fallback"], closing: ["room", "fallback"],
  fallback: ["opening"],
};

/** One owner for journey guards, late async results and application teardown. */
export function createRoomController() {
  let state: RoomState = "fog", sceneVersion = 0, transitionVersion = 0;
  let invalidated = false, disposed = false;
  const scope = new AbortController();
  const cleanups = new Set<() => void>();
  const subscribers = new Set<(state: RoomState) => void>();
  let releaseScene!: () => void;
  const sceneUnavailable = new Promise<void>(resolve => { releaseScene = resolve; });
  return {
    get state() { return state; },
    getState(): RoomState { return state; },
    get sceneVersion() { return sceneVersion; },
    get transitionVersion() { return transitionVersion; },
    get sceneInvalidated() { return invalidated; },
    get disposed() { return disposed; },
    signal: scope.signal,
    sceneUnavailable,
    transition(next: RoomState) {
      if (disposed || state === next || !nextStates[state].includes(next)) return false;
      state = next;
      for (const subscriber of subscribers) subscriber(state);
      return true;
    },
    subscribe(subscriber: (state: RoomState) => void) {
      subscribers.add(subscriber);
      return () => { subscribers.delete(subscriber); };
    },
    beginTransition() { return ++transitionVersion; },
    invalidateScene() {
      if (disposed || invalidated) return false;
      invalidated = true;
      ++sceneVersion;
      releaseScene();
      return true;
    },
    own(cleanup: () => void) {
      if (disposed) cleanup();
      else cleanups.add(cleanup);
      return () => { cleanups.delete(cleanup); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidated = true;
      ++sceneVersion;
      ++transitionVersion;
      releaseScene();
      scope.abort();
      // A failing optional resource must not prevent the rest from releasing.
      for (const cleanup of cleanups) { try { cleanup(); } catch {} }
      cleanups.clear();
      subscribers.clear();
    },
  };
}
