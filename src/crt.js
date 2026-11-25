import * as THREE from 'three';

// Curved CRT face. Lives in the TV model's local space (metres, unscaled model units).
export const SCREEN = { cx: -0.0025, cy: 0.2575, w: 0.316, h: 0.236, zc: 0.1236, sag: 0.0075 };

const vert = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vView = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */`
precision highp float;
uniform sampler2D tFrame;
uniform float uTime, uPower, uSignal, uBright, uMask;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;

float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }

// NES picture: 256x240, show 8px overscan crop on each side
const vec2 SRC = vec2(256.0, 240.0);
const vec4 CROP = vec4(8.0, 8.0, 248.0, 232.0);

vec3 fetchLine(float px, float line){
  // horizontally continuous beam (composite-ish softness), vertically one scanline
  vec2 uv = vec2(px / SRC.x, (line + 0.5) / SRC.y);
  float o = 0.55 / SRC.x;
  vec3 c;
  c.r = texture2D(tFrame, uv + vec2(-o*0.6, 0.0)).r;
  c.g = texture2D(tFrame, uv).g;
  c.b = texture2D(tFrame, uv + vec2(o*0.6, 0.0)).b;
  return c;
}

void main(){
  // picture geometry: slight barrel on top of the physical bulge
  vec2 p = vUv - 0.5;
  float r2 = dot(p*vec2(1.0,0.75), p*vec2(1.0,0.75));
  vec2 q = p * (1.0 + 0.045*r2) * 1.015;
  // vertical squash during power-on
  q.y /= max(uPower, 0.004);
  vec2 uv = q + 0.5;
  bool inside = all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)));

  vec3 col = vec3(0.0);
  if (inside) {
    float px = mix(CROP.x, CROP.z, uv.x);
    float py = mix(CROP.w, CROP.y, uv.y);   // top of screen = line 8
    float line = floor(py);
    float f = fract(py) - 0.5;
    vec3 c0 = toLin(fetchLine(px, line));
    float nb = f > 0.0 ? 1.0 : -1.0;
    vec3 c1 = toLin(fetchLine(px, line + nb));
    // gaussian beam per scanline; bright lines bloom wider
    float l0 = max(max(c0.r,c0.g),c0.b), l1 = max(max(c1.r,c1.g),c1.b);
    float s0 = mix(0.21, 0.38, sqrt(l0)), s1 = mix(0.21, 0.38, sqrt(l1));
    float w0 = exp(-0.5*f*f/(s0*s0)), w1 = exp(-0.5*(1.0-abs(f))*(1.0-abs(f))/(s1*s1));
    col = (c0*w0 + c1*w1) * 1.25;
    // halation glow from a blurrier mip
    vec3 glow = toLin(texture2D(tFrame, vec2(px/SRC.x, py/SRC.y), 3.0).rgb);
    col += glow * 0.06;

    // no-signal snow
    if (uSignal < 1.0) {
      float t = floor(uTime*60.0);
      float n = hash(floor(vec2(uv.x*320.0, py)) + t*13.1);
      float roll = 0.75 + 0.25*sin(uv.y*9.0 + uTime*3.0);
      vec3 snow = vec3(n*n*1.2*roll);
      col = mix(snow, col, uSignal);
    }

    // aperture grille, faded out where it would alias
    float mx = gl_FragCoord.x;
    float stripe = uv.x * 720.0;
    float aa = clamp(1.0 - fwidth(stripe)*0.9, 0.0, 1.0);
    vec3 m = vec3(
      0.5+0.5*cos(6.2831853*(stripe)),
      0.5+0.5*cos(6.2831853*(stripe-0.3333)),
      0.5+0.5*cos(6.2831853*(stripe-0.6667)));
    col *= mix(vec3(1.0), mix(vec3(0.68), m*1.35, 0.55), uMask*aa);
    col *= mix(1.0, 0.82, uMask*(1.0-aa)); // mask still costs light when unresolved

    // brightness falloff toward the corners
    col *= 1.0 - 0.55*pow(r2*2.2, 1.6);
  }
  // rounded mask of the visible tube face
  vec2 d = abs(p) - vec2(0.5) + 0.06;
  float corner = length(max(d, 0.0)) - 0.06;
  float edge = smoothstep(0.0, -0.006, corner);
  // power-on/off flash line
  float flash = (1.0 - smoothstep(0.0, 0.25, uPower)) * smoothstep(0.012, 0.0, abs(p.y)) * step(0.001, uPower);
  col += vec3(flash*3.0);

  // glass black level: phosphor-grey with a touch of green
  vec3 black = vec3(0.0035, 0.0045, 0.0042);
  col = black + col * uBright * step(0.001, uPower);
  gl_FragColor = vec4(col * edge, 1.0);
}`;

export function makeScreenMesh(frameTex) {
  const { w, h, sag } = SCREEN;
  const geo = new THREE.PlaneGeometry(w, h, 48, 36);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2);
    p.setZ(i, -sag * (0.55 * x * x + 0.45 * y * y));
  }
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: {
      tFrame: { value: frameTex }, uTime: { value: 0 }, uPower: { value: 0 }, uSignal: { value: 0 },
      uBright: { value: 1.45 }, uMask: { value: 1 },
    },
    toneMapped: true,
  });
  mat.extensions = { derivatives: true };
  const m = new THREE.Mesh(geo, mat);
  m.position.set(SCREEN.cx, SCREEN.cy, SCREEN.zc);
  // glossy front glass: reflections only, added on top
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 0.5,
  });
  const glass = new THREE.Mesh(geo, glassMat);
  glass.position.copy(m.position); glass.position.z += 0.0008;
  return { screen: m, glass };
}

// Samples each emulator frame into a small light "cookie" + average colour.
export class ScreenLight {
  constructor(cols = 8, rows = 6) {
    this.cols = cols; this.rows = rows;
    this.data = new Uint8Array(cols * rows * 4);
    this.cookie = new THREE.DataTexture(this.data, cols, rows, THREE.RGBAFormat);
    this.cookie.magFilter = this.cookie.minFilter = THREE.LinearFilter;
    this.cookie.colorSpace = THREE.NoColorSpace;
    this.cookie.needsUpdate = true;
    this.avg = new THREE.Color(0, 0, 0); // linear
    this.lum = 0;
    this.cells = new Float32Array(cols * rows * 3);
    this.lut = new Float32Array(256); for (let i = 0; i < 256; i++) this.lut[i] = Math.pow(i / 255, 2.2);
  }
  // fb: Uint32Array 256x240 ABGR
  update(fb, power = 1) {
    const { cols, rows, cells, lut } = this;
    cells.fill(0);
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = 8; y < 232; y += 4) {
      const cy = Math.min(rows - 1, ((y - 8) / 224 * rows) | 0);
      for (let x = 8; x < 248; x += 4) {
        const v = fb[y * 256 + x];
        const r = lut[v & 255], g = lut[(v >> 8) & 255], b = lut[(v >> 16) & 255];
        const cx = Math.min(cols - 1, ((x - 8) / 240 * cols) | 0);
        const k = (cy * cols + cx) * 3; cells[k] += r; cells[k + 1] += g; cells[k + 2] += b;
        R += r; G += g; B += b; n++;
      }
    }
    const per = n / (cols * rows);
    R /= n; G /= n; B /= n;
    this.setFromCells(R, G, B, per, power);
  }
  setUniform(r, g, b, power = 1) {
    // e.g. static noise
    const { cols, rows, cells } = this; const per = 1;
    for (let i = 0; i < cols * rows; i++) { cells[i * 3] = r; cells[i * 3 + 1] = g; cells[i * 3 + 2] = b; }
    this.setFromCells(r, g, b, per, power);
  }
  setFromCells(R, G, B, per, power) {
    const { cols, rows, cells, data } = this;
    const m = Math.max(R, G, B, 1e-4);
    // cookie: each cell's colour relative to the brightest channel average, blended toward the mean so it stays diffuse
    let peak = 1e-4;
    for (let i = 0; i < cols * rows * 3; i++) peak = Math.max(peak, cells[i] / per);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      // spotlight cookie is seen from the light looking out: mirror x, flip y so the screen's left lights the room's left
      const src = ((rows - 1 - cy) * cols + (cols - 1 - cx)) * 3;
      const o = (cy * cols + cx) * 4;
      for (let c = 0; c < 3; c++) {
        const local = cells[src + c] / per / peak;
        const mean = [R, G, B][c] / peak;
        data[o + c] = Math.min(255, Math.round(255 * (0.45 * local + 0.55 * mean)));
      }
      data[o + 3] = 255;
    }
    this.cookie.needsUpdate = true;
    this.avg.setRGB(R / m, G / m, B / m);
    this.lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) * power;
    this.peak = peak * power;
  }
}
