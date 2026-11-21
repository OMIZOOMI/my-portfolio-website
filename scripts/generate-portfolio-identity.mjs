// Original U07 artwork; renders locally using the installed Next.js/Sharp stack.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { createElement: h } = require("react");
const { ImageResponse } = require("next/og");
const sharp = require("sharp");
const root = new URL("../", import.meta.url);
const svg = await readFile(new URL("src/app/icon.svg", root));
await mkdir(new URL("public/identity/", root), { recursive: true });
await writeFile(new URL("src/app/apple-icon.png", root), await sharp(svg).resize(180, 180).png().toBuffer());
const icons = await Promise.all([16, 32, 48].map(size => sharp(svg).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * icons.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(icons.length, 4);
let offset = header.length;
icons.forEach((png, i) => { const p = 6 + 16 * i; header[p] = [16, 32, 48][i]; header[p + 1] = header[p]; header.writeUInt16LE(1, p + 4); header.writeUInt16LE(32, p + 6); header.writeUInt32LE(png.length, p + 8); header.writeUInt32LE(offset, p + 12); offset += png.length; });
await writeFile(new URL("src/app/favicon.ico", root), Buffer.concat([header, ...icons]));
const font = await readFile(require.resolve("next/dist/compiled/@vercel/og/Geist-Regular.ttf"));
const mark = `data:image/svg+xml;base64,${svg.toString("base64")}`;
const card = h("div", { style: { width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "64px 76px", background: "#eef0f2", color: "#252a32", fontFamily: "Geist" } },
  h("div", { style: { display: "flex", alignItems: "center", gap: 22 } }, h("img", { src: mark, width: 92, height: 92 }), h("div", { style: { display: "flex", fontSize: 24, letterSpacing: 3 } }, "AN INTERACTIVE PORTFOLIO")),
  h("div", { style: { display: "flex", marginTop: 45, fontSize: 86, letterSpacing: -4, lineHeight: 1.1 } }, "Om Sawkare"),
  h("div", { style: { display: "flex", marginTop: 22, maxWidth: 1000, fontSize: 36, lineHeight: 1.4, color: "#495362" } }, "Computer vision, AI workflows, and backend development."),
  h("div", { style: { display: "flex", marginTop: "auto", fontSize: 24, color: "#495362" } }, "The things I build. The ideas behind them.")
);
const response = new ImageResponse(card, { width: 1200, height: 630, fonts: [{ name: "Geist", data: font, weight: 400, style: "normal" }] });
const png = Buffer.from(await response.arrayBuffer());
await writeFile(new URL("public/identity/share.png", root), png);
process.stdout.write(`Generated Om favicon, touch icon and 1200×630 share artwork (${png.length} bytes) in ${fileURLToPath(root)}\n`);
