// Runs the NES off the main thread. Main sends {type:'run', frames, buttons}; worker replies with the latest frame.
import { NES } from './nes/nes.js';

let nes = null, audioPort = null, sampleRate = 48000, loaded = false;

self.onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      sampleRate = m.sampleRate || 48000;
      nes = new NES({ sampleRate });
      if (m.audioPort) audioPort = m.audioPort;
      break;
    case 'load':
      try {
        nes = new NES({ sampleRate });
        const rom = nes.load(m.buffer);
        if (m.sram && rom.battery) nes.mapper.sram.set(new Uint8Array(m.sram));
        loaded = true;
        self.postMessage({ type: 'loaded', mapper: rom.mapper, battery: rom.battery });
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
      }
      break;
    case 'reset':
      if (loaded) nes.reset();
      break;
    case 'run': {
      if (!loaded) return;
      nes.pads[0].buttons = m.buttons & 0xff;
      const n = Math.min(m.frames, 4);
      for (let i = 0; i < n; i++) nes.frame();
      const fb = nes.screen.slice();
      self.postMessage({ type: 'frame', fb }, [fb.buffer]);
      const s = nes.apu.takeSamples();
      if (audioPort && s.length) audioPort.postMessage(s, [s.buffer]);
      break;
    }
    case 'sram':
      if (loaded && nes.rom.battery) self.postMessage({ type: 'sram', data: nes.mapper.sram.slice() });
      break;
  }
};
