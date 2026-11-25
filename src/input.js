// Keyboard + gamepad -> NES button byte (A,B,Select,Start,Up,Down,Left,Right = bits 0..7)
const keyMap = {
  KeyX: 0, KeyK: 0, Space: 0,
  KeyZ: 1, KeyJ: 1,
  ShiftLeft: 2, ShiftRight: 2, Tab: 2, Backspace: 2,
  Enter: 3,
  ArrowUp: 4, KeyW: 4, ArrowDown: 5, KeyS: 5, ArrowLeft: 6, KeyA: 6, ArrowRight: 7, KeyD: 7,
};
let kb = 0;
export function initInput({ onReset, onFullscreen, onMute, onStart }) {
  addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code in keyMap) { kb |= 1 << keyMap[e.code]; e.preventDefault(); if (e.code === 'Enter' || e.code === 'Space') onStart?.(); }
    else if (e.code === 'KeyR' && !e.repeat) onReset?.();
    else if (e.code === 'KeyF' && !e.repeat) onFullscreen?.();
    else if (e.code === 'KeyM' && !e.repeat) onMute?.();
  });
  addEventListener('keyup', (e) => { if (e.code in keyMap) { kb &= ~(1 << keyMap[e.code]); e.preventDefault(); } });
  addEventListener('blur', () => { kb = 0; });
}
export function readButtons() {
  let b = kb;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const pr = (i) => p.buttons[i] && p.buttons[i].pressed;
    if (pr(0) || pr(1)) b |= 1; // A
    if (pr(2) || pr(3)) b |= 2; // B
    if (pr(8)) b |= 4; if (pr(9)) b |= 8;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (pr(12) || ay < -0.5) b |= 16; if (pr(13) || ay > 0.5) b |= 32;
    if (pr(14) || ax < -0.5) b |= 64; if (pr(15) || ax > 0.5) b |= 128;
  }
  // a real pad can't press opposite directions together
  if ((b & 48) === 48) b &= ~48;
  if ((b & 192) === 192) b &= ~192;
  return b;
}
