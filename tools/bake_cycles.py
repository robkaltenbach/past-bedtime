"""Path-traced lightmap bake with Blender Cycles (bpy).
usage: python3 bake_cycles.py <dir> <resolution> <samples> [passes=lamp,tvl,tvr]
reads <dir>/blender.npz (from bake_prep.py), writes <dir>/lm_<pass>.npy (linear irradiance, HxWx3)
"""
import sys, json, time, numpy as np, bpy

d, res, spp = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
if res == 0: res = json.load(open(f'{d}/bake.json'))['atlas']
passes = (sys.argv[4] if len(sys.argv) > 4 else 'lamp,tvl,tvr').split(',')
z = np.load(f'{d}/blender.npz')
info = json.loads(str(z['info']))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = spp
sc.cycles.use_denoising = False
sc.cycles.max_bounces = 8
sc.cycles.diffuse_bounces = 5
sc.cycles.glossy_bounces = 1
sc.cycles.transmission_bounces = 4
sc.cycles.transparent_max_bounces = 2
sc.cycles.sample_clamp_indirect = float(__import__('os').environ.get('CLAMP', '8'))
world = bpy.data.worlds.new('night'); sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0

img = bpy.data.images.new('lm', res, res, float_buffer=True, alpha=False)

def mesh_obj(name, P, I, U=None, N=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(P.tolist(), [], I.reshape(-1, 3).tolist())
    if U is not None:
        uvl = me.uv_layers.new(name='lm')
        uvl.data.foreach_set('uv', U[I.ravel()].ravel())
    me.shade_smooth()
    if N is not None:
        try: me.normals_split_custom_set_from_vertices(N.tolist())
        except Exception as e: print('normals', e)
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    return ob

def principled(albedo, rough=0.8):
    m = bpy.data.materials.new('m'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*albedo, 1); b.inputs['Roughness'].default_value = rough
    return m

lm_objs = []
emitters = {}
t0 = time.time()
for i, m in enumerate(info['meshes']):
    P = z[f'P{i}']; I = z[f'I{i}']; N = z[f'N{i}']
    U = z[f'U{i}'] if m['mode'] == 'lm' else None
    ob = mesh_obj(f'o{i}', P, I, U, N)
    a = m['albedo']
    if m['mode'] == 'lm':
        mat = principled(a)
        nt = mat.node_tree; tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
        lm_objs.append(ob)
    elif m['mode'] == 'shade':
        mat = bpy.data.materials.new('shade'); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); mix = nt.nodes.new('ShaderNodeMixShader')
        dif = nt.nodes.new('ShaderNodeBsdfDiffuse'); tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
        dif.inputs['Color'].default_value = (0.8, 0.66, 0.45, 1); tr.inputs['Color'].default_value = (0.95, 0.62, 0.3, 1)
        mix.inputs['Fac'].default_value = 0.45
        nt.links.new(dif.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs['Surface'])
    elif m['mode'] == 'sky':
        mat = bpy.data.materials.new('sky'); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (0.35, 0.45, 0.8, 1); nt.links.new(em.outputs[0], out.inputs['Surface'])
        emitters['sky'] = em
    else:
        mat = principled(a)
    ob.data.materials.append(mat)
print('scene built', len(info['meshes']), 'meshes', round(time.time() - t0, 1), 's')

def screen_quad(name, corners):
    ob = mesh_obj(name, np.array(corners, dtype=np.float32), np.array([0, 1, 2, 0, 2, 3], dtype=np.int32))
    mat = bpy.data.materials.new(name); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1, 1, 1, 1); nt.links.new(em.outputs[0], out.inputs['Surface'])
    # one-sided: a CRT only emits out of its face
    geo = nt.nodes.new('ShaderNodeNewGeometry'); inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0; nt.links.new(geo.outputs['Backfacing'], inv.inputs[1])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; nt.links.new(inv.outputs[0], mul.inputs[0])
    nt.links.new(mul.outputs[0], em.inputs['Strength'])
    ob.data.materials.append(mat); return mul
emitters['tvl'] = screen_quad('tvl', info['screenL'])
emitters['tvr'] = screen_quad('tvr', info['screenR'])

bulb = bpy.data.lights.new('bulb', 'POINT'); bulb.energy = 75; bulb.shadow_soft_size = 0.12; bulb.color = (1.0, 0.74, 0.46)
bo = bpy.data.objects.new('bulb', bulb); bo.location = info['lamp']; sc.collection.objects.link(bo)
moon = bpy.data.lights.new('moon', 'SPOT'); moon.energy = 220; moon.shadow_soft_size = 0.08; moon.spot_size = 0.7; moon.spot_blend = 0.5; moon.color = (0.62, 0.7, 1.0)
mo = bpy.data.objects.new('moon', moon); mo.location = info['moon']['pos']; sc.collection.objects.link(mo)
import mathutils
dvec = mathutils.Vector(info['moon']['target']) - mathutils.Vector(info['moon']['pos'])
mo.rotation_euler = dvec.to_track_quat('-Z', 'Y').to_euler()

def setup(p):
    bulb.energy = 75 if p == 'lamp' else 0
    moon.energy = 0  # Rob: light is the TV plus the hall, nothing else
    emitters['sky'].inputs['Strength'].default_value = 0.0
    emitters['tvl'].inputs[1].default_value = 1.0 if p == 'tvl' else 0.0
    emitters['tvr'].inputs[1].default_value = 1.0 if p == 'tvr' else 0.0

bpy.ops.object.select_all(action='DESELECT')
for ob in lm_objs: ob.select_set(True)
bpy.context.view_layer.objects.active = lm_objs[0]
sc.render.bake.margin = 6
sc.render.bake.margin_type = 'EXTEND'
for p in passes:
    setup(p)
    t0 = time.time()
    # the hall spills through a door crack: its indirect light is pure firefly noise for little gain, so bake it direct-only
    pf = {'DIRECT'} if p == 'lamp' else {'DIRECT', 'INDIRECT'}
    bpy.ops.object.bake(type='DIFFUSE', pass_filter=pf, use_clear=True, margin=6)
    px = np.empty(res * res * 4, dtype=np.float32); img.pixels.foreach_get(px)
    np.save(f'{d}/lm_{p}.npy', px.reshape(res, res, 4)[..., :3])
    print('baked', p, round(time.time() - t0, 1), 's', 'max', float(px.max()))
