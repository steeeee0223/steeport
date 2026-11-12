"""Build the café, export its runtime model, and render the first-person studies."""
import gzip
import json
import math
from pathlib import Path
import random
import shutil
import sys
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from cafe_cat import build_miso
from cafe_geometry import blade, mesh_object, tube
from cafe_lighting import bake_room_bounce
from cafe_surfaces import apply_surfaces

LAYOUT = json.loads((ROOT / "scene/layout.json").read_text())
OUTPUT = ROOT / "public"
STUDIES = OUTPUT / "studies"
STUDIES.mkdir(parents=True, exist_ok=True)
RANDOM = random.Random(152)
bpy.ops.wm.read_factory_settings(use_empty=True)
SCENE = bpy.context.scene


def coords(x, y, z):
    """Browser coordinates (+Y up, street at -Z) to Blender coordinates."""
    return x, -z, y


def linear(value):
    return value / 12.92 if value < 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def material(name, hex_color, roughness=0.75, glow=0):
    color = tuple(linear(int(hex_color[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Emission Color"].default_value = color
    bsdf.inputs["Emission Strength"].default_value = glow
    return mat


cream = material("Limewash", "edd4ad")
sand = material("Warm ivory", "ffe2b7")
trim = material("Painted green trim", "405a50")
oak = material("Honey oak", "bf8050")
oak_edge = material("End grain", "875233")
clay = [material(f"Quarry tile {i}", color) for i, color in enumerate(
    ["aa6851", "b6755b", "a76854", "c08064", "b8775a", "b37360"])]
grout = material("Tile grout", "7e5544")
espresso = material("Dark metal", "332d2d")
bronze = material("Brass", "bd8952", 0.36)
teal = material("Counter tile", "567b70")
teal_edge = material("Dark green", "354f49")
olive = material("Olive cloth", "8b9062")
pot = material("Earthenware", "c17857")
leaves = [material(f"Foliage {i}", color) for i, color in enumerate(
    ["56724e", "73884d", "385b4d"])]
paper = material("Paper", "f6dcb4")
books = [material(f"Book cloth {i}", color) for i, color in enumerate(
    ["b2705f", "748b77", "d8a764", "607387", "e4c5a1"])]
case = material("Graphite laptop", "45484a", 0.54)
keys = material("Keyboard", "242d2d")
key_top = material("Keycaps", "65686b")
display = material("Display glass", "102d2d", 0.4, 0.25)
ink = material("Screen phosphor", "acf0bd", glow=1.6)
lamp = material("Opal glass", "fff0c8", glow=1.3)
street = material("Street", "9d9f9b")
facades = [material(f"Street facade {i}", color) for i, color in enumerate(
    ["cda88a", "dbbfa0", "afaa93", "e0bdad", "d5ae87"])]
skin = material("Visitor skin", "d99c73")
shirt = material("Visitor sweater", "f1ac51")
pants = material("Visitor trousers", "324b50")


def empty(name, x=0, y=0, z=0, parent=None):
    obj = bpy.data.objects.new(name, None)
    SCENE.collection.objects.link(obj)
    obj.parent = parent
    obj.location = coords(x, y, z)
    return obj


def finish(obj, name, mat, parent):
    obj.name = name
    obj.parent = parent
    obj.data.materials.append(mat)
    return obj


def box(name, x, y, z, w, h, d, mat, parent=None, bevel=0, *, bevel_segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=coords(x, y, z))
    obj = finish(bpy.context.object, name, mat, parent)
    obj.dimensions = coords(w, h, -d)
    if bevel:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        edge = obj.modifiers.new("Soft edges", "BEVEL")
        # Leave a flat strip between bevels on opposite edges of thin parts.
        edge.width = min(bevel, min(w, h, d) * 0.4)
        edge.segments = bevel_segments
        obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")
    return obj


def cylinder(name, x, y, z, radius, height, mat, parent=None, top=None, sides=16):
    bpy.ops.mesh.primitive_cone_add(
        vertices=sides, radius1=radius, radius2=radius if top is None else top,
        depth=height, location=coords(x, y, z),
    )
    return finish(bpy.context.object, name, mat, parent)


def plant(name, x, y, z, scale, parent=None):
    group = empty(name, x, y, z, parent)
    cylinder("Pot", 0, 0.16 * scale, 0, 0.18 * scale, 0.32 * scale, pot, group, top=0.24 * scale)
    cylinder("Soil", 0, 0.323 * scale, 0, 0.21 * scale, 0.02 * scale, oak_edge, group)
    vertices, faces = [], []
    for i in range(15):
        angle = i * 2.39996
        dx, dz = math.cos(angle), math.sin(angle)
        height = (0.48 + i % 5 * 0.115) * scale
        spread = (0.11 + i % 4 * 0.048) * scale
        start = coords(0, 0.30 * scale, 0)
        middle = coords(dx * spread * 0.45, 0.45 * scale + (height - 0.45 * scale) * 0.52,
                        dz * spread * 0.45)
        tip = coords(dx * spread, height, dz * spread)
        tube("Plant petiole", group, (start, middle, tip),
             (0.009 * scale, 0.007 * scale, 0.003 * scale), leaves[2], 5)
        blade(vertices, faces, tip, coords(dx, 0.14 + (i % 5) * 0.12, dz),
              scale * (0.19 + (i % 4) * 0.039), scale * (0.052 + (i % 3) * 0.015),
              twist=0.18 * math.sin(i * 1.9))
    foliage = mesh_object("Indoor leaf blades", group, vertices, faces, leaves)
    for face in foliage.data.polygons:
        face.material_index = (face.index // 8) % len(leaves)
        face.use_smooth = True


room = LAYOUT["room"]
half_w, half_d, ceiling = room["width"] / 2, room["depth"] / 2, room["height"]
box("Foundation", 0, -0.15, 0, room["width"] + 0.24, 0.28, room["depth"] + 0.24, oak_edge)
box("Grout bed", 0, -0.035, 0, room["width"], 0.055, room["depth"], grout)
tile_count_x, tile_count_z = 28, 18
tile_w, tile_d = room["width"] / tile_count_x, room["depth"] / tile_count_z
tiles = []
for row in range(tile_count_z):
    for col in range(tile_count_x):
        tiles.append(box("Floor tile", (col + 0.5) * tile_w - half_w, -0.012,
                         (row + 0.5) * tile_d - half_d, tile_w - 0.004, 0.024,
                         tile_d - 0.004, RANDOM.choice(clay)))
bpy.ops.object.select_all(action="DESELECT")
for tile in tiles:
    tile.select_set(True)
bpy.context.view_layer.objects.active = tiles[0]
bpy.ops.object.join()
tile_mesh = bpy.context.object
tile_mesh.name = "Quarry tiles"

front = empty("WallFront")
front_plaster = empty("FrontPlaster", parent=front)
back = empty("WallBack")
left = empty("WallLeft")
right = empty("WallRight")
roof = empty("Ceiling")
box("Ceiling panel", 0, ceiling + 0.075, 0, room["width"] + 0.24, 0.15,
    room["depth"] + 0.24, sand, roof)
for name, group, x in (("Left", left, -half_w), ("Right", right, half_w)):
    box(f"{name} plaster", x, ceiling / 2, 0, 0.16, ceiling, room["depth"], cream, group)
    box("Baseboard", x - math.copysign(0.09, x), 0.07, 0, 0.045, 0.14,
        room["depth"], trim, group)
box("Back plaster", 0, ceiling / 2, half_d, room["width"], ceiling, 0.16, cream, back)
box("Back baseboard", 0, 0.07, half_d - 0.09, room["width"], 0.14, 0.05, trim, back)

window, entry = LAYOUT["window"], LAYOUT["entry"]


def front_panel(a, b, bottom, top, mat, name):
    box(name, (a + b) / 2, (bottom + top) / 2, -half_d,
        b - a, top - bottom, 0.17, mat, front_plaster)


for a, b in ((-half_w, window["left"]), (window["right"], entry["left"]),
             (entry["right"], half_w)):
    front_panel(a, b, 0, ceiling, cream, "Street wall pier")
front_panel(window["left"], window["right"], 0, window["sill"], cream, "Window apron")
front_panel(window["left"], window["right"], window["head"], ceiling, cream, "Window header")
front_panel(entry["left"], entry["right"], 2.36, ceiling, cream, "Door header")
for y in (window["sill"], window["head"]):
    box("Window rail", (window["left"] + window["right"]) / 2, y, -half_d,
        window["right"] - window["left"] + 0.08, 0.10, 0.24, trim, front, 0.012)
for x, sign in ((window["left"], 1), (window["right"], -1)):
    box("Window jamb", x, 1.68, -half_d, 0.083, 1.68, 0.19, trim, front, 0.009)
    casement = empty("Open casement", x + sign * 0.038, 0, -half_d - 0.085, front)
    casement.rotation_euler.z = sign * math.radians(67)
    pane_width = 0.73
    for offset in (0, pane_width):
        box("Casement stile", sign * offset, 1.68, 0, 0.049, 1.54, 0.048,
            trim, casement, 0.004)
    for y in (0.92, 1.42, 1.93, 2.44):
        box("Casement rail", sign * pane_width / 2, y, 0, pane_width, 0.042, 0.047,
            trim, casement, 0.004)
    box("Casement meeting rail", sign * pane_width / 2, 1.68, 0, 0.027, 1.51,
        0.033, trim, casement, 0.003)
    for y in (1.17, 2.19):
        cylinder("Casement hinge barrel", 0, y, 0.028, 0.012, 0.071,
                 bronze, casement, sides=20)
    box("Casement latch", sign * (pane_width - 0.025), 1.42, 0.031,
        0.082, 0.023, 0.023, bronze, casement, 0.004)
for x in (entry["left"], entry["right"]):
    box("Door jamb", x, 1.18, -half_d, 0.08, 2.36, 0.23, trim, front)
box("Door lintel", (entry["left"] + entry["right"]) / 2, 2.36, -half_d,
    1.22, 0.085, 0.23, trim, front)

door_width = entry["right"] - entry["left"] - 0.10
door = empty("EntryDoor", entry["left"] + 0.05, 0, -half_d, front)
door_paint = material("Blackened oak door", "332d27", 0.52)
glass = material("Door glazing", "c4d5d4", 0.12)
glass.node_tree.nodes.get("Principled BSDF").inputs["Alpha"].default_value = 0.14
glass.surface_render_method = "BLENDED"
for x in (0.055, door_width - 0.055):
    box("Door stile", x, 1.04, 0, 0.11, 2.04, 0.079, door_paint, door, 0.008)
for y, h in ((0.085, 0.13), (0.78, 0.13), (1.48, 0.042), (2.0, 0.12)):
    box("Door rail", door_width / 2, y, 0, door_width, h, 0.079, door_paint, door, 0.008)
box("Door lower panel", door_width / 2, 0.43, 0, door_width - 0.20, 0.61,
    0.045, door_paint, door, 0.014)
box("Door glazing", door_width / 2, 1.38, 0, door_width - 0.20, 1.15,
    0.014, glass, door)
box("Door center muntin", door_width / 2, 1.38, 0, 0.044, 1.17, 0.053,
    door_paint, door, 0.004)
box("Door handle backplate", door_width - 0.057, 1.02, 0.045, 0.045, 0.14,
    0.013, bronze, door, 0.006)
box("Door lever", door_width - 0.11, 1.035, 0.069, 0.13, 0.024,
    0.039, bronze, door, 0.009)
sidelight = material("Ribbed warm glass", "d2dbd0", 0.29)
sidelight.node_tree.nodes.get("Principled BSDF").inputs["Alpha"].default_value = 0.17
sidelight.surface_render_method = "BLENDED"
for x, sign in ((window["left"], 1), (window["right"], -1)):
    glass_x = x + sign * 0.105
    box("Ribbed end light", glass_x, 1.68, -half_d - 0.01, 0.125, 1.50, 0.013,
        sidelight, front)
    for i in range(5):
        box("Glazing flute", glass_x + (i - 2) * 0.024, 1.68, -half_d + 0.002,
            0.005, 1.50, 0.009, sidelight, front, 0.002)
box("Transom glazing", (entry["left"] + entry["right"]) / 2, 2.21, -half_d,
    door_width, 0.25, 0.02, glass, front)
box("Transom rail", (entry["left"] + entry["right"]) / 2, 2.08, -half_d,
    door_width + 0.06, 0.06, 0.12, trim, front, 0.008)
for offset in (-0.22, 0.22):
    box("Transom muntin", (entry["left"] + entry["right"]) / 2 + offset,
        2.22, -half_d, 0.034, 0.24, 0.049, trim, front, 0.004)
for y in (0.24, 1.17, 1.88):
    cylinder("Door hinge barrel", 0.014, y, 0.052, 0.015, 0.084,
             bronze, door, sides=20)
box("Door threshold", (entry["left"] + entry["right"]) / 2, 0.01,
    -half_d, door_width, 0.018, 0.25, bronze, front, 0.004)


def table(name, rect, height=0.77, desk=False):
    group = empty(name, rect["x"], 0, rect["z"])
    w, d = rect["width"], rect["depth"]
    top = box("Oak top", 0, height - 0.045, 0, w, 0.09, d, oak, group, 0.027)
    top["placement_surface"] = True
    across, along = min(w, d), max(w, d)
    board_count = max(2, round(across / 0.24))
    for i in range(1, board_count):
        offset = across * (i / board_count - 0.5)
        x, z = (offset, 0) if d > w else (0, offset)
        seam = box("Join between planks", x, height + 0.0002, z,
                   0.002 if d > w else along - 0.05, 0.0007,
                   along - 0.05 if d > w else 0.002, oak_edge, group)
        seam["placement_ignore"] = True
    for x in (-w / 2 + 0.09, w / 2 - 0.09, *((0,) if desk else ())):
        for z in (-d / 2 + 0.08, d / 2 - 0.08):
            box("Table leg", x, (height - 0.08) / 2, z, 0.083, height - 0.08,
                0.083, oak_edge, group, 0.012)
    return group


def chair(rect, seat_index):
    group = empty("Chair", rect["x"], 0, rect["z"])
    group["seatIndex"] = seat_index
    group.rotation_euler.z = math.radians(rect["yaw"])
    window_seat = rect["yaw"] == 0
    box("Chair seat", 0, 0.455, 0, 0.425, 0.065, 0.425,
        oak if window_seat else olive, group, 0.03)
    for x in (-0.17, 0.17):
        for z in (-0.17, 0.17):
            h = 0.77 if z > 0 else 0.45
            post = cylinder("Tapered chair post", x, h / 2, z, 0.017, h, oak_edge,
                            group, top=0.025, sides=12)
            post.rotation_euler.y = math.copysign(-0.09, -x)
    vertices = []
    for index in range(13):
        u = (index - 6) / 6
        x, z = u * 0.223, 0.195 - u * u * 0.105
        bottom, top = 0.72 + 0.035 * abs(u), 0.875 - 0.035 * u * u
        vertices.extend(coords(x, y, z + depth)
                        for y, depth in ((bottom, -0.018), (top, -0.018),
                                         (top, 0.018), (bottom, 0.018)))
    faces = [(3, 2, 1, 0), (48, 49, 50, 51)]
    for index in range(12):
        for side in range(4):
            a = index * 4 + side
            b = index * 4 + (side + 1) % 4
            faces.append((a, b, b + 4, a + 4))
    mesh = bpy.data.meshes.new("Bent oak chair back")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Bent oak chair back", mesh)
    SCENE.collection.objects.link(obj)
    finish(obj, "Bent oak chair back", oak, group)
    for face in mesh.polygons:
        face.use_smooth = face.index % 4 in (2, 0)
    edge = obj.modifiers.new("Rounded chair edge", "BEVEL")
    edge.width, edge.segments = 0.008, 3
    obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")


table("Window desk", LAYOUT["windowDesk"], 0.8, desk=True)
table("Communal table", LAYOUT["communal"])
for seat_index, rect in enumerate(LAYOUT["windowChairs"] + LAYOUT["communalChairs"]):
    chair(rect, seat_index)
for rect in LAYOUT["smallTables"]:
    group = table("Wall table", rect, 0.69)
    cylinder("Coffee cup", 0.12, 0.735, -0.08, 0.055, 0.09, paper, group, top=0.064)
    cylinder("Coffee", 0.12, 0.781, -0.08, 0.047, 0.002, oak_edge, group)
for i, rect in enumerate(LAYOUT["benchSeats"]):
    group = empty("Oak and wool banquette", rect["x"], 0, rect["z"])
    group["seatIndex"] = len(LAYOUT["windowChairs"]) + len(LAYOUT["communalChairs"]) + i
    w, d = rect["width"], rect["depth"]
    for z in (-d * 0.37, d * 0.37):
        for x in (-w * 0.31, w * 0.31):
            cylinder("Banquette turned foot", x, 0.103, z, 0.026, 0.203,
                     oak_edge, group, top=0.035, sides=14)
    box("Banquette frame", 0, 0.286, 0, w - 0.045, 0.19, d - 0.035, oak, group, 0.034)
    box("Wool seat cushion", 0.015, 0.435, 0, w - 0.10, 0.132, d - 0.07,
        olive, group, 0.062)
    back = box("Upholstered banquette back", -0.247, 0.648, 0,
               0.133, 0.537, d - 0.095, olive, group, 0.060)
    back.rotation_euler.y = -0.12
    box("Seat welt", w * 0.42, 0.428, 0, 0.008, 0.012, d - 0.153,
        olive, group, 0.004)
    if i in (0, 2):
        arm = d / 2 * (-1 if i == 0 else 1)
        box("Banquette oak arm", -0.022, 0.588, arm, w - 0.06, 0.071, 0.067,
            oak, group, 0.028)
        box("Banquette arm support", w * 0.30, 0.435, arm, 0.060, 0.26, 0.056,
            oak, group, 0.015)


outlet_face = material("Antique brass outlet plate", "8b7959", 0.45)
outlet_insert = material("Dark phenolic outlet", "30302c", 0.71)


def duplex_outlet(x, y, z, yaw=0, parent=None):
    """Two recessed receptacles in a beveled faceplate, facing local +Z."""
    group = empty("Duplex power outlet", x, y, z, parent)
    group.rotation_euler.z = yaw
    box("Outlet faceplate", 0, 0, 0, 0.123, 0.069, 0.014, outlet_face, group, 0.007)
    for side in (-1, 1):
        cx = side * 0.029
        box("Receptacle", cx, 0, 0.009, 0.037, 0.043, 0.004,
            outlet_insert, group, 0.004)
        for delta in (-0.007, 0.007):
            box("Socket blade recess", cx + delta, 0.004, 0.012,
                0.0038, 0.012, 0.0016, espresso, group)
        box("Socket ground recess", cx, -0.009, 0.012, 0.0055, 0.0047, 0.0016,
            espresso, group, 0.001)
    for edge in (-0.052, 0.052):
        box("Faceplate screw", edge, 0, 0.009, 0.006, 0.003, 0.002, bronze, group, 0.001)


for rect in LAYOUT["windowChairs"]:
    x = rect["x"] - 0.29
    box("Window desk outlet mounting block", x, 0.684, -3.411, 0.143, 0.074, 0.078,
        oak_edge, bevel=0.008)
    duplex_outlet(x, 0.684, -3.365)
for rect in LAYOUT["benchSeats"]:
    duplex_outlet(-half_w + 0.089, 0.977, rect["z"] + 0.30, math.pi / 2, left)
for rect in LAYOUT["communalChairs"]:
    table_x = LAYOUT["communal"]["x"]
    side = math.copysign(1, rect["x"] - table_x)
    x = table_x + side * (LAYOUT["communal"]["width"] / 2 - 0.055)
    box("Table apron outlet support", x - side * 0.025, 0.652, rect["z"],
        0.047, 0.083, 0.145, oak_edge, bevel=0.006)
    duplex_outlet(x, 0.652, rect["z"], side * math.pi / 2)


def vessel(name, profile, mat, parent, sides=40, capped=True):
    """Revolve a bottom-to-top profile, including the inside of hollow vessels."""
    vertices = [coords(radius * math.cos(a * math.tau / sides), y,
                       radius * math.sin(a * math.tau / sides))
                for radius, y in profile for a in range(sides)]
    faces = [(i * sides + a, (i + 1) * sides + a,
              (i + 1) * sides + (a + 1) % sides, i * sides + (a + 1) % sides)
             for i in range(len(profile) - 1) for a in range(sides)]
    if capped:
        first = (len(profile) - 1) * sides
        faces.extend((tuple(range(sides)), tuple(range(first + sides - 1, first - 1, -1))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for face in mesh.polygons[:(len(profile) - 1) * sides]:
        face.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    SCENE.collection.objects.link(obj)
    return finish(obj, name, mat, parent)


porcelain = material("Ivory stoneware glaze", "e6dbc6", 0.27)


def cup(name, parent):
    vessel(name, [(0.037, 0), (0.041, 0.003), (0.043, 0.012),
                  (0.053, 0.076), (0.055, 0.092), (0.054, 0.095),
                  (0.050, 0.096), (0.048, 0.093), (0.046, 0.074),
                  (0.037, 0.016), (0.034, 0.012)], porcelain, parent)


def tinted_glass(name, color, opacity):
    glass = material(name, color, 0.19)
    glass.surface_render_method = "BLENDED"
    glass.node_tree.nodes.get("Principled BSDF").inputs["Alpha"].default_value = opacity
    return glass


carafe_glass = tinted_glass("Smoked glass", "c6d6d0", 0.24)
water_blue = material("Water", "9ab8bc", 0.18)


bar = LAYOUT["bar"]
counter = empty("Long bar", bar["x"], 0, bar["z"])
box("Counter body", 0, 0.52, 0, bar["width"] - 0.06, 1.04, bar["depth"] - 0.06,
    oak_edge, counter)
for i in range(29):
    box("Glazed counter tile", -0.316, 0.52, (i - 14) * 0.156, 0.032, 0.88, 0.145, teal, counter, 0.006)
top = box("Countertop", 0, 1.08, 0, bar["width"], 0.11, bar["depth"], oak, counter, 0.022)
top["placement_surface"] = True
box("Brass rail", -0.337, 0.16, 0, 0.025, 0.035, bar["depth"] - 0.10, bronze, counter)
props = LAYOUT["props"]
water_spot = props["water"]
water_station = empty("WaterStation", water_spot["x"], water_spot["y"], water_spot["z"])
carafe = empty("Carafe", 0.11, 0, -0.21, water_station)
vessel("Glass carafe", [(0.075, 0.004), (0.099, 0.011), (0.105, 0.027),
                        (0.105, 0.139), (0.102, 0.202), (0.093, 0.234),
                        (0.055, 0.275), (0.048, 0.299), (0.048, 0.319),
                        (0.056, 0.325), (0.056, 0.336), (0.047, 0.34),
                        (0.042, 0.334), (0.042, 0.296), (0.051, 0.266),
                        (0.088, 0.224), (0.097, 0.193), (0.099, 0.027),
                        (0.085, 0.016)], carafe_glass, carafe)
vessel("Carafe water", [(0.087, 0.017), (0.098, 0.028), (0.098, 0.159),
                        (0.097, 0.162)], tinted_glass("Water in carafe", "92aaa4", 0.36),
       carafe)
box("Carafe coaster", 0.11, 0.004, -0.21, 0.26, 0.012, 0.26,
    oak_edge, water_station, 0.009)

bar_cup = empty("BarCup", 0, 0, 0, water_station)
cup("Bar ceramic", bar_cup)
cup("Spare water cup", empty("Spare cup", 0.11, 0, 0.21, water_station))
carried = empty("Carried")
carried_cup = empty("CarriedCup", 0.18, 0.01, 0, carried)
cup("Hand ceramic", carried_cup)
cylinder("CupWater", 0, 0.079, 0, 0.046, 0.004, water_blue, carried_cup)
cylinder("PourStream", 0.008, 0.18, 0, 0.012, 0.21, water_blue, water_station)
back_bar = LAYOUT["backBar"]
cabinet = empty("Service cabinet", back_bar["x"], 0, back_bar["z"])
box("Cabinet", 0, 0.439, 0, back_bar["width"], 0.878, back_bar["depth"],
    teal_edge, cabinet, 0.02)
stone_worktop = material("Honed soapstone", "7d7770", 0.5)
sink_z = 1.61
sink_depth = 0.428
counter_end = back_bar["depth"] / 2
for start, end in ((-counter_end, sink_z - sink_depth / 2),
                   (sink_z + sink_depth / 2, counter_end)):
    box("Soapstone worktop", 0, 0.99, (start + end) / 2, back_bar["width"], 0.07,
        end - start, stone_worktop, cabinet, 0.006)
for start, end in ((-back_bar["width"] / 2, -0.178), (0.190, back_bar["width"] / 2)):
    box("Soapstone sink surround", (start + end) / 2, 0.99, sink_z, end - start,
        0.07, sink_depth, stone_worktop, cabinet, 0.006)
for z in (-1.8, -1.08, -0.36, 0.36, 1.08, 1.8):
    box("Inset cupboard front", -0.324, 0.51, z, 0.026, 0.79, 0.69, oak, cabinet, 0.008)
    box("Cupboard pull", -0.347, 0.82, z + 0.19, 0.028, 0.02, 0.13, bronze,
        cabinet, 0.004)
steel = material("Brushed stainless steel", "a6a6a1", 0.33)
steel.node_tree.nodes.get("Principled BSDF").inputs["Metallic"].default_value = 0.72
chrome = material("Polished fittings", "c8c8c5", 0.2)
chrome.node_tree.nodes.get("Principled BSDF").inputs["Metallic"].default_value = 0.83
machine = empty("Two-group espresso machine", -0.04, 1.025, -1.28, cabinet)
box("Machine base", 0, 0.058, 0, 0.55, 0.09, 0.73, espresso, machine, 0.019)
box("Rear housing", 0.10, 0.255, 0, 0.30, 0.38, 0.73, steel, machine, 0.036)
box("Cupping deck", -0.04, 0.416, 0, 0.49, 0.065, 0.73, steel, machine, 0.021)
box("Control fascia", -0.26, 0.364, 0, 0.07, 0.105, 0.73, steel, machine, 0.018)
box("Drip tray", -0.115, 0.109, 0, 0.325, 0.035, 0.68, steel, machine, 0.008)
for i in range(22):
    box("Drain slot", -0.12, 0.128, (i - 10.5) * 0.028, 0.26, 0.002, 0.01,
        espresso, machine)
for z in (-0.177, 0.177):
    cylinder("Group head", -0.17, 0.305, z, 0.073, 0.045, chrome, machine, sides=28)
    cylinder("Portafilter basket", -0.18, 0.27, z, 0.052, 0.025, chrome, machine)
    handle = cylinder("Portafilter handle", -0.264, 0.26, z, 0.018, 0.145,
                      espresso, machine, top=0.022)
    handle.rotation_euler.y = math.pi / 2
    for i in range(4):
        box("Brew button", -0.296, 0.377, z + (i - 1.5) * 0.022, 0.009, 0.018, 0.017,
            espresso, machine, 0.003)
for z in (-0.296, 0.296):
    wand = cylinder("Steam wand", -0.209, 0.232, z, 0.009, 0.18, chrome, machine)
    wand.rotation_euler.y = -0.36
    cylinder("Steam tip", -0.24, 0.14, z, 0.013, 0.029, chrome, machine)
dial = cylinder("Pressure gauge bezel", -0.300, 0.354, 0, 0.03, 0.012, chrome, machine)
dial.rotation_euler.y = math.pi / 2
dial = cylinder("Pressure gauge face", -0.307, 0.354, 0, 0.024, 0.005, paper, machine)
dial.rotation_euler.y = math.pi / 2
box("Pressure gauge needle", -0.311, 0.356, -0.004, 0.002, 0.003, 0.033,
    espresso, machine)
for x in (-0.11, 0.04):
    for z in (-0.23, 0, 0.23):
        holder = empty("Espresso cup", x, 0.45, z, machine)
        holder.scale = (0.77, 0.77, 0.64)
        cup("Porcelain cup", holder)

grinder = empty("Coffee grinder", -0.025, 1.025, -0.64, cabinet)
box("Grinder base", 0, 0.022, 0, 0.32, 0.044, 0.244, espresso, grinder, 0.017)
vessel("Cast grinder body", [(0.095, 0.043), (0.105, 0.051), (0.105, 0.215),
                             (0.098, 0.239), (0.086, 0.255)], espresso, grinder)
cylinder("Grind adjustment collar", 0, 0.269, 0, 0.086, 0.031, steel, grinder, sides=32)
vessel("Glass bean hopper", [(0.052, 0.284), (0.069, 0.305), (0.096, 0.368),
                              (0.106, 0.434), (0.105, 0.45)], carafe_glass, grinder)
vessel("Roasted beans in hopper", [(0.054, 0.285), (0.067, 0.315), (0.085, 0.365),
                                    (0.084, 0.387)], material("Roasted coffee", "3f2517"),
       grinder)
cylinder("Hopper lid", 0, 0.452, 0, 0.112, 0.02, espresso, grinder, top=0.103, sides=40)
box("Grounds chute", -0.109, 0.185, 0, 0.068, 0.049, 0.06, steel, grinder, 0.012)
box("Portafilter fork", -0.125, 0.079, 0, 0.104, 0.017, 0.096, steel, grinder, 0.009)
box("Grinder power rocker", -0.089, 0.13, -0.051, 0.014, 0.03, 0.025, espresso, grinder, 0.004)

# The front counter works from ordering to pickup; prep and rinse stay behind it.
labels = material("Engraved ivory menu lettering", "e7d9bb", 0.74)
rubber = material("Bar tool mat", "292826", 0.84)
linen = material("Washed café linen", "82745b", 0.94)
pale_pastry = material("Baked pie crust", "b47e45", 0.77)
toasted_pastry = material("Toasted pie ridges", "80502c", 0.86)


def counter_card(name, legend, x, y, z, parent):
    stand = empty(name, x, y, z, parent)
    box("Engraved sign board", 0, 0.059, 0, 0.017, 0.098, 0.23, oak_edge, stand, 0.008)
    box("Card stand base", 0, 0.009, 0, 0.09, 0.018, 0.238, oak, stand, 0.006)
    bpy.ops.object.text_add(location=coords(-0.010, 0.058, 0),
                            rotation=(math.pi / 2, 0, -math.pi / 2))
    title = bpy.context.object
    title.data.body = legend
    title.data.align_x = "CENTER"
    title.data.align_y = "CENTER"
    title.data.size = 0.025
    bpy.ops.object.convert(target="MESH")
    finish(bpy.context.object, name + " lettering", labels, stand)


order = empty("Order station", 0.028, 1.135, -0.96, counter)
box("POS weighted base", 0.044, 0.012, 0.005, 0.235, 0.024, 0.245,
    espresso, order, 0.011)
box("POS pivot stand", 0.078, 0.09, 0.005, 0.048, 0.148, 0.070,
    steel, order, 0.006)
terminal = empty("Tilting point-of-sale display", 0.047, 0.186, 0, order)
terminal.rotation_euler.y = 0.29
box("POS display casing", 0, 0, 0, 0.033, 0.168, 0.262, espresso, terminal, 0.012)
box("POS display glass", 0.017, 0, 0, 0.006, 0.14, 0.238, display, terminal, 0.005)
box("Card reader", -0.103, 0.025, 0.236, 0.15, 0.048, 0.083,
    espresso, order, 0.014)
box("Card reader LCD", -0.138, 0.05, 0.236, 0.041, 0.003, 0.060,
    display, order, 0.003)
for x in (-0.086, -0.065, -0.044):
    for z in (0.221, 0.236, 0.251):
        box("Card keypad", x, 0.051, z, 0.009, 0.002, 0.008,
            key_top, order, 0.001)

pastry = empty("Pastry display tray", -0.038, 1.135, -1.80, counter)
box("Pastry tray", 0, 0.020, 0, 0.37, 0.029, 0.63, oak_edge, pastry, 0.012)
for z in (-0.204, 0, 0.207):
    p = empty("Individual hand pie", 0, 0.034, z, pastry)
    vessel("Fluted pie shell", [(0.044, 0.0), (0.064, 0.011), (0.078, 0.034),
                               (0.079, 0.043), (0.072, 0.047), (0.057, 0.04)],
           pale_pastry, p, sides=20)
    cylinder("Pie filling", 0, 0.039, 0, 0.058, 0.009, toasted_pastry, p, sides=20)
    for dx in (-0.026, 0, 0.026):
        length = 0.113 - 0.49 * abs(dx)
        box("Baked lattice pastry", dx, 0.046, 0, 0.013, 0.008, length,
            pale_pastry, p, 0.003)
    for dz in (-0.031, 0.031):
        box("Crossed pastry lattice", 0, 0.049, dz, 0.109, 0.008, 0.013,
            pale_pastry, p, 0.003)
counter_card("Pastry sign", "HOUSE PIES", -0.245, 1.135, -1.82, counter)
counter_card("Pickup sign", "PICKUP", 0.16, 1.135, 0.60, counter)
box("Oak pickup tray", -0.035, 1.154, 0.65, 0.34, 0.028, 0.59, oak_edge, counter, 0.012)
for z in (0.51, 0.77):
    saucer = empty("Ceramic service saucer", -0.055, 1.169, z, counter)
    vessel("Porcelain saucer", [(0.046, 0), (0.068, 0.006), (0.079, 0.015),
                                (0.080, 0.021), (0.069, 0.019), (0.046, 0.012)],
           porcelain, saucer, sides=28)
cup("Cup awaiting pickup", empty("Pickup coffee cup", -0.052, 1.182, 0.52, counter))

prep = empty("Espresso prep station", 0.015, 1.025, -0.12, cabinet)
box("Rubber tamping mat", -0.082, 0.007, -0.085, 0.32, 0.014, 0.32,
    rubber, prep, 0.012)
cylinder("Tamper foot", -0.071, 0.022, -0.12, 0.032, 0.019, chrome, prep, sides=32)
vessel("Turned tamper handle", [(0.016, 0.032), (0.013, 0.043), (0.019, 0.064),
                               (0.022, 0.075), (0.016, 0.087)], oak_edge,
       empty("Tamper grip", -0.071, 0, -0.12, prep), sides=20)
box("Espresso scale", -0.109, 0.015, 0.17, 0.145, 0.028, 0.133, espresso, prep, 0.008)
box("Scale readout", -0.161, 0.030, 0.17, 0.025, 0.002, 0.051, display, prep, 0.002)
knock = empty("Spent grounds knock box", 0.145, 0, 0.09, prep)
box("Knock box floor", 0, 0.013, 0, 0.157, 0.025, 0.167, rubber, knock, 0.005)
for z in (-0.078, 0.078):
    box("Knock box end", 0, 0.060, z, 0.161, 0.12, 0.011, rubber, knock, 0.004)
for x in (-0.075, 0.075):
    box("Knock box side", x, 0.060, 0, 0.011, 0.12, 0.156, rubber, knock, 0.004)
tube("Rubber knock bar", knock, (coords(-0.078, 0.092, 0), coords(0.078, 0.092, 0)),
     (0.013, 0.013), rubber, sides=12)

for i, z in enumerate((0.43, 0.66)):
    pitcher = empty("Milk steaming pitcher", -0.055 + i * 0.085, 1.025, z, cabinet)
    size = 0.86 + i * 0.14
    pitcher.scale = (size, size, size)
    vessel("Stainless milk jug", [(0.037, 0.005), (0.049, 0.01), (0.054, 0.031),
                                 (0.053, 0.091), (0.049, 0.118), (0.046, 0.120),
                                 (0.044, 0.116), (0.047, 0.093), (0.048, 0.034),
                                 (0.04, 0.014)], steel, pitcher, sides=28)
    tube("Bent pitcher handle", pitcher,
         (coords(0.047, 0.091, 0), coords(0.082, 0.077, 0),
          coords(0.082, 0.052, 0), coords(0.049, 0.032, 0)),
         (0.007, 0.007, 0.007, 0.007), steel, sides=8)
box("Folded polishing cloth", 0.04, 1.033, 0.94, 0.225, 0.016, 0.19,
    linen, cabinet, 0.007)
for z, h in ((0.68, 0.22), (0.85, 0.17)):
    jar = empty("Syrup pump", 0.18, 1.025, z, cabinet)
    vessel("Amber syrup bottle", [(0.043, 0), (0.049, 0.014), (0.049, h - 0.052),
                                 (0.033, h - 0.036), (0.023, h)], toasted_pastry, jar, sides=20)
    cylinder("Syrup pump cap", 0, h, 0, 0.027, 0.026, espresso, jar, sides=20)
    tube("Bent syrup pump spout", jar,
         (coords(0, h, 0), coords(0, h + 0.046, 0), coords(-0.045, h + 0.046, 0)),
         (0.007, 0.007, 0.007), steel, sides=8)

sink = empty("Stainless rinse sink", 0.006, 1.025, 1.61, cabinet)
box("Recessed sink bottom", 0, -0.129, 0, 0.36, 0.012, 0.42, steel, sink, 0.004)
for x in (-0.181, 0.181):
    box("Basin side wall", x, -0.068, 0, 0.016, 0.130, 0.431, steel, sink, 0.006)
    box("Basin mounting lip", x, 0.003, 0, 0.044, 0.009, 0.472, chrome, sink, 0.004)
for z in (-0.212, 0.212):
    box("Basin end wall", 0, -0.068, z, 0.36, 0.130, 0.016, steel, sink, 0.006)
    box("Basin mounting lip", 0, 0.003, z, 0.39, 0.009, 0.04, chrome, sink, 0.004)
cylinder("Sink drain", -0.015, -0.119, 0, 0.038, 0.006, espresso, sink, sides=24)
tube("Gooseneck rinse faucet", sink,
     (coords(0.238, 0.005, -0.045), coords(0.238, 0.206, -0.045),
      coords(0.216, 0.274, -0.045), coords(0.174, 0.297, -0.045),
      coords(0.119, 0.284, -0.045), coords(0.087, 0.241, -0.045)),
     (0.015, 0.015, 0.013, 0.013, 0.013, 0.013), chrome, sides=16)
cylinder("Faucet foot", 0.238, 0.012, -0.045, 0.035, 0.024, steel, sink, sides=24)
cylinder("Faucet handle", 0.238, 0.052, 0.055, 0.023, 0.063, chrome, sink, sides=16)
box("Mixer lever", 0.231, 0.085, 0.032, 0.024, 0.012, 0.083,
    chrome, sink, 0.005)

# Shallow service shelves against the wall, above the machine and water counter.
shelves = empty("Service shelves", half_w - 0.24, 0, -0.31, right)
for y in (1.78, 2.21):
    box("Service shelf board", 0, y, 0, 0.30, 0.042, 2.8, oak, shelves, 0.008)
    for z in (-1.18, 0, 1.18):
        box("Shelf bracket wall plate", 0.153, y - 0.08, z, 0.022, 0.135, 0.038,
            espresso, shelves, 0.004)
        support = box("Angled shelf bracket", 0.044, y - 0.061, z, 0.24, 0.023, 0.034,
                      espresso, shelves, 0.004)
        support.rotation_euler.y = 0.34
    for index, z in enumerate((-0.99, -0.86, -0.73, 0.40, 0.53, 0.64)):
        holder = empty("Café spare cup", -0.035 + 0.024 * (index % 2), y + 0.022, z, shelves)
        size = 0.72 + 0.12 * (index % 3)
        holder.scale = (size, size, size * 0.91)
        cup("Shelf stoneware cup", holder)
    for z, h in ((-0.25, 0.185), (-0.09, 0.17), (0.08, 0.194)):
        bag = box("Folded kraft coffee bag", 0.015, y + 0.021 + h / 2, z, 0.091, h, 0.115,
                  oak_edge, shelves, 0.022)
        bag.rotation_euler.z = z * 0.6
        box("Coffee bag paper label", -0.033, y + 0.105, z, 0.002, 0.051, 0.058, paper, shelves, 0.004)


shelf = LAYOUT["shelf"]
bookcase = empty("Bookcase", shelf["x"], 0, shelf["z"])
w, d = shelf["width"], shelf["depth"]
box("Bookcase back", 0, 1.03, d / 2 - 0.025, w, 2.06, 0.05, oak_edge, bookcase)
for x in (-w / 2 + 0.03, 0, w / 2 - 0.03):
    box("Shelf upright", x, 1.04, 0, 0.065, 2.08, d, oak, bookcase, 0.011)
book_rng = random.Random(208)
shelf_cloth = [material(f"Shelf binding {i}", color) for i, color in enumerate(
    ("754f45", "64766c", "9b7c54", "404b55", "938473", "51463c", "5c6b52"))]
shelf_paper = material("Aged edges of book pages", "cbb99a", 0.91)
foil = material("Worn spine foil", "a28a61", 0.53)
# Runs of books touch within each group. The empty bays leave room to browse,
# and the two shorter runs frame the books visitors can pull from the shelf.
shelf_runs = (
    ((-1.54, -0.76),),
    ((-1.54, -0.11), (0.10, 0.79)),
    ((-1.30, -0.10), (0.62, 1.54)),
    ((-1.54, -0.89), (-0.59, -0.18)),
)
for row, y in enumerate((0.12, 0.59, 1.06, 1.53, 2.02)):
    board = box("Shelf board", 0, y, 0, w, 0.055, d, oak, bookcase, 0.01)
    board["placement_surface"] = True
    if row == len(shelf_runs):
        continue
    for start, end in shelf_runs[row]:
        spine_line = -book_rng.uniform(0.14, 0.167)
        cursor = start
        while end - cursor >= 0.042:
            width = min(end - cursor, book_rng.uniform(0.047, 0.105))
            x = cursor + width / 2
            cursor += width + book_rng.uniform(0.001, 0.004)
            h = book_rng.uniform(0.19, 0.355)
            depth = book_rng.uniform(0.17, 0.24)
            front_z = spine_line + book_rng.uniform(-0.009, 0.011)
            base = y + 0.028
            binding = book_rng.choice(shelf_cloth)
            box("Book page block", x, base + h / 2, front_z + depth / 2,
                width - 0.009, h - 0.013, depth - 0.008, shelf_paper, bookcase, 0.002,
                bevel_segments=1)
            for side in (-1, 1):
                box("Cloth book board", x + side * (width / 2 - 0.002), base + h / 2,
                    front_z + depth / 2, 0.004, h, depth, binding, bookcase, 0.001,
                    bevel_segments=1)
            box("Rounded book spine", x, base + h / 2, front_z + 0.002,
                width, h, 0.012, binding, bookcase, 0.004, bevel_segments=1)
            if book_rng.random() < 0.58:
                for mark in (0.15, 0.21, 0.74):
                    box("Blind embossed spine band", x, base + h * mark, front_z - 0.0046,
                        width * 0.76, 0.0033, 0.0018, foil, bookcase)
    if row == 1:
        for layer in range(3):
            width = 0.24 - 0.014 * layer
            y_spine = y + 0.045 + layer * 0.026
            cover = shelf_cloth[(row * 3 + layer) % len(shelf_cloth)]
            x = 1.21 + 0.008 * (-1) ** layer
            box("Stacked book pages", x, y_spine, -0.045, width - 0.008,
                0.019, 0.163, shelf_paper, bookcase, 0.002, bevel_segments=1)
            for offset in (-0.011, 0.011):
                box("Stacked book cover", x, y_spine + offset, -0.045, width,
                    0.004, 0.17, cover, bookcase, 0.001, bevel_segments=1)


def atlas(name, x, y, z, parent=None):
    group = empty(name, x, y, z, parent)
    binding = books[2]
    box("Atlas spine", -0.075, 0, 0, 0.012, 0.239, 0.055, binding, group, 0.004)
    box("Atlas back cover", 0.004, 0, 0.024, 0.154, 0.239, 0.007,
        binding, group, 0.002)
    box("Atlas pages", 0.004, 0, 0.003, 0.143, 0.22, 0.034, paper, group, 0.002)
    cover = empty(name + "Cover", -0.075, 0, -0.022, group)
    box("Atlas front cover", 0.079, 0, -0.002, 0.154, 0.239, 0.007,
        binding, cover, 0.002)
    box("Atlas title stamp", 0.075, 0.051, -0.006, 0.104, 0.038, 0.003,
        teal_edge, cover, 0.001)
    leaf = empty(name + "Left", -0.069, 0, -0.014, group)
    box("Atlas flyleaf", 0.073, 0, 0, 0.143, 0.220, 0.003, paper, leaf, 0.001)
    return group


p = props["shelf"]
atlas("ShelfAtlas", p["x"], p["y"], p["z"])
hand_atlas = atlas("CarriedAtlas", -0.19, 0.07, 0, carried)
hand_atlas.rotation_euler.x = math.radians(-22)

picture = LAYOUT["picture"]
art = empty("Framed print", picture["x"], 1.73, picture["z"])
box("Picture frame", 0, 0, 0, 1.15, 0.81, 0.052, oak_edge, art, 0.018)
box("Paper mat", 0, 0, -0.033, 1.04, 0.70, 0.012, paper, art)
print_sky = material("Print paper", "cebc9e")
box("Landscape paper", 0, 0, -0.042, 0.83, 0.50, 0.009, print_sky, art)
for index, (name, color, contour) in enumerate((
        ("Distant ridge", "a29888", (0.015, 0.045, 0.099, 0.08, 0.04, 0.033, 0.08, 0.10, 0.061)),
        ("Middle ridge", "807a6c", (-0.028, -0.052, -0.027, 0.022, 0.047, 0.01, -0.023, 0.009, -0.009)),
        ("Forested ridge", "5a5a4c", (0.007, -0.03, -0.049, -0.08, -0.102, -0.123, -0.106, -0.08, -0.056)),
        ("River bank", "b1a288", (-0.174, -0.171, -0.164, -0.168, -0.18, -0.164, -0.14, -0.129, -0.122)))):
    z = -0.047 - index * 0.0006
    verts = [coords(-0.415 + 0.83 * i / (len(contour) - 1), y, z)
             for i, y in enumerate(contour)]
    verts.extend((coords(0.415, -0.25, z), coords(-0.415, -0.25, z)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [tuple(reversed(range(len(verts))))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    SCENE.collection.objects.link(obj)
    finish(obj, name, material(name, color), art)
plant("Rear floor plant", LAYOUT["plant"]["x"], 0, LAYOUT["plant"]["z"], 1.28)
plant("Window plant", 1.73, 0.8, -3.21, 0.49)
plant("Table plant", -0.22, 0.77, 0.44, 0.4)

enamel = material("Charcoal pendant enamel", "272927", 0.31)
reflector = material("Pendant enamel lining", "e6d5b3", 0.38, glow=0.18)
for x, z in ((-0.22, -0.95), (-0.22, 0.75), (3.74, -0.69), (3.74, 1.0)):
    fixture = empty("Pendant fixture", x, 2.10, z, roof)
    cylinder("Ceiling canopy", 0, 0.729, 0, 0.066, 0.04, enamel, fixture, sides=32)
    cylinder("Woven pendant cord", 0, 0.469, 0, 0.007, 0.50, espresso, fixture)
    cylinder("Brass stem", 0, 0.232, 0, 0.027, 0.069, bronze, fixture, sides=24)
    outer = [(0.222, 0.012), (0.222, 0.024), (0.217, 0.032), (0.201, 0.067),
             (0.173, 0.106), (0.135, 0.143), (0.09, 0.169), (0.058, 0.18),
             (0.051, 0.19), (0.051, 0.211)]
    vessel("Spun pendant shell", outer, enamel, fixture, sides=48, capped=False)
    vessel("Pendant reflector", [(r - 0.004, y) for r, y in reversed(outer)],
           reflector, fixture, sides=48, capped=False)
    vessel("Rolled pendant rim", [(0.218, 0.009), (0.222, 0.011), (0.224, 0.016),
                                (0.222, 0.021), (0.218, 0.022), (0.216, 0.016),
                                (0.218, 0.009)], enamel, fixture, sides=48, capped=False)
    vessel("Opal bulb", [(0.009, 0.039), (0.028, 0.049), (0.037, 0.065),
                         (0.039, 0.079), (0.029, 0.107), (0.017, 0.119)],
           lamp, fixture)


# Small shaded lamps warm the quiet seating without closing off the view.
warm_linen = material("Natural shade linen", "e0c197", 0.82, glow=0.14)
lamp_stem = material("Darkened lamp brass", "796043", 0.52)


def shaded_lamp(name, x, y, z, stem, shade, foot, parent=None):
    group = empty(name, x, y, z, parent)
    vessel("Weighted lamp foot", [(foot * 0.87, 0), (foot, 0.012),
                                  (foot * 0.96, 0.029), (foot * 0.87, 0.032)],
           oak_edge, group, sides=28)
    cylinder("Lamp stem", 0, stem / 2, 0, 0.012 if foot > 0.10 else 0.008,
             stem, lamp_stem, group, sides=16)
    cylinder("Lamp stem collar", 0, stem - 0.009, 0, 0.021, 0.029, bronze, group, sides=20)
    shade_group = empty("Shallow woven shade", 0, stem, 0, group)
    vessel("Shade cloth", [(shade, 0), (shade * 0.995, 0.013), (shade * 0.72, shade * 0.83),
                         (shade * 0.69, shade * 0.87), (shade * 0.655, shade * 0.87),
                         (shade * 0.688, shade * 0.81), (shade * 0.968, 0.014),
                         (shade * 0.967, 0)], warm_linen, shade_group, sides=40, capped=False)
    vessel("Opal lamp bulb", [(0.008, 0.013), (0.019, 0.024), (0.024, 0.045),
                             (0.022, 0.064), (0.013, 0.073)],
           lamp, shade_group, sides=24)


shaded_lamp("Banquette floor lamp", -5.12, 0, 1.91, 1.34, 0.235, 0.156, left)
shaded_lamp("Window desk reading lamp", 1.08, 0.8, -3.32, 0.238, 0.119, 0.073)

table_lamps = [
    (f"Wall table lamp {i + 1}", rect["x"] - 0.21, 0.69, rect["z"] + 0.07)
    for i, rect in enumerate(LAYOUT["smallTables"])
] + [
    (f"Communal table lamp {i + 1}", LAYOUT["communal"]["x"], 0.77,
     LAYOUT["communal"]["z"] + offset)
    for i, offset in enumerate((-1.06, 1.03))
]
reading_enamel = material("Green reading lamp enamel", "3f6153", 0.32)


def table_lamp(name, x, y, z):
    group = empty(name, x, y, z)
    vessel("Turned brass base", [(0.063, 0), (0.071, 0.006), (0.071, 0.013),
                                (0.060, 0.022), (0.033, 0.025)], lamp_stem, group, sides=28)
    cylinder("Reading lamp stem", 0, 0.108, 0, 0.009, 0.172, bronze, group, sides=16)
    cylinder("Shade cap", 0, 0.261, 0, 0.024, 0.013, bronze, group, sides=20)
    shell = [(0.111, 0.177), (0.111, 0.186), (0.104, 0.205), (0.091, 0.226),
             (0.068, 0.244), (0.040, 0.255), (0.018, 0.257)]
    vessel("Spun green shade", shell, reading_enamel, group, sides=36, capped=False)
    vessel("Ivory reflector", [(r - 0.003, h - 0.002) for r, h in reversed(shell)],
           reflector, group, sides=36, capped=False)
    vessel("Rolled brass shade edge", [(0.106, 0.176), (0.111, 0.176), (0.112, 0.180),
                                     (0.110, 0.184), (0.107, 0.183)], bronze, group,
           sides=36, capped=False)
    vessel("Recessed opal bulb", [(0.008, 0.177), (0.024, 0.183), (0.027, 0.199),
                                  (0.015, 0.213)], lamp, group, sides=20)


for name, x, y, z in table_lamps:
    table_lamp(name, x, y, z)

clock = empty("Walnut wall clock", -2.78, 2.43, half_d - 0.13, back)
dial_mat = material("Matte clock face", "ddcfb3", 0.81)
for name, radius, depth, z, mat in (
        ("Clock walnut case", 0.156, 0.038, 0, oak_edge),
        ("Clock face", 0.136, 0.008, -0.021, dial_mat),
        ("Clock center pin", 0.007, 0.006, -0.030, bronze)):
    disc = cylinder(name, 0, 0, z, radius, depth, mat, clock, sides=40)
    disc.rotation_euler.x = math.pi / 2
for i in range(12):
    angle = i * math.tau / 12
    tick = box("Clock hour tick", 0.113 * math.sin(angle), 0.113 * math.cos(angle), -0.028,
               0.005, 0.015 if i % 3 == 0 else 0.009, 0.002, espresso, clock)
    tick.rotation_euler.y = angle
for name, angle, length, width in (
        ("Clock hour hand", -1.06, 0.071, 0.008), ("Clock minute hand", 0.85, 0.10, 0.005)):
    hand = box(name, math.sin(angle) * length / 2, math.cos(angle) * length / 2, -0.032,
               width, length, 0.002, espresso, clock, 0.001)
    hand.rotation_euler.y = angle

speaker_cloth = material("Woven speaker cloth", "4a4439", 0.93)
for x, z, yaw, wall in ((-half_w + 0.18, 2.77, math.pi / 2, left),
                        (3.11, half_d - 0.18, math.pi, back)):
    speaker = empty("Café wall speaker", x, 2.23, z, wall)
    speaker.rotation_euler.z = yaw
    box("Speaker cabinet", 0, 0, 0, 0.222, 0.321, 0.145, oak_edge, speaker, 0.019)
    box("Speaker grille", 0, 0, 0.075, 0.193, 0.284, 0.019, speaker_cloth, speaker, 0.014)
    for dy, radius in ((-0.046, 0.062), (0.073, 0.031)):
        driver = cylinder("Speaker driver embossing", 0, dy, 0.083, radius, 0.007,
                          espresso, speaker, sides=28)
        driver.rotation_euler.x = math.pi / 2
    box("Speaker walnut badge", 0, -0.126, 0.087, 0.053, 0.011, 0.003,
        bronze, speaker, 0.001)


p = props["notebook"]
notebook = empty("Notebook", p["x"], p["y"], p["z"])
binding = material("Weathered field journal leather", "6c5036", 0.74)
page_edges = material("Cut paper edges", "c3a986", 0.86)
stamping = material("Oxidized gilt", "b59760", 0.69)
box("Notebook back cover", 0.101, -0.015, 0, 0.206, 0.012, 0.291,
    binding, notebook, 0.005)
box("Notebook right paper", 0.102, -0.001, 0, 0.190, 0.021, 0.275,
    paper, notebook, 0.003)
for i in range(5):
    y = -0.010 + 0.0038 * i
    box("Cut edges of paper gatherings", 0.1965, y, -0.001,
        0.0007, 0.00065, 0.267, page_edges, notebook)
cover = empty("NotebookCover", 0, 0.002, 0, notebook)
box("Notebook front cover", 0.103, 0.014, 0, 0.21, 0.010, 0.292,
    binding, cover, 0.005)
box("Notebook cloth spine", 0.003, 0.001, 0, 0.015, 0.035, 0.288,
    binding, notebook, 0.006)
for x in (0.033, 0.181):
    box("Blind-stamped cover rule", x, 0.0195, 0, 0.0014, 0.00045, 0.233,
        stamping, cover)
for z in (-0.116, 0.116):
    box("Blind-stamped cover rule", 0.107, 0.0195, z, 0.149, 0.00045, 0.0014,
        stamping, cover)
box("Pressed cloth label", 0.108, 0.0196, -0.040, 0.127, 0.001, 0.046,
    page_edges, cover, 0.002)
left_pages = empty("NotebookLeft", parent=notebook)
box("Left paper stack", -0.103, 0.001, 0, 0.190, 0.018, 0.275, paper, left_pages, 0.003)
leaf = empty("NotebookPage", 0, 0.016, 0, notebook)
page_profile = [(0.009, 0), (0.045, 0.0025), (0.086, 0.0045),
                (0.129, 0.0045), (0.169, 0.0035), (0.196, 0.001)]
page_vertices = [coords(x, y + side, z) for x, y in page_profile
                 for side, z in ((0, -0.136), (0, 0.136), (0.001, 0.136), (0.001, -0.136))]
page_faces = [(0, 1, 2, 3)]
for start in range(0, len(page_vertices) - 4, 4):
    for edge in range(4):
        a, b = start + edge, start + (edge + 1) % 4
        page_faces.append((a, a + 4, b + 4, b))
page_faces.append(tuple(range(len(page_vertices) - 1, len(page_vertices) - 5, -1)))
turning_sheet = mesh_object("Curved turning paper", leaf, page_vertices, page_faces, [paper])
for face in turning_sheet.data.polygons:
    face.use_smooth = face.index % 4 in (1, 3)
for x in (-0.101, 0.102):
    for i in range(5):
        box("Ruled ink", x, 0.0105, -0.068 + i * 0.028, 0.127 - 0.01 * (i % 3),
            0.0005, 0.0015, page_edges, left_pages if x < 0 else notebook)
mug = empty("Window mug", -2.08, 0.80, -3.19)
mug.scale = (1.32, 1.32, 1.32)
cup("Window mug ceramic", mug)
cylinder("Window coffee", -2.08, 0.914, -3.19, 0.060, 0.003, oak_edge, sides=40)
bpy.ops.mesh.primitive_torus_add(
    major_segments=20, minor_segments=8, location=coords(-2.152, 0.86, -3.19),
    rotation=(math.pi / 2, 0, 0), major_radius=0.040, minor_radius=0.010,
)
finish(bpy.context.object, "Mug handle", sand, None)

laptop = props["laptop"]
computer = empty("Laptop", laptop["x"], laptop["y"], laptop["z"])
box("Machined laptop base", 0, -0.015, 0.137, 0.377, 0.017, 0.275,
    case, computer, 0.006)
box("Recessed keyboard deck", 0, -0.0055, 0.099, 0.318, 0.004, 0.141,
    keys, computer, 0.003)
for row in range(5):
    for column in range(14):
        if row == 4 and 3 <= column <= 10:
            continue
        box("Keycap", (column - 6.5) * 0.022, -0.001, 0.047 + row * 0.026,
            0.019, 0.003, 0.020, key_top, computer, 0.001, bevel_segments=1)
box("Space bar", 0, -0.001, 0.151, 0.17, 0.003, 0.020, key_top, computer, 0.001, bevel_segments=1)
box("Trackpad edge", 0, -0.006, 0.217, 0.147, 0.002, 0.085, keys, computer, 0.003)
box("Glass trackpad", 0, -0.0048, 0.217, 0.143, 0.002, 0.081,
    case, computer, 0.003)
for z in (0.032, 0.059, 0.086):
    box("Port opening", -0.188, -0.014, z, 0.002, 0.004, 0.011, keys, computer, 0.001)
hinge = empty("LaptopHinge", 0, 0.004, 0, computer)
box("Hinge barrel", 0, -0.004, 0.009, 0.306, 0.011, 0.017, case, computer, 0.004)
box("Lid", 0, 0, 0.135, 0.377, 0.009, 0.27, case, hinge, 0.004)
box("Display bezel", 0, -0.0055, 0.135, 0.369, 0.002, 0.263, keys, hinge, 0.002)
box("Display glass", 0, -0.0066, 0.133, 0.343, 0.001, 0.235, display, hinge, 0.002)
for row, widths in enumerate(((0.033, 0.047, 0.031), (0.055, 0.071),
                              (0.024, 0.050, 0.013), (0.061, 0.027), (0.022,))):
    x = -0.147
    for width in widths:
        box("Terminal text", x + width / 2, -0.0073, 0.221 - row * 0.016,
            width, 0.0005, 0.003, ink, hinge)
        x += width + 0.006

p = props["charger"]
charger = empty("Charger", p["x"], p["y"], p["z"])
box("Power brick", -0.11, 0.019, -0.08, 0.12, 0.045, 0.073, espresso, charger, 0.006)
box("Charge indicator", -0.106, 0.044, -0.08, 0.026, 0.008, 0.012, ink, charger)
for name, points in (
    ("CableLoose", [(-0.11, 0.024, -0.05), (-0.10, 0.017, 0.05), (-0.07, 0.017, 0.091),
                    (0.009, 0.02, 0.079), (0.028, 0.023, 0.041)]),
    ("CablePlugged", [(-0.11, 0.024, -0.05), (-0.09, 0.016, 0.03), (-0.027, 0.015, 0.073),
                       (0.06, 0.015, 0.036), (0.144, 0.013, -0.091), (0.211, -0.017, -0.134)]),
):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.008
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, position in zip(spline.bezier_points, points):
        point.co = coords(*position)
        point.handle_left_type = point.handle_right_type = "AUTO"
    group = empty(name, parent=charger)
    obj = bpy.data.objects.new("Charging cable", curve)
    SCENE.collection.objects.link(obj)
    finish(obj, "Charging cable", espresso, group)
    box("Connector", *points[-1], 0.026, 0.018, 0.038, espresso, group, 0.004)

p = props["cat"]
cat = empty("Miso", p["x"], p["y"], p["z"])
cushion = box("Cat cushion", p["x"], 0.066, p["z"], 0.70, 0.135, 0.56, olive, bevel=0.055)
for modifier in list(cushion.modifiers):
    bpy.ops.object.modifier_apply(modifier=modifier.name)
miso_open_eyes = build_miso(cat, empty, material)


street_group = empty("Street")
far_street = empty("FarStreet", parent=street_group)
box("Road", 0, -0.19, -9, 44, 0.20, 14, street, street_group)
box("Near sidewalk", 0, -0.09, -4.5, 36, 0.19, 1.58, sand, street_group)
box("Far sidewalk", 0, -0.09, -9, 40, 0.19, 1.48, sand, street_group)
for z in (-5.23, -8.29):
    box("Stone curb", 0, -0.035, z, 38, 0.13, 0.14, grout, street_group, 0.014)
for x in range(-14, 16, 3):
    box("Road marking", x, -0.087, -6.74, 1.08, 0.002, 0.05, sand, street_group)

roof_tile = material("Weathered charcoal roof tile", "554f46", 0.82)
stone_courses = [material(f"Street limestone {i}", color) for i, color in enumerate(
    ["ae9f88", "bfb09a", "a99a83", "c5b49b", "a39784"])]
timber = material("Weathered cedar", "6e5038", 0.83)
street_frames = material("Patinated window metal", "4c473d", 0.61)
street_glass = [material(f"Deep street glass {i}", color, 0.32) for i, color in enumerate(
    ["374044", "525654", "2d3338"])]
street_rng = random.Random(872)


def tiled_roof(name, x, y, z, width, depth, height):
    """Tiled eaves with a slight concave rise and a dark rolled edge."""
    vertices, faces = [], []
    half_width, half_depth = width / 2, depth / 2
    divisions = max(8, round(width / 0.16))
    slope_segments = 3
    arch_segments = 4
    row_stride = arch_segments + 1

    def ridge(px, t):
        end_rise = 0.18 * (abs(px) / half_width) ** 4
        return y + height * (1 - t) ** 1.36 + end_rise * t ** 2

    for side in (-1, 1):
        for i in range(divisions):
            px = -half_width + (i + 0.5) * width / divisions
            rad = width / divisions * 0.5
            base = len(vertices)
            for row in range(slope_segments + 1):
                t = row / slope_segments
                for segment in range(row_stride):
                    angle = math.pi * segment / arch_segments
                    vertices.append(coords(x + px + math.cos(angle) * rad,
                                           ridge(px, t) + math.sin(angle) * rad * 0.49,
                                           z + side * half_depth * t))
            for row in range(slope_segments):
                for segment in range(arch_segments):
                    a = base + row * row_stride + segment
                    face = (a, a + 1, a + 1 + row_stride, a + row_stride)
                    faces.append(face if side > 0 else tuple(reversed(face)))
    obj = mesh_object(name, far_street, vertices, faces, [roof_tile])
    for face in obj.data.polygons:
        face.use_smooth = True
    tube("Ridge cap", far_street, (coords(x - half_width, y + height + 0.043, z),
                                   coords(x + half_width, y + height + 0.043, z)),
         (0.09, 0.09), roof_tile, sides=8)


def street_window(x, y, z, width, height, panes=2, parent=far_street):
    box("Recessed sash", x, y, z, width + 0.095, height + 0.093, 0.089,
        street_frames, parent, 0.009, bevel_segments=1)
    for i in range(panes):
        px = x + ((i + 0.5) / panes - 0.5) * width
        box("Window reflection", px, y, z + 0.049, width / panes - 0.019,
            height - 0.035, 0.012, street_glass[i % 3], parent)
    box("Mineral sill", x, y - height / 2 - 0.027, z + 0.042,
        width + 0.18, 0.065, 0.20, stone_courses[2], parent, 0.006, bevel_segments=1)


def stone_wall(x, z, width, height):
    columns, rows = max(1, round(width / 0.72)), max(1, round(height / 0.30))
    for row in range(rows):
        cuts = [0, *[width * (i + (row % 2) * 0.52) / columns
                     + street_rng.uniform(-0.056, 0.056) for i in range(1, columns)], width]
        for start, end in zip(cuts, cuts[1:]):
            w = end - start
            box("Coursed limestone", x + (start + end - width) / 2,
                height * (row + 0.5) / rows, z + street_rng.uniform(-0.014, 0.014),
                w - 0.009, height / rows - 0.009, 0.28,
                street_rng.choice(stone_courses), far_street, 0.013, bevel_segments=1)


# A brick residence stands behind a covered stone wall. A timber gate and the
# right-hand slope give the lane distinct landmarks from the window and door.
stone_wall(-5.57, -8.97, 9.0, 1.53)
tiled_roof("Wall coping tiles", -5.57, 1.48, -8.97, 9.16, 0.55, 0.14)
box("Residential brick villa", -4.25, 2.65, -12.35, 6.45, 5.30, 4.9, facades[0], far_street)
box("Villa cream lintel", -4.25, 3.84, -9.85, 6.46, 0.28, 0.15,
    stone_courses[3], far_street, 0.012)
for x, w in ((-6.54, 1.03), (-4.85, 1.66), (-2.62, 1.58)):
    street_window(x, 3.16, -9.83, w, 0.94, 3)
for x in (-5.34, -2.82):
    street_window(x, 4.63, -9.83, 0.94, 0.74)
tiled_roof("Villa pitched roof", -4.25, 5.24, -12.35, 6.68, 5.25, 0.95)
box("Villa service door", -5.94, 1.11, -9.82, 1.09, 2.17, 0.09, timber, far_street, 0.012)

gate_x, gate_z = -0.13, -9.06
box("Gate stone return", -0.92, 0.82, gate_z, 0.33, 1.64, 0.35,
    stone_courses[0], far_street, 0.015)
box("Gate stone return", 0.67, 0.82, gate_z, 0.33, 1.64, 0.35,
    stone_courses[1], far_street, 0.015)
for x in (-0.87, 0.60):
    box("Cedar gate column", x, 1.12, gate_z + 0.13, 0.17, 2.24, 0.21,
        timber, far_street, 0.015)
box("Gate headbeam", gate_x, 2.20, gate_z + 0.10, 1.73, 0.19, 0.23,
    timber, far_street, 0.016)
for i in range(12):
    box("Gate cedar plank", gate_x + (i - 5.5) * 0.108, 0.97, gate_z + 0.17,
        0.104, 1.88, 0.085, timber, far_street, 0.007)
for x in (-0.28, 0.04):
    box("Gate lock plate", x, 1.02, gate_z + 0.23, 0.086, 0.15, 0.022,
        bronze, far_street, 0.009)
tiled_roof("Cedar gate tiled awning", gate_x, 2.21, gate_z, 2.13, 0.99, 0.31)

box("Small stucco house", 0.31, 1.78, -13.18, 3.16, 3.56, 3.95, facades[1], far_street)
tiled_roof("Small house pitched roof", 0.31, 3.51, -13.18, 3.48, 4.26, 0.63)
street_window(0.36, 2.72, -11.16, 1.34, 0.76, 3)
street_window(1.10, 1.46, -11.16, 0.74, 0.91)
box("Corner villa brick", 7.56, 2.42, -12.48, 4.40, 4.84, 5.27, facades[3], far_street)
box("Corner villa stone plinth", 7.56, 0.68, -9.8, 4.44, 1.36, 0.17,
    stone_courses[1], far_street, 0.010)
tiled_roof("Corner villa tile roof", 7.56, 4.82, -12.48, 4.71, 5.54, 0.54)
lane_elevation = empty("Corner villa lane elevation", 5.34, 0, -12.47, far_street)
lane_elevation.rotation_euler.z = -math.pi / 2
street_window(-1.06, 2.77, 0, 0.94, 0.89, parent=lane_elevation)
street_window(0.85, 3.54, 0, 0.64, 0.64, parent=lane_elevation)
box("Side entry lintel", 1.21, 2.37, 0.049, 1.06, 0.13, 0.16,
    stone_courses[2], lane_elevation, 0.012)
box("Recessed lane service door", 1.21, 1.45, 0.016, 0.79, 1.78, 0.069,
    timber, lane_elevation, 0.009)
cylinder("Roof downpipe", -1.77, 2.18, 0.082, 0.031, 4.16,
         street_frames, lane_elevation, sides=12)
for x, y, w, h in ((6.14, 3.23, 1.42, 0.86), (8.46, 3.23, 1.54, 0.86),
                   (8.44, 1.86, 1.27, 0.80), (6.83, 4.21, 0.78, 0.52)):
    street_window(x, y, -9.78, w, h, 3)
box("Corner villa front door", 6.08, 0.94, -9.71, 0.78, 1.87, 0.085,
    timber, far_street, 0.016)
stone_wall(10.52, -9.56, 1.56, 1.35)
tiled_roof("Garden wall coping", 10.52, 1.34, -9.56, 1.68, 0.52, 0.13)
# Continue both ends of the block through the oblique indoor sight lines.
for x, z, w, h, facade in ((-12.35, -12.5, 7.4, 4.24, 1),
                            (-18.28, -14.4, 4.8, 5.1, 2),
                            (13.62, -13.56, 6.82, 4.31, 4),
                            (19.31, -15.22, 4.52, 5.44, 1)):
    box("Neighbouring house", x, h / 2, z, w, h, 4.3, facades[facade], far_street)
    tiled_roof("Neighbour roof", x, h - 0.015, z, w + 0.2, 4.55, 0.62)
    street_window(x - 0.89, h - 1.14, z + 2.18, 1.17, 0.87)
    street_window(x + w * 0.27, 1.96, z + 2.18, 0.77, 1.12)

lane = box("Rising side lane", 3.38, 0.60, -16.27, 3.58, 0.12, 12.5, street, far_street)
lane.rotation_euler.x = 0.105
for x in (1.67, 5.09):
    edge = box("Uphill gutter", x, 0.625, -16.27, 0.10, 0.07, 12.5,
               stone_courses[2], far_street)
    edge.rotation_euler.x = 0.105
for x in (1.82, 4.95):
    shoulder = box("Uphill lane edge marking", x, 0.662, -16.27, 0.035, 0.003, 12.2,
                   sand, far_street)
    shoulder.rotation_euler.x = 0.105
box("Upper road landform", 3.45, 0.68, -25.1, 26, 1.39, 9.0, stone_courses[2], far_street)

for index, (x, z, w, height) in enumerate((
        (-1.52, -19.54, 3.58, 5.20), (6.64, -18.24, 3.00, 4.80),
        (2.79, -25.57, 3.88, 5.30), (6.07, -26.10, 2.84, 6.90),
        (-0.35, -26.64, 3.00, 7.15), (10.53, -23.8, 4.16, 5.3))):
    base = 0.67 if index < 2 else 1.35
    box("Uphill residence", x, base + height / 2, z, w, height, 4.12,
        facades[(index + 1) % 5], far_street)
    tiled_roof("Uphill tile roof", x, base + height, z, w + 0.18, 4.36, 0.55)
    for floor in range(int(height // 1.5)):
        street_window(x - w * 0.24, base + 1.06 + floor * 1.48, z + 2.08, 0.71, 0.70)
        street_window(x + w * 0.23, base + 1.06 + floor * 1.48, z + 2.08, 0.77, 0.72)
for step in range(5):
    box("Concrete exterior stair", 5.28, 0.31 + step * 0.112, -13.4 - step * 0.24,
        0.91, 0.13, 0.27, stone_courses[1], far_street, 0.012)

wire = material("Utility cable rubber", "454441", 0.87)
for x, z, y in ((4.82, -10.9, 0.13), (5.28, -15.63, 0.63), (4.96, -21.22, 1.15)):
    tube("Concrete utility pole", far_street,
         (coords(x, y, z), coords(x + 0.075, y + 4.38, z - 0.028)),
         (0.086, 0.058), stone_courses[0], sides=8)
    box("Utility crossbar", x, y + 4.12, z, 0.62, 0.052, 0.09, wire, far_street)
for (x1, z1, y1), (x2, z2, y2) in (
        ((4.82, -10.9, 4.25), (5.28, -15.63, 4.75)),
        ((5.28, -15.63, 4.75), (4.96, -21.22, 5.27)),
        ((4.82, -10.9, 4.25), (-2.56, -11.65, 4.53))):
    for d in (-0.22, 0.06, 0.25):
        points = [coords(x1 + (x2 - x1) * t + d,
                         y1 + (y2 - y1) * t - 0.31 * math.sin(t * math.pi),
                         z1 + (z2 - z1) * t) for t in (0, 0.2, 0.4, 0.6, 0.8, 1)]
        tube("Sagging aerial cable", far_street, points, [0.009] * len(points), wire, sides=5)

bark = material("Plane tree bark", "594536", 0.82)
tree_rng = random.Random(479)
autumn = [material(f"Autumn leaf {i}", color, 0.70) for i, color in enumerate(
    ["6b7137", "877b3d", "a79046", "686c3b", "8f7438", "5e6437"])]


def plane_tree(x, z, scale, lean, density, low_canopy=False):
    def tree_point(px, py, pz):
        return coords(x + px * scale, py * scale, z + pz * scale)

    stem = [(-0.08, -0.03, 0), (0.03, 0.48, 0.035), (0.10, 0.96, 0.09),
            (lean * 0.38, 1.57, 0.15), (lean * 0.71, 2.27, 0.24),
            (lean, 3.03, 0.31), (lean * 1.18, 3.76, 0.30), (lean * 1.39, 4.50, 0.27)]
    tube("Curved plane tree trunk", street_group, [tree_point(*point) for point in stem],
         [scale * radius for radius in (0.26, 0.196, 0.165, 0.144, 0.113, 0.080, 0.046, 0.016)],
         bark, sides=14, flutes=0.16)

    for i in range(5):
        angle = 0.72 + i * 2.39996
        dx, dz = math.cos(angle), math.sin(angle)
        tube("Exposed plane tree root", street_group, [
            tree_point(0.0, 0.27, 0), tree_point(dx * 0.21, 0.085, dz * 0.21),
            tree_point(dx * 0.44, 0.01, dz * 0.44), tree_point(dx * 0.67, -0.018, dz * 0.67),
        ], [0.106 * scale, 0.078 * scale, 0.039 * scale, 0.006 * scale], bark, sides=7, flutes=0.10)

    vertices, faces = [], []
    for i in range(13):
        lower = low_canopy and i in (0, 3, 5)
        origin = Vector(stem[3 if lower else 4 + i % 3])
        rise = 0.66 if lower else 1
        angle = i * 2.39996 + tree_rng.uniform(-0.23, 0.23)
        direction = Vector((math.cos(angle), 0, math.sin(angle)))
        length = tree_rng.uniform(1.08, 2.55) * (1 - 0.07 * (i % 3))
        middle = origin + direction * (length * 0.41) + Vector((0, 0.39 * rise, 0))
        elbow = origin + direction * (length * 0.77) + Vector((0, 0.76 * rise, 0))
        end = origin + direction * length + Vector((0, (1.16 + (i % 4) * 0.12) * rise, 0))
        points = [origin, middle, elbow, end]
        tube("Swept scaffold branch", street_group, [tree_point(*point) for point in points],
             [scale * radius for radius in (0.074, 0.049, 0.026, 0.005)], bark, sides=9, flutes=0.13)
        for j in range(4):
            twig_root = points[1 + j // 2].lerp(points[2 + j // 2], 0.18 + 0.52 * (j % 2))
            fork_angle = angle + (-1 if j % 2 else 1) * tree_rng.uniform(0.54, 1.42)
            twig = Vector((math.cos(fork_angle), 0, math.sin(fork_angle)))
            twig_len = tree_rng.uniform(0.42, 0.94)
            tip = twig_root + twig * twig_len + Vector((0, 0.39 + j * 0.07, 0))
            joint = twig_root.lerp(tip, 0.56) + Vector((0, -0.09, 0))
            tube("Forked plane tree twig", street_group,
                 [tree_point(*point) for point in (twig_root, joint, tip)],
                 [scale * radius for radius in (0.021, 0.011, 0.0027)], bark, sides=6, flutes=0.10)
            for _ in range(density):
                leaf_angle = tree_rng.uniform(0, math.tau)
                spread = math.sqrt(tree_rng.random()) * (0.43 + 0.15 * (j % 2))
                delta = Vector((math.cos(leaf_angle) * spread, tree_rng.gauss(0, 0.15),
                                math.sin(leaf_angle) * spread))
                location = tip.lerp(joint, tree_rng.uniform(-0.18, 0.43)) + delta
                heading = leaf_angle + tree_rng.uniform(-1.4, 1.4)
                axis = coords(math.cos(heading), tree_rng.uniform(-0.58, 0.46), math.sin(heading))
                length = scale * tree_rng.uniform(0.092, 0.191)
                blade(vertices, faces, tree_point(*location), axis, length,
                      length * tree_rng.uniform(0.31, 0.49), tree_rng.uniform(-0.56, 0.56), bend=0.18)

    canopy = mesh_object("Plane tree canopy", street_group, vertices, faces, autumn)
    hues = [tree_rng.choices(range(len(autumn)), weights=[3, 3, 3, 3, 2, 4])[0]
            for _ in range(len(vertices) // 11)]
    for face in canopy.data.polygons:
        face.material_index = hues[face.index // 8]
        face.use_smooth = True


plane_tree(-3.91, -5.18, 1.00, 0.87, 26, low_canopy=True)
plane_tree(0.96, -8.70, 0.70, -0.42, 11)
plane_tree(8.29, -8.73, 0.78, -0.48, 13)


avatar = empty("Visitor")
torso = empty("VisitorTorso", parent=avatar)
box("Sweater", 0, 0.94, 0, 0.33, 0.42, 0.23, shirt, torso, 0.025)
box("Head", 0, 1.30, -0.01, 0.265, 0.28, 0.235, skin, torso, 0.025)
box("Hair", 0, 1.452, 0.004, 0.29, 0.096, 0.26, espresso, torso, 0.018)
box("Hair at back", 0, 1.32, 0.108, 0.28, 0.21, 0.08, espresso, torso, 0.016)
for i, x in enumerate((-0.091, 0.091)):
    box("Eye", x * 0.62, 1.32, -0.131, 0.028, 0.028, 0.008, espresso, torso)
    leg = empty(f"VisitorLeg{i}", x, 0.73, 0, avatar)
    box("Trouser leg", 0, -0.32, 0, 0.14, 0.63, 0.145, pants, leg, 0.015)
    box("Shoe", 0, -0.67, -0.04, 0.16, 0.13, 0.24, espresso, leg, 0.015)
    box("Sleeve", x * 2.4, 0.93, 0, 0.108, 0.31, 0.14, shirt, torso, 0.013)
    box("Hand", x * 2.4, 0.75, 0, 0.095, 0.11, 0.11, skin, torso, 0.012)


world = bpy.data.worlds.new("Afternoon sky")
SCENE.world = world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.75, 0.83, 1.0, 1)
background.inputs["Strength"].default_value = 0.36


def light(name, kind, position, target, energy, color, size):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "SUN":
        data.angle = size
    else:
        data.shape = "DISK"
        data.size = size
    obj = bpy.data.objects.new(name, data)
    SCENE.collection.objects.link(obj)
    obj.location = coords(*position)
    obj.rotation_euler = (Vector(coords(*target)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return obj


sun = light("Afternoon sun", "SUN", (-5, 8.6, -9), (0, 0, 1), 3.5, (1.0, 0.87, 0.70), 0.038)
light("Cool window sky", "AREA", (-1.1, 2.65, -3.78), (-0.4, 0.6, 1),
      185, (0.78, 0.87, 1.0), 4.8)
for x, z in ((-0.22, -0.95), (-0.22, 0.75), (3.74, -0.69), (3.74, 1.0)):
    light("Pendant downlight", "AREA", (x, 2.095, z), (x, 0.8, z),
          51 if x > 0 else 40, (1.0, 0.77, 0.50), 0.25)

for z in (-1.16, 0.45):
    light("Service shelf accent", "AREA", (4.67, 2.73, z), (5.17, 1.35, z),
          19, (1.0, 0.82, 0.58), 0.16)

light("Banquette lamp pool", "AREA", (-5.12, 1.34, 1.91), (-4.84, 0.55, 1.43),
      12, (1.0, 0.76, 0.48), 0.15)
light("Window reading lamp pool", "AREA", (1.08, 1.04, -3.32), (1.08, 0.8, -3.02),
      4, (1.0, 0.79, 0.53), 0.10)
for name, x, y, z in table_lamps:
    light(f"{name} pool", "AREA", (x, y + 0.178, z), (x, y, z),
          2.4, (1.0, 0.78, 0.51), 0.13)

SCENE.render.engine = "CYCLES"
SCENE.cycles.samples = 24
SCENE.cycles.use_denoising = True
SCENE.render.resolution_x = 1180
SCENE.render.resolution_y = 680
SCENE.render.resolution_percentage = 100
SCENE.view_settings.view_transform = "AgX"
SCENE.render.image_settings.file_format = "JPEG"
SCENE.render.image_settings.quality = 89
# Blender writes enabled stamp fields into JPEG metadata even without a visible stamp.
for prop in SCENE.render.bl_rna.properties:
    if prop.identifier.startswith("use_stamp_"):
        setattr(SCENE.render, prop.identifier, False)


def camera(name, x, y, z, yaw, pitch):
    data = bpy.data.cameras.new(name)
    data.sensor_fit = "VERTICAL"
    data.angle_y = math.radians(62)
    obj = bpy.data.objects.new(name, data)
    SCENE.collection.objects.link(obj)
    obj.location = coords(x, y, z)
    forward = (-math.sin(yaw) * math.cos(pitch), math.sin(pitch),
               -math.cos(yaw) * math.cos(pitch))
    obj.rotation_euler = Vector(coords(*forward)).to_track_quat("-Z", "Y").to_euler()
    return obj


seat = LAYOUT["seat"]
stand = LAYOUT["stand"]
studies = {
    "window-seat": camera("01 Window seat", seat["x"], seat["eye"], seat["z"], seat["yaw"], seat["pitch"]),
    "standing-turn": camera("02 Standing turn", stand["x"], stand["eye"], stand["z"], -2.45, -0.17),
}

# The source keeps individual parts and the preview poses. Export batches use the same mesh data.
hidden_in_stills = [avatar, *avatar.children_recursive, carried, *carried.children_recursive,
                    left_pages, *left_pages.children_recursive, leaf, *leaf.children_recursive,
                    bpy.data.objects["CablePlugged"], *bpy.data.objects["CablePlugged"].children_recursive,
                    bpy.data.objects["Charge indicator"], bpy.data.objects["PourStream"],
                    *miso_open_eyes.children_recursive]
for obj in hidden_in_stills:
    obj.hide_render = True


def bake_floor_contact():
    """Bake fixed furniture contact into a second, room-wide floor UV set."""
    width, depth = room["width"], room["depth"]
    image = bpy.data.images.new("Floor contact", width=384, height=256)
    image.colorspace_settings.name = "Non-Color"
    proxy_mat = material("Floor bake target", "ffffff")
    target = proxy_mat.node_tree.nodes.new("ShaderNodeTexImage")
    target.image = image
    proxy_mat.node_tree.nodes.active = target
    bpy.ops.mesh.primitive_plane_add(size=2, location=coords(0, 0.005, 0))
    proxy = bpy.context.object
    proxy.scale = (width / 2, depth / 2, 1)
    proxy.data.materials.append(proxy_mat)
    SCENE.cycles.samples = 24
    bpy.ops.object.bake(type="AO", margin=3)
    bpy.data.objects.remove(proxy, do_unlink=True)
    bpy.data.materials.remove(proxy_mat)
    image.pack()

    uv = tile_mesh.data.uv_layers.new(name="Floor contact UV")
    for loop in tile_mesh.data.loops:
        p = tile_mesh.matrix_world @ tile_mesh.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (p.x / width + 0.5, p.y / depth + 0.5)

    gltf_output = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    gltf_output.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    for mat in clay:
        nodes = mat.node_tree.nodes
        coords_node = nodes.new("ShaderNodeUVMap")
        coords_node.uv_map = uv.name
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        output = nodes.new("ShaderNodeGroup")
        output.node_tree = gltf_output
        mat.node_tree.links.new(coords_node.outputs["UV"], tex.inputs["Vector"])
        mat.node_tree.links.new(tex.outputs["Color"], output.inputs["Occlusion"])


apply_surfaces(SCENE)
bake_floor_contact()
bake_room_bounce(OUTPUT / "room-irradiance.png", sun, (
    avatar, carried, door, hinge, notebook, water_station, cat,
    bpy.data.objects["CableLoose"], bpy.data.objects["CablePlugged"],
    bpy.data.objects["ShelfAtlas"],
))
SCENE.camera = studies["window-seat"]
SCENE.render.filepath = "//../public/studies/window-seat.jpg"
# Avoid saving machine-specific file browser state in the editable source.
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type == "FILE_BROWSER" and space.params:
                space.params.directory = b"//"
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "scene/cafe.blend"), compress=True)

if "--skip-stills" not in sys.argv:
    for name, view in studies.items():
        SCENE.camera = view
        SCENE.render.filepath = f"//../public/studies/{name}.jpg"
        bpy.ops.render.render(write_still=True)


def batch_meshes():
    """Merge same-material static siblings without flattening visibility or pivot groups."""
    excluded = {obj.name for obj in hidden_in_stills} | {"CupWater"}
    groups = {}
    for obj in list(SCENE.objects):
        if (obj.type == "MESH" and len(obj.data.materials) == 1
                and obj.name not in excluded and not obj.get("placement_surface")
                and not obj.get("placement_ignore")):
            key = (obj.parent, obj.data.materials[0], obj.get("irradianceUv"))
            groups.setdefault(key, []).append(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for (parent, mat, _), objects in groups.items():
        if len(objects) < 3:
            continue
        for obj in objects:
            bpy.context.view_layer.objects.active = obj
            for modifier in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"{parent.name if parent else 'Room'} | {mat.name}"
        joined.select_set(False)


def export_runtime_glb(path, **settings):
    """Write a lossless gzip stream of the self-contained GLB."""
    with TemporaryDirectory() as directory:
        model = Path(directory) / path.with_suffix(".glb").name
        bpy.ops.export_scene.gltf(filepath=str(model), export_format="GLB",
                                  use_selection=True, export_yup=True, **settings)
        with model.open("rb") as source, path.open("wb") as output:
            with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0) as packed:
                shutil.copyfileobj(source, packed)


def remove_unused_export_uvs():
    """Drop UVs for constant materials after saving the editable scene."""
    for obj in SCENE.objects:
        if obj.type != "MESH" or "irradianceUv" in obj:
            continue
        if any(mat and mat.use_nodes and any(node.type == "TEX_IMAGE" for node in mat.node_tree.nodes)
               for mat in obj.data.materials):
            continue
        for layer in list(obj.data.uv_layers):
            obj.data.uv_layers.remove(layer)


remove_unused_export_uvs()
batch_meshes()
bpy.ops.object.select_all(action="DESELECT")
far_members = {far_street, *far_street.children_recursive}
for obj in SCENE.objects:
    if obj.type not in {"LIGHT", "CAMERA"} and obj not in far_members:
        obj.select_set(True)
export_runtime_glb(OUTPUT / "cafe.glbz", export_extras=True,
                   export_image_format="JPEG", export_image_quality=92)
bpy.ops.object.select_all(action="DESELECT")
for obj in far_members:
    obj.select_set(True)
export_runtime_glb(OUTPUT / "street.glbz",
                   export_image_format="JPEG", export_image_quality=92)


def export_depth_street():
    """Bake far façades straight on, then reconstruct their relief from an orthographic depth grid."""
    far_objects = [o for o in far_street.children_recursive if o.type == "MESH"]
    points, polygons = [], []
    for obj in far_objects:
        start = len(points)
        points.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
        polygons.extend(tuple(start + i for i in face.vertices) for face in obj.data.polygons)
    tree = BVHTree.FromPolygons(points, polygons)
    for obj in SCENE.objects:
        if obj.type in {"MESH", "CURVE"}:
            obj.hide_render = obj not in far_objects

    width, height = 36.0, 8.0
    cx, cy, cz = 0, 3.85, -8.36
    view = camera("Street bake", cx, cy, cz, 0, 0)
    view.data.type = "ORTHO"
    view.data.sensor_fit = "HORIZONTAL"
    view.data.ortho_scale = width
    SCENE.camera = view
    SCENE.render.resolution_x = 1152
    SCENE.render.resolution_y = 256
    SCENE.cycles.samples = 12
    SCENE.render.film_transparent = True
    SCENE.render.image_settings.file_format = "PNG"
    SCENE.render.image_settings.color_mode = "RGBA"
    SCENE.render.image_settings.compression = 100

    with TemporaryDirectory() as directory:
        path = Path(directory) / "street.png"
        SCENE.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(str(path))
        image.pack()

    cols, rows = 144, 32
    verts, uv, faces = [], [], []
    for row in range(rows + 1):
        v = row / rows
        for col in range(cols + 1):
            u = col / cols
            x, y = cx + (u - 0.5) * width, cy + (v - 0.5) * height
            point, *_ = tree.ray_cast(Vector(coords(x, y, cz)), Vector(coords(0, 0, -1)), 24)
            verts.append(coords(x, y, -point.y if point is not None else -10.16))
            uv.append((u, v))
    for row in range(rows):
        for col in range(cols):
            a = row * (cols + 1) + col
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    mesh = bpy.data.meshes.new("Facade relief")
    mesh.from_pydata(verts, [], faces)
    texcoords = mesh.uv_layers.new()
    for loop in mesh.loops:
        texcoords.data[loop.index].uv = uv[loop.vertex_index]
    relief = bpy.data.objects.new("FacadeRelief", mesh)
    SCENE.collection.objects.link(relief)
    mat = material("Baked street", "ffffff")
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    bsdf = nodes.get("Principled BSDF")
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    mat.surface_render_method = "DITHERED"
    relief.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    relief.select_set(True)
    bpy.context.view_layer.objects.active = relief
    export_runtime_glb(STUDIES / "street-depth.glbz")


export_depth_street()
