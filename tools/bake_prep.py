"""Lightmap UV atlas for the exported scene (xatlas).
usage: python3 bake_prep.py <dir> <resolution>
reads  <dir>/scene.json + scene.bin  (from the app's ?export mode)
writes <dir>/uv.bin + bake.json (runtime) and <dir>/blender.npz (for bake_cycles.py)
"""
import json, sys, numpy as np, xatlas

d, res = sys.argv[1], int(sys.argv[2])
H = json.load(open(f'{d}/scene.json'))
B = open(f'{d}/scene.bin', 'rb').read()

def arr(off, n, dt, k=1):
    return np.frombuffer(B, dtype=dt, count=n * k, offset=off).reshape(-1, k) if k > 1 else np.frombuffer(B, dtype=dt, count=n, offset=off)

meshes = []
for m in H['meshes']:
    P = arr(m['pos'], m['vcount'], np.float32, 3).copy()
    N = arr(m['nor'], m['vcount'], np.float32, 3).copy()
    I = arr(m['idx'], m['icount'], np.uint32).reshape(-1, 3).copy()
    meshes.append((m, P, N, I))

atlas = xatlas.Atlas()
lm = [i for i, (m, *_rest) in enumerate(meshes) if m['mode'] == 'lm']
for i in lm:
    m, P, N, I = meshes[i]
    atlas.add_mesh(P, I, N)
co = xatlas.ChartOptions(); co.max_iterations = 2
po = xatlas.PackOptions(); po.resolution = res; po.padding = 4; po.bilinear = True; po.bruteForce = False
atlas.generate(co, po, verbose=False)
print('atlas', atlas.width, atlas.height, 'charts', atlas.chart_count, 'utilization', atlas.utilization)

out = bytearray(); meta = []
def put(a):
    off = len(out); out.extend(a.tobytes()); return off
blend = {}
for k, i in enumerate(lm):
    m, P, N, I = meshes[i]
    vmap, idx, uv = atlas[k]
    meta.append({'vcount': m['vcount'], 'nv': int(len(vmap)), 'ni': int(idx.size),
                 'vmap': put(vmap.astype(np.uint32)), 'idx': put(idx.astype(np.uint32).ravel()), 'uv': put(uv.astype(np.float32).ravel())})
    blend[f'P{i}'] = P[vmap]; blend[f'N{i}'] = N[vmap]; blend[f'I{i}'] = idx.astype(np.int32); blend[f'U{i}'] = uv.astype(np.float32)
for i, (m, P, N, I) in enumerate(meshes):
    if m['mode'] != 'lm':
        blend[f'P{i}'] = P; blend[f'N{i}'] = N; blend[f'I{i}'] = I.astype(np.int32)
open(f'{d}/uv.bin', 'wb').write(bytes(out))
json.dump({'resolution': res, 'meshes': meta}, open(f'{d}/bake.json', 'w'))
info = {k: v for k, v in H.items() if k != 'meshes'}
info['meshes'] = [{'mode': m['mode'], 'albedo': m['albedo'], 'name': m['name']} for (m, *_r) in meshes]
np.savez_compressed(f'{d}/blender.npz', info=json.dumps(info), **blend)
print('wrote', len(meta), 'lightmapped meshes, uv.bin', len(out) // 1024, 'KB')
