// 2A03 APU: 2 pulse, triangle, noise, DMC, frame counter. Outputs float samples at sampleRate.
const LENGTH = [10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30];
const DUTY = [[0, 1, 0, 0, 0, 0, 0, 0], [0, 1, 1, 0, 0, 0, 0, 0], [0, 1, 1, 1, 1, 0, 0, 0], [1, 0, 0, 1, 1, 1, 1, 1]];
const TRI = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const NOISE = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const DMC = [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54];
const CPU_HZ = 1789773;

const PULSE_T = new Float32Array(31); for (let i = 0; i < 31; i++) PULSE_T[i] = 95.52 / (8128 / i + 100);
const TND_T = new Float32Array(203); for (let i = 0; i < 203; i++) TND_T[i] = 163.67 / (24329 / i + 100);

class Envelope {
  constructor() { this.start = false; this.loop = false; this.constant = false; this.period = 0; this.value = 0; this.divider = 0; this.decay = 0; }
  clock() {
    if (this.start) { this.start = false; this.decay = 15; this.divider = this.period; }
    else if (this.divider > 0) this.divider--;
    else { this.divider = this.period; if (this.decay > 0) this.decay--; else if (this.loop) this.decay = 15; }
  }
  out() { return this.constant ? this.period : this.decay; }
}

class Pulse {
  constructor(ch) {
    this.ch = ch; this.enabled = false; this.duty = 0; this.dutyPos = 0; this.timer = 0; this.period = 0; this.length = 0;
    this.env = new Envelope(); this.swEnable = false; this.swPeriod = 0; this.swNeg = false; this.swShift = 0; this.swReload = false; this.swDiv = 0;
  }
  write(r, v) {
    switch (r) {
      case 0: this.duty = v >> 6; this.env.loop = !!(v & 0x20); this.env.constant = !!(v & 0x10); this.env.period = v & 15; break;
      case 1: this.swEnable = !!(v & 0x80); this.swPeriod = (v >> 4) & 7; this.swNeg = !!(v & 8); this.swShift = v & 7; this.swReload = true; break;
      case 2: this.period = (this.period & 0x700) | v; break;
      case 3: this.period = (this.period & 0xff) | ((v & 7) << 8); if (this.enabled) this.length = LENGTH[v >> 3]; this.dutyPos = 0; this.env.start = true; break;
    }
  }
  target() { const c = this.period >> this.swShift; return this.swNeg ? this.period - c - (this.ch === 1 ? 1 : 0) : this.period + c; }
  clockTimer() { if (this.timer === 0) { this.timer = this.period; this.dutyPos = (this.dutyPos + 1) & 7; } else this.timer--; }
  clockLength() { if (!this.env.loop && this.length > 0) this.length--; }
  clockSweep() {
    const t = this.target();
    if (this.swDiv === 0 && this.swEnable && this.swShift && this.period >= 8 && t <= 0x7ff) this.period = t;
    if (this.swDiv === 0 || this.swReload) { this.swDiv = this.swPeriod; this.swReload = false; } else this.swDiv--;
  }
  out() {
    if (!this.enabled || this.length === 0 || !DUTY[this.duty][this.dutyPos] || this.period < 8 || this.target() > 0x7ff) return 0;
    return this.env.out();
  }
}

class Triangle {
  constructor() { this.enabled = false; this.control = false; this.linReload = 0; this.lin = 0; this.linFlag = false; this.period = 0; this.timer = 0; this.length = 0; this.pos = 0; }
  write(r, v) {
    switch (r) {
      case 0: this.control = !!(v & 0x80); this.linReload = v & 0x7f; break;
      case 2: this.period = (this.period & 0x700) | v; break;
      case 3: this.period = (this.period & 0xff) | ((v & 7) << 8); if (this.enabled) this.length = LENGTH[v >> 3]; this.linFlag = true; break;
    }
  }
  clockTimer() {
    if (this.timer === 0) { this.timer = this.period; if (this.length > 0 && this.lin > 0 && this.period > 1) this.pos = (this.pos + 1) & 31; }
    else this.timer--;
  }
  clockLinear() { if (this.linFlag) this.lin = this.linReload; else if (this.lin > 0) this.lin--; if (!this.control) this.linFlag = false; }
  clockLength() { if (!this.control && this.length > 0) this.length--; }
  out() { return TRI[this.pos]; }
}

class Noise {
  constructor() { this.enabled = false; this.mode = false; this.period = 4; this.timer = 0; this.length = 0; this.shift = 1; this.env = new Envelope(); }
  write(r, v) {
    switch (r) {
      case 0: this.env.loop = !!(v & 0x20); this.env.constant = !!(v & 0x10); this.env.period = v & 15; break;
      case 2: this.mode = !!(v & 0x80); this.period = NOISE[v & 15]; break;
      case 3: if (this.enabled) this.length = LENGTH[v >> 3]; this.env.start = true; break;
    }
  }
  clockTimer() {
    if (this.timer === 0) {
      this.timer = this.period;
      const b = this.mode ? 6 : 1, fb = (this.shift & 1) ^ ((this.shift >> b) & 1);
      this.shift = (this.shift >> 1) | (fb << 14);
    } else this.timer--;
  }
  clockLength() { if (!this.env.loop && this.length > 0) this.length--; }
  out() { if (!this.enabled || this.length === 0 || (this.shift & 1)) return 0; return this.env.out(); }
}

class DMCChan {
  constructor(apu) { this.apu = apu; this.enabled = false; this.irqEnable = false; this.loop = false; this.period = 428; this.timer = 0; this.value = 0; this.addr = 0xc000; this.len = 0; this.curAddr = 0; this.remaining = 0; this.shift = 0; this.bits = 0; this.irq = false; this.silent = true; }
  write(r, v) {
    switch (r) {
      case 0: this.irqEnable = !!(v & 0x80); this.loop = !!(v & 0x40); this.period = DMC[v & 15]; if (!this.irqEnable) this.irq = false; break;
      case 1: this.value = v & 0x7f; break;
      case 2: this.addr = 0xc000 | (v << 6); break;
      case 3: this.len = (v << 4) | 1; break;
    }
  }
  restart() { this.curAddr = this.addr; this.remaining = this.len; }
  clockTimer() {
    if (!this.enabled) return;
    // memory reader
    if (this.bits === 0 && this.remaining > 0) {
      this.shift = this.apu.nes.cpuRead(this.curAddr); this.apu.nes.cpu.stall += 4;
      this.curAddr = this.curAddr === 0xffff ? 0x8000 : this.curAddr + 1;
      this.remaining--; this.bits = 8; this.silent = false;
      if (this.remaining === 0) { if (this.loop) this.restart(); else if (this.irqEnable) this.irq = true; }
    }
    if (this.timer === 0) {
      this.timer = this.period;
      if (this.bits > 0) {
        if (!this.silent) {
          if (this.shift & 1) { if (this.value <= 125) this.value += 2; } else if (this.value >= 2) this.value -= 2;
        }
        this.shift >>= 1; this.bits--;
        if (this.bits === 0 && this.remaining === 0) this.silent = true;
      }
    } else this.timer--;
  }
}

export class APU {
  constructor(nes, sampleRate = 48000) {
    this.nes = nes; this.sampleRate = sampleRate;
    this.p1 = new Pulse(1); this.p2 = new Pulse(2); this.tri = new Triangle(); this.noise = new Noise(); this.dmc = new DMCChan(this);
    this.cycle = 0; this.frameMode = 0; this.frameIrqInhibit = true; this.frameIrq = false; this.frameStep = 0; this.frameCounter = 0;
    this.mixSum = 0; this.mixN = 0;
    this.sampleAcc = 0; this.samplesPerCycle = sampleRate / CPU_HZ;
    this.buf = new Float32Array(4096); this.bufLen = 0;
    // simple filters (NES hardware: HP 90Hz, HP 440Hz, LP 14kHz)
    this.hp1 = 0; this.hp1x = 0; this.hp2 = 0; this.hp2x = 0; this.lp = 0;
    const dt = 1 / sampleRate;
    const rc = (f) => 1 / (2 * Math.PI * f);
    this.aHP1 = rc(90) / (rc(90) + dt); this.aHP2 = rc(440) / (rc(440) + dt); this.aLP = dt / (rc(14000) + dt);
  }
  get irq() { return this.frameIrq || this.dmc.irq; }
  writeReg(a, v) {
    if (a < 0x4004) this.p1.write(a & 3, v);
    else if (a < 0x4008) this.p2.write(a & 3, v);
    else if (a < 0x400c) this.tri.write(a & 3, v);
    else if (a < 0x4010) this.noise.write(a & 3, v);
    else if (a < 0x4014) this.dmc.write(a & 3, v);
    else if (a === 0x4015) {
      this.p1.enabled = !!(v & 1); this.p2.enabled = !!(v & 2); this.tri.enabled = !!(v & 4); this.noise.enabled = !!(v & 8); this.dmc.enabled = !!(v & 16);
      if (!this.p1.enabled) this.p1.length = 0; if (!this.p2.enabled) this.p2.length = 0;
      if (!this.tri.enabled) this.tri.length = 0; if (!this.noise.enabled) this.noise.length = 0;
      if (!this.dmc.enabled) this.dmc.remaining = 0; else if (this.dmc.remaining === 0) this.dmc.restart();
      this.dmc.irq = false;
    } else if (a === 0x4017) {
      this.frameMode = (v >> 7) & 1; this.frameIrqInhibit = !!(v & 0x40);
      if (this.frameIrqInhibit) this.frameIrq = false;
      this.frameCounter = 0; this.frameStep = 0;
      if (this.frameMode === 1) { this.quarter(); this.half(); }
    }
  }
  readStatus() {
    let s = 0;
    if (this.p1.length > 0) s |= 1; if (this.p2.length > 0) s |= 2; if (this.tri.length > 0) s |= 4; if (this.noise.length > 0) s |= 8;
    if (this.dmc.remaining > 0) s |= 16; if (this.frameIrq) s |= 64; if (this.dmc.irq) s |= 128;
    this.frameIrq = false; return s;
  }
  quarter() { this.p1.env.clock(); this.p2.env.clock(); this.noise.env.clock(); this.tri.clockLinear(); }
  half() { this.p1.clockLength(); this.p2.clockLength(); this.tri.clockLength(); this.noise.clockLength(); this.p1.clockSweep(); this.p2.clockSweep(); }
  // advance one CPU cycle
  step() {
    this.cycle++;
    this.tri.clockTimer();
    if (this.cycle & 1) { this.p1.clockTimer(); this.p2.clockTimer(); this.noise.clockTimer(); }
    this.dmc.clockTimer();
    // frame sequencer at ~240Hz (every 7457 CPU cycles)
    if (++this.frameCounter >= 7457) {
      this.frameCounter = 0;
      const s = this.frameStep;
      if (this.frameMode === 0) {
        this.quarter(); if (s === 1 || s === 3) this.half();
        if (s === 3 && !this.frameIrqInhibit) this.frameIrq = true;
        this.frameStep = (s + 1) % 4;
      } else {
        if (s !== 3) this.quarter(); if (s === 1 || s === 4) this.half();
        this.frameStep = (s + 1) % 5;
      }
    }
    // box-filter every cycle into each output sample (cheap anti-aliasing)
    if (this.cycle & 1) {
      this.mixSum += PULSE_T[this.p1.out() + this.p2.out()] + TND_T[3 * this.tri.out() + 2 * this.noise.out() + this.dmc.value];
      this.mixN++;
    }
    this.sampleAcc += this.samplesPerCycle;
    if (this.sampleAcc >= 1) { this.sampleAcc -= 1; this.emit(); }
  }
  emit() {
    const x = this.mixN ? this.mixSum / this.mixN : 0;
    this.mixSum = 0; this.mixN = 0;
    // filters
    const h1 = this.aHP1 * (this.hp1 + x - this.hp1x); this.hp1 = h1; this.hp1x = x;
    const h2 = this.aHP2 * (this.hp2 + h1 - this.hp2x); this.hp2 = h2; this.hp2x = h1;
    this.lp += this.aLP * (h2 - this.lp);
    if (this.bufLen < this.buf.length) this.buf[this.bufLen++] = this.lp;
  }
  takeSamples() { const out = this.buf.slice(0, this.bufLen); this.bufLen = 0; return out; }
}
