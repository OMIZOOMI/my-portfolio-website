// Test-only loopback proxies. No production component reads fixture flags.
import { createServer } from "node:http";
const upstream = process.env.PORTFOLIO_FIXTURE_UPSTREAM ?? "http://127.0.0.1:3014";

function observations() {
  const seen = new WeakSet(), rendererSeen = new WeakSet(), players = [], tracks = [];
  let desktopMounts = 0, rendererMounts = 0, cameraRequests = 0;
  // Synthetic changing shapes, no physical camera, microphone or saved frames.
  navigator.mediaDevices.getUserMedia = async () => {
    cameraRequests++;
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext("2d"), stream = canvas.captureStream(12);
    tracks.push(...stream.getTracks());
    let phase = 0;
    const draw = () => {
      if (stream.getTracks().every(track => track.readyState === "ended")) return;
      context.fillStyle = "#c7d6e5"; context.fillRect(0, 0, 640, 360);
      context.fillStyle = "#506b82"; context.fillRect(180 + Math.sin(phase += .035) * 90, 110, 100, 100);
      requestAnimationFrame(draw);
    };
    draw(); return stream;
  };
  document.addEventListener("DOMContentLoaded", () => {
    const out = document.createElement("output"); out.id = "u10-observations"; out.hidden = true; document.body.append(out);
    const report = () => {
      document.querySelectorAll("#desktop-root").forEach(node => { if (!seen.has(node)) { seen.add(node); desktopMounts++; } });
      document.querySelectorAll("canvas[data-engine]").forEach(node => { if (!rendererSeen.has(node)) { rendererSeen.add(node); rendererMounts++; } });
      document.querySelectorAll("audio").forEach(audio => { if (!players.includes(audio)) players.push(audio); });
      const value = JSON.stringify({ fixture: "synthetic camera + resource observation", desktopMounts, rendererMounts,
        desktops: document.querySelectorAll("#desktop-root").length, renderers: document.querySelectorAll("canvas[data-engine]").length,
        audioPlayersCreated: players.length, playingAudio: players.filter(audio => !audio.paused && !audio.ended).length,
        cameraRequests, activeCameraTracks: tracks.filter(track => track.readyState === "live").length,
        route: document.querySelector("[data-portfolio-route]")?.getAttribute("data-portfolio-route") });
      if (out.textContent !== value) out.textContent = value;
    };
    new MutationObserver(report).observe(document.body, { childList: true, subtree: true });
    setInterval(report, 100); report();
  }, { once: true });
}
const blockedWebgl = `const nativeContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /^(webgl2?|experimental-webgl)$/.test(kind)?null:nativeContext.call(this,kind,...args)};`;
for (const [port, mode] of [[3015, "resources"], [3016, "no-webgl"], [3017, "no-javascript"]]) {
  createServer(async (request, response) => {
    try {
      const path = request.url ?? "/";
      if (mode === "no-javascript" && /\.js(?:\?|$)/.test(path)) { response.writeHead(503); response.end("JavaScript blocked by test fixture"); return; }
      const headers = { ...request.headers, "accept-encoding": "identity" };
      delete headers.host; delete headers.connection;
      const result = await fetch(new URL(path, upstream), { headers, redirect: "manual" });
      const type = result.headers.get("content-type") ?? "application/octet-stream";
      let body = Buffer.from(await result.arrayBuffer());
      if (type.includes("text/html") && mode !== "no-javascript") {
        const script = mode === "resources" ? `(${observations.toString()})();` : blockedWebgl;
        body = Buffer.from(body.toString().replace("<head>", `<head><script>${script}</script>`));
      }
      const outgoing = { "content-type": type, "cache-control": "no-store", "content-length": body.length };
      for (const key of ["location", "accept-ranges", "content-range"]) if (result.headers.get(key)) outgoing[key] = result.headers.get(key);
      response.writeHead(result.status, outgoing);
      response.end(body);
    } catch (error) { response.writeHead(502); response.end(String(error)); }
  }).listen(port, "127.0.0.1", () => console.log(`${mode}: http://127.0.0.1:${port}`));
}
