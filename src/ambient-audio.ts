/** Build the existing eight-second wave loop without blocking an interaction. */
export async function prepareAmbientNoise(
  context: AudioContext,
  random: () => number = Math.random,
): Promise<AudioBuffer> {
  const requireOpen = () => {
    if (context.state === "closed")
      throw new DOMException("The audio context was closed during preparation", "AbortError");
  };
  const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  requireOpen();
  // Let the initiating click finish its state change and schedule its first draw.
  await yieldToBrowser();
  requireOpen();
  const buffer = context.createBuffer(1, context.sampleRate * 8, context.sampleRate);
  const data = buffer.getChannelData(0);
  let offset = 0, brown = 0;
  while (offset < data.length) {
    requireOpen();
    const end = Math.min(data.length, offset + 8192);
    const started = performance.now();
    // Check time in small blocks, retaining the double-precision filter state
    // across yields. The sample sequence is identical to the former tight loop.
    while (offset < end) {
      const blockEnd = Math.min(end, offset + 256);
      for (; offset < blockEnd; offset++) {
        brown = (brown + random() * .04 - .02) / 1.02;
        data[offset] = brown * 5;
      }
      if (performance.now() - started >= 2) break;
    }
    if (offset < data.length) await yieldToBrowser();
  }
  requireOpen();
  return buffer;
}
