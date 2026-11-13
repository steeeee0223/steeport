"""Generate the editable Leo study from a clean Blender scene."""

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE.parents[1] / "scripts"))
from cafe_cat import ellipsoid, smoothstep, srgb
from cafe_geometry import mesh_object, tube

TAU = math.tau
ROOT = Vector((0.186, 0, 0.306))
SIDE = (1, -1)
TAIL = [
    (-0.191, 0, 0.263), (-0.225, 0.004, 0.286),
    (-0.232, 0.009, 0.322), (-0.229, 0.016, 0.366),
    (-0.220, 0.022, 0.414), (-0.203, 0.024, 0.451),
    (-0.179, 0.020, 0.471), (-0.155, 0.013, 0.466),
    (-0.141, 0.007, 0.451), (-0.137, 0.005, 0.444),
    (-0.135, 0.004, 0.439),
]
TAIL_RADIUS = (0.025, 0.023, 0.021, 0.019, 0.017, 0.016, 0.015, 0.014, 0.013, 0.010, 0.002)

# Ground-contact centers drive both the leg cages and the underside detail.
FORE_PAW = (0.100, 0.049)
HIND_PAW = (-0.178, 0.057)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=SOURCE.parents[1] / "public" / "models")
    parser.add_argument("--draft", action="store_true")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def material(name, hex_color, roughness, *, coat_weight=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*srgb(hex_color), 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = mat.diffuse_color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Coat Weight"].default_value = coat_weight
    return mat


def smooth(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def move_to(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def modifier(obj, kind, name, **properties):
    item = obj.modifiers.new(name, kind)
    for key, value in properties.items():
        setattr(item, key, value)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=item.name)


def solid(name, parts, voxel):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    obj = parts[0]
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = name
    obj.data.name = name
    obj.data.remesh_voxel_size = voxel
    bpy.ops.object.voxel_remesh()
    modifier(obj, "SMOOTH", "Remove voxel stair steps", factor=0.72, iterations=18)
    joins = obj.vertex_groups.new(name="Shoulders, neck and haunches")
    for vertex in obj.data.vertices:
        x, _, z = vertex.co
        leg = smoothstep(0.095, 0.19, z)
        tail = 1 - smoothstep(0.310, 0.363, z) * (1 - smoothstep(-0.19, -0.12, x))
        head = 1 - smoothstep(0.170, 0.234, x) * smoothstep(0.23, 0.30, z)
        ear = 1 - smoothstep(0.335, 0.379, z)
        weight = leg * tail * head * ear
        if weight > 0.0:
            joins.add([vertex.index], weight, "REPLACE")
    modifier(obj, "SMOOTH", "Feather anatomical transitions", factor=0.86,
             iterations=155, vertex_group=joins.name)
    return smooth(obj)


def oriented_mass(name, start, end, width, thickness):
    start, end = Vector(start), Vector(end)
    delta = end - start
    obj = ellipsoid(name, None, (start + end) / 2, (width, thickness, delta.length / 2))
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return obj


def ring_mesh(name, sections, sides, parent=None):
    vertices = [v for section in sections for v in section]
    faces = [tuple(reversed(range(sides)))]
    for i in range(len(sections) - 1):
        start = i * sides
        for j in range(sides):
            a, b = start + j, start + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(len(vertices) - sides, len(vertices))))
    return smooth(mesh_object(name, parent, vertices, faces, []))


def torso():
    # A continuous cage controls the back and belly independently along the spine.
    # Each section specifies x, top, underside and half-width, from rump to chest.
    profile = [
        (-0.255, 0.247, 0.228, 0.015),
        (-0.245, 0.281, 0.198, 0.052),
        (-0.224, 0.307, 0.177, 0.075),
        (-0.194, 0.321, 0.169, 0.086),
        (-0.153, 0.321, 0.159, 0.093),
        (-0.112, 0.318, 0.154, 0.097),
        (-0.065, 0.314, 0.143, 0.102),
        (-0.015, 0.312, 0.132, 0.103),
        (0.033, 0.311, 0.125, 0.099),
        (0.075, 0.309, 0.125, 0.086),
        (0.111, 0.296, 0.137, 0.067),
        (0.133, 0.271, 0.155, 0.049),
        (0.145, 0.235, 0.178, 0.024),
    ]
    sides = 32
    sections = []
    for x, top, bottom, width in profile:
        center = (top + bottom) / 2
        height = (top - bottom) / 2
        ring = []
        for i in range(sides):
            angle = i * TAU / sides
            vertical = math.sin(angle)
            y = width * math.cos(angle) * (1 - 0.13 * vertical)
            ring.append((x, y, center + height * vertical))
        sections.append(ring)
    result = ring_mesh("Continuous trunk", sections, sides)
    modifier(result, "SUBSURF", "Rounded trunk cage", levels=2)
    return result


def leg(side, hind):
    paw_x, paw_y = HIND_PAW if hind else FORE_PAW
    if hind:
        profile = [
            (paw_x, paw_y, 0.005, 0.016, 0.012),
            (paw_x, paw_y, 0.014, 0.024, 0.018),
            (-0.185, 0.058, 0.027, 0.021, 0.017),
            (-0.201, 0.060, 0.051, 0.015, 0.014),
            (-0.211, 0.062, 0.079, 0.016, 0.016),
            (-0.201, 0.063, 0.106, 0.020, 0.019),
            (-0.179, 0.065, 0.135, 0.032, 0.025),
            (-0.161, 0.066, 0.163, 0.045, 0.032),
            (-0.169, 0.064, 0.196, 0.057, 0.037),
            (-0.179, 0.059, 0.233, 0.057, 0.039),
            (-0.180, 0.047, 0.269, 0.048, 0.031),
            (-0.169, 0.043, 0.294, 0.031, 0.024),
        ]
    else:
        profile = [
            (paw_x, paw_y, 0.005, 0.017, 0.012),
            (paw_x, paw_y, 0.014, 0.023, 0.018),
            (0.095, 0.050, 0.027, 0.021, 0.017),
            (0.087, 0.052, 0.046, 0.014, 0.014),
            (0.088, 0.054, 0.067, 0.015, 0.015),
            (0.084, 0.056, 0.092, 0.017, 0.016),
            (0.075, 0.058, 0.117, 0.020, 0.018),
            (0.064, 0.061, 0.142, 0.025, 0.021),
            (0.064, 0.064, 0.172, 0.036, 0.028),
            (0.075, 0.064, 0.209, 0.042, 0.033),
            (0.076, 0.056, 0.246, 0.043, 0.033),
            (0.063, 0.047, 0.283, 0.034, 0.025),
        ]
    sections = [[
        (x + length * math.cos(angle), side * y + width * math.sin(angle), z)
        for angle in (i * TAU / 24 for i in range(24))
    ] for x, y, z, length, width in profile]
    result = ring_mesh("Hind leg" if hind else "Foreleg", sections, 24)
    modifier(result, "SUBSURF", "Rounded leg cage", levels=2)
    return result


def anatomy(draft):
    body = [
        torso(),
        oriented_mass("Sloping neck", (0.053, 0, 0.202), (0.192, 0, 0.331), 0.061, 0.061),
        *(leg(side, hind) for side in SIDE for hind in (False, True)),
    ]
    skull = [
        ellipsoid("Cranium", None, ROOT + Vector((-0.018, 0, 0.012)), (0.067, 0.062, 0.060)),
        ellipsoid("Brow and nasal bridge", None, ROOT + Vector((0.021, 0, 0.006)), (0.042, 0.038, 0.044)),
        ellipsoid("Mandible", None, ROOT + Vector((0.015, 0, -0.035)), (0.050, 0.046, 0.027)),
        ellipsoid("Chin", None, ROOT + Vector((0.043, 0, -0.044)), (0.026, 0.025, 0.015)),
        *(ellipsoid("Cheek", None, ROOT + Vector((0.002, side * 0.031, -0.017)),
                    (0.047, 0.035, 0.037)) for side in SIDE),
        *(ellipsoid("Whisker cushion", None, ROOT + Vector((0.048, side * 0.018, -0.025)),
                    (0.024, 0.022, 0.018)) for side in SIDE),
    ]
    ears = [ear(side) for side in SIDE]
    sculpt = solid("Leo · body", body + skull + [tail(), *ears], 0.0021 if draft else 0.00175)
    return sculpt


def align_neck(parts):
    """Lower and pitch the head forward, blending into the standing shoulders."""
    pitch = math.radians(7)
    sin_pitch, cos_pitch = math.sin(pitch), math.cos(pitch)
    pivot_x, pivot_z = 0.139, 0.290
    for obj in parts:
        matrix = obj.matrix_world
        inverse = matrix.inverted()
        for vertex in obj.data.vertices:
            point = matrix @ vertex.co
            x, _, z = point
            weight = smoothstep(0.086, 0.171, x) * smoothstep(0.199, 0.272, z)
            if weight > 0:
                dx, dz = x - pivot_x, z - pivot_z
                point.x += weight * (dx * (cos_pitch - 1) + dz * sin_pitch)
                point.z += weight * (-dx * sin_pitch + dz * (cos_pitch - 1) - 0.030)
                vertex.co = inverse @ point
        obj.data.update()


def ear(side):
    # Front rim, recessed cartilage and closed outer back form a thin pinna.
    outline = [
        (-0.007, 0.022, 0.036), (-0.011, 0.025, 0.063),
        (-0.023, 0.047, 0.108), (-0.029, 0.056, 0.116),
        (-0.035, 0.061, 0.112), (-0.036, 0.067, 0.086),
        (-0.027, 0.073, 0.056), (-0.008, 0.063, 0.031),
    ]
    center = Vector((-0.026, 0.048, 0.068))
    vertices = []
    for factor, depth in ((1, 0.0), (0.70, -0.004), (0.26, -0.009)):
        for point in outline:
            p = center.lerp(Vector(point), factor)
            vertices.append(ROOT + Vector((p.x + depth, side * p.y, p.z)))
    for point in outline:
        p = Vector(point)
        thickness = 0.009 + 0.012 * (1 - smoothstep(0.068, 0.112, p.z))
        vertices.append(ROOT + Vector((p.x - thickness, side * (p.y - 0.002), p.z - 0.003)))
    vertices.append(ROOT + Vector((-0.054, side * 0.047, 0.069)))
    faces = [tuple(range(16, 24))]
    for i in range(8):
        j = (i + 1) % 8
        faces += [
            (i, j, j + 8, i + 8), (i + 8, j + 8, j + 16, i + 16),
            (j, i, i + 24, j + 24), (j + 24, i + 24, 32),
        ]
    obj = mesh_object(f"Pinna {'L' if side > 0 else 'R'}", None, vertices, faces, [])
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    mesh.to_mesh(obj.data)
    mesh.free()
    modifier(obj, "SUBSURF", "Cupped cartilage and soft rim", levels=3)

    return smooth(obj)


def tail():
    anchors = [Vector(point) for point in TAIL]
    path, radii = [], []
    for i in range(len(anchors) - 1):
        a, b, c, d = anchors[max(0, i - 1)], anchors[i], anchors[i + 1], anchors[min(len(anchors) - 1, i + 2)]
        for j in range(12):
            t = j / 12
            path.append(0.5 * (2 * b + (c - a) * t +
                               (2 * a - 5 * b + 4 * c - d) * t**2 +
                               (-a + 3 * b - 3 * c + d) * t**3))
            radii.append(TAIL_RADIUS[i] * (1 - t) + TAIL_RADIUS[i + 1] * t)
    path.append(anchors[-1])
    radii.append(TAIL_RADIUS[-1])
    # Transport the cross-section frame through each bend to prevent twisting.
    sections = []
    previous = None
    for i, (point, radius) in enumerate(zip(path, radii)):
        tangent = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        if previous is None:
            across = (Vector((0, 1, 0)) - tangent * tangent.y).normalized()
        else:
            across = previous.rotation_difference(tangent) @ across
        up = tangent.cross(across)
        sections.append([
            point + radius * (across * math.cos(angle) + up * math.sin(angle))
            for angle in (j * TAU / 24 for j in range(24))
        ])
        previous = tangent
    return ring_mesh("Tail volume", sections, 24)


def from_front(body, y, z, offset=0.0):
    hit, point, _, _ = body.ray_cast((0.45, y, ROOT.z + z), (-1, 0, 0))
    if not hit:
        raise ValueError(f"Facial detail missed the surface at y={y}, z={z}")
    point.x += offset
    return point


def eye(body, side, rim, iris, pupil):
    center_y, center_z = 0.032, 0.0085
    width, height = 0.0160, 0.0106
    sides = 64

    def surface(u, v, offset):
        y = side * (center_y + width * u)
        z = center_z + height * v + u * 0.0017
        return from_front(body, y, z, offset)

    def layer(name, mat, rings, point_at):
        vertices = [point_at(0, 0)]
        for r in range(1, rings + 1):
            for i in range(sides):
                vertices.append(point_at(r / rings, i * TAU / sides))
        faces = [(0, 1 + i, 1 + (i + 1) % sides) for i in range(sides)]
        for r in range(rings - 1):
            start = 1 + r * sides
            for i in range(sides):
                a, b = start + i, start + (i + 1) % sides
                faces.append((a, a + sides, b + sides, b))
        front = 1 + (rings - 1) * sides
        back = len(vertices)
        vertices.extend(vertices[front + i] - Vector((0.0045, 0, 0)) for i in range(sides))
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((front + i, back + i, back + j, front + j))
        faces.append(tuple(back + i for i in reversed(range(sides))))
        if side < 0:
            faces = [tuple(reversed(face)) for face in faces]
        label = f"{name} {'L' if side > 0 else 'R'}"
        return smooth(mesh_object(label, None, vertices, faces, [mat]))

    def aperture(r, angle):
        u = r * math.cos(angle)
        v = r * math.sin(angle) * (1 - 0.21 * abs(u))
        return surface(u, v, 0.00040 + 0.0019 * (1 - r * r))

    def disk(r, angle):
        u = -0.025 + r * 0.64 * math.cos(angle)
        v = -0.018 + r * 0.93 * math.sin(angle)
        return surface(u, v, 0.00255 + 0.00085 * (1 - r * r))

    def center(r, angle):
        u = -0.031 + r * 0.386 * math.cos(angle)
        v = -0.016 + r * 0.77 * math.sin(angle)
        distance = math.hypot((u + 0.025) / 0.64, (v + 0.018) / 0.93)
        return surface(u, v, 0.00270 + 0.00085 * (1 - distance**2))

    return [
        layer("Eye rim", rim, 12, aperture),
        layer("Iris", iris, 14, disk),
        layer("Pupil", pupil, 12, center),
    ]


def face_details(body):
    eye_rim = material("Eye rim", "554337", 0.53)
    iris = material("Iris · change color here", "8e8050", 0.32, coat_weight=0.17)
    pupil = material("Pupil", "201813", 0.30, coat_weight=0.17)
    leather = material("Terracotta nose leather", "945646", 0.50)
    crease = material("Mouth and nostrils", "573a2d", 0.76)
    whisker = material("Ivory whiskers", "d9ccba", 0.74)
    features = [part for side in SIDE for part in eye(body, side, eye_rim, iris, pupil)]
    outline = [
        (-0.013, -0.016), (-0.010, -0.011), (0, -0.011), (0.010, -0.011),
        (0.013, -0.016), (0.010, -0.020), (0.004, -0.024),
        (0, -0.028), (-0.004, -0.024), (-0.010, -0.020),
    ]
    shape = [from_front(body, y * 0.87, z, 0.0018) for y, z in outline]
    back = [point - Vector((0.0044, 0, 0)) for point in shape]
    n = len(shape)
    center = from_front(body, 0, -0.017, 0.0063)
    faces = [(n * 2, (i + 1) % n, i) for i in range(n)]
    faces += [((i + 1) % n, (i + 1) % n + n, i + n, i) for i in range(n)]
    faces += [tuple(range(n, n * 2))]
    nose = mesh_object("Nose leather", None, shape + back + [center], faces, [leather])
    modifier(nose, "BEVEL", "Soften nose leather edge", width=0.001, segments=3)
    features.append(smooth(nose))

    for side in SIDE:
        nostril = ellipsoid("Nostril", None, from_front(body, side * 0.008, -0.018, 0.0035),
                           (0.0008, 0.0030, 0.0012), math.radians(-side * 22))
        nostril.data.materials.append(crease)
        features.append(nostril)
        mouth = [(0, -0.039), (0.006, -0.041), (0.014, -0.042),
                 (0.021, -0.042), (0.027, -0.040), (0.030, -0.038)]
        features.append(tube("Mouth corner", None, [from_front(body, side * y, z, 0.0008) for y, z in mouth],
                             (0.00048, 0.00068, 0.00077, 0.00057, 0.00034, 0.00010), crease))
        for i in range(8):
            y = 0.024 + 0.006 * (i % 3)
            z = -0.030 + 0.004 * (i // 3) - 0.001 * (i % 3)
            root = from_front(body, side * y, z, 0.00045)
            spread = -0.025 + 0.009 * i
            length = 0.074 + 0.004 * math.sin(i * 2.2)
            sweep = [root + Vector((0.014 * math.sin(math.pi * t) - 0.032 * t*t,
                                    side * (length - y) * t,
                                    spread * t - 0.010 * t*t))
                     for t in (0, 0.18, 0.38, 0.60, 0.82, 1)]
            features.append(tube("Tapered whisker", None, sweep,
                                 (0.00033, 0.00030, 0.00026, 0.00021, 0.00015, 0.00005), whisker, 6))
        for i in range(2):
            root = from_front(body, side * (0.027 + 0.007 * i), 0.031 - 0.002 * i, 0.0003)
            sweep = [root + Vector((0.001 - 0.016 * t**2, side * (0.009 + i * 0.004) * t, 0.029 * t))
                     for t in (0, 0.25, 0.5, 0.75, 1)]
            features.append(tube("Brow whisker", None, sweep, (0.00022, 0.00019, 0.00015, 0.00010, 0.00004), whisker, 6))

    philtrum = [from_front(body, 0, z, 0.00055) for z in (-0.026, -0.032, -0.037, -0.039)]
    features.append(tube("Philtrum", None, philtrum, (0.00045, 0.00062, 0.00057, 0.00044), crease))
    return features


def paw_details(body):
    pad = material("Muted rose paw pads", "9c665d", 0.64)
    groove = material("Toe fur shadow", "8c5b35", 0.86)
    objects = []
    for hind in (False, True):
        x, center_y = HIND_PAW if hind else FORE_PAW
        for side in SIDE:
            y = side * center_y
            toe_width = 0.007
            for i in range(4):
                offset = (i - 1.5) * toe_width
                toe_x = x + 0.011 - 0.004 * abs(i - 1.5)
                toe = ellipsoid("Toe pad", None, (toe_x - 0.004, y + offset * 0.83, 0.0061),
                                (0.006, 0.0036, 0.0017), segments=16, ring_count=10)
                toe.data.materials.append(pad)
                objects.append(toe)
            palm = ellipsoid("Central paw pad", None, (x - 0.009, y, 0.0060),
                             (0.009, 0.010, 0.0020), segments=20, ring_count=12)
            palm.data.materials.append(pad)
            objects.append(palm)
            for i in (-1, 0, 1):
                seam_y = y + i * toe_width
                points = []
                for t in (0, 0.25, 0.50, 0.75, 1):
                    z = 0.009 + 0.007 * t
                    lateral = seam_y + 0.0012 * t * i
                    hit, co, _, _ = body.ray_cast((x + 0.04, lateral, z), (-1, 0, 0))
                    if hit:
                        co.x += 0.00016
                        points.append(co)
                if len(points) == 5:
                    objects.append(tube("Toe crease", None, points,
                                        (0.00015, 0.00035, 0.00045, 0.00037, 0.00007), groove, 6))
    return objects


def camera(name, stage, location, target, span):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = span
    data.clip_start = 0.01
    data.clip_end = 500
    obj = bpy.data.objects.new(name, data)
    stage.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return obj


def area(name, stage, location, target, power, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    stage.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_stage(scene, stage, draft):
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0.0044))
    plane = bpy.context.object
    plane.name = "Studio ground"
    plane.data.materials.append(material("Warm limestone studio", "c1b9a8", 0.93))
    move_to(plane, stage)
    plane.hide_set(True)
    cameras = {
        "Portrait": ((1.42, -1.36, 0.73), (-0.015, 0, 0.240), 0.75),
        "Front": ((1.9, 0, 0.31), (0, 0, 0.227), 0.60),
        "Profile": ((0, -1.9, 0.42), (-0.019, 0, 0.227), 0.72),
        "Rear": ((-1.9, 0.73, 0.70), (-0.014, 0, 0.236), 0.69),
        "Top": ((0, 0.0005, 2), (-0.014, 0, 0.235), 0.72),
        "Face": ((1.42, 0.60, 0.55), (0.166, 0, 0.332), 0.27),
        "Underside": ((0.68, -0.68, -1.5), (-0.013, 0, 0.205), 0.74),
        "Reference · 0313": ((0.495, -0.217, 0.288), (0.173, -0.023, 0.320), 0.27),
    }
    for name, (location, target, span) in cameras.items():
        camera(name, stage, location, target, span)

    ref = bpy.data.objects["Reference · 0313"]
    ref.data.type = "PERSP"
    ref.data.lens = 51

    camera("Reference · 0262 at 1.57 s", stage, (0.11, -1.80, 0.88), (-0.007, 0, 0.228), 0.63)
    camera("Reference · 0289 at 8 s", stage, (-1.78, 0.14, 0.73), (-0.064, 0, 0.224), 0.59)
    camera("Reference · 0352 at 21.67 s", stage, (1.15, -1.75, 1.27), (-0.006, 0, 0.225), 0.65)

    area("Softbox · key", stage, (0.7, -0.75, 1.25), (0, 0, 0.24), 25, 0.73, (1, 0.94, 0.85))
    area("Softbox · fill", stage, (0.77, 0.70, 0.72), (0.11, 0, 0.24), 12, 0.65, (0.84, 0.91, 1))
    area("Softbox · edge", stage, (-0.70, 0.10, 1.03), (0, 0, 0.25), 29, 0.63, (1, 0.96, 0.87))
    scene.world = bpy.data.worlds.new("Studio ambient light")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.49, 0.53, 0.62, 1)
    background.inputs["Strength"].default_value = 0.17
    scene.camera = bpy.data.objects["Portrait"]
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12 if draft else 32
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.35
    scene.render.resolution_x = 440 if draft else 1000
    scene.render.resolution_y = 440 if draft else 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.unit_settings.system = "METRIC"


def main():
    args = arguments()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Leo"
    bpy.context.preferences.filepaths.save_version = 0
    model = bpy.data.collections.new("Leo")
    stage = bpy.data.collections.new("Studio")
    scene.collection.children.link(model)
    scene.collection.children.link(stage)
    coat = material("Coat · change color here", "ad794c", 0.69)
    body = anatomy(args.draft)
    body.data.materials.append(coat)

    parts = [body]
    if not args.draft:
        parts += face_details(body) + paw_details(body)
    bpy.context.view_layer.update()
    align_neck(parts)
    for part in parts:
        move_to(part, model)

    setup_stage(scene, stage, args.draft)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    for screen in bpy.data.screens:
        for region in screen.areas:
            if region.type == "VIEW_3D":
                space = region.spaces.active
                space.clip_start = 0.01
                space.overlay.show_extras = False
                space.overlay.show_floor = False
                space.overlay.show_axis_x = False
                space.overlay.show_axis_y = False
                space.region_3d.view_rotation = scene.camera.rotation_euler.to_quaternion()
                space.region_3d.view_location = (-0.012, 0, 0.22)
                space.region_3d.view_distance = 1.04
                space.shading.color_type = "MATERIAL"
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "leo.blend"), relative_remap=False)
    if args.draft:
        for view in ("Portrait", "Front", "Profile", "Top"):
            scene.camera = bpy.data.objects[view]
            scene.render.filepath = str(output / (view.lower() + ".png"))
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
