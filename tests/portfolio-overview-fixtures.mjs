// Test-only loopback proxy. Nothing in the production app reads fixture flags.
// Modes exercise HTML before hydration, delayed model loading and unavailable WebGL.
import { createServer } from "node:http";
const upstream = process.env.PORTFOLIO_FIXTURE_UPSTREAM ?? "http://127.0.0.1:3014";
const probe = `<script>(function(){var mounts=0,seen=new WeakSet(),errors=[];function start(){var out=document.createElement('output');out.hidden=true;out.id='u02-test-observations';document.body.append(out);function update(){var roots=document.querySelectorAll('#desktop-root');roots.forEach(function(root){if(!seen.has(root)){seen.add(root);mounts++;}});var text=JSON.stringify({desktopMounts:mounts,desktops:roots.length,errors:errors});if(out.textContent!==text)out.textContent=text;}new MutationObserver(update).observe(document.body,{childList:true,subtree:true});window.addEventListener('error',function(event){if(event.message){errors.push(String(event.message).slice(0,180));errors=errors.slice(-5);update();}});update();}document.addEventListener('DOMContentLoaded',start,{once:true});})();</script>`;
const noWebgl = `<script>(function(){var original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind){if(kind==='webgl'||kind==='webgl2'||kind==='experimental-webgl')return null;return original.apply(this,arguments);};})();</script>`;

for (const [port, mode] of [[3015, "delayed-model"], [3016, "no-webgl"], [3017, "blocked-js"], [3018, "failed-model"]]) {
  createServer(async (request, response) => {
    try {
      const path = request.url ?? "/";
      if (mode === "blocked-js" && /\.js(?:\?|$)/.test(path)) {
        response.writeHead(503, { "content-type": "text/plain" }); response.end("JavaScript blocked by test fixture"); return;
      }
      if (path.startsWith("/macbook.glb/") && /\.gltf(?:\?|$)/.test(path)) {
        if (mode === "delayed-model") await new Promise(resolve => setTimeout(resolve, 12000));
        if (mode === "failed-model") {
          response.writeHead(503, { "content-type": "text/plain" }); response.end("Model blocked by test fixture"); return;
        }
      }
      const result = await fetch(new URL(path, upstream), { headers: { "accept-encoding": "identity" } });
      const type = result.headers.get("content-type") ?? "application/octet-stream";
      let body = Buffer.from(await result.arrayBuffer());
      if (type.includes("text/html")) body = Buffer.from(body.toString().replace("<head>", "<head>" + (mode === "no-webgl" ? noWebgl : "") + probe));
      response.writeHead(result.status, { "content-type": type, "cache-control": "no-store" }); response.end(body);
    } catch (error) {
      response.writeHead(502, { "content-type": "text/plain" }); response.end(String(error));
    }
  }).listen(port, "127.0.0.1", () => console.log(`${mode}: http://127.0.0.1:${port}`));
}
