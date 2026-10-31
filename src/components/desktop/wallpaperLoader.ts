const decodedImages = new Map<string, Promise<string>>();

/** One shared request/decode per selected URL, never a collection preload. */
export function loadWallpaper(url: string): Promise<string> {
  const cached = decodedImages.get(url);
  if (cached) return cached;

  const request = new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    let settled = false;
    const deadline = window.setTimeout(() => finish(new Error("The wallpaper took too long to load.")), 8000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(deadline);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(url);
    }
    async function decode() {
      try {
        await image.decode();
        finish();
      } catch {
        finish(new Error("The wallpaper could not be decoded."));
      }
    }
    image.decoding = "async";
    image.onload = decode;
    image.onerror = () => finish(new Error("The wallpaper could not be loaded."));
    image.src = url;
    if (image.complete && image.naturalWidth > 0) void decode();
  });
  decodedImages.set(url, request);
  // Failed loads remain retryable. Successful decodes are shared with boot.
  void request.catch(() => decodedImages.delete(url));
  return request;
}
