# Past Bedtime

A from-scratch NES emulator (6502 CPU, PPU, APU; mappers 0, 1, 2, 3, 4, 7, 66) running on a CRT inside a lamp-lit 1990s bedroom, built with three.js. The screen's live picture lights the room.

- `npm run dev` / `npm run build`
- Drop any `.nes` file onto the page. ROMs stay in the browser (IndexedDB); battery saves persist.
- Tests: `node test/nestest.mjs` (needs `nes-test-roms`).

Two Tree Creative 2026 · Models/textures: Poly Haven (CC0) · Demo cart: nes15 by Mathew Brenaman (BSD).
