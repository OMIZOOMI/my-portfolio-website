// Loopback QA only: asymmetric synthetic video, no physical camera or recordings.
import { createServer } from "node:http";
const upstream = process.env.PORTFOLIO_FIXTURE_UPSTREAM ?? "http://127.0.0.1:3014";

function install(mode) {
  const tracks = [], urls = new Set(), checks = [];
  let requests = 0, audioRequests = 0, urlCreated = 0, urlRevoked = 0, frames = 0, encodes = 0;
  const nativeCreate = URL.createObjectURL.bind(URL), nativeRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = nativeCreate(blob); if (blob.type === "image/png") { urls.add(url); urlCreated++; } return url; };
  URL.revokeObjectURL = url => { if (urls.delete(url)) urlRevoked++; nativeRevoke(url); };
  navigator.mediaDevices.getUserMedia = async constraints => {
    requests++; if (constraints.audio) audioRequests++;
    if (mode === "deny-first" && requests === 1) throw new DOMException("Denied by synthetic fixture", "NotAllowedError");
    const source = document.createElement("canvas"); source.width = 1280; source.height = 720;
    const context = source.getContext("2d"), stream = source.captureStream(20); tracks.push(...stream.getTracks());
    const draw = () => {
      if (stream.getTracks().every(track => track.readyState === "ended")) { source.width = source.height = 0; return; }
      frames++;
      context.fillStyle = "#bd5555"; context.fillRect(0, 0, 640, 720);
      context.fillStyle = "#4b9bac"; context.fillRect(640, 0, 640, 720);
      context.fillStyle = "#fff"; context.font = "36px sans-serif"; context.fillText("SOURCE LEFT", 90, 110); context.fillText("SOURCE RIGHT", 780, 110);
      context.fillStyle = "#f4d78e"; context.beginPath(); context.arc(640 + Math.sin(frames / 35) * 220, 380, 70, 0, 2 * Math.PI); context.fill();
      context.fillStyle = "#202328"; context.fillRect(460, 600, 370, 60); context.fillStyle = "#fff"; context.font = "25px sans-serif"; context.fillText(`SYNTHETIC FRAME ${frames}`, 480, 640);
      requestAnimationFrame(draw);
    };
    draw(); return stream;
  };
  const nativeBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
    if (!this.closest("[data-camera-preview]")) return nativeBlob.call(this, callback, ...args);
    encodes++;
    const width = this.width, height = this.height, context = this.getContext("2d");
    const expected = context.getImageData(0, 0, width, height).data;
    if (mode === "encode-error") { queueMicrotask(() => callback(null)); return; }
    return nativeBlob.call(this, blob => {
      const deliver = () => callback(blob);
      if (mode === "delayed") setTimeout(deliver, 2200); else deliver();
      if (!blob) return;
      createImageBitmap(blob).then(bitmap => {
        const decoded = new OffscreenCanvas(width, height), decodedContext = decoded.getContext("2d");
        decodedContext.drawImage(bitmap, 0, 0);
        const actual = decodedContext.getImageData(0, 0, width, height).data;
        const equal = actual.length === expected.length && actual.every((value, index) => value === expected[index]);
        const at = (x, y) => [...actual.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
        checks.push({ width, height, exactPreviewPixels: equal, left: at(4, Math.floor(height / 2)), right: at(width - 5, Math.floor(height / 2)) });
        if (checks.length > 6) checks.shift();
        bitmap.close(); decoded.width = decoded.height = 0;
      });
    }, ...args);
  };
  document.addEventListener("DOMContentLoaded", () => {
    const out = document.createElement("output"); out.hidden = true; out.id = "u11-observations"; document.body.append(out);
    const report = () => {
      const value = JSON.stringify({ fixture: mode, requests, audioRequests, activeTracks: tracks.filter(track => track.readyState === "live").length,
        frames, encodes, photoURLs: urls.size, urlCreated, urlRevoked, checks,
        sourceTime: document.querySelector("[data-facetime-app] video")?.currentTime,
        camera: document.querySelector("[data-facetime-app]")?.getAttribute("data-camera-status") });
      if (out.textContent !== value) out.textContent = value;
    };
    setInterval(report, 100); report();
  }, { once: true });
}

for (const [port, mode] of [[3015, "live"], [3016, "deny-first"], [3017, "encode-error"], [3018, "download-blocked"], [3019, "delayed"]]) {
  createServer(async (request, response) => {
    try {
      const headers = { ...request.headers, "accept-encoding": "identity" }; delete headers.host; delete headers.connection;
      const result = await fetch(new URL(request.url ?? "/", upstream), { headers, redirect: "manual" });
      const type = result.headers.get("content-type") ?? "application/octet-stream";
      let body = Buffer.from(await result.arrayBuffer());
      if (type.includes("text/html")) body = Buffer.from(body.toString().replace("<head>", `<head><script>(${install.toString()})(${JSON.stringify(mode)})</script>`));
      const outgoing = { "content-type": type, "content-length": body.length, "cache-control": "no-store" };
      for (const key of ["location", "accept-ranges", "content-range"]) if (result.headers.get(key)) outgoing[key] = result.headers.get(key);
      if (mode === "download-blocked") outgoing["content-security-policy"] = "sandbox allow-scripts allow-same-origin allow-forms allow-popups allow-modals";
      response.writeHead(result.status, outgoing); response.end(body);
    } catch (error) { response.writeHead(502); response.end(String(error)); }
  }).listen(port, "127.0.0.1", () => console.log(`${mode}: http://127.0.0.1:${port}`));
}
