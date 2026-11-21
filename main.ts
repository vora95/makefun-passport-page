// The Passport Page of a Country That Isn't There — make.fun bounty
// Program: draws one invented passport spread (1024x1024 PNG) to /output/entry.png.
// Node 22, stdlib only (node:zlib, node:fs, node:path). No network, no Date,
// no Math.random: every pixel comes from a fixed seed, so two runs are byte-identical.
//
// Country: the Republic of Skarland, a North Atlantic island nation.
// Bearer: Elin Marit Skarven, born 14 MAR 1994 in Havnoy. Passport issued
// 12 JUN 2024, expires 12 JUN 2034. Every stamp is dated after the issue date.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------------------------------------------------------- PRNG (fixed seed)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261121);

// ---------------------------------------------------------------- Canvas
const W = 1024;
const H = 1024;
type RGB = [number, number, number];

class Canvas {
  w: number;
  h: number;
  px: Uint8Array; // RGB
  a: Uint8Array; // alpha mask, 255 = opaque paint, 0 = untouched (for stamp buffers)
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.px = new Uint8Array(w * h * 3);
    this.a = new Uint8Array(w * h).fill(255);
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
    this.a[y * this.w + x] = 255;
  }
  // alpha blend 0..1 over what is already there
  blend(x: number, y: number, c: RGB, alpha: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    const inv = 1 - alpha;
    this.px[i] = Math.round(this.px[i] * inv + c[0] * alpha);
    this.px[i + 1] = Math.round(this.px[i + 1] * inv + c[1] * alpha);
    this.px[i + 2] = Math.round(this.px[i + 2] * inv + c[2] * alpha);
    this.a[y * this.w + x] = 255;
  }
  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 3;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
  fill(c: RGB): void {
    for (let i = 0; i < this.w * this.h; i++) {
      this.px[i * 3] = c[0]; this.px[i * 3 + 1] = c[1]; this.px[i * 3 + 2] = c[2];
    }
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  rectBlend(x0: number, y0: number, x1: number, y1: number, c: RGB, alpha: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.blend(x, y, c, alpha);
  }
  hline(x0: number, x1: number, y: number, c: RGB): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  vline(x: number, y0: number, y1: number, c: RGB): void {
    for (let y = y0; y <= y1; y++) this.set(x, y, c);
  }
  box(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    for (let k = 0; k < t; k++) {
      this.hline(x0, x1, y0 + k, c); this.hline(x0, x1, y1 - k, c);
      this.vline(x0 + k, y0, y1, c); this.vline(x1 - k, y0, y1, c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  // anti-aliased-ish thin line: draw 2px with a soft neighbour
  line2(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    this.line(x0, y0, x1, y1, c);
    this.line(x0 + 1, y0, x1 + 1, y1, c);
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    let x = 0, y = r, d = 3 - 2 * r;
    const plot = (px: number, py: number) => {
      this.set(cx + px, cy + py, c); this.set(cx - px, cy + py, c);
      this.set(cx + px, cy - py, c); this.set(cx - px, cy - py, c);
      this.set(cx + py, cy + px, c); this.set(cx - py, cy + px, c);
      this.set(cx + py, cy - px, c); this.set(cx - py, cy - px, c);
    };
    while (y >= x) {
      plot(x, y);
      x++;
      if (d > 0) { y--; d = d + 4 * (x - y) + 10; } else d = d + 4 * x + 6;
    }
  }
  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      this.hline(cx - half, cx + half, cy + y, c);
    }
  }
  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = -ry; y <= ry; y++) {
      const half = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      this.hline(cx - half, cx + half, cy + y, c);
    }
  }
  // scanline polygon fill (points: [x,y] pairs, y sorted implicitly)
  polygon(pts: [number, number][], c: RGB): void {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        this.hline(Math.ceil(xs[k]), Math.floor(xs[k + 1]), y, c);
      }
    }
  }
}

// ---------------------------------------------------------------- 5x7 bitmap font
// Each glyph: 7 rows, 5 bits (bit 4 = leftmost column).
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  "-": [0, 0, 0, 0x0e, 0, 0, 0],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  "+": [0, 0x04, 0x04, 0x0e, 0x04, 0x04, 0],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "\u00d8": [0x0e, 0x11, 0x15, 0x15, 0x19, 0x11, 0x0e], // O-slash
  "\u00c9": [0x08, 0x04, 0x0e, 0x11, 0x1f, 0x10, 0x0e], // E-acute
  "\u00b7": [0, 0, 0x0c, 0x0c, 0, 0, 0], // middle dot
};
const CHAR_W = 6; // 5px glyph + 1px gap

function textWidth(s: string, scale: number, gapPx?: number): number {
  const gap = gapPx ?? scale;
  return s.length * (5 * scale + gap) - gap;
}
function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB, gapPx?: number): void {
  const gap = gapPx ?? scale;
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT[" "]!;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row]! & (1 << (4 - col))) {
          cv.rect(cx + col * scale, y + row * scale, cx + col * scale + scale - 1, y + row * scale + scale - 1, c);
        }
      }
    }
    cx += 5 * scale + gap;
  }
}
function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}
// same, but blended (for stamp ink)
function drawTextBlend(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB, alpha: number): void {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT[" "]!;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row]! & (1 << (4 - col))) {
          cv.rectBlend(cx + col * scale, y + row * scale, cx + col * scale + scale - 1, y + row * scale + scale - 1, c, alpha);
        }
      }
    }
    cx += CHAR_W * scale;
  }
}

// ---------------------------------------------------------------- PNG encode (RGB, filter 0)
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(cv: Canvas): Buffer {
  const raw = Buffer.alloc((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (cv.w * 3 + 1)] = 0; // filter: none
    raw.set(cv.px.subarray(y * cv.w * 3, (y + 1) * cv.w * 3), y * (cv.w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0); ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- palette
const NAVY: RGB = [28, 47, 74];
const NAVY_SOFT: RGB = [58, 82, 110];
const PAPER: RGB = [243, 237, 219];
const PAPER_DARK: RGB = [232, 224, 200];
const INK: RGB = [32, 40, 52];
const STAMP_RED: RGB = [163, 51, 39];
const STAMP_BLUE: RGB = [43, 93, 138];
const STAMP_GREEN: RGB = [46, 110, 68];
const GOLD: RGB = [176, 141, 74];
const SKIN: RGB = [224, 190, 158];
const SKIN_SH: RGB = [198, 160, 128];
const HAIR: RGB = [212, 182, 128];
const SWEATER: RGB = [94, 110, 96];
const PHOTO_BG: RGB = [148, 166, 178];

// ---------------------------------------------------------------- rotated blit (for stamps)
function blitRotated(dst: Canvas, src: Canvas, cx: number, cy: number, angleDeg: number): void {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const scx = src.w / 2, scy = src.h / 2;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (src.a[y * src.w + x] === 0) continue;
      const dx = x - scx, dy = y - scy;
      const rx = Math.round(cx + dx * cos - dy * sin);
      const ry = Math.round(cy + dx * sin + dy * cos);
      if (rx < 0 || ry < 0 || rx >= dst.w || ry >= dst.h) continue;
      const si = (y * src.w + x) * 3;
      dst.blend(rx, ry, [src.px[si]!, src.px[si + 1]!, src.px[si + 2]!], 0.82);
    }
  }
}
function stampCanvas(w: number, h: number): Canvas {
  const c = new Canvas(w, h);
  c.a.fill(0);
  return c;
}

// ---------------------------------------------------------------- portrait (flat-illustration passport photo)
function drawPortrait(cv: Canvas, x0: number, y0: number, x1: number, y1: number): void {
  const w = x1 - x0, h = y1 - y0;
  const cx = x0 + Math.floor(w / 2);
  // background: muted blue-grey with halftone dots
  cv.rect(x0, y0, x1, y1, PHOTO_BG);
  for (let y = y0 + 4; y < y1; y += 9) {
    for (let x = x0 + 4; x < x1; x += 9) {
      cv.fillCircle(x, y, 1, [132, 150, 162]);
    }
  }
  // shoulders / knitted sweater
  cv.polygon([[cx - 78, y1], [cx - 72, y0 + 150], [cx - 40, y0 + 128], [cx + 40, y0 + 128], [cx + 72, y0 + 150], [cx + 78, y1]], SWEATER);
  // sweater knit stripes
  for (let y = y0 + 152; y < y1 - 2; y += 7) {
    cv.hline(cx - 74, cx + 74, y, [80, 96, 82]);
  }
  // collar
  cv.polygon([[cx - 34, y0 + 132], [cx, y0 + 152], [cx + 34, y0 + 132], [cx + 22, y0 + 124], [cx, y0 + 138], [cx - 22, y0 + 124]], [238, 232, 214]);
  // neck
  cv.rect(cx - 16, y0 + 104, cx + 16, y0 + 136, SKIN_SH);
  // head
  cv.fillEllipse(cx, y0 + 72, 46, 56, SKIN);
  // jaw shading
  cv.fillEllipse(cx, y0 + 96, 38, 26, SKIN_SH);
  cv.fillEllipse(cx, y0 + 84, 40, 30, SKIN);
  // hair: fair, swept to the side
  cv.polygon([[cx - 48, y0 + 62], [cx - 50, y0 + 18], [cx - 30, y0 + 2], [cx + 8, y0 + 0], [cx + 38, y0 + 10], [cx + 50, y0 + 34], [cx + 46, y0 + 66], [cx + 40, y0 + 34], [cx + 18, y0 + 16], [cx - 12, y0 + 14], [cx - 34, y0 + 28], [cx - 42, y0 + 48]], HAIR);
  // hair strands
  cv.line(cx - 30, y0 + 20, cx - 18, y0 + 44, [186, 156, 102]);
  cv.line(cx - 6, y0 + 12, cx + 2, y0 + 40, [186, 156, 102]);
  cv.line(cx + 22, y0 + 16, cx + 30, y0 + 42, [186, 156, 102]);
  // eyebrows
  cv.line2(cx - 30, y0 + 62, cx - 10, y0 + 58, [120, 96, 62]);
  cv.line2(cx + 10, y0 + 58, cx + 30, y0 + 62, [120, 96, 62]);
  // eyes
  cv.fillEllipse(cx - 20, y0 + 70, 7, 4, [255, 255, 255]);
  cv.fillEllipse(cx + 20, y0 + 70, 7, 4, [255, 255, 255]);
  cv.fillCircle(cx - 20, y0 + 70, 3, [52, 74, 92]);
  cv.fillCircle(cx + 20, y0 + 70, 3, [52, 74, 92]);
  // nose
  cv.line(cx, y0 + 72, cx - 3, y0 + 92, SKIN_SH);
  cv.line(cx - 3, y0 + 92, cx + 4, y0 + 94, SKIN_SH);
  // mouth
  cv.line(cx - 12, y0 + 106, cx + 12, y0 + 106, [150, 96, 88]);
  // cheek light
  cv.fillEllipse(cx - 30, y0 + 88, 8, 5, [232, 200, 172]);
  cv.fillEllipse(cx + 30, y0 + 88, 8, 5, [232, 200, 172]);
}

// ---------------------------------------------------------------- emblem: mountain + waves + star
function drawEmblem(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.circle(cx, cy, r, NAVY);
  cv.circle(cx, cy, r - 2, NAVY);
  // mountain
  cv.polygon([[cx - r + 8, cy + r - 12], [cx - 8, cy - r + 14], [cx + 2, cy + 2], [cx + 12, cy - r + 22], [cx + r - 8, cy + r - 12]], NAVY);
  // snow cap
  cv.polygon([[cx - 14, cy - r + 22], [cx - 8, cy - r + 14], [cx - 2, cy - r + 22], [cx - 8, cy - r + 17]], PAPER);
  // waves
  for (let k = 0; k < 2; k++) {
    const y = cy + r - 22 + k * 6;
    for (let x = cx - r + 10; x < cx + r - 10; x += 12) {
      cv.line(x, y, x + 6, y - 3, NAVY);
      cv.line(x + 6, y - 3, x + 12, y, NAVY);
    }
  }
  // star above mountain
  const sx = cx, sy = cy - r + 6;
  cv.fillCircle(sx, sy, 3, GOLD);
  cv.line(sx, sy - 6, sx, sy + 6, GOLD);
  cv.line(sx - 6, sy, sx + 6, sy, GOLD);
}

// ---------------------------------------------------------------- MRZ (ICAO 9303, check digits computed)
function mrzVal(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 55;
  return 0; // '<'
}
function mrzCheck(s: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += mrzVal(s[i]!) * w[i % 3]!;
  return sum % 10;
}
function pad(s: string, n: number): string {
  return (s + "<".repeat(n)).slice(0, n);
}
function mrzLines(): [string, string] {
  const line1 = pad("P<SKLSKARVEN<<ELIN<MARIT", 44);
  const doc = "SK4829137";
  const dob = "940314";
  const exp = "340612";
  const opt = "";
  // TD3 line 2: doc(9)+chk(1)+nat(3)+dob(6)+chk(1)+sex(1)+exp(6)+chk(1)
  //   + optional(15)+composite chk(1) = 44
  let line2 = doc + mrzCheck(doc) + "SKL" + dob + mrzCheck(dob) + "F" + exp + mrzCheck(exp) + pad(opt, 15);
  const composite = mrzCheck(line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 28) + line2.slice(28, 43));
  line2 += String(composite);
  return [line1, line2.slice(0, 44)];
}

// ---------------------------------------------------------------- circular date stamp (offscreen, then rotated)
function makeCircleStamp(lines: string[], color: RGB, r: number): Canvas {
  const s = r * 2 + 24;
  const cv = stampCanvas(s, s);
  const c = s / 2;
  cv.circle(c, c, r, color);
  cv.circle(c, c, r - 4, color);
  cv.circle(c, c, r - 16, color);
  const n = lines.length;
  lines.forEach((ln, i) => {
    const scale = 1;
    const y = Math.round(c - ((n * 7 * scale + (n - 1) * 5) / 2) + i * (7 * scale + 5));
    drawTextBlend(cv, ln, Math.round(c - textWidth(ln, scale) / 2), y, scale, color, 0.9);
  });
  // small star at bottom inside ring
  cv.fillCircle(c, c + r - 9, 2, color);
  return cv;
}
function makeRectStamp(lines: string[], color: RGB, w: number, h: number): Canvas {
  const cv = stampCanvas(w + 16, h + 16);
  cv.box(8, 8, w + 8, h + 8, color, 2);
  const n = lines.length;
  lines.forEach((ln, i) => {
    const scale = 2;
    const y = 8 + (h - (n * 14 + (n - 1) * 6)) / 2 + i * 20;
    drawTextBlend(cv, ln, 8 + (w - textWidth(ln, scale)) / 2, y, scale, color, 0.9);
  });
  return cv;
}

// ---------------------------------------------------------------- guilloche + paper grain
function guilloche(cv: Canvas, x0: number, x1: number, y0: number, y1: number, c: RGB, alpha: number): void {
  for (let row = 0; row < 6; row++) {
    const yBase = y0 + ((y1 - y0) * (row + 0.5)) / 6;
    for (let x = x0; x <= x1; x += 2) {
      const y = Math.round(yBase + 5 * Math.sin((x / 34) + row * 1.3));
      cv.blend(x, y, c, alpha);
    }
  }
}
function grain(cv: Canvas, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y += 3) {
    for (let x = x0; x <= x1; x += 3) {
      const d = Math.floor((rng() - 0.5) * 14);
      if (d === 0) continue;
      cv.blend(x, y, d > 0 ? [255, 250, 235] : [190, 178, 150], Math.abs(d) / 28);
    }
  }
}

// ---------------------------------------------------------------- field helper (label over value, one type size each)
function field(cv: Canvas, x: number, y: number, label: string, value: string, labelScale = 1, valueScale = 2): number {
  drawText(cv, label, x, y, labelScale, NAVY_SOFT);
  drawText(cv, value, x, y + 8 * labelScale + 4, valueScale, INK);
  return y + 8 * labelScale + 4 + 7 * valueScale + 10;
}

// ---------------------------------------------------------------- data page (left)
function drawDataPage(cv: Canvas): void {
  const X0 = 30, X1 = 492;
  // header
  drawTextCentered(cv, "REPUBLIC OF SKARLAND", 261, 44, 3, NAVY);
  drawTextCentered(cv, "PASSPORT  \u00b7  PASSEPORT  \u00b7  VEGABREF", 261, 78, 1, NAVY_SOFT);
  cv.hline(X0 + 8, X1 - 8, 100, NAVY);
  // emblem
  drawEmblem(cv, 261, 138, 26);
  drawTextCentered(cv, "SKL", 261, 172, 1, NAVY_SOFT);
  // photo
  cv.box(48, 196, 218, 386, NAVY, 2);
  drawPortrait(cv, 50, 198, 216, 384);
  // photo corner marks
  cv.line(48, 196, 66, 196, GOLD); cv.line(48, 196, 48, 214, GOLD);
  cv.line(218, 196, 200, 196, GOLD); cv.line(218, 196, 218, 214, GOLD);
  cv.line(48, 386, 66, 386, GOLD); cv.line(48, 386, 48, 368, GOLD);
  cv.line(218, 386, 200, 386, GOLD); cv.line(218, 386, 218, 368, GOLD);
  drawText(cv, "PHOTO", 54, 372, 1, [255, 255, 255]);
  // fields right of photo
  let y = 200;
  y = field(cv, 236, y, "TYPE / TYPE", "P");
  y = field(cv, 300, 200, "CODE / CODE", "SKL");
  y = field(cv, 380, 200, "PASSPORT NO.", "SK4829137");
  field(cv, 236, 262, "SURNAME / NOM", "SKARVEN");
  field(cv, 236, 322, "GIVEN NAMES / PRENOMS", "ELIN MARIT");
  field(cv, 236, 382, "NATIONALITY / NATIONALITE", "SKARLANDER");
  // second row of fields across the page
  field(cv, 48, 420, "DATE OF BIRTH", "14 MAR 1994");
  field(cv, 300, 420, "PLACE OF BIRTH", "HAVNOY");
  field(cv, 48, 480, "SEX / SEXE", "F");
  field(cv, 150, 480, "DATE OF ISSUE", "12 JUN 2024");
  field(cv, 330, 480, "DATE OF EXPIRY", "12 JUN 2034");
  field(cv, 48, 540, "AUTHORITY / AUTORITE", "HAVNOY PASSPORT OFFICE");
  // language column (trilingual, criterion 5 support)
  cv.box(48, 606, 444, 690, NAVY_SOFT, 1);
  drawText(cv, "LANGUAGES OF THE BEARER / LANGUES / TUNGUMAL", 60, 616, 1, NAVY_SOFT);
  drawText(cv, "SKARLSK  \u00b7  ENGLISH  \u00b7  FRANCAIS", 60, 636, 2, INK);
  drawText(cv, "BEARER READS AND SIGNS IN ALL THREE.", 60, 664, 1, NAVY_SOFT);
  // signature
  drawText(cv, "HOLDER'S SIGNATURE / SIGNATURE DU TITULAIRE", 48, 716, 1, NAVY_SOFT);
  cv.hline(48, 444, 748, NAVY);
  // signature strokes (a flowing hand)
  cv.line2(60, 742, 90, 726, INK); cv.line2(90, 726, 118, 744, INK);
  cv.line2(118, 744, 150, 724, INK); cv.line2(150, 724, 176, 742, INK);
  cv.line2(176, 742, 210, 728, INK); cv.line2(210, 728, 236, 744, INK);
  cv.line2(236, 744, 268, 730, INK); cv.line2(268, 730, 300, 746, INK);
  cv.line2(300, 746, 330, 730, INK); cv.line2(330, 730, 360, 744, INK);
  // MRZ (tight OCR-B-style spacing so 44 chars fit the data page)
  const [m1, m2] = mrzLines();
  cv.rect(X0, 800, X1, 900, PAPER_DARK);
  cv.box(X0, 800, X1, 900, NAVY, 1);
  drawText(cv, m1, 48, 822, 2, INK, 0);
  drawText(cv, m2, 48, 856, 2, INK, 0);
  drawText(cv, "THIS PASSPORT CONTAINS 32 PAGES  \u00b7  SKL  \u00b7  4829137", 48, 922, 1, NAVY_SOFT);
  guilloche(cv, X0 + 10, X1 - 10, 940, 972, NAVY, 0.10);
}

// ---------------------------------------------------------------- visa page (right)
function drawVisaPage(cv: Canvas): void {
  const X0 = 532, X1 = 994;
  drawTextCentered(cv, "VISAS", 763, 44, 3, NAVY);
  drawTextCentered(cv, "VISA  \u00b7  VEGABREF", 763, 78, 1, NAVY_SOFT);
  cv.hline(X0 + 8, X1 - 8, 100, NAVY);
  drawText(cv, "12", 968, 44, 2, NAVY_SOFT);
  // --- visa sticker (Kaldvaer) top-left
  cv.box(548, 116, 760, 280, NAVY, 2);
  cv.rect(550, 118, 758, 142, NAVY);
  drawText(cv, "KINGDOM OF KALDVAER", 560, 124, 1, PAPER);
  drawText(cv, "VISA", 560, 152, 3, STAMP_RED);
  drawText(cv, "NO. KV-771204", 660, 158, 1, INK);
  field(cv, 560, 186, "VALID / VALABLE", "01 MAY 2026");
  drawText(cv, "EXP 01 NOV 2026", 560, 222, 1, INK);
  field(cv, 560, 236, "ENTRIES / ENTREES", "MULTIPLE");
  drawText(cv, "FISHING CREW - SEASONAL", 560, 272, 1, NAVY_SOFT);
  // red seal straddling the sticker's corner
  const seal = makeCircleStamp(["KALDVAER", "CONSULATE", "HAVNOY"], STAMP_RED, 34);
  blitRotated(cv, seal, 736, 258, -12);
  // --- tiny map of Skarland top-right
  cv.box(776, 116, 978, 268, NAVY_SOFT, 1);
  drawText(cv, "SKARLAND", 788, 126, 1, NAVY_SOFT);
  cv.polygon([[830, 250], [812, 210], [826, 176], [860, 158], [900, 150], [936, 168], [952, 200], [940, 232], [906, 252], [862, 256]], [196, 210, 196]);
  // island outline (border via lines)
  const isl: [number, number][] = [[830, 250], [812, 210], [826, 176], [860, 158], [900, 150], [936, 168], [952, 200], [940, 232], [906, 252], [862, 256]];
  for (let i = 0; i < isl.length; i++) {
    const [x0, y0] = isl[i]!, [x1, y1] = isl[(i + 1) % isl.length]!;
    cv.line(x0, y0, x1, y1, NAVY);
  }
  cv.fillCircle(872, 222, 4, STAMP_RED);
  drawText(cv, "HAVNOY", 884, 216, 1, INK);
  drawText(cv, "NORTH ATLANTIC  66 12' N", 788, 258, 1, NAVY_SOFT);
  // --- stamps
  const stamps: { make: () => Canvas; x: number; y: number; rot: number }[] = [
    { make: () => makeCircleStamp(["HAVNOY", "DEPARTURE", "03 JUL 2024"], STAMP_BLUE, 52), x: 616, y: 348, rot: -8 },
    { make: () => makeCircleStamp(["KALDVAER", "ARRIVAL", "03 JUL 2024"], STAMP_RED, 52), x: 772, y: 352, rot: 7 },
    { make: () => makeCircleStamp(["KALDVAER", "DEPARTURE", "18 JUL 2024"], STAMP_BLUE, 52), x: 924, y: 346, rot: -5 },
    { make: () => makeCircleStamp(["OSTFJORD", "ARRIVAL", "09 MAR 2025"], STAMP_RED, 52), x: 616, y: 500, rot: 6 },
    { make: () => makeCircleStamp(["OSTFJORD", "DEPARTURE", "22 MAR 2025"], STAMP_BLUE, 52), x: 772, y: 504, rot: -9 },
    { make: () => makeCircleStamp(["MERHAVN", "ARRIVAL", "02 OCT 2025"], STAMP_RED, 52), x: 924, y: 498, rot: 8 },
    { make: () => makeCircleStamp(["MERHAVN", "DEPARTURE", "14 OCT 2025"], STAMP_BLUE, 52), x: 616, y: 648, rot: -6 },
    { make: () => makeCircleStamp(["KALDVAER", "ARRIVAL", "11 MAY 2026"], STAMP_RED, 52), x: 772, y: 652, rot: 5 },
    { make: () => makeRectStamp(["ADMITTED", "HAVNOY", "11 MAY 2026"], STAMP_GREEN, 150, 72), x: 910, y: 652, rot: -4 },
  ];
  for (const s of stamps) blitRotated(cv, s.make(), s.x, s.y, s.rot);
  // --- conditions box: the telling detail (criterion 5)
  cv.box(548, 736, 978, 856, STAMP_RED, 2);
  drawText(cv, "CONDITIONS OF ENTRY", 560, 746, 2, STAMP_RED);
  drawText(cv, "BEARER MAY LAND ONLY BY SEA.", 560, 774, 2, INK);
  drawText(cv, "MUST GREET THE HARBOURMASTER", 560, 794, 2, INK);
  drawText(cv, "ON ARRIVAL.", 560, 814, 2, INK);
  drawText(cv, "NO MOTOR VEHICLES ON SKARLAND.", 560, 834, 2, INK);
  // --- fee stamp
  guilloche(cv, X0 + 10, X1 - 10, 940, 972, NAVY, 0.10);
  const fee = makeRectStamp(["HARBOUR DUE 12 KR", "PAID  11 MAY 2026"], STAMP_GREEN, 250, 56);
  blitRotated(cv, fee, 763, 916, -3);
  drawText(cv, "PAGE 12 - VISAS  \u00b7  SKL  \u00b7  4829137", 548, 962, 1, NAVY_SOFT);
}

// ---------------------------------------------------------------- main
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const cv = new Canvas(W, H);
  // cover edge + paper
  cv.fill(NAVY);
  cv.rect(14, 14, 1009, 1009, PAPER);
  // centre gutter shadow
  for (let x = 500; x <= 524; x++) {
    const d = Math.min(x - 500, 524 - x);
    cv.rectBlend(x, 14, x, 1009, [60, 50, 30], 0.05 + 0.10 * (1 - d / 12));
  }
  // page edge lines
  cv.vline(24, 14, 1009, PAPER_DARK);
  cv.vline(999, 14, 1009, PAPER_DARK);
  // faint watermark emblem in each page centre
  cv.circle(261, 470, 120, PAPER_DARK);
  cv.circle(763, 470, 120, PAPER_DARK);
  drawDataPage(cv);
  drawVisaPage(cv);
  // paper grain over everything (coarse, sparse: keeps PNG small)
  grain(cv, 16, 16, 1007, 1007);
  const png = encodePNG(cv);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  console.log(`wrote ${path.join(outDir, "entry.png")} ${png.length} bytes`);
}

main();
