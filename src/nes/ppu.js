// Ricoh 2C02 PPU, dot-stepped (341 dots x 262 scanlines).
import { MIRROR } from './cart.js';

export const PALETTE = [
  0x666666, 0x002a88, 0x1412a7, 0x3b00a4, 0x5c007e, 0x6e0040, 0x6c0600, 0x561d00,
  0x333500, 0x0b4800, 0x005200, 0x004f08, 0x00404d, 0x000000, 0x000000, 0x000000,
  0xadadad, 0x155fd9, 0x4240ff, 0x7527fe, 0xa01acc, 0xb71e7b, 0xb53120, 0x994e00,
  0x6b6d00, 0x388700, 0x0c9300, 0x008f32, 0x007c8d, 0x000000, 0x000000, 0x000000,
  0xfffeff, 0x64b0ff, 0x9290ff, 0xc676ff, 0xf36aff, 0xfe6ecc, 0xfe8170, 0xea9e22,
  0xbcbe00, 0x88d800, 0x5ce430, 0x45e082, 0x48cdde, 0x4f4f4f, 0x000000, 0x000000,
  0xfffeff, 0xc0dfff, 0xd3d2ff, 0xe8c8ff, 0xfbc2ff, 0xfec4ea, 0xfeccc5, 0xf7d8a5,
  0xe4e594, 0xcfef96, 0xbdf4ab, 0xb3f3cc, 0xb5ebf2, 0xb8b8b8, 0x000000, 0x000000,
];
// ABGR for little-endian Uint32 writes into an RGBA buffer
const ABGR = new Uint32Array(64);
for (let i = 0; i < 64; i++) { const c = PALETTE[i]; ABGR[i] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff); }

const MIRROR_TABLE = [
  [0, 0, 1, 1], // horizontal
  [0, 1, 0, 1], // vertical
  [0, 0, 0, 0],
  [1, 1, 1, 1],
  [0, 1, 2, 3],
];

export class PPU {
  constructor(nes) {
    this.nes = nes;
    this.vram = new Uint8Array(4096); // 4 nametables (2 used unless four-screen)
    this.pal = new Uint8Array(32);
    this.oam = new Uint8Array(256);
    this.front = new Uint32Array(256 * 240);
    this.back = new Uint32Array(256 * 240);
    this.reset();
  }
  reset() {
    this.cycle = 340; this.scanline = 240; this.frame = 0;
    this.v = 0; this.t = 0; this.x = 0; this.w = 0; this.f = 0;
    this.ctrl = 0; this.mask = 0; this.status = 0; this.oamAddr = 0; this.buffered = 0; this.bus = 0;
    this.ntByte = 0; this.atByte = 0; this.loTile = 0; this.hiTile = 0; this.tileData = 0; // tileData hi 32 bits stored separately
    this.tileHi = 0; this.tileLo = 0;
    this.spriteCount = 0;
    this.spPat = new Uint32Array(8); this.spPos = new Int32Array(8); this.spPri = new Uint8Array(8); this.spIdx = new Uint8Array(8);
    this.nmiOccurred = false; this.frameReady = false;
  }
  get mapper() { return this.nes.mapper; }

  // ---- PPU address space
  ntIndex(a) {
    const table = (a >> 10) & 3;
    return MIRROR_TABLE[this.mapper.mirror][table] * 0x400 + (a & 0x3ff);
  }
  read(a) {
    a &= 0x3fff;
    if (a < 0x2000) return this.mapper.ppuRead(a);
    if (a < 0x3f00) return this.vram[this.ntIndex(a)];
    return this.readPal(a);
  }
  write(a, v) {
    a &= 0x3fff;
    if (a < 0x2000) this.mapper.ppuWrite(a, v);
    else if (a < 0x3f00) this.vram[this.ntIndex(a)] = v;
    else this.writePal(a, v);
  }
  palIdx(a) { a &= 0x1f; if (a >= 16 && (a & 3) === 0) a -= 16; return a; }
  readPal(a) { return this.pal[this.palIdx(a)]; }
  writePal(a, v) { this.pal[this.palIdx(a)] = v & 0x3f; }

  // ---- CPU-facing registers
  readReg(r) {
    switch (r) {
      case 2: {
        let s = (this.status & 0xe0) | (this.bus & 0x1f);
        if (this.nmiOccurred) s |= 0x80;
        this.nmiOccurred = false; this.w = 0;
        // reading on the exact vblank-set dot suppresses NMI
        if (this.scanline === 241 && this.cycle <= 2) this.suppressNmi = true;
        this.bus = s; return s;
      }
      case 4: this.bus = this.oam[this.oamAddr]; return this.bus;
      case 7: {
        let v;
        if ((this.v & 0x3fff) < 0x3f00) { v = this.buffered; this.buffered = this.read(this.v); }
        else { this.buffered = this.read(this.v - 0x1000); v = (this.readPal(this.v) & 0x3f) | (this.bus & 0xc0); }
        this.v = (this.v + ((this.ctrl & 4) ? 32 : 1)) & 0x7fff;
        this.bus = v; return v;
      }
    }
    return this.bus;
  }
  writeReg(r, val) {
    this.bus = val;
    switch (r) {
      case 0: {
        const wasOn = this.ctrl & 0x80;
        this.ctrl = val; this.t = (this.t & 0xf3ff) | ((val & 3) << 10);
        if (!wasOn && (val & 0x80) && this.nmiOccurred) this.nes.cpu.nmiPending = true;
        break;
      }
      case 1: this.mask = val; break;
      case 3: this.oamAddr = val; break;
      case 4: this.oam[this.oamAddr] = val; this.oamAddr = (this.oamAddr + 1) & 0xff; break;
      case 5:
        if (this.w === 0) { this.t = (this.t & 0xffe0) | (val >> 3); this.x = val & 7; this.w = 1; }
        else { this.t = (this.t & 0x8fff) | ((val & 7) << 12); this.t = (this.t & 0xfc1f) | ((val & 0xf8) << 2); this.w = 0; }
        break;
      case 6:
        if (this.w === 0) { this.t = (this.t & 0x80ff) | ((val & 0x3f) << 8); this.w = 1; }
        else { this.t = (this.t & 0xff00) | val; this.v = this.t; this.w = 0; }
        break;
      case 7:
        this.write(this.v, val);
        this.v = (this.v + ((this.ctrl & 4) ? 32 : 1)) & 0x7fff;
        break;
    }
  }
  dma(page) {
    const cpu = this.nes;
    for (let i = 0; i < 256; i++) { this.oam[this.oamAddr] = cpu.cpuRead((page << 8) | i); this.oamAddr = (this.oamAddr + 1) & 0xff; }
  }

  // ---- scrolling helpers
  incX() { if ((this.v & 0x1f) === 31) { this.v &= ~0x1f; this.v ^= 0x400; } else this.v++; }
  incY() {
    if ((this.v & 0x7000) !== 0x7000) { this.v += 0x1000; return; }
    this.v &= ~0x7000;
    let y = (this.v & 0x3e0) >> 5;
    if (y === 29) { y = 0; this.v ^= 0x800; } else if (y === 31) y = 0; else y++;
    this.v = (this.v & ~0x3e0) | (y << 5);
  }
  copyX() { this.v = (this.v & 0xfbe0) | (this.t & 0x41f); }
  copyY() { this.v = (this.v & 0x841f) | (this.t & 0x7be0); }

  fetchNT() { this.ntByte = this.read(0x2000 | (this.v & 0xfff)); }
  fetchAT() {
    const v = this.v;
    const a = 0x23c0 | (v & 0x0c00) | ((v >> 4) & 0x38) | ((v >> 2) & 7);
    const shift = ((v >> 4) & 4) | (v & 2);
    this.atByte = ((this.read(a) >> shift) & 3) << 2;
  }
  fetchLo() { const fy = (this.v >> 12) & 7; this.loTile = this.read(((this.ctrl & 0x10) << 8) + this.ntByte * 16 + fy); }
  fetchHi() { const fy = (this.v >> 12) & 7; this.hiTile = this.read(((this.ctrl & 0x10) << 8) + this.ntByte * 16 + fy + 8); }
  storeTile() {
    let d = 0; const a = this.atByte;
    for (let i = 0; i < 8; i++) {
      const p1 = (this.loTile & 0x80) >> 7, p2 = (this.hiTile & 0x80) >> 6;
      this.loTile = (this.loTile << 1) & 0xff; this.hiTile = (this.hiTile << 1) & 0xff;
      d = ((d << 4) | a | p1 | p2) >>> 0;
    }
    this.tileLo = d;
  }

  bgPixel() {
    if (!(this.mask & 8)) return 0;
    // 64-bit shift register emulated as tileHi:tileLo (current tile in hi)
    return (this.tileHi >>> ((7 - this.x) * 4)) & 0x0f;
  }
  spritePixel() {
    if (!(this.mask & 0x10)) return 0;
    const X = this.cycle - 1;
    for (let i = 0; i < this.spriteCount; i++) {
      let off = X - this.spPos[i];
      if (off < 0 || off > 7) continue;
      off = 7 - off;
      const c = (this.spPat[i] >>> (off * 4)) & 0x0f;
      if ((c & 3) === 0) continue;
      this.spHit = i; return c;
    }
    return 0;
  }
  renderPixel() {
    const x = this.cycle - 1, y = this.scanline;
    let bg = this.bgPixel(), sp = this.spritePixel(); const si = this.spHit;
    if (x < 8 && !(this.mask & 2)) bg = 0;
    if (x < 8 && !(this.mask & 4)) sp = 0;
    const b = bg & 3, s = sp & 3;
    let color;
    if (!b && !s) color = 0;
    else if (!b) color = sp | 0x10;
    else if (!s) color = bg;
    else {
      if (this.spIdx[si] === 0 && x < 255) this.status |= 0x40;
      color = this.spPri[si] === 0 ? (sp | 0x10) : bg;
    }
    let c = this.readPal(color) & 0x3f;
    if (this.mask & 1) c &= 0x30;
    this.back[y * 256 + x] = ABGR[c];
  }
  fetchSpritePattern(i, row) {
    let tile = this.oam[i * 4 + 1]; const attr = this.oam[i * 4 + 2];
    let addr;
    if (!(this.ctrl & 0x20)) {
      if (attr & 0x80) row = 7 - row;
      addr = ((this.ctrl & 8) << 9) + tile * 16 + row;
    } else {
      if (attr & 0x80) row = 15 - row;
      const table = tile & 1; tile &= 0xfe;
      if (row > 7) { tile++; row -= 8; }
      addr = 0x1000 * table + tile * 16 + row;
    }
    const a = (attr & 3) << 2;
    let lo = this.read(addr), hi = this.read(addr + 8), d = 0;
    for (let k = 0; k < 8; k++) {
      let p1, p2;
      if (attr & 0x40) { p1 = lo & 1; p2 = (hi & 1) << 1; lo >>= 1; hi >>= 1; }
      else { p1 = (lo & 0x80) >> 7; p2 = (hi & 0x80) >> 6; lo = (lo << 1) & 0xff; hi = (hi << 1) & 0xff; }
      d = ((d << 4) | a | p1 | p2) >>> 0;
    }
    return d;
  }
  evaluateSprites() {
    const h = (this.ctrl & 0x20) ? 16 : 8; let n = 0;
    for (let i = 0; i < 64; i++) {
      const y = this.oam[i * 4], row = this.scanline - y;
      if (row < 0 || row >= h) continue;
      if (n < 8) {
        this.spPat[n] = this.fetchSpritePattern(i, row);
        this.spPos[n] = this.oam[i * 4 + 3];
        this.spPri[n] = (this.oam[i * 4 + 2] >> 5) & 1;
        this.spIdx[n] = i;
      }
      n++;
    }
    if (n > 8) { n = 8; this.status |= 0x20; }
    this.spriteCount = n;
  }

  tick() {
    const rendering = this.mask & 0x18;
    if (rendering && this.f === 1 && this.scanline === 261 && this.cycle === 339) {
      this.cycle = 0; this.scanline = 0; this.frame++; this.f ^= 1; return;
    }
    this.cycle++;
    if (this.cycle > 340) {
      this.cycle = 0; this.scanline++;
      if (this.scanline > 261) { this.scanline = 0; this.frame++; this.f ^= 1; }
    }
  }

  // advance one dot
  step() {
    this.tick();
    const cyc = this.cycle, line = this.scanline;
    const rendering = this.mask & 0x18;
    const pre = line === 261, visLine = line < 240, renderLine = pre || visLine;
    const preFetch = cyc >= 321 && cyc <= 336, visCyc = cyc >= 1 && cyc <= 256, fetchCyc = preFetch || visCyc;

    if (rendering) {
      if (visLine && visCyc) this.renderPixel();
      if (renderLine && fetchCyc) {
        // shift the 64-bit tile register by 4
        this.tileHi = ((this.tileHi << 4) | (this.tileLo >>> 28)) >>> 0;
        this.tileLo = (this.tileLo << 4) >>> 0;
        switch (cyc & 7) {
          case 1: this.fetchNT(); break;
          case 3: this.fetchAT(); break;
          case 5: this.fetchLo(); break;
          case 7: this.fetchHi(); break;
          case 0: this.storeTile(); break;
        }
      }
      if (pre && cyc >= 280 && cyc <= 304) this.copyY();
      if (renderLine) {
        if (fetchCyc && (cyc & 7) === 0) this.incX();
        if (cyc === 256) this.incY();
        if (cyc === 257) this.copyX();
      }
      if (cyc === 257) { if (visLine) this.evaluateSprites(); else this.spriteCount = 0; }
      // MMC3 scanline counter (A12 rise approximation)
      if (cyc === 260 && (visLine || pre)) this.mapper.scanline();
    } else if (visLine && visCyc) {
      // rendering disabled: show backdrop (or the palette entry v points at)
      const c = ((this.v & 0x3f00) === 0x3f00) ? this.readPal(this.v) : this.readPal(0);
      this.back[line * 256 + cyc - 1] = ABGR[c & 0x3f];
    }

    if (line === 241 && cyc === 1) {
      const t = this.front; this.front = this.back; this.back = t; this.frameReady = true;
      if (!this.suppressNmi) {
        this.nmiOccurred = true;
        if (this.ctrl & 0x80) this.nes.cpu.nmiPending = true;
      }
      this.suppressNmi = false;
    }
    if (pre && cyc === 1) { this.nmiOccurred = false; this.status &= ~0x60; }
  }
}
