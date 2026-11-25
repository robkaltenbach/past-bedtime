// usage: node run.mjs rom frames out.rgba  -> prints $6000 status text if present
import { NES } from '../src/nes/nes.js';
import fs from 'fs';
const [rom, frames, out, press] = process.argv.slice(2);
const nes = new NES();
nes.load(fs.readFileSync(rom));
const F = +frames;
for (let f = 0; f < F; f++) {
  if (press) { const on = (f % 60) > 30 && f > 120; nes.pads[0].set(3, on && (f % 240) < 120); }
  nes.frame();
}
if (out) fs.writeFileSync(out, Buffer.from(nes.screen.buffer));
const s = nes.mapper.sram;
if (s[1] === 0xde && s[2] === 0xb0 && s[3] === 0x61) {
  let t = ''; for (let i = 4; s[i]; i++) t += String.fromCharCode(s[i]);
  console.log('status', s[0].toString(16), '|', t.trim().replace(/\n+/g, ' / '));
} else console.log('no $6000 status');
