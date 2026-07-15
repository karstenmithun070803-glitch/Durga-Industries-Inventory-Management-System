// Generates all brand/icon assets for the DVN IMS PWA from a single source logo.
//
//   node scripts/generate-icons.mjs            (uses Images/dvn-logo-source.png)
//   npm run icons:generate
//
// Outputs (overwrites in place):
//   src/app/icon.png            512  full lockup on white
//   src/app/apple-icon.png      180  full lockup on white
//   public/icons/icon-192.png   192  full lockup on white (manifest, purpose:any)
//   public/icons/icon-512.png   512  full lockup on white (manifest, purpose:any)
//   public/icons/icon-512-maskable.png 512  full lockup, smaller (maskable safe zone)
//   src/app/favicon.ico         16/32/48  navy tile + white "DVN" (legible at tab size)
//   public/brand/dvn-logo.png   trimmed, transparent — for login + sidebar (next/image)
//
// Approach: render into a <canvas> in a headless browser. The source has a noisy off-white
// background, so we adaptively sample the corners to learn the bg tone, trim to the content
// bounding box, and composite onto opaque white (no halo). The favicon is drawn fresh (a navy
// tile with white "DVN") because the full lockup is illegible at 16px. See PLAN §A/§A2/§C.

import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
// The logo lives in the outer client folder's Images/ dir (two levels above durga-ims).
const DEFAULT_SOURCES = [
  path.resolve(PROJECT, "..", "..", "Images", "dvn-logo-source.png"),
  path.resolve(PROJECT, "..", "Images", "dvn-logo-source.png"),
];
const SOURCE = process.argv[2]
  ? path.resolve(process.argv[2])
  : DEFAULT_SOURCES.find((p) => fs.existsSync(p)) ?? DEFAULT_SOURCES[0];

const APP = path.join(PROJECT, "src", "app");
const ICONS = path.join(PROJECT, "public", "icons");
const BRAND = path.join(PROJECT, "public", "brand");
const NAVY = "#0f172a";

if (!fs.existsSync(SOURCE)) throw new Error(`Source logo not found: ${SOURCE}`);
for (const d of [ICONS, BRAND]) fs.mkdirSync(d, { recursive: true });

const sourceDataUrl =
  "data:image/png;base64," + fs.readFileSync(SOURCE).toString("base64");

function writePngFromDataUrl(file, dataUrl) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  console.log("wrote", path.relative(PROJECT, file));
}

// Minimal ICO encoder: container of PNGs (supported by all modern browsers).
function buildIco(pngBuffers /* [{size, buf}] */) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngBuffers.forEach(({ size, buf }, i) => {
    const e = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e + 0); // width
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1); // height
    dir.writeUInt8(0, e + 2); // palette
    dir.writeUInt8(0, e + 3); // reserved
    dir.writeUInt16LE(1, e + 4); // color planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(buf.length, e + 8); // bytes in resource
    dir.writeUInt32LE(offset, e + 12); // offset
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngBuffers.map((p) => p.buf)]);
}

const browser = await chromium.launch();
const page = await browser.newPage();

// All canvas work happens in the browser context and returns data URLs.
const result = await page.evaluate(async ({ sourceDataUrl, NAVY }) => {
  const load = (src) =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  const img = await load(sourceDataUrl);

  // Draw source to a work canvas
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wctx = work.getContext("2d");
  wctx.drawImage(img, 0, 0);
  const data = wctx.getImageData(0, 0, w, h).data;

  // Adaptive background = average of the four corners
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
  ].map(([x, y]) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  });
  const bg = [0, 1, 2].map(
    (c) => corners.reduce((s, p) => s + p[c], 0) / corners.length
  );
  const TOL = 46; // Euclidean distance from bg to count as content
  const isContent = (i) => {
    const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) > TOL;
  };

  // Content bounding box
  let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isContent((y * w + x) * 4)) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // Helper: draw the trimmed logo centered onto a square of `size`, scaled so its LONGER side
  // is `size * scale`, on an opaque `bg` fill.
  const iconOnWhite = (size, scale) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const box = size * scale;
    const s = Math.min(box / cropW, box / cropH);
    const dw = cropW * s, dh = cropH * s;
    ctx.drawImage(work, minX, minY, cropW, cropH, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return c.toDataURL("image/png");
  };

  // Transparent trimmed copy for in-app use (bg keyed out).
  const transparentCopy = () => {
    const c = document.createElement("canvas");
    c.width = cropW; c.height = cropH;
    const ctx = c.getContext("2d");
    ctx.drawImage(work, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    const id = ctx.getImageData(0, 0, cropW, cropH);
    const d = id.data;
    for (let p = 0; p < d.length; p += 4) {
      const dr = d[p] - bg[0], dg = d[p + 1] - bg[1], db = d[p + 2] - bg[2];
      if (Math.sqrt(dr * dr + dg * dg + db * db) <= TOL) d[p + 3] = 0;
    }
    ctx.putImageData(id, 0, 0);
    return { dataUrl: c.toDataURL("image/png"), width: cropW, height: cropH };
  };

  // Favicon: navy rounded tile + white "DVN", fit to width.
  const favicon = (size) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const r = Math.max(2, Math.round(size * 0.16));
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(size, 0, size, size, r);
    ctx.arcTo(size, size, 0, size, r);
    ctx.arcTo(0, size, 0, 0, r);
    ctx.arcTo(0, 0, size, 0, r);
    ctx.closePath();
    ctx.fillStyle = NAVY;
    ctx.fill();

    const pad = size * 0.14;
    const maxW = size - pad * 2;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fs = size * 0.5;
    ctx.font = `700 ${fs}px Helvetica, Arial, sans-serif`;
    const measured = ctx.measureText("DVN").width;
    fs = Math.min(fs * (maxW / measured), size * 0.62);
    ctx.font = `700 ${fs}px Helvetica, Arial, sans-serif`;
    ctx.fillText("DVN", size / 2, size / 2 + size * 0.02);
    return c.toDataURL("image/png");
  };

  return {
    icon512: iconOnWhite(512, 0.86),
    apple180: iconOnWhite(180, 0.86),
    icon192: iconOnWhite(192, 0.86),
    maskable512: iconOnWhite(512, 0.6),
    webCopy: transparentCopy(),
    fav16: favicon(16),
    fav32: favicon(32),
    fav48: favicon(48),
    bg,
    crop: { cropW, cropH },
  };
}, { sourceDataUrl, NAVY });

await browser.close();

// Write PNG assets
writePngFromDataUrl(path.join(APP, "icon.png"), result.icon512);
writePngFromDataUrl(path.join(APP, "apple-icon.png"), result.apple180);
writePngFromDataUrl(path.join(ICONS, "icon-192.png"), result.icon192);
writePngFromDataUrl(path.join(ICONS, "icon-512.png"), result.icon512);
writePngFromDataUrl(path.join(ICONS, "icon-512-maskable.png"), result.maskable512);
writePngFromDataUrl(path.join(BRAND, "dvn-logo.png"), result.webCopy.dataUrl);

// Assemble favicon.ico (16/32/48)
const toBuf = (d) => Buffer.from(d.replace(/^data:image\/png;base64,/, ""), "base64");
const ico = buildIco([
  { size: 16, buf: toBuf(result.fav16) },
  { size: 32, buf: toBuf(result.fav32) },
  { size: 48, buf: toBuf(result.fav48) },
]);
fs.writeFileSync(path.join(APP, "favicon.ico"), ico);
console.log("wrote", path.relative(PROJECT, path.join(APP, "favicon.ico")));

// Emit the trimmed dims so the next/image usage can set width/height.
console.log(
  `\nTrimmed logo content: ${result.crop.cropW}x${result.crop.cropH}` +
  ` (aspect ${(result.crop.cropW / result.crop.cropH).toFixed(3)}:1)` +
  `  bg≈rgb(${result.bg.map((n) => Math.round(n)).join(",")})`
);
console.log("public/brand/dvn-logo.png dims:", result.webCopy.width, "x", result.webCopy.height);
