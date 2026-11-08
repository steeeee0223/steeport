"""Mesh builders for curved stems, bark and folded leaves."""

import math

import bpy
from mathutils import Vector


def mesh_object(name, parent, vertices, faces, materials):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for material in materials:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj


def tube(name, parent, points, radii, material, sides=8, flutes=0):
    """Create one smooth taper along a path, with lengthwise UVs for bark and paint."""
    path = [Vector(point) for point in points]
    vertices = []
    lengths = [0]
    for index, (point, radius) in enumerate(zip(path, radii)):
        before = path[max(0, index - 1)]
        after = path[min(len(path) - 1, index + 1)]
        tangent = (after - before).normalized()
        ref = Vector((1, 0, 0)) if abs(tangent.x) < 0.90 else Vector((0, 1, 0))
        u = tangent.cross(ref).normalized()
        v = tangent.cross(u)
        if index:
            lengths.append(lengths[-1] + (point - before).length)
        for side in range(sides):
            angle = math.tau * side / sides
            shape = 1 + flutes * (math.sin(3 * angle + 0.4 * index)
                                  + 0.45 * math.sin(7 * angle - 0.23 * index))
            vertices.append(point + radius * shape * (u * math.cos(angle) + v * math.sin(angle)))
    faces, coordinates = [], []
    for index, distance in enumerate(lengths[:-1]):
        for side in range(sides):
            left = index * sides + side
            right = index * sides + (side + 1) % sides
            faces.append((left, right, right + sides, left + sides))
            lo, hi = side / sides, (side + 1) / sides
            coordinates.extend(((distance, lo), (distance, hi),
                                (lengths[index + 1], hi), (lengths[index + 1], lo)))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(range(len(vertices) - sides, len(vertices))))
    obj = mesh_object(name, parent, vertices, faces, [material])
    uv = obj.data.uv_layers.new(name="UVMap")
    for face in list(obj.data.polygons)[:-2]:
        face.use_smooth = True
    for loop, coord in zip(uv.data, coordinates):
        loop.uv = coord
    return obj


def blade(vertices, faces, origin, axis, length, width, twist=0, bend=0.22):
    """Append a folded tapered leaf with an arched midrib."""
    origin, axis = Vector(origin), Vector(axis).normalized()
    up = Vector((0, 0, 1))
    across = axis.cross(up).normalized()
    up = across.cross(axis).normalized()
    across = (across + twist * up).normalized()
    up = across.cross(axis).normalized()
    offset = len(vertices)
    vertices.append(origin)
    for t, profile in ((0.30, 0.80), (0.61, 1), (0.85, 0.54)):
        center = origin + axis * (t * length) + up * (length * bend * math.sin(t * math.pi))
        edge = width * profile
        vertices.extend((center - across * edge, center + up * edge * 0.18, center + across * edge))
    vertices.append(origin + axis * length - up * (length * 0.09))
    faces.extend(tuple(offset + index for index in reversed(face)) for face in (
        (0, 1, 2), (0, 2, 3), (1, 4, 5, 2), (2, 5, 6, 3),
        (4, 7, 8, 5), (5, 8, 9, 6), (7, 10, 8), (8, 10, 9),
    ))
