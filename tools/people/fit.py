"""Rose and Walter from a real human base.

The base is a MakeHuman man (CC0, from OpenGameArt's "Gaucho drinking mate",
the same file Hedgerow uses), pulled out of its .blend by extract.py into
mh.npz and bones.json. This reshapes him into each of them to the approved
turnaround sheet, paints their clothes on as vertex colours (pushing cloth
out from the skin a little), and cuts him into the game's jointed parts: each
part lands in its own joint's frame, so every pose in people.ts works on it.

    python3 tools/people/fit.py <dir with mh.npz, bones.json and the textures> src/render/people-mesh.ts

The joint layout here must match figure() in src/render/people.ts.
"""
import base64
import json
import sys

import numpy as np

src, out = sys.argv[1], sys.argv[2]
Z = np.load(f'{src}/mh.npz')
B = {k: np.array(v[0]) for k, v in json.load(open(f'{src}/bones.json')).items()}
skin_tex = np.load(f'{src}/testmodel2-base-middleage_lightskinned_male_diffuse.png.npy')
eye_tex = np.load(f'{src}/testmodel2-highpolyeyes-brown_eye.png.npy')


def three(p):
    """Blender (z up, facing -y) to three.js (y up, facing +z)."""
    p = np.asarray(p, np.float64)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], -1)


J = {k: three(v) for k, v in B.items()}
# The base body keeps only what the clothes leave bare (head, hands, feet);
# the casual suit's shirt and trousers carry the body, cut where Rose and
# Walter need it and recoloured.
meshes = [three(Z[f'testmodel2-{k}_P']) for k in ('base', 'highpolyeyes', 'male_casualsuit01')]
tris = [Z[f'testmodel2-{k}_T'] for k in ('base', 'highpolyeyes', 'male_casualsuit01')]
doms = [Z['testmodel2-base_dom'], np.array(['head'] * len(meshes[1])), Z['testmodel2-male_casualsuit01_dom']]
uvs = [Z[f'testmodel2-{k}_uv'] for k in ('base', 'highpolyeyes', 'male_casualsuit01')]
src_of = np.concatenate([np.full(len(m), i) for i, m in enumerate(meshes)])
P = np.concatenate(meshes)
starts = np.cumsum([0] + [len(m) for m in meshes])
T = np.concatenate([t + o for t, o in zip(tris, starts)])
dom = np.concatenate(doms)
uv = np.concatenate(uvs)
is_eye = src_of == 1
is_skin = src_of == 0
def sample(tex, uv):
    h, w = tex.shape[:2]
    x = np.clip((uv[:, 0] % 1) * (w - 1), 0, w - 1).astype(int)
    y = np.clip((1 - uv[:, 1] % 1) * (h - 1), 0, h - 1).astype(int)
    # Blender's pixels run bottom row first.
    return tex[h - 1 - y, x].astype(np.float64) / 255


def normals(P, T):
    n = np.zeros_like(P)
    f = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for k in range(3):
        np.add.at(n, T[:, k], f)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


N0 = normals(P, T)


def part_of(g):
    """Which of the game's joints a MakeHuman bone rides on. Our L is the
    figure's -x side, which is MakeHuman's right."""
    side = {'_r': 'L', '_l': 'R'}.get(g[-2:], '')
    if g.startswith(('thigh',)):
        return 'leg' + side
    if g.startswith(('calf', 'foot', 'ball')):
        return 'knee' + side
    if g.startswith('upperarm'):
        return 'arm' + side
    if g.startswith('lowerarm'):
        return 'elbow' + side
    if g.startswith(('hand', 'thumb', 'index', 'middle', 'ring', 'pinky')):
        return 'hand' + side
    if g.startswith(('neck', 'head')) or g in ('', 'jaw') or 'eye' in g or 'lip' in g or 'brow' in g or 'cheek' in g or 'tongue' in g or 'teeth' in g or 'nose' in g or 'ear' in g:
        return 'head'
    return 'hips'


part = np.array([part_of(g) for g in dom])
keep = ~is_skin | np.isin(part, ['head', 'handL', 'handR', 'kneeL', 'kneeR'])
keep &= ~(is_skin & np.isin(part, ['kneeL', 'kneeR']) & (P[:, 1] > 0.12))
T = T[keep[T].all(1)]


def rot_to(a, b):
    """Rotation taking unit vector a to unit vector b."""
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = np.dot(a, b)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def build(who):
    rose = who == 'rose'
    # The game's joints, in the figure's own units (before its overall scale).
    legx = 0.1 if rose else 0.085
    leg_len, half = 0.82, 0.82 * 0.52
    hip_y = 0.85
    arm_len = 0.5 if rose else 0.62
    ax, ay = (0.19, 0.46) if rose else (0.165, 0.54)
    head_y, head_z = (0.56, 0.0) if rose else (0.66, 0.045)
    head_scale = 1.15 * (1.3 if rose else 1)
    origin = {'hips': np.array([0, hip_y, 0]), 'head': np.array([0, hip_y + head_y, head_z])}
    for s, sx in (('L', -1), ('R', 1)):
        origin['leg' + s] = np.array([sx * legx, hip_y, 0])
        origin['knee' + s] = origin['leg' + s] + [0, -half, 0]
        origin['arm' + s] = np.array([sx * ax, hip_y + ay, 0])
        origin['elbow' + s] = origin['arm' + s] + [0, -arm_len * 0.52, 0]
        origin['hand' + s] = origin['arm' + s] + [0, -arm_len, 0]

    W = np.zeros_like(P)  # each vertex's place on the figure at rest, straight-limbed
    mh_hip = (J['thigh_l'] + J['thigh_r']) / 2
    mh_sh = (J['upperarm_l'] + J['upperarm_r']) / 2
    down = np.array([0, -1.0, 0])

    def limb(name, a, b, length, girth, extra=()):
        sel = np.isin(part, [name, *extra])
        d = J[b] - J[a]
        R = rot_to(d, down)
        q = (P[sel] - J[a]) @ R.T
        L = np.linalg.norm(d)
        q[:, 1] *= length / L
        q[:, [0, 2]] *= girth
        return sel, q

    for s, m in (('L', 'r'), ('R', 'l')):
        g_leg = 1.25 if rose else 0.9
        g_arm = 1.3 if rose else 0.85
        sel, q = limb('leg' + s, f'thigh_{m}', f'calf_{m}', half, g_leg)
        W[sel] = q + origin['leg' + s]
        sel, q = limb('knee' + s, f'calf_{m}', f'foot_{m}', leg_len - half, g_leg * (1.1 if rose else 1))
        W[sel] = q + origin['knee' + s]
        sel, q = limb('arm' + s, f'upperarm_{m}', f'lowerarm_{m}', arm_len * 0.52, g_arm)
        W[sel] = q + origin['arm' + s]
        # Near the shoulder the sleeve only part-turns, as skinning would, so the
        # shoulder seam rounds over instead of standing up in a point.
        d = J[f'lowerarm_{m}'] - J[f'upperarm_{m}']
        t = np.clip(((P[sel] - J[f'upperarm_{m}']) @ d) / (d @ d), 0, 1)
        w = smooth(t, 0.0, 0.45)[:, None]
        rest = (P[sel] - mh_hip) * [1, ay / (mh_sh[1] - mh_hip[1]), 1] + origin['hips']
        rest[:, 0] += np.sign(rest[:, 0]) * (ax - abs(J['upperarm_l'][0]))
        W[sel] = W[sel] * w + rest * (1 - w)
        # The hand keeps its length along the forearm's line, at a size to suit the person.
        d = J[f'hand_{m}'] - J[f'lowerarm_{m}']
        R = rot_to(d, down)
        sel = part == 'elbow' + s
        q = (P[sel] - J[f'lowerarm_{m}']) @ R.T
        q[:, 1] *= arm_len * 0.48 / np.linalg.norm(d)
        q[:, [0, 2]] *= g_arm
        W[sel] = q + origin['elbow' + s]
        sel = part == 'hand' + s
        q = (P[sel] - J[f'hand_{m}']) @ R.T * (1.05 if rose else 1.1)
        W[sel] = q + origin['hand' + s]

    # The body: hips to shoulders stretched to the game's height, then shaped:
    # Rose an egg, widest at the belly; Walter narrow and flat.
    sel = part == 'hips'
    q = P[sel] - mh_hip
    sv = ay / (mh_sh[1] - mh_hip[1])
    h = q[:, 1] / (mh_sh[1] - mh_hip[1])
    if rose:
        gx = 1.25 + 0.3 * np.exp(-((h - 0.3) / 0.35) ** 2) - 0.2 * smooth(h, 0.7, 1.0)
        gz = 1.25 + 0.45 * np.exp(-((h - 0.35) / 0.3) ** 2) * (q[:, 2] > 0) + 0.1 * np.exp(-((h - 0.2) / 0.3) ** 2)
    else:
        gx = 0.88 + 0.0 * h
        gz = 0.92 + 0.0 * h
    q[:, 0] *= gx
    q[:, 2] *= gz
    q[:, 1] *= sv
    W[sel] = q + origin['hips']

    # The head, a touch bigger than life (the head group scales it again).
    sel = part == 'head'
    hs = 1.0 if rose else 1.05
    q = (P[sel] - J['head']) * hs
    if not rose:
        # Walter: a longer face and bigger nose and ears.
        q[:, 1] *= 1.08
    W[sel] = origin['head'] + (q + [0, 0.04, 0]) * head_scale


    # Clothes, painted, and pushed out from the skin.
    N = N0.copy()
    col = sample(skin_tex, uv)
    col[~is_skin] = 0.5
    tone = np.array([0xee, 0xc0, 0xa6]) / 255
    flat = 0.92 if rose else 0.85  # Rose's face loses the base man's stubble and lines
    col = col * (1 - flat) + tone * flat
    col[is_eye] = sample(eye_tex, uv[is_eye])
    push = np.zeros(len(P))
    if rose:
        hd = (part == 'head') & is_skin
        for sx in (-1, 1):
            cheek = np.linalg.norm((W[:, [0, 1, 2]] - (origin['head'] + np.array([sx * 0.038, 0.05, 0.09]) * head_scale)) / head_scale, axis=1)
            k = np.clip(1 - cheek / 0.03, 0, 1)[:, None] * hd[:, None]
            col = col * (1 - 0.5 * k) + np.array([0.9, 0.5, 0.5]) * 0.5 * k
    y = W[:, 1]
    x, z = W[:, 0], W[:, 2]
    rel = y - hip_y

    def paint(mask, c, d=0.0):
        col[mask] = c
        push[mask] = np.maximum(push[mask], d)

    if rose:
        cardigan = np.array([0x9e, 0x40, 0x56]) / 255
        knit = (np.sin(y * 260) > 0.3)[:, None] * 0.06
        torso = part == 'hips'
        paint(torso, cardigan, 0.004)
        neck = torso & (rel > ay - 0.02) & (z > 0.0)
        paint(neck, np.array([0xef, 0xe2, 0xc8]) / 255, 0.004)
        dots = neck & (np.sin(x * 300) * np.sin(y * 300) > 0.6)
        col[dots] = np.array([0xd8, 0x8a, 0x90]) / 255
        for s in 'LR':
            paint(part == 'arm' + s, cardigan, 0.004)
            el = part == 'elbow' + s
            wrist = origin['hand' + s][1]
            paint(el & (y > wrist + 0.06), cardigan, 0.004)
            paint(el & (y <= wrist + 0.06), np.array([0xef, 0xe2, 0xc8]) / 255, 0.008)
            paint(part == 'leg' + s, np.array([0x5a, 0x44, 0x34]) / 255, 0.0)
            kn = part == 'knee' + s
            top = origin['knee' + s][1] - 0.06
            paint(kn & (y < top), np.array([0x6f, 0x8a, 0x52]) / 255, 0.012)
            paint(kn & (y >= top), np.array([0x4a, 0x38, 0x2a]) / 255, 0.016)
            flowers = kn & (y < top - 0.03) & (y > 0.08) & (np.sin(x * 90 + y * 40) * np.sin(z * 90 - y * 50) > 0.8)
            col[flowers] = np.array([0xd8, 0x8a, 0x90]) / 255
            sole = kn & (y < 0.025)
            col[sole] = np.array([0x3a, 0x32, 0x26]) / 255
    else:
        shirt = np.array([0xe4, 0xdc, 0xc0]) / 255
        check = ((np.sin(x * 160) > 0.85) | (np.sin(y * 160) > 0.85))[:, None] * np.array([0.18, 0.12, 0.2])
        tweed = np.array([0x5a, 0x43, 0x30]) / 255
        torso = part == 'hips'
        paint(torso, shirt, 0.0)
        # The waistcoat: hip to chest, open in a V at the front.
        vee = (z > 0) & (np.abs(x) < 0.012 + np.clip(rel - (ay - 0.22), 0, 1) * 0.5)
        wc = torso & (rel > -0.06) & (rel < ay - 0.03) & ~vee
        paint(wc, tweed, 0.006)
        btn = wc & (z > 0) & (np.abs(x) < 0.03) & (np.abs(np.sin(rel * 40)) < 0.12) & (rel < ay - 0.25)
        col[btn] = np.array([0x2a, 0x20, 0x18]) / 255
        neck = torso & (rel > ay + 0.02) & (z > 0.02) & (np.abs(x) < 0.04)
        paint(neck, np.array([0x4a, 0x5a, 0x34]) / 255, 0.0)
        for s in 'LR':
            paint(part == 'arm' + s, shirt, 0.0)
            el = part == 'elbow' + s
            roll = origin['elbow' + s][1] - 0.05
            paint(el, tone, 0.0)
            paint(el & (y > roll), shirt * 0.95, 0.012)
            cord = np.array([0x6a, 0x62, 0x34]) / 255
            for p_ in ('leg' + s,):
                m = part == p_
                paint(m, cord, 0.0)
            kn = part == 'knee' + s
            paint(kn & (y > 0.2), cord, 0.0)
            paint(kn & (y > 0.16) & (y <= 0.2), np.array([0x7a, 0x72, 0x40]) / 255, 0.012)
            paint(kn & (y > 0.11) & (y <= 0.16), np.array([0xd9, 0xcc, 0xae]) / 255, 0.004)
            boot = kn & (y <= 0.11)
            paint(boot, np.array([0x6b, 0x4a, 0x30]) / 255, 0.02)
            col[kn & (y < 0.02)] = np.array([0x3a, 0x2a, 0x1e]) / 255
        # Bald on top, grey above the ears and round the back.
        hd = part == 'head'
        hc = origin['head'] + np.array([0, 0.04 * head_scale, 0])
        hy = (y - hc[1]) / head_scale
        side = hd & (hy > 0.02) & (hy < 0.1) & (z < hc[2] + 0.02 * head_scale) & ~is_eye
        paint(side, np.array([0xc8, 0xc4, 0xbc]) / 255, 0.01)
    # Spread the push over neighbours, so cloth edges roll rather than tear.
    for _ in range(6):
        acc = np.zeros(len(P)); cnt = np.zeros(len(P))
        for k in range(3):
            np.add.at(acc, T[:, k], push[T[:, (k + 1) % 3]]); np.add.at(cnt, T[:, k], 1)
        push = np.where(cnt > 0, 0.5 * push + 0.5 * acc / np.maximum(cnt, 1), push)
    Wn = normals(W, T)
    W = W + Wn * push[:, None]
    # The feet sit on the ground.
    W[:, 1] -= max(0.0, W[np.isin(part, ['kneeL', 'kneeR']), 1].min())
    col = np.clip(col, 0, 1)

    parts = {}
    tri_part = np.array([part[t[0]] if part[t[0]] == part[t[1]] or part[t[0]] == part[t[2]] else part[t[1]] for t in T])
    for name in origin:
        tris = T[tri_part == name]
        if not len(tris):
            continue
        used, inv = np.unique(tris, return_inverse=True)
        local = W[used] - origin[name]
        if name == 'head':
            local = local / head_scale
        parts[name] = dict(
            p=np.round(local * 8192).astype(np.int16),
            c=np.round(col[used] * 255).astype(np.uint8),
            i=inv.reshape(-1, 3).astype(np.uint16),
        )
    return parts


def pack(parts):
    head, blobs, off = {}, [], 0
    for name, d in parts.items():
        entry = {}
        for k in ('p', 'c', 'i'):
            b = d[k].tobytes()
            pad = (-len(b)) % 4
            entry[k] = [off, len(d[k].flat)]
            blobs.append(b + b'\0' * pad)
            off += len(b) + pad
        head[name] = entry
    return head, base64.b64encode(b''.join(blobs)).decode()


lines = ['// Generated by tools/people/fit.py from a CC0 MakeHuman base. Do not edit.',
         '/** Positions are int16 in 1/8192 units, colours rgb bytes, triangles uint16, each part in its own joint frame. */',
         'export interface PartTable { [part: string]: { p: [number, number]; c: [number, number]; i: [number, number] } }']
for who in ('rose', 'walter'):
    head, data = pack(build(who))
    lines.append(f'export const {who}Parts: PartTable = {json.dumps(head)}')
    lines.append(f"export const {who}Data = '{data}'")
open(out, 'w').write('\n'.join(lines) + '\n')
print(out, sum(len(l) for l in lines) // 1024, 'KB')
