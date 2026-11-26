// The parents' living room, early 90s: cream walls over a striped wainscot, big CRT on the entertainment stand,
// a floral sofa, toys all over the carpet. A soft night sky through sheer curtains lifts the ambient a touch.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildConsole, buildController, buildVCR, cord } from '../scene/room.js';
import { pbr, metricUV, fbm, shadowAll, canvasTex } from '../scene/util.js';
import { padLead } from './bedroom.js';

const R = { W: 5.2, D: 4.8, H: 2.5 };
const WIN = { z0: -0.75, z1: 0.85, y0: 0.75, y1: 2.15 };
const STAND_S = [0.62, 0.62, 0.95], STAND_TOP = 0.68 * 0.62;
const TV_S = 2.35;

function mesh(geo, mat, x, y, z, grain = 'y') {
  metricUV(geo, grain);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
const box = (w, h, d, r = 0, seg = 2) => (r > 0 ? new RoundedBoxGeometry(w, h, d, seg, r) : new THREE.BoxGeometry(w, h, d));

function wallpaperMat() {
  // dusty-rose and cream pinstripe, very 1992
  const t = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#d9c2b8'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) {
      c.fillStyle = '#b58c86'; c.fillRect(x, 0, 22, h);
      c.fillStyle = '#efe3d3'; c.fillRect(x + 30, 0, 4, h); c.fillRect(x + 40, 0, 2, h);
    }
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(80,50,40,${Math.random() * 0.05})`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.6, 1 / 0.6);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
}

function buildShell() {
  const g = new THREE.Group();
  const { W, D, H } = R, hx = W / 2, hz = D / 2, T = 0.12, RAIL = 0.9;
  const upper = pbr('painted_plaster_wall', { size: 1.4, color: 0xe2d6c0, normalScale: 0.5, ao: 0.5 });
  const lower = wallpaperMat();
  const floorMat = pbr('curly_teddy_natural', { size: 0.35, color: 0xb8a690, normalScale: 1.5, sheen: 1, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xa89880) });
  const ceilMat = pbr('ceiling_interior', { size: 0.9, color: 0xece8de, normalScale: 1.4 });
  const oak = pbr('oak_veneer_01', { size: 0.9, color: 0xb8875a, normalScale: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  g.add(mesh(box(W, T, D), floorMat, 0, -T / 2, 0, 'z'));
  g.add(mesh(box(W, T, D), ceilMat, 0, H + T / 2, 0, 'z'));
  // far, back, left walls: wallpaper below the rail, plaster above
  const wall = (w, along, pos, rot) => {
    const lo = mesh(box(along === 'x' ? w : T, RAIL, along === 'x' ? T : w), lower, pos[0], RAIL / 2, pos[2], along === 'x' ? 'y' : 'y');
    const hi = mesh(box(along === 'x' ? w : T, H - RAIL, along === 'x' ? T : w), upper, pos[0], RAIL + (H - RAIL) / 2, pos[2]);
    g.add(lo, hi);
  };
  wall(W + 2 * T, 'x', [0, 0, -hz - T / 2]);
  wall(W + 2 * T, 'x', [0, 0, hz + T / 2]);
  wall(D, 'z', [-hx - T / 2, 0, 0]);
  // right wall with the big window: pieces around the opening
  const rw = (z0, z1, y0, y1, mat) => g.add(mesh(box(T, y1 - y0, z1 - z0), mat, hx + T / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  rw(-hz, WIN.z0, 0, RAIL, lower); rw(-hz, WIN.z0, RAIL, H, upper);
  rw(WIN.z1, hz, 0, RAIL, lower); rw(WIN.z1, hz, RAIL, H, upper);
  rw(WIN.z0, WIN.z1, 0, WIN.y0, lower);
  rw(WIN.z0, WIN.z1, WIN.y1, H, upper);
  // chair rail + baseboards + crown
  const rail = (len, x, z, along) => { const geo = along === 'x' ? box(len, 0.045, 0.022, 0.006) : box(0.022, 0.045, len, 0.006); g.add(mesh(geo, oak, x, RAIL, z, along)); };
  const base = (len, x, z, along) => { const geo = along === 'x' ? box(len, 0.11, 0.016, 0.004) : box(0.016, 0.11, len, 0.004); g.add(mesh(geo, oak, x, 0.055, z, along)); };
  for (const f of [rail, base]) {
    f(W, 0, -hz + 0.011, 'x'); f(W, 0, hz - 0.011, 'x'); f(D, -hx + 0.011, 0, 'z');
    f(WIN.z0 + hz, hx - 0.011, (-hz + WIN.z0) / 2, 'z'); f(hz - WIN.z1, hx - 0.011, (WIN.z1 + hz) / 2, 'z');
  }
  base(WIN.z1 - WIN.z0, hx - 0.011, (WIN.z0 + WIN.z1) / 2, 'z');
  // window: casing, sill, sash bars, glass (skip), sky outside (static light source)
  const trim = new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.45 });
  const zc = (WIN.z0 + WIN.z1) / 2, wz = WIN.z1 - WIN.z0, yc = (WIN.y0 + WIN.y1) / 2, wy = WIN.y1 - WIN.y0;
  g.add(mesh(box(0.02, 0.08, wz + 0.16, 0.005), trim, hx - 0.01, WIN.y1 + 0.04, zc, 'z'));
  g.add(mesh(box(0.15, 0.03, wz + 0.2, 0.006), trim, hx - 0.03, WIN.y0 - 0.01, zc, 'z'));
  g.add(mesh(box(0.02, wy, 0.08, 0.005), trim, hx - 0.01, yc, WIN.z0 - 0.04));
  g.add(mesh(box(0.02, wy, 0.08, 0.005), trim, hx - 0.01, yc, WIN.z1 + 0.04));
  for (const z of [zc - wz / 6, zc + wz / 6]) g.add(mesh(box(0.03, wy, 0.03, 0.004), trim, hx + 0.07, yc, z));
  g.add(mesh(box(0.03, 0.04, wz, 0.004), trim, hx + 0.07, yc, zc, 'z'));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(wz, wy), new THREE.MeshPhysicalMaterial({ color: 0x0a0e14, roughness: 0.05, transparent: true, opacity: 0.15, depthWrite: false }));
  glass.position.set(hx + 0.08, yc, zc); glass.rotation.y = -Math.PI / 2; glass.userData.bake = 'skip'; g.add(glass);
  const sky = canvasTex(512, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b1020'); gr.addColorStop(0.7, '#1c2436'); gr.addColorStop(1, '#0a0b10');
    c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#05060a';
    for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(Math.random() * w, h * 0.75 + Math.random() * 30, 25 + Math.random() * 40, 0, 7); c.fill(); }
  });
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), new THREE.MeshBasicMaterial({ map: sky, color: new THREE.Color(0.35, 0.35, 0.35) }));
  outside.position.set(hx + 4, 1.5, zc); outside.rotation.y = -Math.PI / 2; outside.userData.bake = 'sky'; g.add(outside);
  // sheer curtains, gathered to the sides, plus a valance
  const sheer = new THREE.MeshPhysicalMaterial({ color: 0xf2ece0, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color(0xffffff), depthWrite: false });
  for (const [z0, z1, s] of [[WIN.z0 - 0.12, WIN.z0 + 0.42, 1], [WIN.z1 - 0.42, WIN.z1 + 0.12, 2]]) {
    const geo = new THREE.PlaneGeometry(z1 - z0, WIN.y1 - WIN.y0 + 0.25, 60, 20);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i); p.setZ(i, Math.sin(u * 48 + s) * 0.022 + fbm(u * 6, v * 3, s) * 0.01); }
    geo.computeVertexNormals();
    const cm = new THREE.Mesh(geo, sheer); cm.rotation.y = -Math.PI / 2; cm.position.set(hx - 0.06, yc + 0.08, (z0 + z1) / 2); cm.userData.bake = 'skip'; g.add(cm);
  }
  const val = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.24, wz + 0.4, 3, 0.03), new THREE.MeshStandardMaterial({ color: 0x8a5a5e, roughness: 0.85 }));
  metricUV(val.geometry); val.position.set(hx - 0.06, WIN.y1 + 0.12, zc); val.castShadow = val.receiveShadow = true; g.add(val);
  // ceiling fan, still
  const fanWood = pbr('oak_veneer_01', { size: 0.5, color: 0x7a5236, normalScale: 0.3 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 1, roughness: 0.35 });
  const fan = new THREE.Group(); fan.position.set(0.2, R.H, 0.2);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 12), brass); rod.position.y = -0.125; fan.add(rod);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.11, 32), brass); motor.position.y = -0.3; fan.add(motor);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const bl = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.008, 0.13, 2, 0.003), fanWood); metricUV(bl.geometry, 'x');
    bl.position.set(Math.cos(a) * 0.38, -0.31, Math.sin(a) * 0.38); bl.rotation.y = -a; bl.rotation.x = 0.12; fan.add(bl);
  }
  shadowAll(fan); g.add(fan);
  return g;
}

function blocks() {
  // wooden alphabet blocks
  const g = new THREE.Group();
  const cols = ['#c8362e', '#2e6bc8', '#e0a91e', '#2e9a52'], L = 'ABCKTZ';
  let s = 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const spots = [[0.55, -0.55], [0.62, -0.45], [0.5, -0.38], [0.71, -0.6], [0.58, -0.49, 1], [-0.95, -0.15], [-0.85, -0.05]];
  spots.forEach(([x, z, stacked], i) => {
    const tex = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#e8d3a8'; c.fillRect(0, 0, w, h); c.strokeStyle = cols[i % 4]; c.lineWidth = 10; c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = cols[(i + 1) % 4]; c.font = 'bold 84px Georgia, serif'; c.textAlign = 'center'; c.fillText(L[i % L.length], w / 2, h * 0.75);
    });
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.05, 0.05, 2, 0.004), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    b.position.set(x, stacked ? 0.075 : 0.025, z); b.rotation.y = rnd() * 3; b.castShadow = b.receiveShadow = true; g.add(b);
  });
  return g;
}

function tapes() {
  // a stack of VHS tapes in their sleeves
  const g = new THREE.Group();
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.45 });
  for (let i = 0; i < 4; i++) {
    const lab = canvasTex(256, 32, (c, w, h) => { c.fillStyle = '#f3efe4'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a3a8a'; c.font = 'italic 18px "Comic Sans MS", cursive'; c.fillText(['Xmas 91', 'Cartoons', "Ryan's B-day", 'Tape 4'][i], 10, 23); });
    const t = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.026, 0.105, 2, 0.002), sleeve); t.position.set(0, 0.013 + i * 0.027, 0); t.rotation.y = (i % 2 ? 0.06 : -0.04); g.add(t);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.018), new THREE.MeshStandardMaterial({ map: lab, roughness: 0.7 })); l.position.set(0, 0.013 + i * 0.027, 0.0526); l.rotation.y = t.rotation.y; l.userData.bake = 'skip'; g.add(l);
  }
  return shadowAll(g);
}

function painting() {
  const g = new THREE.Group();
  const art = canvasTex(512, 384, (c, w, h) => {
    const s = c.createLinearGradient(0, 0, 0, h * 0.6); s.addColorStop(0, '#e9b07a'); s.addColorStop(1, '#f4d9a8'); c.fillStyle = s; c.fillRect(0, 0, w, h);
    c.fillStyle = '#7d8f6a'; c.beginPath(); c.moveTo(0, h * 0.62); c.quadraticCurveTo(w * 0.35, h * 0.42, w * 0.6, h * 0.6); c.quadraticCurveTo(w * 0.8, h * 0.7, w, h * 0.55); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.fillStyle = '#56684a'; c.beginPath(); c.moveTo(0, h * 0.8); c.quadraticCurveTo(w * 0.5, h * 0.65, w, h * 0.82); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.fillStyle = '#8a4b3a'; c.fillRect(w * 0.62, h * 0.55, 30, 22); c.beginPath(); c.moveTo(w * 0.62 - 4, h * 0.55); c.lineTo(w * 0.62 + 15, h * 0.5); c.lineTo(w * 0.62 + 34, h * 0.55); c.fill();
  });
  const frameMat = pbr('oak_veneer_01', { size: 0.3, color: 0x8a5a36, normalScale: 0.3 });
  const fr = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.66, 0.04, 2, 0.01), frameMat); metricUV(fr.geometry, 'x'); g.add(fr);
  const cv = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.54), new THREE.MeshStandardMaterial({ map: art, roughness: 0.7 })); cv.position.z = 0.021; g.add(cv);
  return shadowAll(g);
}

function coffeeTable() {
  const oak = pbr('oak_veneer_01', { size: 0.9, color: 0xa87650, normalScale: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const g = new THREE.Group();
  g.add(mesh(box(1.1, 0.04, 0.6, 0.012), oak, 0, 0.42, 0, 'x'));
  g.add(mesh(box(0.98, 0.02, 0.5, 0.006), oak, 0, 0.12, 0, 'x'));
  for (const x of [-0.5, 0.5]) for (const z of [-0.25, 0.25]) g.add(mesh(box(0.05, 0.4, 0.05, 0.008), oak, x, 0.2, z));
  return g;
}

export default {
  id: 'living',
  title: 'Living room',
  camera: { eye: [0.3, 0.66, 1.05], target: [-0.15, 0.74, -1.9], fov: 42, orbit: [0, 0.9, -0.6] },
  tv: { pos: [-0.2, STAND_TOP, -R.D / 2 + 0.228 * TV_S + 0.03], scale: TV_S, rotY: 0.02 },
  models: ['television_02', 'modern_wooden_cabinet', 'sofa_03', 'ArmChair_01', 'Ottoman_01', 'potted_plant_02', 'wicker_basket_01', 'rubber_duck_toy', 'football', 'cardboard_box_01', 'throw_pillows_01'],
  staticGain: 0,
  tvGain: 6,
  fill: 0.0035,
  room: R,
  build(scene) {
    scene.add(buildShell());
    const consoleBox = buildConsole(); consoleBox.position.set(-0.6, 0, -1.3); consoleBox.rotation.y = 0.2; scene.add(consoleBox);
    const pad = buildController(); pad.position.set(0.12, 0.004, -0.15); pad.rotation.y = -0.5; scene.add(pad);
    const art = painting(); art.position.set(-0.2, 1.92, -R.D / 2 + 0.025); scene.add(art);
    const ct = coffeeTable(); ct.position.set(1.35, 0, 0.35); ct.rotation.y = 0.08; scene.add(ct);
    scene.add(blocks());
    return { consoleBox, pad };
  },
  place(scene, m, h) {
    const [, stand, sofa, chair, ottoman, plant, basket, duck, football, box, pillows] = m;
    stand.scale.set(...STAND_S); stand.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(0x9a8670); } });
    stand.position.set(-0.2, 0, -R.D / 2 + 0.342 * STAND_S[2] + 0.015); scene.add(shadowAll(stand));
    const vcr = buildVCR(); vcr.position.set(-0.98, STAND_TOP, -R.D / 2 + 0.18); vcr.rotation.y = 0.04; scene.add(vcr); h.vcr = vcr;
    const tp = tapes(); tp.position.set(0.42, STAND_TOP, -R.D / 2 + 0.2); tp.rotation.y = -0.15; scene.add(tp);
    sofa.scale.setScalar(0.82); sofa.position.set(-R.W / 2 + 0.45, 0, -0.2); sofa.rotation.y = Math.PI / 2; scene.add(shadowAll(sofa));
    pillows.scale.setScalar(0.8); pillows.position.set(-R.W / 2 + 0.5, 0.45, 0.35); pillows.rotation.y = Math.PI / 2 + 0.3; scene.add(shadowAll(pillows));
    chair.position.set(1.75, 0, -1.25); chair.rotation.y = -0.9; scene.add(shadowAll(chair));
    ottoman.position.set(-1.25, 0, 0.55); ottoman.rotation.y = 0.3; scene.add(shadowAll(ottoman));
    plant.position.set(1.35, 0, -R.D / 2 + 0.38); plant.scale.setScalar(1.0); scene.add(shadowAll(plant));
    basket.position.set(0.85, 0, -0.35); basket.rotation.y = 0.5; scene.add(shadowAll(basket));
    duck.scale.setScalar(0.3); duck.position.set(0.95, 0.03, -0.38); duck.rotation.y = -0.8; scene.add(shadowAll(duck));
    football.scale.setScalar(0.85); football.position.set(-1.3, 0, -0.75); football.rotation.y = 0.6; scene.add(shadowAll(football));
    box.position.set(1.55, 0, 1.1); box.rotation.y = 0.4; scene.add(shadowAll(box));
    padLead(scene, h);
    scene.add(cord([[-0.66, 0.04, -1.38], [-0.75, 0.004, -1.5], [-0.9, 0.05, -2.36], [-0.6, STAND_TOP + 0.05, -2.36], [-0.2, STAND_TOP + 0.12, -2.3]], 0.0024, 0x8a8a80));
  },
};
