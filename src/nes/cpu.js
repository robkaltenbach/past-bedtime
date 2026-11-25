// MOS 6502 (Ricoh 2A03) core. Official opcodes plus the unofficial ones real games and nestest use.
const C = 1, Z = 2, I = 4, D = 8, B = 16, U = 32, V = 64, N = 128;

// mode ids
const IMP = 0, ACC = 1, IMM = 2, ZP = 3, ZPX = 4, ZPY = 5, ABS = 6, ABX = 7, ABY = 8, IND = 9, IZX = 10, IZY = 11, REL = 12;

// [opcode, mnemonic, mode, cycles, pagePenalty]
const TABLE = [];
function def(name, entries) {
  for (const [op, mode, cyc, pen] of entries) TABLE[op] = [name, mode, cyc, pen ? 1 : 0];
}
const RD = (b) => [[b + 0x09, IMM, 2], [b + 0x05, ZP, 3], [b + 0x15, ZPX, 4], [b + 0x0d, ABS, 4], [b + 0x1d, ABX, 4, 1], [b + 0x19, ABY, 4, 1], [b + 0x01, IZX, 6], [b + 0x11, IZY, 5, 1]];
def('ORA', RD(0x00)); def('AND', RD(0x20)); def('EOR', RD(0x40)); def('ADC', RD(0x60));
def('LDA', RD(0xa0)); def('CMP', RD(0xc0)); def('SBC', RD(0xe0));
def('STA', [[0x85, ZP, 3], [0x95, ZPX, 4], [0x8d, ABS, 4], [0x9d, ABX, 5], [0x99, ABY, 5], [0x81, IZX, 6], [0x91, IZY, 6]]);
const SH = (b) => [[b + 0x0a, ACC, 2], [b + 0x06, ZP, 5], [b + 0x16, ZPX, 6], [b + 0x0e, ABS, 6], [b + 0x1e, ABX, 7]];
def('ASL', SH(0x00)); def('ROL', SH(0x20)); def('LSR', SH(0x40)); def('ROR', SH(0x60));
def('DEC', [[0xc6, ZP, 5], [0xd6, ZPX, 6], [0xce, ABS, 6], [0xde, ABX, 7]]);
def('INC', [[0xe6, ZP, 5], [0xf6, ZPX, 6], [0xee, ABS, 6], [0xfe, ABX, 7]]);
def('BPL', [[0x10, REL, 2]]); def('BMI', [[0x30, REL, 2]]); def('BVC', [[0x50, REL, 2]]); def('BVS', [[0x70, REL, 2]]);
def('BCC', [[0x90, REL, 2]]); def('BCS', [[0xb0, REL, 2]]); def('BNE', [[0xd0, REL, 2]]); def('BEQ', [[0xf0, REL, 2]]);
def('BIT', [[0x24, ZP, 3], [0x2c, ABS, 4]]);
def('BRK', [[0x00, IMP, 7]]);
def('CLC', [[0x18, IMP, 2]]); def('SEC', [[0x38, IMP, 2]]); def('CLI', [[0x58, IMP, 2]]); def('SEI', [[0x78, IMP, 2]]);
def('CLV', [[0xb8, IMP, 2]]); def('CLD', [[0xd8, IMP, 2]]); def('SED', [[0xf8, IMP, 2]]);
def('CPX', [[0xe0, IMM, 2], [0xe4, ZP, 3], [0xec, ABS, 4]]);
def('CPY', [[0xc0, IMM, 2], [0xc4, ZP, 3], [0xcc, ABS, 4]]);
def('DEX', [[0xca, IMP, 2]]); def('DEY', [[0x88, IMP, 2]]); def('INX', [[0xe8, IMP, 2]]); def('INY', [[0xc8, IMP, 2]]);
def('JMP', [[0x4c, ABS, 3], [0x6c, IND, 5]]); def('JSR', [[0x20, ABS, 6]]);
def('LDX', [[0xa2, IMM, 2], [0xa6, ZP, 3], [0xb6, ZPY, 4], [0xae, ABS, 4], [0xbe, ABY, 4, 1]]);
def('LDY', [[0xa0, IMM, 2], [0xa4, ZP, 3], [0xb4, ZPX, 4], [0xac, ABS, 4], [0xbc, ABX, 4, 1]]);
def('NOP', [[0xea, IMP, 2]]);
def('PHA', [[0x48, IMP, 3]]); def('PHP', [[0x08, IMP, 3]]); def('PLA', [[0x68, IMP, 4]]); def('PLP', [[0x28, IMP, 4]]);
def('RTI', [[0x40, IMP, 6]]); def('RTS', [[0x60, IMP, 6]]);
def('STX', [[0x86, ZP, 3], [0x96, ZPY, 4], [0x8e, ABS, 4]]);
def('STY', [[0x84, ZP, 3], [0x94, ZPX, 4], [0x8c, ABS, 4]]);
def('TAX', [[0xaa, IMP, 2]]); def('TAY', [[0xa8, IMP, 2]]); def('TSX', [[0xba, IMP, 2]]);
def('TXA', [[0x8a, IMP, 2]]); def('TXS', [[0x9a, IMP, 2]]); def('TYA', [[0x98, IMP, 2]]);
// unofficial
def('NOP', [[0x1a, IMP, 2], [0x3a, IMP, 2], [0x5a, IMP, 2], [0x7a, IMP, 2], [0xda, IMP, 2], [0xfa, IMP, 2],
  [0x80, IMM, 2], [0x82, IMM, 2], [0x89, IMM, 2], [0xc2, IMM, 2], [0xe2, IMM, 2],
  [0x04, ZP, 3], [0x44, ZP, 3], [0x64, ZP, 3], [0x14, ZPX, 4], [0x34, ZPX, 4], [0x54, ZPX, 4], [0x74, ZPX, 4], [0xd4, ZPX, 4], [0xf4, ZPX, 4],
  [0x0c, ABS, 4], [0x1c, ABX, 4, 1], [0x3c, ABX, 4, 1], [0x5c, ABX, 4, 1], [0x7c, ABX, 4, 1], [0xdc, ABX, 4, 1], [0xfc, ABX, 4, 1]]);
def('LAX', [[0xa7, ZP, 3], [0xb7, ZPY, 4], [0xaf, ABS, 4], [0xbf, ABY, 4, 1], [0xa3, IZX, 6], [0xb3, IZY, 5, 1], [0xab, IMM, 2]]);
def('SAX', [[0x87, ZP, 3], [0x97, ZPY, 4], [0x8f, ABS, 4], [0x83, IZX, 6]]);
def('SBC', [[0xeb, IMM, 2]]);
const RMW = (b) => [[b + 0x07, ZP, 5], [b + 0x17, ZPX, 6], [b + 0x0f, ABS, 6], [b + 0x1f, ABX, 7], [b + 0x1b, ABY, 7], [b + 0x03, IZX, 8], [b + 0x13, IZY, 8]];
def('SLO', RMW(0x00)); def('RLA', RMW(0x20)); def('SRE', RMW(0x40)); def('RRA', RMW(0x60)); def('DCP', RMW(0xc0)); def('ISB', RMW(0xe0));
def('ANC', [[0x0b, IMM, 2], [0x2b, IMM, 2]]); def('ALR', [[0x4b, IMM, 2]]); def('ARR', [[0x6b, IMM, 2]]); def('AXS', [[0xcb, IMM, 2]]);
def('SHY', [[0x9c, ABX, 5]]); def('SHX', [[0x9e, ABY, 5]]); def('AHX', [[0x9f, ABY, 5], [0x93, IZY, 6]]); def('TAS', [[0x9b, ABY, 5]]); def('LAS', [[0xbb, ABY, 4, 1]]);
for (let i = 0; i < 256; i++) if (!TABLE[i]) TABLE[i] = ['NOP', IMP, 2, 0];

const NAMES = [...new Set(TABLE.map((t) => t[0]))];
const OPS = TABLE.map((t) => [NAMES.indexOf(t[0]), t[1], t[2], t[3]]);
const K = Object.fromEntries(NAMES.map((n, i) => [n, i]));

export class CPU {
  constructor(bus) {
    this.bus = bus;
    this.a = 0; this.x = 0; this.y = 0; this.sp = 0xfd; this.pc = 0; this.p = I | U;
    this.cycles = 0; this.stall = 0;
    this.nmiPending = false; this.irqLines = 0; // bitmask of asserted IRQ sources
  }
  read(a) { return this.bus.cpuRead(a); }
  write(a, v) { this.bus.cpuWrite(a, v); }
  read16(a) { return this.read(a) | (this.read((a + 1) & 0xffff) << 8); }
  read16bug(a) { const hi = (a & 0xff00) | ((a + 1) & 0xff); return this.read(a) | (this.read(hi) << 8); }
  push(v) { this.write(0x100 | this.sp, v); this.sp = (this.sp - 1) & 0xff; }
  pull() { this.sp = (this.sp + 1) & 0xff; return this.read(0x100 | this.sp); }
  push16(v) { this.push(v >> 8); this.push(v & 0xff); }
  pull16() { const lo = this.pull(); return lo | (this.pull() << 8); }
  zn(v) { this.p = (this.p & ~(Z | N)) | (v ? 0 : Z) | (v & N); }
  reset() {
    this.pc = this.read16(0xfffc); this.sp = (this.sp - 3) & 0xff; this.p |= I; this.cycles += 7;
  }
  interrupt(vec, brk) {
    this.push16(this.pc); this.push((this.p | U | (brk ? B : 0)) & ~(brk ? 0 : B));
    this.p |= I; this.pc = this.read16(vec); return 7;
  }
  compare(a, b) { const r = (a - b) & 0xff; this.zn(r); if (a >= b) this.p |= C; else this.p &= ~C; }
  adc(v) {
    const a = this.a, c = this.p & C, s = a + v + c;
    this.p &= ~(C | V);
    if (s > 0xff) this.p |= C;
    if (~(a ^ v) & (a ^ s) & 0x80) this.p |= V;
    this.a = s & 0xff; this.zn(this.a);
  }
  // returns CPU cycles consumed
  step() {
    if (this.stall > 0) { const s = this.stall; this.stall = 0; this.cycles += s; return s; }
    if (this.nmiPending) { this.nmiPending = false; const c = this.interrupt(0xfffa, false); this.cycles += c; return c; }
    if (this.irqLines && !(this.p & I)) { const c = this.interrupt(0xfffe, false); this.cycles += c; return c; }

    const opcode = this.read(this.pc);
    const [k, mode, base, pen] = OPS[opcode];
    let pc = (this.pc + 1) & 0xffff, addr = 0, crossed = false;
    switch (mode) {
      case IMM: addr = pc; pc = (pc + 1) & 0xffff; break;
      case ZP: addr = this.read(pc); pc = (pc + 1) & 0xffff; break;
      case ZPX: addr = (this.read(pc) + this.x) & 0xff; pc = (pc + 1) & 0xffff; break;
      case ZPY: addr = (this.read(pc) + this.y) & 0xff; pc = (pc + 1) & 0xffff; break;
      case ABS: addr = this.read16(pc); pc = (pc + 2) & 0xffff; break;
      case ABX: { const b = this.read16(pc); addr = (b + this.x) & 0xffff; crossed = (b & 0xff00) !== (addr & 0xff00); pc = (pc + 2) & 0xffff; break; }
      case ABY: { const b = this.read16(pc); addr = (b + this.y) & 0xffff; crossed = (b & 0xff00) !== (addr & 0xff00); pc = (pc + 2) & 0xffff; break; }
      case IND: addr = this.read16bug(this.read16(pc)); pc = (pc + 2) & 0xffff; break;
      case IZX: { const z = (this.read(pc) + this.x) & 0xff; addr = this.read(z) | (this.read((z + 1) & 0xff) << 8); pc = (pc + 1) & 0xffff; break; }
      case IZY: { const z = this.read(pc); const b = this.read(z) | (this.read((z + 1) & 0xff) << 8); addr = (b + this.y) & 0xffff; crossed = (b & 0xff00) !== (addr & 0xff00); pc = (pc + 1) & 0xffff; break; }
      case REL: { let o = this.read(pc); pc = (pc + 1) & 0xffff; if (o & 0x80) o -= 256; addr = (pc + o) & 0xffff; break; }
    }
    this.pc = pc;
    let cyc = base + (pen && crossed ? 1 : 0);
    const branch = (cond) => { if (cond) { cyc += ((this.pc & 0xff00) !== (addr & 0xff00)) ? 2 : 1; this.pc = addr; } };
    let v, r;
    switch (k) {
      case K.ADC: this.adc(this.read(addr)); break;
      case K.SBC: this.adc(this.read(addr) ^ 0xff); break;
      case K.AND: this.a &= this.read(addr); this.zn(this.a); break;
      case K.ORA: this.a |= this.read(addr); this.zn(this.a); break;
      case K.EOR: this.a ^= this.read(addr); this.zn(this.a); break;
      case K.LDA: this.a = this.read(addr); this.zn(this.a); break;
      case K.LDX: this.x = this.read(addr); this.zn(this.x); break;
      case K.LDY: this.y = this.read(addr); this.zn(this.y); break;
      case K.LAX: this.a = this.x = this.read(addr); this.zn(this.a); break;
      case K.STA: this.write(addr, this.a); break;
      case K.STX: this.write(addr, this.x); break;
      case K.STY: this.write(addr, this.y); break;
      case K.SAX: this.write(addr, this.a & this.x); break;
      case K.CMP: this.compare(this.a, this.read(addr)); break;
      case K.CPX: this.compare(this.x, this.read(addr)); break;
      case K.CPY: this.compare(this.y, this.read(addr)); break;
      case K.BIT: v = this.read(addr); this.p = (this.p & ~(Z | V | N)) | ((v & this.a) ? 0 : Z) | (v & (V | N)); break;
      case K.ASL: case K.LSR: case K.ROL: case K.ROR: {
        v = mode === ACC ? this.a : this.read(addr);
        if (mode !== ACC) this.write(addr, v); // dummy write
        const c = this.p & C;
        if (k === K.ASL) { r = (v << 1) & 0xff; this.p = (this.p & ~C) | (v >> 7); }
        else if (k === K.LSR) { r = v >> 1; this.p = (this.p & ~C) | (v & 1); }
        else if (k === K.ROL) { r = ((v << 1) | c) & 0xff; this.p = (this.p & ~C) | (v >> 7); }
        else { r = (v >> 1) | (c << 7); this.p = (this.p & ~C) | (v & 1); }
        this.zn(r);
        if (mode === ACC) this.a = r; else this.write(addr, r);
        break;
      }
      case K.INC: v = this.read(addr); this.write(addr, v); r = (v + 1) & 0xff; this.write(addr, r); this.zn(r); break;
      case K.DEC: v = this.read(addr); this.write(addr, v); r = (v - 1) & 0xff; this.write(addr, r); this.zn(r); break;
      case K.INX: this.x = (this.x + 1) & 0xff; this.zn(this.x); break;
      case K.INY: this.y = (this.y + 1) & 0xff; this.zn(this.y); break;
      case K.DEX: this.x = (this.x - 1) & 0xff; this.zn(this.x); break;
      case K.DEY: this.y = (this.y - 1) & 0xff; this.zn(this.y); break;
      case K.TAX: this.x = this.a; this.zn(this.x); break;
      case K.TAY: this.y = this.a; this.zn(this.y); break;
      case K.TXA: this.a = this.x; this.zn(this.a); break;
      case K.TYA: this.a = this.y; this.zn(this.a); break;
      case K.TSX: this.x = this.sp; this.zn(this.x); break;
      case K.TXS: this.sp = this.x; break;
      case K.PHA: this.push(this.a); break;
      case K.PHP: this.push(this.p | B | U); break;
      case K.PLA: this.a = this.pull(); this.zn(this.a); break;
      case K.PLP: this.p = (this.pull() & ~B) | U; break;
      case K.CLC: this.p &= ~C; break; case K.SEC: this.p |= C; break;
      case K.CLI: this.p &= ~I; break; case K.SEI: this.p |= I; break;
      case K.CLD: this.p &= ~D; break; case K.SED: this.p |= D; break;
      case K.CLV: this.p &= ~V; break;
      case K.BPL: branch(!(this.p & N)); break; case K.BMI: branch(this.p & N); break;
      case K.BVC: branch(!(this.p & V)); break; case K.BVS: branch(this.p & V); break;
      case K.BCC: branch(!(this.p & C)); break; case K.BCS: branch(this.p & C); break;
      case K.BNE: branch(!(this.p & Z)); break; case K.BEQ: branch(this.p & Z); break;
      case K.JMP: this.pc = addr; break;
      case K.JSR: this.push16((this.pc - 1) & 0xffff); this.pc = addr; break;
      case K.RTS: this.pc = (this.pull16() + 1) & 0xffff; break;
      case K.RTI: this.p = (this.pull() & ~B) | U; this.pc = this.pull16(); break;
      case K.BRK: this.pc = (this.pc + 1) & 0xffff; this.push16(this.pc); this.push(this.p | B | U); this.p |= I; this.pc = this.read16(0xfffe); break;
      case K.NOP: if (mode !== IMP && mode !== ACC) this.read(addr); break;
      case K.SLO: v = this.read(addr); this.p = (this.p & ~C) | (v >> 7); v = (v << 1) & 0xff; this.write(addr, v); this.a |= v; this.zn(this.a); break;
      case K.RLA: { v = this.read(addr); const c = this.p & C; this.p = (this.p & ~C) | (v >> 7); v = ((v << 1) | c) & 0xff; this.write(addr, v); this.a &= v; this.zn(this.a); break; }
      case K.SRE: v = this.read(addr); this.p = (this.p & ~C) | (v & 1); v >>= 1; this.write(addr, v); this.a ^= v; this.zn(this.a); break;
      case K.RRA: { v = this.read(addr); const c = this.p & C; this.p = (this.p & ~C) | (v & 1); v = (v >> 1) | (c << 7); this.write(addr, v); this.adc(v); break; }
      case K.DCP: v = (this.read(addr) - 1) & 0xff; this.write(addr, v); this.compare(this.a, v); break;
      case K.ISB: v = (this.read(addr) + 1) & 0xff; this.write(addr, v); this.adc(v ^ 0xff); break;
      case K.ANC: this.a &= this.read(addr); this.zn(this.a); this.p = (this.p & ~C) | (this.a >> 7); break;
      case K.ALR: this.a &= this.read(addr); this.p = (this.p & ~C) | (this.a & 1); this.a >>= 1; this.zn(this.a); break;
      case K.ARR: {
        this.a &= this.read(addr); this.a = (this.a >> 1) | ((this.p & C) << 7); this.zn(this.a);
        const b6 = (this.a >> 6) & 1, b5 = (this.a >> 5) & 1;
        this.p = (this.p & ~(C | V)) | (b6 ? C : 0) | ((b6 ^ b5) ? V : 0); break;
      }
      case K.SHY: case K.SHX: case K.AHX: case K.TAS: {
        const idx = (k === K.SHY) ? this.x : this.y;
        const hi = ((addr - idx) >> 8) & 0xff;
        let val = (k === K.SHY) ? this.y : (k === K.SHX) ? this.x : (this.a & this.x);
        if (k === K.TAS) this.sp = this.a & this.x;
        val &= (hi + 1) & 0xff;
        if (crossed) addr = (val << 8) | (addr & 0xff);
        this.write(addr, val); break;
      }
      case K.LAS: v = this.read(addr) & this.sp; this.a = this.x = this.sp = v; this.zn(v); break;
      case K.AXS: { v = this.read(addr); const t = (this.a & this.x); r = (t - v) & 0xff; this.p = (this.p & ~C) | (t >= v ? C : 0); this.x = r; this.zn(r); break; }
    }
    this.cycles += cyc;
    return cyc;
  }
  // for debugging / nestest logs
  static disasmName(op) { return TABLE[op][0]; }
}
CPU.FLAGS = { C, Z, I, D, B, U, V, N };
