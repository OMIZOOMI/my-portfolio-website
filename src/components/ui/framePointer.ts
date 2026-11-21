/** Keep the newest pointer sample; do geometry and painting once per frame. */
export function createFramePointer<T>(
  paint: (value: T) => void,
  request: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
) {
  let frame: number | null = null;
  let pending: { value: T } | null = null;
  const flush = () => {
    if (frame !== null) cancel(frame);
    frame = null;
    const sample = pending;
    pending = null;
    if (sample) paint(sample.value);
  };
  return {
    push(value: T) {
      pending = { value };
      if (frame === null) frame = request(flush);
    },
    flush,
    cancel() {
      if (frame !== null) cancel(frame);
      frame = null;
      pending = null;
    },
  };
}
