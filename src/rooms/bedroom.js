// The kid's bedroom: wood paneling, bunk bed on the left, CRT on a low stand.
import * as THREE from 'three';
import { buildRoom, buildBunkBed, buildConsole, buildController, buildVCR, buildPoster, buildGlowStars, cord, ROOM } from '../scene/room.js';
import { shadowAll } from '../scene/util.js';

const STAND_S = [0.6, 0.6, 0.95], STAND_TOP = 0.68 * 0.6;

export default {
  id: 'bedroom',
  title: 'Bedroom',
  camera: { eye: [0.32, 0.64, 0.78], target: [0.05, 0.6, -1.3], fov: 43, orbit: [0.12, 0.7, -0.6] },
  tv: { pos: [0.12, STAND_TOP, -1.235], scale: 1.95, rotY: -0.03 },
  models: ['television_02', 'modern_wooden_cabinet', 'wooden_display_shelves_01', 'book_encyclopedia_set_01', 'alarm_clock_01', 'plastic_crate_01', 'baseball_01', 'throw_pillows_01', 'dartboard'],
  staticGain: 0,
  build(scene) {
    scene.add(buildRoom());
    const bunk = buildBunkBed(); bunk.position.set(-ROOM.W / 2 + 0.54, 0, -ROOM.D / 2 + 1.04); scene.add(bunk);
    scene.add(buildGlowStars());
    const poster = buildPoster(); poster.position.set(-0.5, 1.5, -ROOM.D / 2 + 0.004); poster.rotation.z = 0.012; scene.add(poster);
    const consoleBox = buildConsole(); consoleBox.position.set(-0.36, 0, -0.8); consoleBox.rotation.y = 0.14; scene.add(consoleBox);
    const pad = buildController(); pad.position.set(0.22, 0.004, -0.5); pad.rotation.y = -0.35; scene.add(pad);
    return { consoleBox, pad };
  },
  place(scene, m, h) {
    const [, stand, shelves, books, clock, crate, ball, pillows, dart] = m;
    stand.scale.set(...STAND_S); stand.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(0x8c7a68); } }); stand.position.set(0.02, 0, -ROOM.D / 2 + 0.342 * STAND_S[2] + 0.012); scene.add(shadowAll(stand));
    shelves.scale.setScalar(0.9); shelves.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(0x6a4a34); } }); shelves.rotation.y = Math.PI / 2; shelves.position.set(1.29, 0, -ROOM.D / 2 + 0.186 * 0.9 + 0.01); scene.add(shadowAll(shelves));
    books.scale.setScalar(0.85); books.position.set(1.0, 0.57, -1.56); scene.add(shadowAll(books));
    clock.position.set(0.64, STAND_TOP, -1.28); clock.rotation.y = -Math.PI / 2 - 0.35; scene.add(shadowAll(clock));
    crate.position.set(1.15, 0, -0.62); crate.rotation.y = -0.35; scene.add(shadowAll(crate));
    ball.position.set(1.12, 0.058, -0.64); scene.add(shadowAll(ball));
    pillows.position.set(-1.1, 0.48, 0.05); pillows.rotation.y = 1.3; pillows.scale.setScalar(0.85); scene.add(shadowAll(pillows));
    dart.position.set(ROOM.W / 2 - 0.002, 1.62, 0.95); dart.rotation.y = -Math.PI / 2; scene.add(shadowAll(dart));
    padLead(scene, h);
    const vcr = buildVCR(); vcr.position.set(-0.52, STAND_TOP, -1.3); vcr.rotation.y = 0.05; scene.add(vcr); h.vcr = vcr;
    scene.add(cord([[-0.44, 0.04, -0.87], [-0.5, 0.004, -1.0], [-0.62, 0.05, -1.68], [-0.3, STAND_TOP + 0.05, -1.68], [0.12, STAND_TOP + 0.12, -1.62]], 0.0024, 0x8a8a80));
  },
};

export function padLead(scene, h) {
  h.consoleBox.updateMatrixWorld(true); h.pad.updateMatrixWorld(true);
  const p0 = h.consoleBox.localToWorld(h.consoleBox.userData.port.clone()), p1 = h.pad.localToWorld(h.pad.userData.lead.clone());
  const mid = p0.clone().lerp(p1, 0.5);
  scene.add(cord([[p0.x, p0.y, p0.z], [p0.x + 0.01, 0.005, p0.z + 0.08], [mid.x - 0.1, 0.004, mid.z + 0.05], [mid.x + 0.08, 0.004, mid.z - 0.04], [p1.x - 0.05, 0.004, p1.z - 0.06], [p1.x, p1.y, p1.z]]));
}
