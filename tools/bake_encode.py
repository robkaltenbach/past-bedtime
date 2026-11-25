"""Clean up and encode baked lightmaps for the web.
usage: python3 bake_encode.py <dir> <out_dir>
reads <dir>/lm_{lamp,tvl,tvr}.npy + bake.json, writes <out_dir>/lm_*.png, uv.bin, bake.json (with per-basis scales)
PNG encoding: value = (E / scale) ^ (1/2.2), dithered; runtime decodes pow(v, 2.2) * scale.
"""
import sys, json, shutil, numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, __import__('os').path.dirname(__file__))
from oidn import denoise_lightmap

d, out = sys.argv[1], sys.argv[2]
meta = json.load(open(f'{d}/bake.json'))
scales = {}
rng = np.random.default_rng(1)
for p in ['lamp', 'tvl', 'tvr']:
    E = np.load(f'{d}/lm_{p}.npy').astype(np.float32)
    covered = E.max(axis=2) > 0
    # pad charts outward so the denoiser and mip/bilinear sampling never see black gaps, then OIDN
    idx = ndimage.distance_transform_edt(~covered, return_distances=False, return_indices=True)
    S = E[idx[0], idx[1]]
    S = np.maximum(denoise_lightmap(S), 0)
    lum = S.max(axis=2)
    scale = float(np.percentile(lum[covered], 99.7)) * 1.15
    scales[p] = scale
    v = np.clip(S / scale, 0, 1) ** (1 / 2.2)
    v = np.clip(v * 255 + rng.uniform(-0.5, 0.5, v.shape), 0, 255).astype(np.uint8)
    Image.fromarray(v, 'RGB').save(f'{out}/lm_{p}.png', optimize=True)
    print(p, 'scale', scale)
meta['scales'] = scales
json.dump(meta, open(f'{out}/bake.json', 'w'))
shutil.copy(f'{d}/uv.bin', f'{out}/uv.bin')
