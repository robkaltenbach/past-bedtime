// AudioWorklet: plays NES samples queued from the emulator worker.
class NESAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = new Float32Array(32768); this.r = 0; this.w = 0; this.n = 0; this.last = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.port) { e.data.port.onmessage = (ev) => this.push(ev.data); return; }
      if (e.data instanceof Float32Array) this.push(e.data);
    };
  }
  push(s) {
    const cap = this.q.length;
    // keep latency bounded (~120ms): drop oldest if too far ahead
    const max = Math.floor(sampleRate * 0.12);
    for (let i = 0; i < s.length; i++) {
      this.q[this.w] = s[i]; this.w = (this.w + 1) % cap; this.n++;
      if (this.n > max) { this.r = (this.r + 1) % cap; this.n--; }
    }
  }
  process(_, outputs) {
    const out = outputs[0][0]; const cap = this.q.length;
    for (let i = 0; i < out.length; i++) {
      if (this.n > 0) { this.last = this.q[this.r]; this.r = (this.r + 1) % cap; this.n--; }
      else this.last *= 0.995; // underrun: decay instead of clicking
      out[i] = this.last;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('nes-audio', NESAudio);
