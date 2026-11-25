import { CPU } from './cpu.js';
import { PPU } from './ppu.js';
import { APU } from './apu.js';
import { parseROM, createMapper } from './cart.js';

export const BUTTON = { A: 0, B: 1, SELECT: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7 };

class Controller {
  constructor() { this.buttons = 0; this.shift = 0; this.strobe = 0; }
  write(v) { this.strobe = v & 1; if (this.strobe) this.shift = this.buttons; }
  read() {
    if (this.strobe) return 0x40 | (this.buttons & 1);
    const b = this.shift & 1; this.shift = (this.shift >> 1) | 0x80; return 0x40 | b;
  }
  set(btn, down) { if (down) this.buttons |= 1 << btn; else this.buttons &= ~(1 << btn); }
}

export class NES {
  constructor({ sampleRate = 48000 } = {}) {
    this.ram = new Uint8Array(2048);
    this.cpu = new CPU(this);
    this.ppu = new PPU(this);
    this.apu = new APU(this, sampleRate);
    this.pads = [new Controller(), new Controller()];
    this.mapper = null; this.openBus = 0;
  }
  load(buffer) {
    const rom = parseROM(buffer);
    this.rom = rom;
    this.mapper = createMapper(rom);
    this.ram.fill(0);
    this.ppu.reset();
    this.cpu.a = this.cpu.x = this.cpu.y = 0; this.cpu.sp = 0xfd; this.cpu.p = 0x24; this.cpu.cycles = 0;
    this.cpu.pc = this.cpu.read16(0xfffc); this.cpu.cycles = 7;
    return rom;
  }
  reset() { if (!this.mapper) return; this.cpu.reset(); this.ppu.writeReg(0, 0); this.ppu.writeReg(1, 0); }
  cpuRead(a) {
    let v;
    if (a < 0x2000) v = this.ram[a & 0x7ff];
    else if (a < 0x4000) v = this.ppu.readReg(a & 7);
    else if (a === 0x4015) v = this.apu.readStatus();
    else if (a === 0x4016) v = (this.pads[0].read() & 0x1f) | (this.openBus & 0xe0);
    else if (a === 0x4017) v = (this.pads[1].read() & 0x1f) | (this.openBus & 0xe0);
    else if (a < 0x4020) v = this.openBus;
    else v = this.mapper.cpuRead(a);
    this.openBus = v;
    return v;
  }
  cpuWrite(a, v) {
    this.openBus = v;
    if (a < 0x2000) this.ram[a & 0x7ff] = v;
    else if (a < 0x4000) this.ppu.writeReg(a & 7, v);
    else if (a === 0x4014) { this.ppu.dma(v); this.cpu.stall += 513 + (this.cpu.cycles & 1); }
    else if (a === 0x4016) { this.pads[0].write(v); this.pads[1].write(v); }
    else if (a < 0x4018) this.apu.writeReg(a, v);
    else if (a >= 0x4020) this.mapper.cpuWrite(a, v);
  }
  // run one CPU instruction plus matching PPU/APU time
  step() {
    const c = this.cpu.step();
    const ppu = this.ppu;
    for (let i = 0, n = c * 3; i < n; i++) ppu.step();
    const apu = this.apu;
    for (let i = 0; i < c; i++) apu.step();
    this.cpu.irqLines = (this.mapper.irq ? 1 : 0) | (apu.irq ? 2 : 0);
    return c;
  }
  frame() {
    if (!this.mapper) return;
    this.ppu.frameReady = false;
    let guard = 0;
    while (!this.ppu.frameReady && guard++ < 200000) this.step();
  }
  get screen() { return this.ppu.front; }
}
