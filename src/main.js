import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect, BlendFunction, SMAAEffect, DepthOfFieldEffect, ChromaticAberrationEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import bedroom from './rooms/bedroom.js';
import living from './rooms/living.js';
import { shadowAll, setAniso } from './scene/util.js';
import { makeScreenMesh, ScreenLight, SCREEN, whitePoint } from './crt.js';
import { initInput, readButtons } from './input.js';
import { RomStore } from './store.js';
import { exportScene, applyBake, LM } from './bake.js';
import { initDev } from './dev.js';

const ROOMS = { bedroom, living };

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const EXPORT = params.has('export');
let baked = null;
const VIEW = params.has('view') ? params.get('view').split(',').map(Number) : null;
let ROOM_ID = params.get('room') || (() => { try { return localStorage.getItem('pb-room'); } catch { return null; } })() || 'bedroom';
if (!ROOMS[ROOM_ID]) ROOM_ID = 'bedroom';
const room = ROOMS[ROOM_ID];

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
const MAX_DPR = Math.min(window.devicePixelRatio || 1, 1.5);
let dpr = TEST ? 1 : MAX_DPR;
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
setAniso(renderer.capabilities.getMaxAnisotropy());
renderer.info.autoReset = false; // count every pass of a frame, not just the last fullscreen quad
RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(room.camera.fov, innerWidth / innerHeight, 0.03, 30);
const EYE = new THREE.Vector3(...room.camera.eye);
camera.position.copy(EYE);

// ---------------------------------------------------------------- room
const handles = room.build(scene);
const consoleBox = handles.consoleBox;

// ---------------------------------------------------------------- models
const manager = new THREE.LoadingManager();
const gltf = new GLTFLoader(manager);
const loadModel = (id) => new Promise((res, rej) => gltf.load(`${BASE}assets/models/${id}/${id}.gltf`, (g) => res(g.scene), undefined, rej));
const progressEl = document.getElementById('progress');
manager.onProgress = (_, done, total) => { if (progressEl) progressEl.style.width = `${Math.round((done / total) * 100)}%`; };

const TV_S = room.tv.scale;
const tvGroup = new THREE.Group();
tvGroup.position.set(...room.tv.pos); tvGroup.scale.setScalar(TV_S); tvGroup.rotation.y = room.tv.rotY;
scene.add(tvGroup);

// emulator framebuffer texture
const fbBytes = new Uint8Array(256 * 240 * 4);
const frameTex = new THREE.DataTexture(fbBytes, 256, 240, THREE.RGBAFormat);
frameTex.flipY = false; frameTex.generateMipmaps = true;
frameTex.minFilter = THREE.LinearMipmapLinearFilter; frameTex.magFilter = THREE.LinearFilter;
frameTex.colorSpace = THREE.NoColorSpace; frameTex.needsUpdate = true;
const { screen, glass } = makeScreenMesh(frameTex);
tvGroup.add(screen, glass);
const screenU = screen.material.uniforms;

async function loadModels() {
  const models = await Promise.all(room.models.map(loadModel));
  tvGroup.add(shadowAll(models[0]));
  room.place(scene, models, handles);
}

// ---------------------------------------------------------------- lights
// TV world-space emitter frame
const scrWorld = new THREE.Vector3(), scrFwd = new THREE.Vector3();
function updateScreenFrame() {
  tvGroup.updateMatrixWorld(true);
  scrWorld.set(SCREEN.cx, SCREEN.cy, SCREEN.zc).applyMatrix4(tvGroup.matrixWorld);
  scrFwd.set(0, 0, 1).transformDirection(tvGroup.matrixWorld);
}
updateScreenFrame();

const light = new ScreenLight(8, 6);
const tvArea = new THREE.RectAreaLight(0xffffff, 0, SCREEN.w * TV_S, SCREEN.h * TV_S);
tvArea.position.copy(scrWorld).addScaledVector(scrFwd, 0.004);
tvArea.lookAt(tvArea.position.clone().add(scrFwd));
scene.add(tvArea);

// fallback when no bake is available: a dim fill so the room isn't black
const fallback = new THREE.HemisphereLight(0xffffff, 0x404040, 0);
scene.add(fallback);

const led = new THREE.PointLight(0xff2010, 0.0009, 0.5, 2);
led.position.set(consoleBox.position.x + 0.135, 0.03, consoleBox.position.z + 0.13);
scene.add(led);

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
Object.assign(ao.configuration, { aoRadius: 0.22, distanceFalloff: 0.6, intensity: 1.6, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, aoSamples: 12, denoiseSamples: 6, denoiseRadius: 10 });
if (params.has('ao')) composer.addPass(ao);
const bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.45, luminanceThreshold: 0.75, luminanceSmoothing: 0.35, radius: 0.72 });
const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.38 });
const grain = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.ADD });
grain.blendMode.opacity.value = 0.08;
const dof = new DepthOfFieldEffect(camera, { worldFocusDistance: 2.25, worldFocusRange: 1.6, bokehScale: 2.2, resolutionScale: 0.5 });
const ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0006, 0.0004), radialModulation: true, modulationOffset: 0.35 });
if (params.has('dof')) composer.addPass(new EffectPass(camera, dof));
// one fullscreen pass for the grade, one for AA (each pass at 4K-ish costs real time)
composer.addPass(new EffectPass(camera, bloom, tone, vignette, grain));
composer.addPass(new EffectPass(camera, new SMAAEffect()));
renderer.toneMappingExposure = params.has('exp') ? +params.get('exp') : 2.4;

// ---------------------------------------------------------------- environment (captured once, scaled live)
function captureEnvironment() {
  const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cc = new THREE.CubeCamera(0.05, 20, rt);
  cc.position.set(0.1, 0.9, -0.4);
  light.setUniform(0, 0, 0, 1); applyLights(0, 1);
  screen.visible = glass.visible = false;
  const bg = scene.background; scene.background = new THREE.Color(0);
  cc.update(renderer, scene);
  screen.visible = glass.visible = true; scene.background = bg;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromCubemap(rt.texture).texture;
  scene.environmentIntensity = 0;
}

// ---------------------------------------------------------------- emulator + audio
const worker = new Worker(new URL('./emu-worker.js', import.meta.url), { type: 'module' });
let audio = null, audioOut = null, hiss = null, panner = null;
let romLoaded = false, inFlight = false, emuAcc = 0, needFrame = false;
const fb32 = new Uint32Array(fbBytes.buffer);
let power = 0, powerTarget = 1, signal = 0, signalTarget = 0;
const store = new RomStore();

async function initAudio() {
  if (audio) return;
  audio = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  await audio.audioWorklet.addModule(`${BASE}nes-audio.js`);
  const node = new AudioWorkletNode(audio, 'nes-audio', { outputChannelCount: [1] });
  const ch = new MessageChannel();
  node.port.postMessage({ port: ch.port1 }, [ch.port1]);
  worker.postMessage({ type: 'init', sampleRate: audio.sampleRate, audioPort: ch.port2 }, [ch.port2]);
  // a small CRT speaker in a carpeted room
  const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
  const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
  const body = audio.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 900; body.gain.value = 3; body.Q.value = 0.8;
  const rev = audio.createConvolver(); rev.buffer = roomImpulse(audio);
  const wet = audio.createGain(); wet.gain.value = 0.22;
  panner = audio.createStereoPanner();
  audioOut = audio.createGain(); audioOut.gain.value = 0.9;
  node.connect(hp).connect(body).connect(lp);
  lp.connect(panner); lp.connect(rev).connect(wet).connect(panner);
  panner.connect(audioOut).connect(audio.destination);
  // static hiss for no-signal
  const nb = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(); src.buffer = nb; src.loop = true;
  const hf = audio.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 3200; hf.Q.value = 0.4;
  hiss = audio.createGain(); hiss.gain.value = 0;
  src.connect(hf).connect(hiss).connect(hp); src.start();
}
function roomImpulse(ctx) {
  const len = Math.floor(ctx.sampleRate * 0.45), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 60 ? i / 60 : 1); }
  return b;
}

worker.onerror = (e) => showError('Emulator crashed: ' + (e.message || 'unknown error'));
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'frame') {
    inFlight = false;
    fb32.set(m.fb);
    frameTex.needsUpdate = true;
    light.update(m.fb, 1);
    needFrame = false;
    worker.postMessage({ type: 'recycle', fb: m.fb }, [m.fb.buffer]);
  } else if (m.type === 'loaded') {
    romLoaded = true; signalTarget = 1;
    hideError();
  } else if (m.type === 'error') {
    showError(m.message); romLoaded = false; signalTarget = 0;
  } else if (m.type === 'sram' && currentRom) {
    store.saveSram(currentRom.key, m.data);
  }
};

let currentRom = null;
async function insertCartridge(name, buffer, { remember = true } = {}) {
  await initAudio();
  const bytes = new Uint8Array(buffer);
  const key = RomStore.hash(bytes);
  currentRom = { name, key };
  // channel change: drop to static briefly, then the new picture
  signalTarget = 0; romLoaded = false; signal = 0;
  const sram = await store.loadSram(key);
  setTimeout(() => worker.postMessage({ type: 'load', buffer: bytes.buffer.slice(0), sram }), 450);
  if (remember) store.saveRom(name, bytes);
  setCartLabel(name);
}

// ---------------------------------------------------------------- UI
const ui = {
  intro: document.getElementById('intro'), start: document.getElementById('start'), help: document.getElementById('help'),
  err: document.getElementById('err'), file: document.getElementById('file'), cart: document.getElementById('cart'), drop: document.getElementById('drop'),
};
function showError(msg) { ui.err.textContent = msg; ui.err.classList.add('show'); }
function hideError() { ui.err.classList.remove('show'); }
function setCartLabel(n) { ui.cart.textContent = '▶ ' + n.replace(/\.nes$/i, ''); ui.cart.classList.add('on'); }

let started = false;
async function start() {
  if (started) return; started = true;
  ui.intro.classList.add('gone'); ui.help.classList.remove('gone');
  await initAudio();
  audio.resume();
  const last = await store.loadRom();
  if (last) insertCartridge(last.name, last.bytes, { remember: false });
  else {
    const r = await fetch(`${BASE}roms/nes15.nes`);
    insertCartridge('nes15 (demo cart)', await r.arrayBuffer(), { remember: false });
  }
  setTimeout(() => ui.help.classList.add('fade'), 12000);
  document.activeElement?.blur?.();
}
ui.start.addEventListener('click', start);
document.getElementById('load').addEventListener('click', (e) => { e.stopPropagation(); ui.file.click(); });
document.getElementById('load2').addEventListener('click', (e) => { e.stopPropagation(); ui.file.click(); });
// room picker: rooms are separate scenes (and separate bakes), so switching reloads
const goRoom = (id) => { try { localStorage.setItem('pb-room', id); } catch {} const u = new URL(location.href); u.searchParams.set('room', id); location.href = u.toString(); };
for (const b of document.querySelectorAll('#rooms button')) {
  b.classList.toggle('on', b.dataset.room === ROOM_ID);
  b.addEventListener('click', () => { if (b.dataset.room !== ROOM_ID) goRoom(b.dataset.room); });
}
document.getElementById('swap').addEventListener('click', (e) => { e.stopPropagation(); goRoom(ROOM_ID === 'bedroom' ? 'living' : 'bedroom'); });
ui.file.addEventListener('change', async () => {
  const f = ui.file.files[0]; if (!f) return;
  if (!started) { started = true; ui.intro.classList.add('gone'); ui.help.classList.remove('gone'); await initAudio(); audio.resume(); }
  insertCartridge(f.name, await f.arrayBuffer());
  ui.file.value = '';
});
addEventListener('dragover', (e) => { e.preventDefault(); ui.drop.classList.add('show'); });
addEventListener('dragleave', (e) => { if (e.target === document.documentElement || e.clientX <= 0 || e.clientY <= 0) ui.drop.classList.remove('show'); });
addEventListener('drop', async (e) => {
  e.preventDefault(); ui.drop.classList.remove('show');
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (!started) { started = true; ui.intro.classList.add('gone'); ui.help.classList.remove('gone'); await initAudio(); audio.resume(); }
  insertCartridge(f.name, await f.arrayBuffer());
});

let toastT = 0;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
addEventListener('gamepadconnected', (e) => toast('Controller connected: ' + e.gamepad.id.replace(/\(.*\)/, '').trim()));
canvas.tabIndex = 0; canvas.addEventListener('pointerdown', () => { canvas.focus(); document.activeElement !== canvas && canvas.focus(); });
addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !e.repeat) { ui.help.classList.remove('fade'); ui.help.classList.toggle('hidden'); } });
initInput({
  onReset: () => { if (romLoaded) { worker.postMessage({ type: 'reset' }); power = 0.02; } },
  onFullscreen: () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); },
  onMute: () => { if (audioOut) audioOut.gain.value = audioOut.gain.value > 0 ? 0 : 0.9; },
  onStart: () => start(),
});
setInterval(() => { if (romLoaded) worker.postMessage({ type: 'sram' }); }, 5000);
addEventListener('beforeunload', () => { if (romLoaded) worker.postMessage({ type: 'sram' }); });

// ---------------------------------------------------------------- gentle look
const look = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => {
  // soft response curve: small moves near the centre barely turn the head
  const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.35);
  look.tx = f((e.clientX / innerWidth) * 2 - 1);
  look.ty = f((e.clientY / innerHeight) * 2 - 1);
});
document.addEventListener('mouseleave', () => { look.tx = 0; look.ty = 0; });
const baseTarget = new THREE.Vector3(...room.camera.target);
const baseDir = baseTarget.clone().sub(EYE).normalize();
const baseYaw = Math.atan2(baseDir.x, -baseDir.z), basePitch = Math.asin(baseDir.y);
if (params.has('cam')) { const [yx, yy] = params.get('cam').split(',').map(Number); look.tx = look.x = yx; look.ty = look.y = yy; }

// ---------------------------------------------------------------- frame loop
// CRT white point (9300K) on the picture; the light it throws into the dark room reads cooler still,
// because dark-adapted eyes shift toward blue (Purkinje effect)
// The room light is shown the way film shows TV glow: as if white-balanced for a warm house (WB kelvin),
// so a 9300K tube reads properly blue on everything it touches.
const SCREEN_K = params.has('k') ? +params.get('k') : 9300, WB_K = params.has('wb') ? +params.get('wb') : 3000;
screenU.uWhite.value.copy(whitePoint(SCREEN_K));
const rt = whitePoint(SCREEN_K).divide(whitePoint(WB_K).divideScalar(1));
rt.divideScalar(0.2126 * rt.x + 0.7152 * rt.y + 0.0722 * rt.z);
const ROOM_TINT = new THREE.Color(rt.x, rt.y, rt.z);
const ENV_I = params.has('env') ? +params.get('env') : 0.2;
const tmpL = new THREE.Color(), tmpR = new THREE.Color();
const LAMP_GAIN = params.has('amb') ? +params.get('amb') : room.staticGain, TV_GAIN = params.has('tvg') ? +params.get('tvg') : (room.tvGain || 4.0);
const DEV = {
  tvLeft: true, tvRight: true, ambient: true, spec: true,
  tvGain: TV_GAIN, ambientGain: LAMP_GAIN, fill: params.has('fill') ? +params.get('fill') : (room.fill || 0), wb: WB_K, tubeK: SCREEN_K,
  freeze: false, view: 'final',
};
function setWhite() {
  screenU.uWhite.value.copy(whitePoint(DEV.tubeK));
  const r = whitePoint(DEV.tubeK).divide(whitePoint(DEV.wb));
  r.divideScalar(0.2126 * r.x + 0.7152 * r.y + 0.0722 * r.z);
  ROOM_TINT.setRGB(r.x, r.y, r.z);
}
function applyLights(lum, pw) {
  const L = lum;
  if (baked) {
    light.halves(tmpL, tmpR, pw);
    // Cycles' diffuse light pass is outgoing radiance for albedo 1; three wants irradiance (x PI).
    // The baked screen emitted radiance 1; ours shows the picture at uBright.
    const k = Math.PI * screenU.uBright.value;
    LM.uTvL.value.copy(tmpL).multiply(ROOM_TINT).multiplyScalar(baked.scales.tvl * k * DEV.tvGain * (DEV.tvLeft ? 1 : 0));
    LM.uTvR.value.copy(tmpR).multiply(ROOM_TINT).multiplyScalar(baked.scales.tvr * k * DEV.tvGain * (DEV.tvRight ? 1 : 0));
    LM.uLamp.value.setScalar((baked.scales.lamp || 0) * Math.PI * DEV.ambientGain * (DEV.ambient ? 1 : 0));
    LM.uFill.value.setRGB(0.8, 0.86, 1).multiplyScalar(DEV.fill * (DEV.ambient ? 1 : 0));
    tvArea.color.copy(light.avg).multiply(ROOM_TINT); tvArea.intensity = DEV.spec ? 1.5 * L * DEV.tvGain : 0;
    fallback.intensity = 0;
    scene.environmentIntensity = DEV.spec ? ENV_I : 0;
    return;
  }
  tvArea.color.copy(light.avg);
  tvArea.intensity = 60 * L;
  fallback.color.copy(light.avg); fallback.intensity = params.has('flat') ? 2.5 : 0.4 * L + 0.02;
  scene.environmentIntensity = ENV_I;
}

let last = performance.now(), t = 0, frameTimes = [], dprCooldown = 0, dev = null;
function resize() {
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// the picture only changes at 60 Hz, so render at a steady 60 instead of chasing 120 Hz displays (avoids vsync judder)
const FRAME_MIN = params.has('uncapped') ? 0 : 13.5; // > one 120 Hz interval, < one 60 Hz interval
function tick(now) {
  if (now - last < FRAME_MIN) { requestAnimationFrame(tick); return; }
  const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;

  // emulator pacing (NTSC 60.0988 fps)
  if (romLoaded && signal > 0.02 && !DEV.freeze) {
    emuAcc += dt * 60.0988;
    const n = Math.floor(emuAcc);
    if (n > 0 && !inFlight) { emuAcc -= n; if (emuAcc > 3) emuAcc = 0; inFlight = true; worker.postMessage({ type: 'run', frames: n, buttons: readButtons() }); }
  }

  // TV power + signal transitions
  power += (powerTarget - power) * Math.min(1, dt * 6);
  signal += Math.sign(signalTarget - signal) * Math.min(Math.abs(signalTarget - signal), dt * 6);
  screenU.uTime.value = t; screenU.uPower.value = power; screenU.uSignal.value = signal;

  // light: blend picture light with static light while there's no signal
  if (signal < 1) {
    const s = 0.3 + 0.05 * Math.random();
    if (!romLoaded) light.setUniform(s, s, s * 1.04, power);
  }
  const L = light.lum * power;
  applyLights(L, power);
  if (hiss) hiss.gain.value = (1 - signal) * 0.035 * (started ? 1 : 0);
  led.intensity = 0.0009 * (romLoaded ? 1 : 0.4);
  if (handles.vcr) handles.vcr.userData.vfd.material.emissiveIntensity = (t % 1 < 0.5) ? 1.6 : 0.04; // 12:00, forever

  if (!(dev && dev.active)) {
  // camera
    look.x += (look.tx - look.x) * Math.min(1, dt * 1.6);
    look.y += (look.ty - look.y) * Math.min(1, dt * 1.6);
    const yaw = baseYaw + look.x * 0.42 + Math.sin(t * 0.21) * 0.006;
    const pitch = basePitch - look.y * 0.2 + Math.sin(t * 0.33) * 0.004;
    camera.position.set(EYE.x + Math.sin(t * 0.27) * 0.004, EYE.y + Math.sin(t * 0.52) * 0.003, EYE.z);
    camera.lookAt(camera.position.x + Math.sin(yaw) * Math.cos(pitch), camera.position.y + Math.sin(pitch), camera.position.z - Math.cos(yaw) * Math.cos(pitch));
    if (panner) panner.pan.value = Math.max(-0.6, Math.min(0.6, Math.sin(-(yaw - baseYaw) + 0.05) * 0.9));
  }
  if (VIEW) { camera.position.set(VIEW[0], VIEW[1], VIEW[2]); camera.lookAt(VIEW[3], VIEW[4], VIEW[5]); }
  if (dev && dev.active) dev.update(dt);
  renderer.info.reset();
  composer.render(dt);

  // adaptive resolution to hold ~60fps
  if (!TEST) {
    frameTimes.push(dt); if (frameTimes.length > 90) frameTimes.shift();
    if (--dprCooldown < 0 && frameTimes.length === 90) {
      const avg = frameTimes.reduce((a, b) => a + b) / 90;
      if (avg > 0.0205 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); dprCooldown = 120; frameTimes = []; }
      else if (avg < 0.0135 && dpr < MAX_DPR) { dpr = Math.min(MAX_DPR, dpr + 0.25); resize(); dprCooldown = 240; frameTimes = []; }
    }
  }
  window.__PB = { fps: 1 / dt, dpr, L, romLoaded, buttons: readButtons(), fb: fb32[256 * 120 + 128] ^ fb32[256 * 60 + 64] ^ fb32[256 * 200 + 200] };
  requestAnimationFrame(tick);
}

function bakeExtras() {
  tvGroup.updateMatrixWorld(true);
  const z = SCREEN.zc + 0.004, { cx, cy, w, h } = SCREEN;
  const q = (x0, x1) => [[x0, cy - h / 2, z], [x1, cy - h / 2, z], [x1, cy + h / 2, z], [x0, cy + h / 2, z]].map((p) => new THREE.Vector3(...p).applyMatrix4(tvGroup.matrixWorld).toArray());
  return { room: room.id, screenL: q(cx - w / 2, cx), screenR: q(cx, cx + w / 2), lamp: null, sky: room.staticGain > 0 ? 2.5 : 0, moon: null };
}
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }

loadModels().then(async () => {
  if (EXPORT) {
    await new Promise((r) => setTimeout(r, 1500)); // let textures decode for albedo sampling
    const { header, blob } = exportScene(scene, bakeExtras());
    window.__export = { header: JSON.stringify(header), blob: b64(blob) };
    document.title = 'export-ready';
    return;
  }
  if (!params.has('nobake')) {
    try {
      baked = await applyBake(scene, `${BASE}bake/${room.id}/`);
      renderer.shadowMap.enabled = false;
      // physically consistent exposure: the room is lit only by the baked screen + hall, so expose for the room
      // and run the tube at a real CRT's brightness relative to it
      if (!params.has('exp')) renderer.toneMappingExposure = 9;
      if (!params.has('bright')) screenU.uBright.value = 0.45;
      screenU.uRoom.value = 0.25;
      bloom.luminanceMaterial.threshold = 0.2;
      scene.traverse((o) => {
        const m = o.material; if (!m || Array.isArray(m) || !m.emissive) return;
        if (o.isInstancedMesh) m.emissiveIntensity = 0.06; // glow stars
      });
      consoleBox.userData.led.material.emissiveIntensity = 3;
      scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    } catch (e) { console.warn('bake not applied:', e.message); baked = null; }
  }
  captureEnvironment();
  setWhite();
  dev = initDev({ THREE, scene, camera, renderer, composer, canvas, room, DEV, LM, effects: { bloom, vignette, grain }, setWhite, isBaked: () => !!baked, light, tmpL, tmpR, screenU, eye: EYE });
  document.getElementById('loading').classList.add('gone');
  ui.start.disabled = false;
  if (TEST) {
    window.__test = { insert: async (url) => { started = true; ui.intro.classList.add('gone'); const r = await fetch(url); insertCartridge(url.split('/').pop(), await r.arrayBuffer(), { remember: false }); } };
  }
  requestAnimationFrame((n) => { last = n; tick(n); });
  document.title = 'Past Bedtime';
  window.__ready = true;
}).catch((e) => { console.error(e); showError('Failed to load the room: ' + e.message); });
