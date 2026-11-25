import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pbr, metricUV, fbm, shadowAll, canvasTex } from './util.js';

export const ROOM = { W: 3.6, D: 3.4, H: 2.45 };
export const WIN = { z0: -0.9, z1: 0.12, y0: 0.95, y1: 2.08 };

const box = (w, h, d, r = 0, seg = 2) => (r > 0 ? new RoundedBoxGeometry(w, h, d, seg, r) : new THREE.BoxGeometry(w, h, d));
function mesh(geo, mat, x, y, z, grain = 'y') {
  metricUV(geo, grain);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}

export function buildRoom() {
  const g = new THREE.Group();
  const { W, D, H } = ROOM, hx = W / 2, hz = D / 2, T = 0.12;

  // knotty-pine style paneling: planked wood texture run vertically
  const wallMat = pbr('wood_floor_worn', { size: 1.5, color: 0x9a7052, normalScale: 1.1, ao: 0.9 });
  wallMat.roughness = 0.62;
  const floorMat = pbr('curly_teddy_natural', { size: 0.4, color: 0x6e5644, normalScale: 1.3 });
  const ceilMat = pbr('ceiling_interior', { size: 0.9, color: 0xe9e5dc, normalScale: 1.4 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1e, roughness: 0.45 });

  // floor / ceiling
  const floor = mesh(box(W, T, D), floorMat, 0, -T / 2, 0); floor.castShadow = false; g.add(floor);
  const ceil = mesh(box(W, T, D), ceilMat, 0, H + T / 2, 0); g.add(ceil);
  // far, back, left walls
  g.add(mesh(box(W + 2 * T, H, T), wallMat, 0, H / 2, -hz - T / 2, 'x'));
  g.add(mesh(box(W + 2 * T, H, T), wallMat, 0, H / 2, hz + T / 2, 'x'));
  g.add(mesh(box(T, H, D), wallMat, -hx - T / 2, H / 2, 0, 'z'));
  // right wall with window opening (extruded shape gives the reveal)
  const s = new THREE.Shape();
  s.moveTo(-hz, 0); s.lineTo(hz, 0); s.lineTo(hz, H); s.lineTo(-hz, H); s.lineTo(-hz, 0);
  const hole = new THREE.Path();
  hole.moveTo(WIN.z0, WIN.y0); hole.lineTo(WIN.z0, WIN.y1); hole.lineTo(WIN.z1, WIN.y1); hole.lineTo(WIN.z1, WIN.y0); hole.lineTo(WIN.z0, WIN.y0);
  s.holes.push(hole);
  const rg = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
  rg.rotateY(-Math.PI / 2); // shape x -> world z, extrude depth -> world -x
  rg.computeBoundingBox();
  rg.translate(hx - rg.boundingBox.min.x, 0, 0);
  rg.computeVertexNormals();
  const rightWall = mesh(rg, wallMat, 0, 0, 0, 'z');
  g.add(rightWall);

  // baseboards
  const bbH = 0.095, bbT = 0.014;
  g.add(mesh(box(W, bbH, bbT, 0.004), trimMat, 0, bbH / 2, -hz + bbT / 2, 'x'));
  g.add(mesh(box(bbT, bbH, D, 0.004), trimMat, -hx + bbT / 2, bbH / 2, 0, 'z'));
  g.add(mesh(box(bbT, bbH, D, 0.004), trimMat, hx - bbT / 2, bbH / 2, 0, 'z'));
  g.add(mesh(box(W, bbH, bbT, 0.004), trimMat, 0, bbH / 2, hz - bbT / 2, 'x'));

  g.add(buildWindow(trimMat));
  return g;
}

function buildWindow(trimMat) {
  const g = new THREE.Group();
  const hx = ROOM.W / 2, zc = (WIN.z0 + WIN.z1) / 2, wz = WIN.z1 - WIN.z0, yc = (WIN.y0 + WIN.y1) / 2, wy = WIN.y1 - WIN.y0;
  const cw = 0.07, ct = 0.018;
  // casing
  g.add(mesh(box(ct, cw, wz + 2 * cw, 0.005), trimMat, hx - ct / 2, WIN.y1 + cw / 2, zc, 'z'));
  g.add(mesh(box(ct, cw * 0.8, wz + 2 * cw, 0.005), trimMat, hx - ct / 2, WIN.y0 - cw * 0.4 - 0.02, zc, 'z'));
  g.add(mesh(box(ct, wy + cw, cw, 0.005), trimMat, hx - ct / 2, yc + cw / 2 - 0.02, WIN.z0 - cw / 2));
  g.add(mesh(box(ct, wy + cw, cw, 0.005), trimMat, hx - ct / 2, yc + cw / 2 - 0.02, WIN.z1 + cw / 2));
  // sill (stool) proud of the wall
  g.add(mesh(box(0.16, 0.025, wz + 2 * cw + 0.05, 0.006), trimMat, hx + 0.12 - 0.16 / 2 - 0.035, WIN.y0, zc, 'z'));
  // sashes: frame + glass, a bit back in the reveal
  const sashMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.5 });
  const xs = hx + 0.075, f = 0.045;
  const frame = (y0, y1, x) => {
    const h = y1 - y0, c = (y0 + y1) / 2;
    g.add(mesh(box(0.04, f, wz, 0.004), sashMat, x, y0 + f / 2, zc, 'z'));
    g.add(mesh(box(0.04, f, wz, 0.004), sashMat, x, y1 - f / 2, zc, 'z'));
    g.add(mesh(box(0.04, h, f, 0.004), sashMat, x, c, WIN.z0 + f / 2));
    g.add(mesh(box(0.04, h, f, 0.004), sashMat, x, c, WIN.z1 - f / 2));
  };
  frame(WIN.y0, yc + 0.02, xs - 0.02); frame(yc - 0.02, WIN.y1, xs + 0.02);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0e14, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.5, depthWrite: false });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(wz - 0.06, wy - 0.06), glassMat);
  glass.position.set(xs + 0.01, yc, zc); glass.rotation.y = -Math.PI / 2; g.add(glass);

  // vinyl mini-blinds, slats tilted part-open
  const nSl = 52, slatW = 0.025, span = wy - 0.06;
  const slatGeo = new THREE.BoxGeometry(slatW, 0.0015, wz - 0.02, 1, 1, 8);
  // slight crown on each slat
  const sp = slatGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { const x = sp.getX(i); sp.setY(i, sp.getY(i) + (1 - (2 * x / slatW) ** 2) * 0.0015); }
  slatGeo.computeVertexNormals();
  const slatMat = new THREE.MeshStandardMaterial({ color: 0xe3ddce, roughness: 0.55, side: THREE.DoubleSide });
  const slats = new THREE.InstancedMesh(slatGeo, slatMat, nSl);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < nSl; i++) {
    const y = WIN.y1 - 0.07 - (i / (nSl - 1)) * (span - 0.05);
    e.set(0, 0, -0.62 + Math.sin(i * 1.7) * 0.015); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(hx - 0.04, y, zc), q, new THREE.Vector3(1, 1, 1));
    slats.setMatrixAt(i, m4);
  }
  slats.castShadow = true; slats.receiveShadow = true;
  g.add(slats);
  // headrail + bottom rail
  g.add(mesh(box(0.045, 0.04, wz - 0.005, 0.006), slatMat, hx - 0.04, WIN.y1 - 0.025, zc, 'z'));
  g.add(mesh(box(0.03, 0.012, wz - 0.02, 0.004), slatMat, hx - 0.04, WIN.y1 - span + 0.005, zc, 'z'));
  // ladder cords
  const cordMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 });
  for (const dz of [-0.33, 0, 0.33]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, span, 4), cordMat);
    c.position.set(hx - 0.04, WIN.y1 - span / 2, zc + dz * wz); g.add(c);
  }
  // pull cord + wand
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: 0.3 }));
  wand.position.set(hx - 0.065, WIN.y1 - 0.33, WIN.z0 + 0.04); g.add(wand);

  // night outside: sky, rooftops, trees, a far lit window
  const sky = canvasTex(1024, 512, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#05070d'); gr.addColorStop(0.55, '#0d1424'); gr.addColorStop(0.78, '#1c1f2a'); gr.addColorStop(1, '#0a0b0e');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(200,210,255,${Math.random() * 0.5})`; c.fillRect(Math.random() * w, Math.random() * h * 0.5, 1, 1); }
    c.fillStyle = '#030305';
    // tree masses
    for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(Math.random() * w, h * 0.62 + Math.random() * 60, 40 + Math.random() * 70, 0, 7); c.fill(); }
    // house across the street
    c.beginPath(); c.moveTo(380, 330); c.lineTo(520, 250); c.lineTo(660, 330); c.lineTo(660, 512); c.lineTo(380, 512); c.fill();
    c.fillStyle = '#ffb35a'; c.fillRect(560, 360, 26, 34);
    c.fillStyle = 'rgba(255,170,80,0.25)'; c.fillRect(552, 352, 42, 50);
    c.fillStyle = '#030305'; c.fillRect(0, 440, w, 72);
    // street lamp glow
    const lg = c.createRadialGradient(250, 300, 2, 250, 300, 60);
    lg.addColorStop(0, 'rgba(220,230,255,1)'); lg.addColorStop(0.15, 'rgba(160,180,255,0.5)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = lg; c.fillRect(150, 200, 200, 200);
  });
  const skyMat = new THREE.MeshBasicMaterial({ map: sky, color: new THREE.Color(1.6, 1.6, 1.6) });
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), skyMat);
  outside.position.set(hx + 5, 1.6, zc); outside.rotation.y = -Math.PI / 2; g.add(outside);
  return g;
}

// ---------- bunk bed ----------
function comforterGeo(w, l, drop, { headGap = 0.5, seed = 1, thick = 0.035 } = {}) {
  // a plane draped over a mattress whose top is at y=0, centred at x=0, foot at z=+l/2
  const cov = l - headGap;
  const W = w + 2 * drop, L = cov + drop;
  const sx = 90, sz = 120;
  const geo = new THREE.PlaneGeometry(W, L, sx, sz); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, r = 0.05;
  const zStart = -l / 2 + headGap;
  const bend = (s) => { // arc-length beyond the edge -> [out, down]
    if (s <= 0) return [s, 0];
    const arc = (Math.PI / 2) * r;
    if (s < arc) { const a = s / r; return [r * Math.sin(a), r * (1 - Math.cos(a))]; }
    return [r, r + (s - arc)];
  };
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getZ(i) + L / 2; // v from 0 (head edge) to L
    const sxv = Math.abs(u) - w / 2;
    const [ox, dy1] = bend(sxv);
    const sfoot = v - cov;
    const [oz, dy2] = bend(sfoot);
    let x = Math.sign(u) * (w / 2 + ox), z = zStart + Math.min(v, cov) + (sfoot > 0 ? oz : 0);
    if (sxv <= 0) x = u;
    if (sfoot <= 0) z = zStart + v;
    let y = thick - Math.max(dy1, dy2);
    // wrinkles + loft, more where it hangs
    const hang = Math.max(dy1, dy2);
    const n = fbm(u * 3.1 + seed, v * 2.2, seed * 3.7, 4);
    const n2 = fbm(u * 9 + 3, v * 7, seed, 3);
    y += n * 0.018 + n2 * 0.004 + (hang > 0 ? 0 : 0.012 * (1 - (u / (w / 2)) ** 2));
    // hanging folds swing in and out
    const fold = Math.sin((sxv > 0 ? v : u) * 22 + n * 4) * 0.012 * Math.min(1, hang / 0.15);
    if (sxv > 0) x += Math.sign(u) * fold; else if (sfoot > 0) z += fold;
    // hem doesn't drop below the deck
    p.setXYZ(i, x, Math.max(y, -drop * 0.95), z);
  }
  geo.computeVertexNormals();
  // metric UVs from the flat layout
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W, uv.getY(i) * L);
  return geo;
}

function pillowGeo(w, h, d, seed) {
  const geo = new RoundedBoxGeometry(w, h, d, 6, Math.min(h, d) * 0.45);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ex = 1 - (2 * x / w) ** 2, ez = 1 - (2 * z / d) ** 2;
    const puff = Math.max(0, ex) * Math.max(0, ez);
    p.setY(i, y * (0.55 + 0.65 * puff) + fbm(x * 8 + seed, z * 8, seed) * 0.008);
  }
  geo.computeVertexNormals();
  metricUV(geo, 'z');
  return geo;
}

export function buildBunkBed() {
  const g = new THREE.Group();
  const wood = pbr('oak_veneer_01', { size: 0.9, color: 0xd6b48a, rough: 0.9, normalScale: 0.5 });
  wood.roughness = 0.75;
  const sheet = pbr('rough_linen', { size: 0.35, color: 0xe8ecf2, normalScale: 0.8 });
  const sheetBlue = pbr('rough_linen', { size: 0.35, color: 0xbfd0e4, normalScale: 0.8 });
  const plaidRed = pbr('fabric_pattern_07', { size: 0.42, normalScale: 1, diff: 'diff' });
  const plaidBlue = pbr('fabric_pattern_07', { size: 0.42, normalScale: 1, diff: 'diff2' });
  plaidRed.side = plaidBlue.side = THREE.DoubleSide;
  const fleece = pbr('knitted_fleece', { size: 0.3, color: 0x6f7b62 });

  const W = 1.06, L = 2.06, P = 0.072, Hp = 1.78;
  const x0 = -W / 2, x1 = W / 2, z0 = -L / 2, z1 = L / 2;
  // posts
  for (const x of [x0 + P / 2, x1 - P / 2]) for (const z of [z0 + P / 2, z1 - P / 2]) g.add(mesh(box(P, Hp, P, 0.008), wood, x, Hp / 2, z));
  // side rails (lower + upper deck)
  const rail = (y, h, t = 0.035) => {
    for (const x of [x0 + t / 2 + 0.012, x1 - t / 2 - 0.012]) g.add(mesh(box(t, h, L - 2 * P, 0.006), wood, x, y, 0, 'z'));
  };
  rail(0.25, 0.13); rail(1.25, 0.13);
  // end panels: top rail, mid rail, slats
  for (const z of [z0 + P / 2, z1 - P / 2]) {
    for (const [y, h] of [[1.68, 0.1], [1.42, 0.07], [0.72, 0.08], [0.34, 0.07]]) g.add(mesh(box(W - 2 * P, h, 0.032, 0.006), wood, 0, y, z, 'x'));
    for (let i = 1; i < 6; i++) {
      const x = x0 + P + (i / 6) * (W - 2 * P);
      g.add(mesh(box(0.035, 0.28, 0.022, 0.004), wood, x, 1.42 + 0.035 + 0.11, z));
      g.add(mesh(box(0.035, 0.30, 0.022, 0.004), wood, x, 0.37 + 0.18, z));
    }
  }
  // decks (plywood slats hidden under mattresses)
  for (const y of [0.29, 1.29]) g.add(mesh(box(W - 0.1, 0.02, L - 0.1), wood, 0, y, 0, 'z'));
  // upper guard rail on the room side, from the head end
  const gz0 = -0.3, gz1 = z1 - P;
  g.add(mesh(box(0.035, 0.09, gz1 - gz0, 0.006), wood, x1 - 0.03, 1.66, (gz0 + gz1) / 2, 'z'));
  g.add(mesh(box(0.05, 0.45, 0.05, 0.006), wood, x1 - 0.03, 1.47, gz0));
  // ladder at the foot, room side
  const lz0 = -0.74, lz1 = -0.41, lx = x1 + 0.03;
  for (const z of [lz0, lz1]) {
    const lr = mesh(box(0.04, 1.72, 0.055, 0.006), wood, lx, 0.86, z); lr.rotation.z = 0.06; g.add(lr);
  }
  for (let i = 0; i < 5; i++) {
    const y = 0.3 + i * 0.3;
    const r = mesh(new THREE.CylinderGeometry(0.016, 0.016, lz1 - lz0, 12), wood, lx - Math.sin(0.06) * (y - 0.86), y, (lz0 + lz1) / 2, 'y');
    r.rotation.x = Math.PI / 2; g.add(r);
  }

  // mattresses, comforters, pillows
  const mW = W - 0.1, mL = L - 0.1, mH = 0.16;
  const beds = [[0.30, plaidRed, sheet, 1.3], [1.30, plaidBlue, sheetBlue, 5.1]];
  for (const [deck, quilt, sh, seed] of beds) {
    const mt = mesh(box(mW, mH, mL, 0.05, 4), sh, 0, deck + mH / 2, 0, 'z'); g.add(mt);
    const top = deck + mH;
    const cg = comforterGeo(mW, mL, 0.2, { headGap: 0.55, seed, thick: 0.03 });
    const c = new THREE.Mesh(cg, quilt); c.position.set(0, top, 0); c.castShadow = c.receiveShadow = true; g.add(c);
    // turned-down fold at the head edge of the comforter
    const fold = new THREE.Mesh(new RoundedBoxGeometry(mW + 0.06, 0.05, 0.24, 4, 0.024), quilt);
    metricUV(fold.geometry, 'x');
    fold.position.set(0, top + 0.05, -mL / 2 + 0.55 + 0.1); fold.rotation.x = 0.04; fold.castShadow = fold.receiveShadow = true; g.add(fold);
    const pw = mesh(pillowGeo(0.62, 0.15, 0.4, seed), sheet, 0.02, top + 0.06, -mL / 2 + 0.25, 'z'); pw.rotation.y = 0.05; pw.rotation.x = -0.08; g.add(pw);
  }
  // a fleece throw bunched at the foot of the lower bunk
  const throwGeo = comforterGeo(0.7, 0.45, 0.02, { headGap: 0, seed: 9, thick: 0.06 });
  const th = new THREE.Mesh(throwGeo, fleece); th.position.set(0.1, 0.46 + 0.03, 0.55); th.rotation.y = 0.5; th.castShadow = th.receiveShadow = true; g.add(th);
  return g;
}

// ---------- small procedural props ----------
export function buildConsole() {
  // generic early-90s grey game console (original design)
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0xbfbcb4, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.6 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.075, 0.2, 4, 0.012), grey); body.position.y = 0.0375; g.add(body);
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.02, 0.12, 3, 0.006), dark); top.position.set(-0.03, 0.078, -0.01); g.add(top);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.004, 0.012), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
  slot.position.set(-0.03, 0.089, -0.01); g.add(slot);
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.028, 0.012, 0.018, 2, 0.004), dark); b.position.set(0.085, 0.078, -0.04 + i * 0.045); g.add(b);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a08, emissiveIntensity: 14 }));
  led.position.set(0.11, 0.05, 0.1); g.add(led); g.userData.led = led;
  for (let i = 0; i < 2; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.006, 12), dark); p.rotation.x = Math.PI / 2; p.position.set(-0.07 + i * 0.05, 0.03, 0.101); g.add(p); }
  return shadowAll(g);
}

export function cord(points, radius = 0.0028, color = 0x1c1c1c) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, radius, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
  m.castShadow = m.receiveShadow = true; return m;
}

export function buildPoster() {
  // an original "Our Solar System" classroom-style poster
  const t = canvasTex(768, 1024, (c, w, h) => {
    c.fillStyle = '#0b0f2a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    const sun = c.createRadialGradient(-60, h * 0.55, 40, -60, h * 0.55, 330);
    sun.addColorStop(0, '#fff6c0'); sun.addColorStop(0.5, '#ffb030'); sun.addColorStop(1, 'rgba(255,90,0,0)');
    c.fillStyle = sun; c.fillRect(0, 0, w, h);
    const pl = [[200, 6, '#b0a090'], [250, 10, '#e8c890'], [305, 11, '#3a7fd0'], [355, 8, '#d06040'], [440, 34, '#d8b088'], [540, 28, '#e8d4a0'], [625, 18, '#a0e0e8'], [695, 17, '#4060e0']];
    for (const [x, r, col] of pl) {
      const y = h * 0.55 + Math.sin(x) * 20;
      const gr = c.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, '#000');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      if (r === 28) { c.strokeStyle = 'rgba(230,210,160,0.8)'; c.lineWidth = 4; c.beginPath(); c.ellipse(x, y, r * 1.9, r * 0.45, -0.3, 0, 7); c.stroke(); }
    }
    c.fillStyle = '#ffd23f'; c.font = 'bold 86px Impact, Arial Black, sans-serif'; c.textAlign = 'center';
    c.fillText('OUR SOLAR', w / 2, 130); c.fillText('SYSTEM', w / 2, 225);
    c.fillStyle = '#9fd3ff'; c.font = 'bold 30px Arial, sans-serif';
    c.fillText('NINE PLANETS · ONE STAR', w / 2, h - 70);
    c.strokeStyle = '#ffd23f'; c.lineWidth = 10; c.strokeRect(18, 18, w - 36, h - 36);
  });
  const geo = new THREE.PlaneGeometry(0.46, 0.61, 24, 32);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, (Math.abs(y) / 0.305) ** 3 * 0.006 + fbm(x * 10, y * 10, 2) * 0.0015); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.38 }));
  m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m);
  const tack = new THREE.MeshStandardMaterial({ color: 0xc02020, roughness: 0.3 });
  for (const [x, y] of [[-0.21, 0.285], [0.21, 0.285], [-0.21, -0.285], [0.21, -0.285]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), tack); s.position.set(x, y, 0.006); s.scale.z = 0.6; g.add(s);
  }
  return g;
}

export function buildGlowStars() {
  // glow-in-the-dark ceiling stars, faint green phosphorescence
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.4 : 1; const f = i ? 'lineTo' : 'moveTo'; shape[f](Math.cos(a) * r, Math.sin(a) * r); }
  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8e8b0, emissive: 0x7dff9a, emissiveIntensity: 0.35, roughness: 0.6, side: THREE.DoubleSide });
  const n = 34; const inst = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) {
    const big = rnd() < 0.25, sc = big ? 0.05 : 0.022 + rnd() * 0.012;
    e.set(Math.PI / 2, 0, rnd() * 6); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(-1.75 + rnd() * 1.5, ROOM.H - 0.002, -1.6 + rnd() * 2.6), q, new THREE.Vector3(sc, sc, sc));
    inst.setMatrixAt(i, m4);
  }
  return inst;
}

export function buildLamp() {
  // ceramic table lamp with a fabric drum shade (original design)
  const g = new THREE.Group();
  const prof = [[0, 0], [0.075, 0], [0.078, 0.012], [0.07, 0.02], [0.06, 0.03], [0.085, 0.09], [0.098, 0.15], [0.09, 0.21], [0.06, 0.26], [0.03, 0.29], [0.022, 0.31], [0.026, 0.325], [0, 0.33]].map(([x, y]) => new THREE.Vector2(x, y));
  const glaze = new THREE.MeshPhysicalMaterial({ color: 0x3b2417, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const base = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), glaze); g.add(base);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 1, roughness: 0.35 });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 12), brass); neck.position.y = 0.39; g.add(neck);
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.045, 16), brass); sock.position.y = 0.47; g.add(sock);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffc27a, emissiveIntensity: 40 }));
  bulb.position.y = 0.52; bulb.castShadow = false; g.add(bulb);
  // harp
  const harpCurve = new THREE.CatmullRomCurve3([[-0.09, 0.45], [-0.1, 0.55], [-0.05, 0.62], [0, 0.635], [0.05, 0.62], [0.1, 0.55], [0.09, 0.45]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const harp = new THREE.Mesh(new THREE.TubeGeometry(harpCurve, 40, 0.0025, 6), brass); g.add(harp);
  // shade: outer fabric + inner lining, light escapes top and bottom
  const shadeTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#e7d2a8'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(${120 + Math.random() * 60},${90 + Math.random() * 40},50,0.06)`; c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1); }
    for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(0,0,0,0.035)'; c.fillRect(0, y, w, 1); }
  });
  const shadeGeo = new THREE.CylinderGeometry(0.115, 0.19, 0.22, 48, 1, true);
  const shade = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ map: shadeTex, color: 0x6a5846, roughness: 0.9, emissive: 0xff7a22, emissiveMap: shadeTex, emissiveIntensity: 0.6, side: THREE.FrontSide }));
  shade.position.y = 0.56; g.add(shade);
  const lining = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffa050, emissiveIntensity: 2.2, roughness: 1, side: THREE.BackSide }));
  lining.position.y = 0.56; lining.scale.setScalar(0.995); g.add(lining);
  // trims
  for (const [y, r] of [[0.67, 0.115], [0.45, 0.19]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0035, 6, 64), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.7 })); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  bulb.castShadow = false; lining.castShadow = false;
  // lights: shadowed bulb (shade makes the pools) + a soft unshadowed glow for light through the fabric
  const key = new THREE.PointLight(0xff9a40, 0.7, 0, 2); key.position.y = 0.53; key.castShadow = true;
  key.shadow.mapSize.set(512, 512); key.shadow.camera.near = 0.02; key.shadow.camera.far = 6; key.shadow.radius = 4; key.shadow.blurSamples = 8; key.shadow.bias = -0.002;
  const glow = new THREE.PointLight(0xff8a35, 0.1, 0, 2); glow.position.y = 0.56;
  g.add(key, glow);
  g.userData = { key, glow };
  return g;
}
