// Baked lighting: scene export for the offline Cycles bake, and runtime application of the lightmaps.
// Modes (mesh.userData.bake): 'lm' (default: lightmapped), 'occluder' (in the bake, keeps realtime shading),
// 'shade' (translucent lamp shade), 'sky' (emitter outside the window), 'skip' (not in the bake at all).
import * as THREE from 'three';
import { ShaderChunk } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function bakeMode(o) { return o.userData.bake || 'lm'; }

export function staticMeshes(scene) {
  const list = [];
  scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && bakeMode(o) !== 'skip') list.push(o); });
  return list;
}

// InstancedMesh -> one merged Mesh (so it can carry lightmap UVs)
export function flattenInstanced(inst) {
  const geos = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < inst.count; i++) { inst.getMatrixAt(i, m); const g = inst.geometry.clone(); g.applyMatrix4(m); geos.push(g); }
  const mesh = new THREE.Mesh(mergeGeometries(geos), inst.material);
  mesh.position.copy(inst.position); mesh.quaternion.copy(inst.quaternion); mesh.scale.copy(inst.scale);
  mesh.castShadow = inst.castShadow; mesh.receiveShadow = inst.receiveShadow; mesh.userData = { ...inst.userData };
  return mesh;
}

// ---------------------------------------------------------------- export (run in the browser with ?export)
function avgTextureColor(tex) {
  const img = tex && tex.image; if (!img) return [1, 1, 1];
  try {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0;
    const lin = (v) => Math.pow(v / 255, 2.2);
    for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); }
    const n = d.length / 4; return [r / n, g / n, b / n];
  } catch { return [0.5, 0.5, 0.5]; }
}

export function exportScene(scene, extras) {
  scene.updateMatrixWorld(true);
  const meshes = [], chunks = []; let off = 0;
  const push = (arr) => { const o = off; chunks.push(arr); off += arr.byteLength; return o; };
  const nm = new THREE.Matrix3();
  for (const o of staticMeshes(scene)) {
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal;
    const n = pos.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
    nm.getNormalMatrix(o.matrixWorld);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); P.set([v.x, v.y, v.z], i * 3);
      if (nor) v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0);
      N.set([v.x, v.y, v.z], i * 3);
    }
    const I = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const base = mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [1, 1, 1];
    const t = avgTextureColor(mat.map);
    const albedo = base.map((c, i) => Math.min(0.95, c * t[i]));
    meshes.push({ name: o.name || o.parent?.name || '', mode: bakeMode(o), albedo, vcount: n, icount: I.length, pos: push(P), nor: push(N), idx: push(I) });
  }
  const blob = new Uint8Array(off); let p = 0;
  for (const c of chunks) { blob.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), p); p += c.byteLength; }
  return { header: { meshes, ...extras }, blob };
}

// ---------------------------------------------------------------- runtime
export const LM = {
  uLamp: { value: new THREE.Color(1, 1, 1) },
  uTvL: { value: new THREE.Color(0, 0, 0) },
  uTvR: { value: new THREE.Color(0, 0, 0) },
  lmTvL: { value: null }, lmTvR: { value: null },
  uFill: { value: new THREE.Color(0, 0, 0) }, // flat 'eyes adjusted' lift, no shadows, kept tiny
  uDebug: { value: 0 }, // 0 final, 1 lighting only (white albedo)
};

const mapsChunk = ShaderChunk.lights_fragment_maps
  .replace(/vec4 lightMapTexel[\s\S]*?irradiance \+= lightMapIrradiance;/, `
    vec3 lmA = pow( texture2D( lightMap, vLightMapUv ).rgb, vec3( 2.2 ) );
    vec3 lmB = pow( texture2D( lmTvL, vLightMapUv ).rgb, vec3( 2.2 ) );
    vec3 lmC = pow( texture2D( lmTvR, vLightMapUv ).rgb, vec3( 2.2 ) );
    irradiance = lmA * uLamp + lmB * uTvL + lmC * uTvR + uFill;`)
  .replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '');

function patchMaterial(mat, lampTex) {
  if (mat.userData.lmPatched) return;
  mat.userData.lmPatched = true;
  mat.lightMap = lampTex; mat.lightMapIntensity = 1;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, LM);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_fragment_maps>', mapsChunk)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.directDiffuse = vec3( 0.0 );')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tif ( uDebug == 1 ) diffuseColor.rgb = vec3( 0.72 );')
      .replace('void main() {', 'uniform sampler2D lmTvL, lmTvR; uniform vec3 uLamp, uTvL, uTvR, uFill; uniform int uDebug;\nvoid main() {');
  };
  mat.customProgramCacheKey = () => 'lm';
  mat.needsUpdate = true;
}

export async function applyBake(scene, base) {
  const [meta, buf] = await Promise.all([
    fetch(base + 'bake.json').then((r) => { if (!r.ok) throw new Error('no bake'); return r.json(); }),
    fetch(base + 'uv.bin').then((r) => r.arrayBuffer()),
  ]);
  const list = staticMeshes(scene).filter((o) => bakeMode(o) === 'lm');
  if (list.length !== meta.meshes.length) throw new Error(`bake is stale: ${list.length} meshes vs ${meta.meshes.length} baked`);
  const loader = new THREE.TextureLoader();
  const load = (f) => new Promise((res) => loader.load(base + f, (t) => { t.channel = 1; t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; /* no mips: mip levels average across unrelated atlas charts and smear blocks onto distant walls */ res(t); }));
  const black = () => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.channel = 1; t.needsUpdate = true; return t; };
  const [tLamp, tL, tR] = await Promise.all([meta.scales.lamp ? load('lm_lamp.png') : black(), load('lm_tvl.png'), load('lm_tvr.png')]);
  LM.lmTvL.value = tL; LM.lmTvR.value = tR;
  for (let k = 0; k < list.length; k++) {
    const o = list[k], m = meta.meshes[k];
    const g0 = o.geometry;
    if (g0.attributes.position.count !== m.vcount) throw new Error(`bake is stale at mesh ${k}`);
    const vmap = new Uint32Array(buf, m.vmap, m.nv), idx = new Uint32Array(buf, m.idx, m.ni), uv = new Float32Array(buf, m.uv, m.nv * 2);
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g0.attributes)) {
      const s = attr.itemSize, src = attr.array, out = new src.constructor(m.nv * s);
      for (let i = 0; i < m.nv; i++) for (let c = 0; c < s; c++) out[i * s + c] = src[vmap[i] * s + c];
      g.setAttribute(name, new THREE.BufferAttribute(out, s, attr.normalized));
    }
    g.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    o.geometry = g;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mt of mats) patchMaterial(mt, tLamp);
  }
  return meta;
}
