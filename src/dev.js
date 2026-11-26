// Dev mode: free camera + live toggles for every light layer and effect, to show how the room is lit.
import GUI from 'lil-gui';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function initDev(ctx) {
  const { THREE, camera, renderer, canvas, room, DEV, LM, effects, setWhite, isBaked, tmpL, tmpR, eye } = ctx;
  const btn = document.getElementById('devbtn');
  const legend = document.getElementById('devlegend');
  let gui = null, controls = null;
  const state = { active: false };
  const saved = {};

  function enter() {
    state.active = true; document.body.classList.add('dev');
    saved.pos = camera.position.clone(); saved.quat = camera.quaternion.clone();
    controls = new OrbitControls(camera, canvas);
    controls.target.set(...room.camera.orbit); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 0.3; controls.maxDistance = 8; controls.screenSpacePanning = true;
    controls.update();
    gui = new GUI({ title: 'Dev mode — how the light works' });
    gui.domElement.classList.add('pb-gui');
    const lf = gui.addFolder('Light layers (baked in Blender Cycles)');
    lf.add(DEV, 'tvLeft').name('TV · left half of picture');
    lf.add(DEV, 'tvRight').name('TV · right half of picture');
    lf.add(DEV, 'ambient').name('Ambient fill');
    lf.add(DEV, 'spec').name('Live reflections');
    lf.add(DEV, 'tvGain', 0, 12, 0.1).name('TV brightness');
    lf.add(DEV, 'fill', 0, 0.02, 0.0005).name('Ambient fill amount');
    const cf = gui.addFolder('Colour');
    cf.add(DEV, 'tubeK', 6500, 12000, 100).name('Tube white (K)').onChange(setWhite);
    cf.add(DEV, 'wb', 2000, 9300, 100).name('Eye balance (K)').onChange(setWhite);
    cf.add(renderer, 'toneMappingExposure', 1, 20, 0.1).name('Exposure');
    const vf = gui.addFolder('View');
    vf.add(DEV, 'view', { 'Final': 'final', 'Lighting only': 'light', 'Left / right halves': 'halves' }).name('Mode').onChange((v) => {
      LM.uDebug.value = v === 'final' ? 0 : 1;
      legend.classList.toggle('show', v === 'halves');
    });
    const fx = { bloom: true, grain: true, vignette: true };
    vf.add(fx, 'bloom').name('Bloom').onChange((v) => { effects.bloom.blendMode.opacity.value = v ? 1 : 0; });
    vf.add(fx, 'grain').name('Film grain').onChange((v) => { effects.grain.blendMode.opacity.value = v ? 0.08 : 0; });
    vf.add(fx, 'vignette').name('Vignette').onChange((v) => { effects.vignette.blendMode.opacity.value = v ? 1 : 0; });
    vf.add(DEV, 'freeze').name('Pause the game');
    const cam = {
      seat: () => { camera.position.copy(eye); controls.target.set(...room.camera.target); controls.update(); },
      above: () => { camera.position.set(room.camera.orbit[0] + 0.01, (room.room?.H ?? 2.45) - 0.15, room.camera.orbit[2] + 0.4); controls.target.set(room.camera.orbit[0], 0, room.camera.orbit[2]); controls.update(); },
      orbit: () => { camera.position.set(room.camera.orbit[0] + 2.2, 1.6, room.camera.orbit[2] + 2.4); controls.target.set(...room.camera.orbit); controls.update(); },
    };
    const kf = gui.addFolder('Camera  (drag to orbit · right-drag to pan · scroll to zoom)');
    kf.add(cam, 'seat').name('Player seat');
    kf.add(cam, 'orbit').name('Corner view');
    kf.add(cam, 'above').name('Ceiling view');
    const info = { fps: '', calls: '', tris: '', bake: isBaked() ? 'yes' : 'no (realtime fallback)' };
    const ifold = gui.addFolder('Stats');
    ifold.add(info, 'fps').name('FPS').listen().disable();
    ifold.add(info, 'calls').name('Draw calls').listen().disable();
    ifold.add(info, 'tris').name('Triangles').listen().disable();
    ifold.add(info, 'bake').name('Baked lighting').disable();
    state.info = info;
    // live swatches of what each half of the picture is throwing into the room
    const sw = document.createElement('div'); sw.className = 'pb-swatches';
    sw.innerHTML = '<span>Left half</span><i id="swL"></i><span>Right half</span><i id="swR"></i>';
    gui.domElement.appendChild(sw);
    state.swL = sw.querySelector('#swL'); state.swR = sw.querySelector('#swR');
    state.frames = 0; state.acc = 0;
    btn.textContent = 'Exit dev mode';
  }
  function exit() {
    state.active = false; document.body.classList.remove('dev');
    controls?.dispose(); controls = null; gui?.destroy(); gui = null;
    LM.uDebug.value = 0; legend.classList.remove('show');
    effects.bloom.blendMode.opacity.value = 1; effects.grain.blendMode.opacity.value = 0.08; effects.vignette.blendMode.opacity.value = 1;
    DEV.freeze = false;
    camera.position.copy(saved.pos); camera.quaternion.copy(saved.quat);
    btn.textContent = 'Dev mode';
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); state.active ? exit() : enter(); btn.blur(); });
  addEventListener('keydown', (e) => { if (e.code === 'Backquote' && !e.repeat) state.active ? exit() : enter(); });

  const hex = (c) => '#' + c.clone().convertLinearToSRGB().getHexString();
  state.update = (dt) => {
    controls?.update();
    if (DEV.view === 'halves') {
      // false colour: left half's light in red, right half's in cyan, at their live intensities
      const mag = (c) => (c.r + c.g + c.b) / 3;
      const l = mag(LM.uTvL.value), r = mag(LM.uTvR.value);
      LM.uTvL.value.setRGB(1, 0.12, 0.08).multiplyScalar(l * 2.2);
      LM.uTvR.value.setRGB(0.08, 0.7, 1).multiplyScalar(r * 2.2);
    }
    state.frames++; state.acc += dt;
    if (state.acc > 0.5 && state.info) {
      state.info.fps = (state.frames / state.acc).toFixed(0);
      state.info.calls = renderer.info.render.calls; state.info.tris = renderer.info.render.triangles.toLocaleString();
      state.frames = 0; state.acc = 0;
      const m = (c) => { const k = Math.max(c.r, c.g, c.b, 1e-4); return c.clone().multiplyScalar(1 / k); };
      if (state.swL) { state.swL.style.background = hex(m(tmpL)); state.swR.style.background = hex(m(tmpR)); }
    }
  };
  return state;
}
