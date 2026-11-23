type PagePair = [HTMLCanvasElement, HTMLCanvasElement];

/** One immutable reader spread, not a growing cache of personal pages. */
export function createPageRasterCache() {
  let entry: { key: string; pages: Promise<PagePair> } | undefined;
  let disposed = false;
  return {
    capture(key: string, capture: () => Promise<PagePair>): Promise<PagePair> {
      if (disposed) return Promise.reject(new Error('The paper cache is disposed'));
      if (entry?.key === key) return entry.pages;
      const next = { key, pages: Promise.resolve().then(capture) };
      entry = next;
      // A failed or superseded capture must never poison the next request.
      void next.pages.catch(() => { if (entry === next) entry = undefined; });
      return next.pages;
    },
    clear() { entry = undefined; },
    dispose() { disposed = true; entry = undefined; },
  };
}
