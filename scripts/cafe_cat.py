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


def ellipsoid(name, parent, center, radii, yaw=0, *, segments=28, ring_count=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=ring_count)
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
        (0.035, 0.020, 0.044), (0.011, 0.032, 0.099), (-0.025, 0.064, 0.149),
        (-0.031, 0.070, 0.148), (-0.021, 0.100, 0.086), (0.020, 0.099, 0.041),
    ]
    vertices = [(x, side * y, z) for x, y, z in outline]
    vertices += [
        (x - (0.040 - 0.030 * smoothstep(0.045, 0.149, z)), side * y, z - 0.003)
        for x, y, z in outline
    ]
    vertices += [(0.001, side * 0.066, 0.086)]
    # The inside of the ear is a recessed shape with a border of ginger fur.
    vertices += [
        (x * 0.64 - 0.003, side * (0.066 + (y - 0.066) * 0.66),
         0.085 + (z - 0.085) * 0.74)
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


def leg_form(cat, hind, side):
    """Loft a whole leg with a haunch, a narrow hock and a rounded toe."""
    profile = (
        ((-0.159, 0.003, 0.017, 0.015), (-0.158, 0.010, 0.035, 0.026),
         (-0.164, 0.025, 0.043, 0.029), (-0.181, 0.046, 0.026, 0.023),
         (-0.193, 0.082, 0.018, 0.019), (-0.178, 0.123, 0.024, 0.023),
         (-0.134, 0.174, 0.045, 0.036), (-0.133, 0.224, 0.055, 0.040),
         (-0.146, 0.272, 0.053, 0.039), (-0.155, 0.311, 0.023, 0.027))
        if hind else
        ((0.124, 0.003, 0.016, 0.015), (0.125, 0.010, 0.032, 0.024),
         (0.119, 0.025, 0.036, 0.026), (0.103, 0.048, 0.023, 0.020),
         (0.096, 0.087, 0.019, 0.019), (0.084, 0.134, 0.025, 0.021),
         (0.078, 0.178, 0.034, 0.028), (0.084, 0.223, 0.042, 0.032),
         (0.086, 0.272, 0.045, 0.035), (0.078, 0.304, 0.024, 0.022))
    )
    sides = 16
    vertices = [
        (x + rx * math.cos(theta), side * 0.064 + ry * math.sin(theta), z)
        for x, z, rx, ry in profile
        for theta in (i * math.tau / sides for i in range(sides))
    ]
    faces = [tuple(reversed(range(sides)))]
    for ring in range(len(profile) - 1):
        a = ring * sides
        b = a + sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    faces.append(tuple(range(len(vertices) - sides, len(vertices))))
    return mesh_object("Whole leg", cat, vertices, faces, [])


def curl_body(torso):
    """Bake the resting pose used by the editable scene and browser."""
    torso.shape_key_add(name="Standing")
    curl = torso.shape_key_add(name="Curled")
    for vertex, point in zip(torso.data.vertices, curl.data):
        x, y, z = vertex.co
        fold = min(1, max(0, (z - 0.045) / 0.208))
        paw = 1 - smoothstep(0.030, 0.162, z)
        if x < -0.028:
            x += paw * 0.026
        else:
            x += paw * (0.062 if y < 0 else 0.047)
        point.co = (x, y * (1.18 - 0.15 * paw), z - 0.176 * fold)
    curl.value = 1


def build_miso(cat, empty, material):
    """Build a fused ginger coat, feline face and a separate tail pivot."""
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
        ellipsoid("Rib cage", cat, (-0.025, 0, 0.283), (0.145, 0.093, 0.080)),
        ellipsoid("Tucked flank", cat, (-0.116, 0, 0.292), (0.116, 0.081, 0.071)),
        ellipsoid("Haunches", cat, (-0.167, 0, 0.279), (0.089, 0.093, 0.091)),
        ellipsoid("Shoulders", cat, (0.062, 0, 0.279), (0.102, 0.083, 0.087)),
        ellipsoid("Chest", cat, (0.111, 0, 0.249), (0.062, 0.067, 0.069)),
        ellipsoid("Neck", cat, (0.123, 0, 0.319), (0.065, 0.063, 0.055)),
        *(leg_form(cat, hind, side) for hind in (False, True) for side in (-1, 1)),
    ], 0.23)

    def body_fur(x, y, z):
        orange = ginger.lerp(warm, smoothstep(-0.13, 0.13, y))
        rib = math.cos((x + 3.3 * y * y + 0.36 * z + 0.009 * math.sin(y * 47)) * 81)
        stripe = (smoothstep(0.36, 0.90, rib) * smoothstep(0.251, 0.326, z)
                  * (1 - smoothstep(-0.067, 0.036, x)))
        bib = (smoothstep(0.088, 0.139, x - abs(y) * 0.35)
               * smoothstep(0.147, 0.220, z) * (1 - smoothstep(0.293, 0.347, z)))
        sock = 1 - smoothstep(0.039, 0.078 + 0.012 * math.sin(x * 120 + y * 56), z)
        return orange.lerp(tabby, stripe * 0.40).lerp(cream, max(bib, sock))

    coat(torso, fur, body_fur)
    # This coat is vertex-colored. Dropping the old sphere UVs lets the
    # exporter share vertices so its normals stay smooth as the legs bend.
    while torso.data.uv_layers:
        torso.data.uv_layers.remove(torso.data.uv_layers[0])
    curl_body(torso)
    head = empty("MisoHead", parent=cat)
    head.location = (0.139, 0, 0.149)
    head.rotation_euler.y = math.radians(-16)
    head.rotation_euler.z = math.radians(-18)
    face = fused("Miso skull and cheeks", [
        ellipsoid("Skull", head, (-0.014, 0, 0.009), (0.081, 0.084, 0.075)),
        ellipsoid("Short feline muzzle", head, (0.025, 0, -0.036), (0.044, 0.056, 0.034)),
        *[
            ellipsoid("Cheek", head, (0.007, side * 0.033, -0.026), (0.052, 0.049, 0.038))
            for side in (-1, 1)
        ],
        ellipsoid("Chin", head, (0.023, 0, -0.060), (0.038, 0.049, 0.018)),
        *[
            ellipsoid("Whisker pad", head, (0.041, side * 0.024, -0.041), (0.031, 0.033, 0.024))
            for side in (-1, 1)
        ],
    ], 0.43)

    def face_fur(x, y, z):
        orange = ginger.lerp(warm, smoothstep(0.005, 0.073, x))
        muzzle = 1 - smoothstep(-0.046, -0.023, z + abs(y) * 0.38)
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
            ("Eye rim", 0.047, 0.002, -0.004, (0.011, 0.021, 0.0115), charcoal),
            ("Amber iris", 0.047, 0.002, 0.001, (0.0055, 0.013, 0.0085), iris),
            ("Slit pupil", 0.046, 0.002, 0.0055, (0.0018, 0.0036, 0.007), pupil),
        ):
            eye = ellipsoid(name, awake, at_surface(side * y, z, offset), radii,
                            math.radians(33 * side), segments=20, ring_count=10)
            eye.data.materials.append(mat)
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
    tail.location = (-0.183, -0.018, 0.085)
    build_tail(tail, fur, ginger, tabby)
    return awake


def build_tail(tail, fur, ginger, tabby):
    """Sweep a tapered tail through three continuous, softly rounded poses."""
    curled = [
        (0, 0, 0), (-0.064, -0.018, -0.008), (-0.087, -0.083, -0.036),
        (-0.039, -0.132, -0.049), (0.039, -0.151, -0.052),
        (0.126, -0.150, -0.052), (0.204, -0.130, -0.050),
        (0.269, -0.095, -0.047), (0.299, -0.057, -0.040),
    ]
    unfurled = [
        (0, 0, 0), (-0.066, -0.013, 0.014), (-0.123, -0.052, 0.033),
        (-0.154, -0.109, 0.067), (-0.149, -0.163, 0.114),
        (-0.107, -0.196, 0.166), (-0.047, -0.202, 0.210),
        (0.019, -0.189, 0.230), (0.062, -0.166, 0.225),
    ]
    raised = [
        (0, 0, 0), (-0.067, -0.004, 0.028), (-0.121, -0.002, 0.075),
        (-0.161, 0.005, 0.131), (-0.181, 0.013, 0.194),
        (-0.180, 0.018, 0.256), (-0.158, 0.017, 0.306),
        (-0.119, 0.012, 0.331), (-0.077, 0.006, 0.327),
    ]
    radii = (0.037, 0.031, 0.027, 0.024, 0.021, 0.018, 0.015, 0.011, 0.0025)
    sides = 12
    subdivisions = 6

    def sweep(anchors):
        anchors = [Vector(point) for point in anchors]
        path, widths = [], []
        for i in range(len(anchors) - 1):
            a, b, c, d = (anchors[max(0, i - 1)], anchors[i],
                          anchors[i + 1], anchors[min(len(anchors) - 1, i + 2)])
            for step in range(subdivisions):
                t = step / subdivisions
                path.append(0.5 * ((2 * b) + (-a + c) * t +
                                   (2 * a - 5 * b + 4 * c - d) * t * t +
                                   (-a + 3 * b - 3 * c + d) * t * t * t))
                widths.append(radii[i] + (radii[i + 1] - radii[i]) * t)
        path.append(anchors[-1])
        widths.append(radii[-1])

        vertices = []
        previous = None
        for i, (point, radius) in enumerate(zip(path, widths)):
            tangent = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
            # Carry the previous frame along the curve so adjacent rings
            # cannot flip where the tail turns over at the tip.
            across = (Vector((0, 1, 0)) - tangent * tangent.y).normalized() if previous is None \
                else previous.rotation_difference(tangent) @ across
            up = tangent.cross(across)
            previous = tangent
            for side in range(sides):
                angle = side * math.tau / sides
                vertices.append(point + radius * (across * math.cos(angle) + up * math.sin(angle)))
        return vertices

    vertices = sweep(curled)
    faces = [tuple(reversed(range(sides)))]
    for start in range(0, len(vertices) - sides, sides):
        for side in range(sides):
            a = start + side
            b = start + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(len(vertices) - sides, len(vertices))))
    mesh = mesh_object("MisoTailFur", tail, vertices, faces, [fur])
    for face in mesh.data.polygons:
        face.use_smooth = True
    mesh.shape_key_add(name="Curled")
    for name, anchors in (("Unfurled", unfurled), ("Raised", raised)):
        key = mesh.shape_key_add(name=name)
        for vertex, target in zip(key.data, sweep(anchors)):
            vertex.co = target

    layer = mesh.data.color_attributes.new(name="Fur", type="BYTE_COLOR", domain="POINT")
    for i, attribute in enumerate(layer.data):
        ring = i // sides
        stripe = smoothstep(0.20, 0.92, math.cos(ring * 1.12)) * smoothstep(1, 10, ring)
        attribute.color = (*ginger.lerp(tabby, 0.55 * stripe), 1)
