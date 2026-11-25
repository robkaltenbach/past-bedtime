import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();
export let maxAniso = 8;
export function setAniso(n) { maxAniso = n; }

function tex(url, srgb) {
  const key = url + srgb;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  cache.set(key, t);
  return t;
}

// PBR material from a Poly Haven texture folder (diff / nor / arm). UVs are expected in metres; `size` = metres per tile.
export function pbr(name, { size = 1, color = 0xffffff, rough = 1, normalScale = 1, diff = 'diff', metal = false, ao = 1, ...rest } = {}) {
  const base = `${import.meta.env.BASE_URL}assets/tex/${name}/`;
  const prep = (t) => { const c = t.clone(); c.repeat.set(1 / size, 1 / size); c.needsUpdate = true; return c; };
  const arm = prep(tex(base + 'arm.jpg', false));
  const physical = 'sheen' in rest || 'clearcoat' in rest;
  const M = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({
    map: prep(tex(base + diff + '.jpg', true)),
    normalMap: prep(tex(base + 'nor.jpg', false)),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: arm, aoMap: arm, aoMapIntensity: ao,
    metalnessMap: metal ? arm : null, metalness: metal ? 1 : 0,
    roughness: rough, color, ...rest,
  });
  return m;
}

// Assign planar UVs in metres, picking the projection from each vertex normal. `grain` = axis that maps to V.
export function metricUV(geo, grain = 'y') {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { [u, v] = grain === 'z' ? [y, z] : [z, y]; }
    else if (ay >= az) { [u, v] = grain === 'z' ? [x, z] : grain === 'x' ? [z, x] : [x, z]; }
    else { [u, v] = grain === 'x' ? [y, x] : [x, y]; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// cheap deterministic value noise / fbm for cloth wrinkles
function hash(x, y, z) { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
export function fbm(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

export function shadowAll(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
