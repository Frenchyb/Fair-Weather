import bpy, numpy as np, sys
from mathutils import Matrix
bpy.ops.wm.open_mainfile(filepath='/tmp/claude-0/mh/npcmateando.blend')
print([ (o.name,o.type, len(o.data.vertices) if o.type=='MESH' else '') for o in bpy.data.objects])
arm = bpy.data.objects['testmodel2']
arm.animation_data_clear()
for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
W = arm.matrix_world
bones = {b.name: (list(W @ b.head), list(W @ b.tail)) for b in arm.pose.bones}
dg = bpy.context.evaluated_depsgraph_get()
out = {}
for name in ['testmodel2-base', 'testmodel2-highpolyeyes', 'testmodel2-male_casualsuit01']:
    o = bpy.data.objects[name]
    e = o.evaluated_get(dg); m = e.to_mesh()
    m.calc_loop_triangles()
    P = np.array([list(o.matrix_world @ v.co) for v in m.vertices], np.float32)
    T = np.array([list(t.vertices) for t in m.loop_triangles], np.int32)
    gn = {g.index: g.name for g in o.vertex_groups}
    dom = []
    for v in o.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        dom.append(gn[best.group] if best else '')
    # UVs and skin texture sample for colour
    uv = np.zeros((len(m.vertices), 2), np.float32)
    if m.uv_layers:
        for t in m.loop_triangles:
            for li, vi in zip(t.loops, t.vertices): uv[vi] = m.uv_layers.active.data[li].uv
    out[name] = dict(P=P, T=T, dom=np.array(dom), uv=uv)
    print(name, P.shape, T.shape, P.min(0), P.max(0))
np.savez('/tmp/claude-0/mh/mh.npz', **{f'{k}_{kk}': v for k, d in out.items() for kk, v in d.items()})
import json; json.dump(bones, open('/tmp/claude-0/mh/bones.json', 'w'))
print({k: bones[k][0] for k in ['pelvis','spine_03','neck_01','head','upperarm_l','lowerarm_l','hand_l','thigh_l','calf_l','foot_l'] if k in bones})
