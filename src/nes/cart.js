// iNES / NES 2.0 parsing and mappers 0, 1, 2, 3, 4, 7, 66.
export const MIRROR = { HORIZONTAL: 0, VERTICAL: 1, SINGLE0: 2, SINGLE1: 3, FOUR: 4 };

export function parseROM(buf) {
  const d = new Uint8Array(buf);
  if (d[0] !== 0x4e || d[1] !== 0x45 || d[2] !== 0x53 || d[3] !== 0x1a) throw new Error('Not an iNES ROM (.nes)');
  const prgBanks = d[4], chrBanks = d[5], f6 = d[6], f7 = d[7];
  const nes2 = (f7 & 0x0c) === 0x08;
  let mapper = (f6 >> 4) | (f7 & 0xf0);
  if (nes2) mapper |= (d[8] & 0x0f) << 8;
  const trainer = f6 & 4;
  let off = 16 + (trainer ? 512 : 0);
  const prgSize = prgBanks * 16384, chrSize = chrBanks * 8192;
  const prg = d.slice(off, off + prgSize); off += prgSize;
  const chr = chrSize ? d.slice(off, off + chrSize) : new Uint8Array(8192);
  const mirror = (f6 & 8) ? MIRROR.FOUR : (f6 & 1) ? MIRROR.VERTICAL : MIRROR.HORIZONTAL;
  return { prg, chr, chrRAM: chrSize === 0, mapper, mirror, battery: !!(f6 & 2) };
}

class Mapper {
  constructor(rom) {
    this.rom = rom; this.prg = rom.prg; this.chr = rom.chr; this.mirror = rom.mirror;
    this.sram = new Uint8Array(8192); this.irq = false;
  }
  ppuRead(a) { return this.chr[a & 0x1fff]; }
  ppuWrite(a, v) { if (this.rom.chrRAM) this.chr[a & 0x1fff] = v; }
  cpuRead(a) { if (a >= 0x6000 && a < 0x8000) return this.sram[a - 0x6000]; return 0; }
  cpuWrite(a, v) { if (a >= 0x6000 && a < 0x8000) this.sram[a - 0x6000] = v; }
  scanline() {}
}

class NROM extends Mapper {
  cpuRead(a) { if (a >= 0x8000) return this.prg[(a - 0x8000) % this.prg.length]; return super.cpuRead(a); }
}

class MMC1 extends Mapper {
  constructor(rom) {
    super(rom); this.shift = 0x10; this.control = 0x0c; this.chr0 = 0; this.chr1 = 0; this.prgBank = 0;
    this.prgOff = [0, 0]; this.chrOff = [0, 0]; this.update();
  }
  cpuRead(a) {
    if (a >= 0x8000) { const b = (a - 0x8000) >> 14; return this.prg[this.prgOff[b] + (a & 0x3fff)]; }
    return super.cpuRead(a);
  }
  cpuWrite(a, v) {
    if (a < 0x8000) return super.cpuWrite(a, v);
    if (v & 0x80) { this.shift = 0x10; this.control |= 0x0c; this.update(); return; }
    const done = this.shift & 1;
    this.shift = (this.shift >> 1) | ((v & 1) << 4);
    if (done) {
      const r = this.shift; this.shift = 0x10;
      if (a < 0xa000) this.control = r;
      else if (a < 0xc000) this.chr0 = r;
      else if (a < 0xe000) this.chr1 = r;
      else this.prgBank = r & 0x0f;
      this.update();
    }
  }
  update() {
    const m = this.control & 3;
    this.mirror = [MIRROR.SINGLE0, MIRROR.SINGLE1, MIRROR.VERTICAL, MIRROR.HORIZONTAL][m];
    const prgMode = (this.control >> 2) & 3, chrMode = (this.control >> 4) & 1;
    const nPrg = this.prg.length >> 14;
    // 512KB SUROM: chr0 bit 4 selects 256KB PRG half
    const outer = this.prg.length > 262144 ? (this.chr0 & 0x10) : 0;
    const bank = (b) => (((b & 0x0f) | outer) % nPrg) * 0x4000;
    if (prgMode <= 1) { const b = (this.prgBank & 0x0e); this.prgOff = [bank(b), bank(b | 1)]; }
    else if (prgMode === 2) this.prgOff = [bank(0), bank(this.prgBank)];
    else this.prgOff = [bank(this.prgBank), bank(0x0f)];
    const nChr4 = Math.max(1, this.chr.length >> 12);
    if (chrMode === 0) { const b = (this.chr0 & 0x1e) % nChr4; this.chrOff = [b * 0x1000, (b + 1) % nChr4 * 0x1000]; }
    else this.chrOff = [(this.chr0 % nChr4) * 0x1000, (this.chr1 % nChr4) * 0x1000];
  }
  ppuRead(a) { return this.chr[this.chrOff[(a >> 12) & 1] + (a & 0x0fff)]; }
  ppuWrite(a, v) { if (this.rom.chrRAM) this.chr[this.chrOff[(a >> 12) & 1] + (a & 0x0fff)] = v; }
}

class UxROM extends Mapper {
  constructor(rom) { super(rom); this.bank = 0; this.last = (this.prg.length >> 14) - 1; }
  cpuRead(a) {
    if (a >= 0xc000) return this.prg[this.last * 0x4000 + (a - 0xc000)];
    if (a >= 0x8000) return this.prg[this.bank * 0x4000 + (a - 0x8000)];
    return super.cpuRead(a);
  }
  cpuWrite(a, v) { if (a >= 0x8000) this.bank = (v & 0x0f) % (this.prg.length >> 14); else super.cpuWrite(a, v); }
}

class CNROM extends Mapper {
  constructor(rom) { super(rom); this.bank = 0; }
  cpuRead(a) { if (a >= 0x8000) return this.prg[(a - 0x8000) % this.prg.length]; return super.cpuRead(a); }
  cpuWrite(a, v) { if (a >= 0x8000) this.bank = (v & 3) % Math.max(1, this.chr.length >> 13); else super.cpuWrite(a, v); }
  ppuRead(a) { return this.chr[this.bank * 0x2000 + (a & 0x1fff)]; }
}

class AxROM extends Mapper {
  constructor(rom) { super(rom); this.bank = 0; this.mirror = MIRROR.SINGLE0; }
  cpuRead(a) { if (a >= 0x8000) return this.prg[this.bank * 0x8000 + (a - 0x8000)]; return super.cpuRead(a); }
  cpuWrite(a, v) {
    if (a >= 0x8000) { this.bank = (v & 7) % Math.max(1, this.prg.length >> 15); this.mirror = (v & 0x10) ? MIRROR.SINGLE1 : MIRROR.SINGLE0; }
    else super.cpuWrite(a, v);
  }
}

class GxROM extends Mapper {
  constructor(rom) { super(rom); this.p = 0; this.c = 0; }
  cpuRead(a) { if (a >= 0x8000) return this.prg[this.p * 0x8000 + (a - 0x8000)]; return super.cpuRead(a); }
  cpuWrite(a, v) {
    if (a >= 0x8000) { this.p = ((v >> 4) & 3) % Math.max(1, this.prg.length >> 15); this.c = (v & 3) % Math.max(1, this.chr.length >> 13); }
    else super.cpuWrite(a, v);
  }
  ppuRead(a) { return this.chr[this.c * 0x2000 + (a & 0x1fff)]; }
}

class MMC3 extends Mapper {
  constructor(rom) {
    super(rom);
    this.reg = [0, 2, 4, 5, 6, 7, 0, 1]; this.sel = 0; this.prgMode = 0; this.chrMode = 0;
    this.irqLatch = 0; this.irqCounter = 0; this.irqEnable = false; this.irqReload = false;
    this.fourScreen = rom.mirror === MIRROR.FOUR;
    this.prgOff = [0, 0, 0, 0]; this.chrOff = new Int32Array(8); this.update();
  }
  cpuRead(a) {
    if (a >= 0x8000) { const b = (a - 0x8000) >> 13; return this.prg[this.prgOff[b] + (a & 0x1fff)]; }
    return super.cpuRead(a);
  }
  cpuWrite(a, v) {
    if (a < 0x8000) return super.cpuWrite(a, v);
    const even = !(a & 1);
    if (a < 0xa000) {
      if (even) { this.sel = v & 7; this.prgMode = (v >> 6) & 1; this.chrMode = (v >> 7) & 1; }
      else this.reg[this.sel] = v;
      this.update();
    } else if (a < 0xc000) {
      if (even && !this.fourScreen) this.mirror = (v & 1) ? MIRROR.HORIZONTAL : MIRROR.VERTICAL;
    } else if (a < 0xe000) {
      if (even) this.irqLatch = v; else { this.irqCounter = 0; this.irqReload = true; }
    } else {
      if (even) { this.irqEnable = false; this.irq = false; } else this.irqEnable = true;
    }
  }
  update() {
    const n8 = this.prg.length >> 13, nk = Math.max(1, this.chr.length >> 10);
    const P = (b) => ((b % n8) + n8) % n8 * 0x2000;
    const r6 = this.reg[6] & 0x3f, r7 = this.reg[7] & 0x3f;
    if (this.prgMode === 0) this.prgOff = [P(r6), P(r7), P(n8 - 2), P(n8 - 1)];
    else this.prgOff = [P(n8 - 2), P(r7), P(r6), P(n8 - 1)];
    const Ck = (b) => (b % nk) * 0x400;
    const r = this.reg, o = this.chrOff;
    const lo = [Ck(r[0] & 0xfe), Ck(r[0] | 1), Ck(r[1] & 0xfe), Ck(r[1] | 1)];
    const hi = [Ck(r[2]), Ck(r[3]), Ck(r[4]), Ck(r[5])];
    const order = this.chrMode === 0 ? [...lo, ...hi] : [...hi, ...lo];
    for (let i = 0; i < 8; i++) o[i] = order[i];
  }
  ppuRead(a) { return this.chr[this.chrOff[(a >> 10) & 7] + (a & 0x3ff)]; }
  ppuWrite(a, v) { if (this.rom.chrRAM) this.chr[this.chrOff[(a >> 10) & 7] + (a & 0x3ff)] = v; }
  scanline() {
    if (this.irqCounter === 0 || this.irqReload) { this.irqCounter = this.irqLatch; this.irqReload = false; }
    else this.irqCounter--;
    if (this.irqCounter === 0 && this.irqEnable) this.irq = true;
  }
}

const MAPPERS = { 0: NROM, 1: MMC1, 2: UxROM, 3: CNROM, 4: MMC3, 7: AxROM, 66: GxROM };
export function createMapper(rom) {
  const M = MAPPERS[rom.mapper];
  if (!M) throw new Error(`Mapper ${rom.mapper} isn't supported yet (supported: 0, 1, 2, 3, 4, 7, 66 — covers most of the library)`);
  return new M(rom);
}
