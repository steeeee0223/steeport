"""Paint the archive meshes in their own pose space, using the survey as reference."""

import numpy as np


def smooth(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def blend(a, b, weight):
    return a + (b - a) * np.asarray(weight)[..., None]


def rgb(color):
    return np.array(list(bytes.fromhex(color))) / 255


def linear(color):
    return np.where(color <= 0.04045, color / 12.92, ((color + 0.055) / 1.055) ** 2.4)


def oval(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2


def tail_distance(points, anchors):
    best = np.full(len(points), np.inf)
    length = np.zeros(len(points))
    walked = 0.0
    for a, b in zip(anchors, anchors[1:]):
        a, b = np.array(a), np.array(b)
        vector = b - a
        size = np.linalg.norm(vector)
        along = np.clip(((points - a) * vector).sum(axis=1) / size**2, 0, 1)
        distance = np.linalg.norm(points - a - along[:, None] * vector, axis=1)
        closer = distance < best
        length[closer] = walked + along[closer] * size
        best = np.minimum(best, distance)
        walked += size
    return best, length


TAILS = {
    "Standing": [(-.216, 0, .30), (-.26, 0, .322), (-.30, 0, .373),
                 (-.344, 0, .439), (-.391, 0, .5)],
    "Walking": [(-.172, .003, .23), (-.204, -.033, .177), (-.255, -.069, .15),
                 (-.312, -.101, .152), (-.372, -.138, .17)],
    "Stretching": [(-.231, 0, .278), (-.273, 0, .277), (-.299, 0, .233),
                   (-.308, 0, .158), (-.322, 0, .117), (-.346, 0, .087)],
}


def paint(points, normals, pose, *, atlas=None):
    x, y, z = points.T
    lateral = abs(y)
    nx, ny, nz = normals.T
    variation = (np.sin(130 * x + 113 * y + 152 * z)
                 * np.cos(151 * x - 153 * y + 103 * z))
    grain = (np.sin(291 * x + 357 * y + 414 * z)
             * np.sin(241 * x - 541 * y + 319 * z))
    if pose == "Stretching":
        # Read the sloped torso along its own spine. The front legs are almost
        # horizontal in this archive, so use length to place their bars.
        height = z + .14 * smooth(-.15, .13, x)
        leg = smooth(.07, .15, x) * (1 - smooth(.055, .10, z))
        leg_axis = z + x * leg
    else:
        height = z
        leg_axis = z
    flank_phase = (x * 125 + 3.6 * np.cos(height * 18 + .32)
                   + 1.65 * np.sin(lateral * 26 + 11 * x)
                   + .6 * np.sin(height * 56 - x * 11 + 1.2 * np.sign(y))
                   + .25 * variation)
    flank = smooth(.48, .94, np.cos(flank_phase))
    leg_bars = smooth(.24, .92, np.cos(leg_axis * 112 - 16 * x + 18 * lateral))
    stripe = flank * smooth(.06, .21, height) * (1 - .29 * smooth(.27, .36, height))
    stripe = np.maximum(stripe, leg_bars * (1 - smooth(.107, .20, height)) * .81)
    spine = (1 - smooth(.003, .027, lateral)) * smooth(.22, .34, height)
    stripe = np.maximum(stripe, spine * (.55 + .25 * np.sin(78 * x)))
    belly = (1 - smooth(.038, .077, lateral)) * (1 - smooth(-.73, -.22, nz))
    belly *= smooth(.035, .13, height) * (1 - smooth(.15, .25, x))
    tone = np.clip(.40 + .13 * np.sin(21 * x + 14 * z) + .14 * variation
                   + .09 * grain + .22 * (1 - smooth(.18, .36, height)), 0, 1)
    orange = blend(rgb("915026"), rgb("c48850"), tone)
    orange = blend(orange, rgb("d7af83"), belly * .56)
    distance, along = tail_distance(points, TAILS[pose])
    tail = (1 - smooth(.033, .047, distance)) * smooth(.008, .045, along)
    tail_rings = smooth(.12, .84, np.cos(along * 174 + .24 * variation))
    stripe = stripe * (1 - tail) + tail_rings * tail

    if pose == "Walking":
        # The archive atlas gives local stripe and eye/mouth detail. Its
        # grey ground color and white socks are replaced by Leo's orange.
        light = atlas @ np.array([.26, .64, .10])
        contrast = 1 - smooth(.13, .53, light)
        head = smooth(.22, .29, x) * smooth(.175, .21, z)
        atlas_weight = (.33 + .55 * head) * smooth(.10, .17, z) * (1 - .85 * tail)
        stripe += (contrast - stripe) * atlas_weight
        color = blend(orange, rgb("6a361d"), stripe * .79)
        face = head * smooth(.293, .333, x) * (1 - smooth(.037, .068, abs(y - .008)))
        muzzle = face * (1 - smooth(.24, .268, z)) * smooth(.58, .83, light)
        color = blend(color, rgb("e7ccaf"), muzzle * .86)
        red = atlas[:, 0] - atlas[:, 1]
        rose = head * smooth(.307, .337, x) * (1 - smooth(.023, .046, abs(y - .008)))
        rose *= (1 - smooth(.24, .257, z)) * smooth(.09, .18, red)
        color = blend(color, blend(rgb("622e2d"), rgb("b67669"), light), rose * .95)
        eye = smooth(.223, .246, z) * (1 - smooth(.295, .318, z))
        olive = smooth(.08, .25, atlas[:, 1] - atlas[:, 2]) * (1 - smooth(.22, .40, red))
        dark = 1 - smooth(.085, .15, light)
        eye *= np.maximum(olive, dark * .83) * smooth(.257, .292, x)
        eye *= 1 - smooth(.083, .102, abs(y + .004))
        color = blend(color, atlas * np.array([.93, .94, .96]), eye)
        whiskers = (smooth(.78, .94, light) * head
                    * smooth(.051, .075, abs(y - .008)) * smooth(.306, .34, x))
        return blend(color, rgb("f0dfc8"), whiskers * .8)

    color = blend(orange, rgb("69391f"), stripe * .76)
    if pose == "Standing":
        face_x, eye_z, eye_y = .267, .304, .022
        nose_z, ear_z = .271, .348
        head = smooth(.185, .24, x) * smooth(.215, .252, z)
    else:
        face_x, eye_z, eye_y = .19, .164, .026
        nose_z, ear_z = .127, .197
        head = smooth(.115, .17, x) * smooth(.095, .12, z)
    face = smooth(face_x - .012, face_x + .031, x) * head
    eye_dz = z - eye_z
    cheek_phase = 204 * eye_dz + 66 * lateral + .45 * variation
    cheek = smooth(.49, .94, np.cos(cheek_phase)) * smooth(.019, .04, lateral)
    cheek *= (1 - smooth(.015, .048, abs(eye_dz))) * head
    brow_center = .006 + .37 * abs(eye_dz - .034)
    brow = (1 - smooth(.002, .006, abs(lateral - brow_center))) * smooth(.005, .016, eye_dz)
    brow += .64 * (1 - smooth(.002, .005, abs(lateral - .02 - .28 * eye_dz)))
    brow *= face * smooth(.004, .022, eye_dz) * (1 - smooth(.044, .061, eye_dz))
    color = blend(color, rgb("865034"), np.clip(cheek * .55 + brow * .78, 0, 1))
    chin = 1 - smooth(.52, 1.45, oval(y, z, 0, nose_z - .018, .027, .016))
    muzzle = 1 - smooth(.5, 1.2, oval(lateral, z, .015, nose_z - .005, .016, .010))
    color = blend(color, rgb("e3ccb0"), np.maximum(chin, muzzle * .85) * face)
    ear = (1 - smooth(.35, 1.07, oval(lateral, z, .041, ear_z + .008, .012, .027)))
    color = blend(color, rgb("c5907f"), ear * smooth(.22, .74, nx) * head)
    nose = (1 - smooth(.66, 1.10, oval(y, z, 0, nose_z, .010, .006)))
    color = blend(color, rgb("a16357"), nose * smooth(face_x + .017, face_x + .037, x))
    if pose == "Standing":
        # Paint directly onto the archive eye inserts, front ear shells and
        # long whisker cards. The small depth gate keeps the pupils on the lens.
        iris_shape = oval(lateral, z, eye_y, eye_z, .0099, .0101)
        eye = smooth(.285, .295, x)
        iris = (1 - smooth(.70, 1.10, iris_shape)) * eye
        color = blend(color, rgb("4a3024"), (1 - smooth(.88, 1.36, iris_shape)) * eye)
        color = blend(color, blend(rgb("8d7946"), rgb("b6a16d"), tone), iris)
        pupil = (1 - smooth(.71, 1.04, oval(lateral, z, eye_y - .001, eye_z, .0046, .0084))) * eye
        color = blend(color, rgb("1d1914"), pupil)
        whisker = smooth(.047, .056, lateral) * smooth(.284, .300, x)
        whisker *= smooth(.24, .252, z) * (1 - smooth(.282, .293, z))
        color = blend(color, rgb("ebdcc0"), whisker)
    else:
        iris_shape = oval(lateral, z, eye_y, eye_z, .0094, .0074)
        iris_gate = smooth(.12, .60, nx) * smooth(.194, .208, x)
        color = blend(color, rgb("4e3525"), (1 - smooth(.68, 1.31, iris_shape)) * iris_gate)
        color = blend(color, rgb("a48f53"), (1 - smooth(.56, .91, iris_shape)) * iris_gate)
        pupil = oval(lateral, z, eye_y - .001, eye_z, .0037, .0063)
        color = blend(color, rgb("1e1912"), (1 - smooth(.65, 1.02, pupil)) * iris_gate)
    pads = (1 - smooth(.001, .005, z)) * (1 - smooth(-.86, -.57, nz))
    pads *= smooth(.045, .069, lateral) * .8
    return blend(color, rgb("a86b62"), pads)
