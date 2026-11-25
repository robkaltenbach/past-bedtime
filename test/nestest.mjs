import { NES } from '../src/nes/nes.js';
import fs from 'fs';
const R = process.env.NES_TEST_ROMS || '../nes-test-roms/other/';
const nes = new NES();
nes.load(fs.readFileSync(R + 'nestest.nes'));
const cpu = nes.cpu; cpu.pc = 0xc000; cpu.p = 0x24; cpu.sp = 0xfd; cpu.cycles = 7;
const log = fs.readFileSync(R + 'nestest.log', 'utf8').split(/\r?\n/).filter(Boolean);
const h = (v, n = 2) => v.toString(16).toUpperCase().padStart(n, '0');
for (let i = 0; i < log.length; i++) {
  const L = log[i];
  const exp = { pc: L.slice(0, 4), a: L.match(/A:(\w\w)/)[1], x: L.match(/X:(\w\w)/)[1], y: L.match(/Y:(\w\w)/)[1], p: L.match(/P:(\w\w)/)[1], sp: L.match(/SP:(\w\w)/)[1], cyc: L.match(/CYC:(\d+)/)[1] };
  const got = { pc: h(cpu.pc, 4), a: h(cpu.a), x: h(cpu.x), y: h(cpu.y), p: h(cpu.p), sp: h(cpu.sp), cyc: String(cpu.cycles) };
  const bad = Object.keys(exp).filter((k) => exp[k] !== got[k]);
  if (bad.length) { console.log('MISMATCH line', i + 1, bad, '\n exp', L, '\n got', JSON.stringify(got), '\n prev', log[i - 1]); process.exit(1); }
  nes.step();
}
console.log('nestest OK', log.length, 'lines; result bytes', h(nes.ram[2]), h(nes.ram[3]));
