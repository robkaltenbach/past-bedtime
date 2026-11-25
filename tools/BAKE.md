# Baked lighting

The room's lighting is path-traced offline and baked into lightmaps: one basis for the lamp + moonlight, and one each for the left and right halves of the CRT (white emitters). At runtime `src/bake.js` recombines them with the live picture's colours.

Rebuild after any change to static geometry or layout (the runtime refuses a stale bake and falls back to realtime lights):

    npm run dev &                                   # app on 127.0.0.1:5173
    python3 tools/bake_export.py /tmp/bake          # ?export mode -> scene.json + scene.bin
    python3 tools/bake_prep.py /tmp/bake 1024       # xatlas lightmap UVs -> uv.bin, bake.json, blender.npz
    python3 tools/bake_cycles.py /tmp/bake 0 16     # Blender Cycles (pip bpy) -> lm_*.npy  (0 = atlas size from prep)
    python3 tools/bake_encode.py /tmp/bake public/bake   # OIDN denoise -> PNGs + scales

Requires: pip `bpy xatlas scipy pillow playwright`.
