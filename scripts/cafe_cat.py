"""Model Miso's face, articulated legs, and two tail poses."""

import math

import bpy
from mathutils import Color, Vector

from cafe_geometry import mesh_object, tube


def srgb(hex_color):
    color = Color(tuple(int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)))
    return Vector(color.from_srgb_to_scene_linear())


def smoothstep(start, end, value):
    t = min(1, max(0, (value - start) / (end - start)))
    return t * t * (3 - 2 * t)


def ellipsoid(name, parent, center, radii, yaw=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = center
    obj.rotation_euler.z = yaw
    obj.scale = radii
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def fused(name, parts, detail):
    """Weld overlapping forms so the cheeks and shoulders have no seams."""
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    obj = parts[0]
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = name
    obj.data.remesh_voxel_size = 0.0036
    bpy.ops.object.voxel_remesh()
    smooth = obj.modifiers.new("Soften fur profile", "SMOOTH")
    smooth.factor = 0.8
    smooth.iterations = 4
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    simplify = obj.modifiers.new("Retain the profile with fewer faces", "DECIMATE")
    simplify.ratio = detail
    bpy.ops.object.modifier_apply(modifier=simplify.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def coat(obj, mat, colors):
    """Store diffuse markings as glTF-compatible vertex colors."""
    obj.data.materials.append(mat)
    layer = obj.data.color_attributes.new(name="Fur", type="BYTE_COLOR", domain="POINT")
    for vertex, attribute in zip(obj.data.vertices, layer.data):
        color = colors(*vertex.co)
        attribute.color = (*color, 1)


def ear(head, side, outer, lining):
    """A cupped triangular pinna with a rounded tip and a soft fold at its root."""
    outline = [
        (0.020, 0.027, 0.049), (-0.009, 0.037, 0.090), (-0.021, 0.063, 0.128),
        (-0.014, 0.078, 0.126), (-0.004, 0.099, 0.080), (0.011, 0.093, 0.042),
    ]
    vertices = [(x, side * y, z) for x, y, z in outline]
    vertices += [(x - 0.035, side * (y * 0.96 + 0.002), z - 0.005) for x, y, z in outline]
    vertices += [(0.001, side * 0.066, 0.081)]
    # The inside of the ear is a recessed shape with a border of ginger fur.
    vertices += [
        (x * 0.54 - 0.001, side * (0.066 + (y - 0.066) * 0.55), 0.080 + (z - 0.080) * 0.64)
        for x, y, z in outline
    ]
    faces = [tuple(range(6, 12))]
    for i in range(6):
        j = (i + 1) % 6
        faces += [(i, j, 6 + j, 6 + i), (i, 13 + i, 13 + j, j), (12, 13 + j, 13 + i)]
    if side < 0:
        faces = [tuple(reversed(face)) for face in faces]
    obj = mesh_object("Triangular pinna", head, vertices, faces, [outer, lining])
    for face in obj.data.polygons:
        face.material_index = int(face.index % 3 == 0 and face.index != 0)
        face.use_smooth = True
    subdiv = obj.modifiers.new("Soft ear folds", "SUBSURF")
    subdiv.levels = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=subdiv.name)


def nose(head, at_surface, mat):
    points = [(0.0, -0.009), (0.011, 0.001), (0.012, 0.004),
              (0.005, 0.006), (-0.005, 0.006), (-0.012, 0.004), (-0.011, 0.001)]
    shape = [at_surface(y, z - 0.038, 0.0024) for y, z in points]
    shape += [Vector((x - 0.005, y, z)) for x, y, z in shape]
    faces = [tuple(range(7)), tuple(reversed(range(7, 14)))]
    faces += [(i, i + 7, (i + 1) % 7 + 7, (i + 1) % 7) for i in range(7)]
    obj = mesh_object("Small triangular nose leather", head, shape, faces, [mat])
    bevel = obj.modifiers.new("Round nose edges", "BEVEL")
    bevel.width = 0.0018
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)


def build_miso(cat, empty, material):
    """Build a recognizably feline face, forepaws and a separate tail pivot."""
    ear_fur = material("Miso ear fur", "ca8c55")
    pink = material("Miso ear lining", "c88478")
    nose_color = material("Miso nose", "925b59", 0.62)
    charcoal = material("Miso eyelids", "51332a")
    iris = material("Miso amber iris", "b78742", 0.4)
    pupil = material("Miso pupil", "292320", 0.32)
    whisker = material("Miso whiskers", "ede0cc")
    fur = material("Miso painted fur", "ffffff", 0.89)
    nodes = fur.node_tree.nodes
    pigment = nodes.new("ShaderNodeVertexColor")
    pigment.layer_name = "Fur"
    fur.node_tree.links.new(pigment.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])

    ginger = srgb("cf8c53")
    warm = srgb("e6a663")
    tabby = srgb("ac633d")
    cream = srgb("f5e6cc")

    cat.rotation_euler.z = math.radians(24)
    torso = fused("MisoTorso", [
        ellipsoid("Rounded rib cage", cat, (-0.060, 0, 0.110), (0.195, 0.132, 0.105)),
        ellipsoid("Folded hindquarters", cat, (-0.129, -0.005, 0.109), (0.129, 0.139, 0.102), 0.12),
        ellipsoid("Shoulders", cat, (0.058, 0.001, 0.090), (0.111, 0.099, 0.084), -0.09),
        ellipsoid("Chest", cat, (0.107, 0.003, 0.083), (0.069, 0.083, 0.069)),
    ], 0.23)

    def body_fur(x, y, z):
        orange = ginger.lerp(warm, smoothstep(-0.13, 0.13, y))
        rib = math.cos((x + 3.3 * y * y + 0.36 * z + 0.009 * math.sin(y * 47)) * 81)
        stripe = (smoothstep(0.36, 0.90, rib) * smoothstep(0.075, 0.15, z)
                  * (1 - smoothstep(-0.067, 0.036, x)))
        bib = smoothstep(0.111, 0.156, x - abs(y) * 0.34)
        sock = smoothstep(0.102, 0.155, x) * (1 - smoothstep(0.034, 0.071, z))
        return orange.lerp(tabby, stripe * 0.34).lerp(cream, max(bib, sock))

    coat(torso, fur, body_fur)
    # The browser poses each piece between its joints. The upper legs overlap
    # the rib cage and hips, and the paws have their own floor contact.
    for index in range(4):
        leg = empty(f"MisoLeg{index}", parent=cat)
        hind = index >= 2
        paw_x = (-0.19 if hind else (0.19 if index == 0 else 0.17))
        side = -1 if index % 2 == 0 else 1
        for name, radius, breadth, x, z in (
            ("Upper", 0.054 if hind else 0.037, 0.043 if hind else 0.032, paw_x - 0.055, 0.05),
            ("Lower", 0.028 if hind else 0.026, 0.025, paw_x - 0.028, 0.029),
            ("Paw", 0.042 if hind else 0.046, 0.030, paw_x, 0.026),
        ):
            pivot = empty(f"Miso{name}{index}", parent=leg)
            pivot.location = (x, side * 0.056, z)
            piece = ellipsoid(f"{name} leg form", pivot, (0, 0, 0),
                              (radius, breadth, 0.065 if name != "Paw" else 0.026))
            coat(piece, fur, lambda x, y, z, name=name: (
                ginger.lerp(cream, 1 - smoothstep(-0.7, 0.5, x + 0.5 * z))
                if name == "Paw" else ginger.lerp(warm, 0.2 + 0.25 * z)
            ))
    head = empty("MisoHead", parent=cat)
    head.location = (0.139, 0, 0.149)
    head.rotation_euler.y = math.radians(-16)
    head.rotation_euler.z = math.radians(-18)
    face = fused("Miso skull and cheeks", [
        ellipsoid("Skull", head, (-0.013, 0, 0.010), (0.076, 0.092, 0.077)),
        ellipsoid("Short feline muzzle", head, (0.048, 0, -0.041), (0.047, 0.063, 0.035)),
        ellipsoid("Chin", head, (0.032, 0, -0.064), (0.046, 0.051, 0.017)),
        *[
            ellipsoid("Whisker pad", head, (0.057, side * 0.026, -0.044), (0.036, 0.036, 0.026))
            for side in (-1, 1)
        ],
    ], 0.43)

    def face_fur(x, y, z):
        orange = ginger.lerp(warm, smoothstep(0.005, 0.073, x))
        muzzle = 1 - smoothstep(-0.037, -0.019, z + abs(y) * 0.33)
        blaze = (1 - smoothstep(0.003, 0.024, abs(y))) * (1 - smoothstep(-0.015, 0.036, z))
        lines = smoothstep(0.53, 0.96, math.cos((abs(y) - z * 0.32) * 176))
        brow = lines * smoothstep(0.025, 0.052, z) * smoothstep(-0.004, 0.05, x)
        cheeks = smoothstep(0.046, 0.075, abs(y)) * smoothstep(
            0.71, 0.96, math.cos((z + x * 0.30) * 240)
        )
        return orange.lerp(tabby, min(0.58, brow * 0.58 + cheeks * 0.62)).lerp(cream, max(muzzle, blaze))

    coat(face, fur, face_fur)

    def at_surface(y, z, rise=0.0016):
        hit, point, _, _ = face.ray_cast((0.20, y, z), (-1, 0, 0))
        if not hit:
            raise ValueError(f"Facial detail lies outside Miso's skull: {y}, {z}")
        return Vector((point.x + rise, y, z))

    asleep = empty("MisoClosedEyes", parent=head)
    awake = empty("MisoOpenEyes", parent=head)
    for side in (-1, 1):
        ear(head, side, ear_fur, pink)
        eyelid = ((0.024, 0.001), (0.032, 0.004), (0.043, 0.0048),
                  (0.055, 0.003), (0.065, -0.003), (0.071, -0.006))
        tube("Closed almond eyelid", asleep, [at_surface(side * y, z) for y, z in eyelid],
             (0.0008, 0.0022, 0.0026, 0.0027, 0.0021, 0.00075), charcoal, 6)
        for name, y, z, offset, radii, mat in (
            ("Eye rim", 0.048, 0.003, -0.004, (0.014, 0.023, 0.014), charcoal),
            ("Amber iris", 0.048, 0.003, 0.002, (0.009, 0.016, 0.011), iris),
            ("Slit pupil", 0.046, 0.003, 0.010, (0.0024, 0.004, 0.0085), pupil),
        ):
            ellipsoid(name, awake, at_surface(side * y, z, offset),
                      radii, math.radians(33 * side)).data.materials.append(mat)
    for side in (-1, 1):
        mouth = ((0.0, -0.053), (0.011, -0.059), (0.021, -0.061), (0.033, -0.056))
        tube("Mouth corner", head, [at_surface(side * y, z, 0.0009) for y, z in mouth],
             (0.00115, 0.0013, 0.00125, 0.0006), nose_color, 6)
        for index, spread in enumerate((-0.012, 0, 0.011)):
            root = at_surface(side * (0.037 + 0.003 * index), -0.045 + 0.005 * index, 0.0008)
            tip = (root.x + 0.003 - index * 0.012, side * (0.099 + index * 0.006),
                   root.z + spread)
            middle = (root.x + 0.008, side * 0.074, root.z + spread * 0.25)
            tube("Whisker", head, (root, middle, tip), (0.00104, 0.0009, 0.00026), whisker, 5)
    nose(head, at_surface, nose_color)

    tail = empty("MisoTail", parent=cat)
    tail.location = (-0.198, -0.033, 0.07)
    # The thick root grows out of the hip; the tip rests by the forepaws.
    curled = [
        (0, 0, 0), (-0.044, -0.057, -0.009), (-0.015, -0.123, -0.019),
        (0.062, -0.145, -0.031), (0.149, -0.131, -0.034), (0.23, -0.101, -0.034),
        (0.29, -0.066, -0.028), (0.311, -0.043, -0.020),
    ]
    radii = (0.035, 0.040, 0.039, 0.034, 0.030, 0.025, 0.019, 0.003)
    raised = [
        (0, 0, 0), (-0.058, -0.012, 0.035), (-0.102, -0.015, 0.091),
        (-0.131, -0.005, 0.147), (-0.147, 0.011, 0.207), (-0.142, 0.023, 0.266),
        (-0.112, 0.032, 0.310), (-0.069, 0.029, 0.316),
    ]

    def sample(anchors):
        points, widths = [], []
        anchors = [Vector(point) for point in anchors]
        for i in range(len(anchors) - 1):
            a, b, c, d = (anchors[max(0, i - 1)], anchors[i],
                          anchors[i + 1], anchors[min(len(anchors) - 1, i + 2)])
            for step in range(6):
                t = step / 6
                points.append(0.5 * ((2 * b) + (-a + c) * t +
                                    (2 * a - 5 * b + 4 * c - d) * t * t +
                                    (-a + 3 * b - 3 * c + d) * t * t * t))
                widths.append(radii[i] + (radii[i + 1] - radii[i]) * t)
        return points + [anchors[-1]], widths + [radii[-1]]

    points, widths = sample(curled)
    curl = tube("Wrapped tail", tail, points, widths, fur, 12)
    curl.name = "MisoTailFur"
    lift, _ = sample(raised)
    curl.shape_key_add(name="Curled")
    upright = curl.shape_key_add(name="Raised")
    for i, (rest, target) in enumerate(zip(points, lift)):
        a, b = max(0, i - 1), min(len(points) - 1, i + 1)
        rotation = (points[b] - points[a]).rotation_difference(lift[b] - lift[a])
        for side in range(12):
            vertex = i * 12 + side
            upright.data[vertex].co = target + rotation @ (curl.data.vertices[vertex].co - rest)
    layer = curl.data.color_attributes.new(name="Fur", type="BYTE_COLOR", domain="POINT")
    for i, attribute in enumerate(layer.data):
        ring = i // 12
        color = ginger.lerp(tabby, 0.57 * smoothstep(0.20, 0.87, math.cos(ring * 1.12)))
        attribute.color = (*color, 1)
    return awake
