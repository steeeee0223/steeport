"""Build the café, export its runtime model, and render the first-person studies."""
import json
import math
from pathlib import Path
import random
import sys
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[1]
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


def surface_texture(mat, name, seed, wood=False):
    """Pack a small, tileable color texture into both the source and glTF."""
    size = 128
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    image.colorspace_settings.name = "sRGB"
    rng = random.Random(seed)
    color = mat.diffuse_color
    pixels = []
    for y in range(size):
        v = math.tau * y / size
        for x in range(size):
            u = math.tau * x / size
            if wood:
                warp = 0.55 * math.sin(u) + 0.2 * math.sin(3 * u)
                tone = 1 + 0.14 * math.sin(12 * v + warp) + 0.055 * math.sin(33 * v + warp * 2)
            else:
                tone = 1 + 0.045 * math.sin(4 * u + v) * math.cos(3 * v - u)
            tone += rng.uniform(-0.027, 0.027)
            values = [min(1, c * tone) for c in color[:3]]
            pixels.extend([12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
                           for c in values] + [1])
    image.pixels.foreach_set(pixels)
    image.pack()
    nodes = mat.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    mat.node_tree.links.new(texture.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])


surface_texture(oak, "Oak grain", 23, wood=True)
surface_texture(cream, "Limewash grain", 41)


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


def box(name, x, y, z, w, h, d, mat, parent=None, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=coords(x, y, z))
    obj = finish(bpy.context.object, name, mat, parent)
    obj.dimensions = coords(w, h, -d)
    if bevel:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        edge = obj.modifiers.new("Soft edges", "BEVEL")
        edge.width = bevel
        edge.segments = 2
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
    for i in range(9):
        a = i * 2.39996
        spread = (0.11 + i % 3 * 0.045) * scale
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1,
            radius=1,
            location=coords(math.cos(a) * spread, (0.52 + i % 4 * 0.13) * scale,
                            math.sin(a) * spread),
        )
        leaf = finish(bpy.context.object, "Leaf", leaves[i % 3], group)
        leaf.scale = (0.11 * scale, 0.075 * scale, 0.32 * scale)
        leaf.rotation_euler = (0, 0.32 + i % 3 * 0.2, -a)


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
                         (row + 0.5) * tile_d - half_d, tile_w - 0.009, 0.024,
                         tile_d - 0.009, RANDOM.choice(clay)))
bpy.ops.object.select_all(action="DESELECT")
for tile in tiles:
    tile.select_set(True)
bpy.context.view_layer.objects.active = tiles[0]
bpy.ops.object.join()
tile_mesh = bpy.context.object
tile_mesh.name = "Quarry tiles"

front = empty("WallFront")
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
        b - a, top - bottom, 0.17, mat, front)


for a, b in ((-half_w, window["left"]), (window["right"], entry["left"]),
             (entry["right"], half_w)):
    front_panel(a, b, 0, ceiling, cream, "Street wall pier")
front_panel(window["left"], window["right"], 0, window["sill"], cream, "Window apron")
front_panel(window["left"], window["right"], window["head"], ceiling, cream, "Window header")
front_panel(entry["left"], entry["right"], 2.36, ceiling, cream, "Door header")
for y in (window["sill"], window["head"]):
    box("Window rail", (window["left"] + window["right"]) / 2, y, -half_d,
        window["right"] - window["left"] + 0.08, 0.10, 0.24, trim, front, 0.012)
for x in (window["left"], -2.42, -0.20, window["right"]):
    box("Window mullion", x, 1.68, -half_d, 0.08, 1.66, 0.16, trim, front, 0.01)
for x in (window["left"], window["right"]):
    shutter = empty("Open casement", x, 0, -half_d - 0.02, front)
    sign = -1 if x < 0 else 1
    shutter.rotation_euler.z = sign * math.radians(30)
    for offset in (0, 0.44):
        box("Casement stile", sign * offset, 1.68, 0, 0.055, 1.59, 0.045, trim, shutter)
    for y in (0.91, 2.45):
        box("Casement rail", sign * 0.22, y, 0, 0.44, 0.055, 0.045, trim, shutter)
for x in (entry["left"], entry["right"]):
    box("Door jamb", x, 1.18, -half_d, 0.08, 2.36, 0.23, trim, front)
box("Door lintel", (entry["left"] + entry["right"]) / 2, 2.36, -half_d,
    1.22, 0.085, 0.23, trim, front)


def table(name, rect, height=0.77, desk=False):
    group = empty(name, rect["x"], 0, rect["z"])
    w, d = rect["width"], rect["depth"]
    box("Oak top", 0, height - 0.045, 0, w, 0.09, d, oak, group, 0.027)
    for i in range(1, 5):
        box("Plank seam", 0, height + 0.0003, d * (i / 5 - 0.5),
            w - 0.06, 0.001, 0.005, oak_edge, group)
    for x in (-w / 2 + 0.09, w / 2 - 0.09, *((0,) if desk else ())):
        for z in (-d / 2 + 0.08, d / 2 - 0.08):
            box("Table leg", x, (height - 0.08) / 2, z, 0.083, height - 0.08,
                0.083, oak_edge, group, 0.012)
    return group


def chair(rect):
    group = empty("Chair", rect["x"], 0, rect["z"])
    group.rotation_euler.z = math.radians(rect["yaw"])
    box("Chair seat", 0, 0.455, 0, 0.425, 0.075, 0.425, olive, group, 0.018)
    for x in (-0.17, 0.17):
        for z in (-0.17, 0.17):
            h = 0.86 if z > 0 else 0.43
            box("Chair post", x, h / 2, z, 0.045, h, 0.047, oak_edge, group, 0.008)
    box("Chair back", 0, 0.78, 0.174, 0.37, 0.145, 0.06, oak, group, 0.017)


table("Window desk", LAYOUT["windowDesk"], 0.8, desk=True)
table("Communal table", LAYOUT["communal"])
for rect in LAYOUT["windowChairs"] + LAYOUT["communalChairs"]:
    chair(rect)
for rect in LAYOUT["smallTables"]:
    group = table("Wall table", rect, 0.69)
    cylinder("Coffee cup", 0.12, 0.735, -0.08, 0.055, 0.09, paper, group, top=0.064)
    cylinder("Coffee", 0.12, 0.781, -0.08, 0.047, 0.002, oak_edge, group)
for rect in LAYOUT["benchSeats"]:
    group = empty("Wall booth", rect["x"], 0, rect["z"])
    w, d = rect["width"], rect["depth"]
    box("Booth base", 0, 0.2, 0, w - 0.05, 0.4, d - 0.035, oak_edge, group)
    box("Booth cushion", 0, 0.45, 0, w, 0.14, d, olive, group, 0.042)
    box("Booth back", -0.25, 0.72, 0, 0.14, 0.63, d, olive, group, 0.035)

bar = LAYOUT["bar"]
counter = empty("Long bar", bar["x"], 0, bar["z"])
box("Counter body", 0, 0.52, 0, bar["width"] - 0.06, 1.04, bar["depth"] - 0.06, teal_edge, counter)
for i in range(29):
    box("Glazed counter tile", -0.316, 0.52, (i - 14) * 0.156, 0.032, 0.88, 0.145, teal, counter, 0.006)
box("Countertop", 0, 1.08, 0, bar["width"], 0.11, bar["depth"], oak, counter, 0.022)
box("Brass rail", -0.337, 0.16, 0, 0.025, 0.035, bar["depth"] - 0.10, bronze, counter)
props = LAYOUT["props"]
water_spot = props["water"]
water_station = empty("WaterStation", water_spot["x"], water_spot["y"], water_spot["z"])
carafe = empty("Carafe", 0.11, 0.07, -0.21, water_station)
cylinder("Water carafe", 0, 0.085, 0, 0.105, 0.31, teal, carafe, top=0.078)
cylinder("Carafe cap", 0, 0.255, 0, 0.081, 0.035, bronze, carafe)
water_blue = material("Water", "69aab6", 0.16)


def cup(name, parent):
    # Revolve the cross section to give the ceramic cup a real rim and hollow interior.
    profile = [(0, 0), (0.045, 0), (0.055, 0.095), (0.048, 0.095),
               (0.038, 0.012), (0, 0.012)]
    sides = 20
    verts = [coords(r * math.cos(a * math.tau / sides), y,
                    r * math.sin(a * math.tau / sides))
             for r, y in profile for a in range(sides)]
    faces = [(i * sides + a, (i + 1) * sides + a,
              (i + 1) * sides + (a + 1) % sides, i * sides + (a + 1) % sides)
             for i in range(len(profile) - 1) for a in range(sides)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    SCENE.collection.objects.link(obj)
    finish(obj, name, sand, parent)


bar_cup = empty("BarCup", 0, 0, 0, water_station)
cup("Bar ceramic", bar_cup)
cylinder("Spare water cup", 0.11, 0.048, 0.21, 0.045, 0.095, paper, water_station, top=0.055)
carried = empty("Carried")
carried_cup = empty("CarriedCup", 0.18, 0.01, 0, carried)
cup("Hand ceramic", carried_cup)
cylinder("CupWater", 0, 0.079, 0, 0.046, 0.004, water_blue, carried_cup)
cylinder("PourStream", 0.008, 0.18, 0, 0.012, 0.21, water_blue, water_station)
back_bar = LAYOUT["backBar"]
machine = empty("Service cabinet", back_bar["x"], 0, back_bar["z"])
box("Cabinet", 0, 0.48, 0, back_bar["width"], 0.96, back_bar["depth"], teal_edge, machine, 0.02)
box("Worktop", 0, 0.99, 0, back_bar["width"], 0.07, back_bar["depth"], sand, machine)
box("Espresso machine", 0, 1.24, -1.28, 0.46, 0.44, 0.74, espresso, machine, 0.035)
box("Espresso machine face", -0.239, 1.28, -1.28, 0.025, 0.27, 0.67, bronze, machine, 0.008)
for z in (-1.48, -1.14, -0.51, -0.34, -0.17):
    cylinder("Cup", 0, 1.5 if z < -1 else 1.08, z, 0.06, 0.1, paper, machine)

shelf = LAYOUT["shelf"]
bookcase = empty("Bookcase", shelf["x"], 0, shelf["z"])
w, d = shelf["width"], shelf["depth"]
box("Bookcase back", 0, 1.03, d / 2 - 0.025, w, 2.06, 0.05, oak_edge, bookcase)
for x in (-w / 2 + 0.03, 0, w / 2 - 0.03):
    box("Shelf upright", x, 1.04, 0, 0.065, 2.08, d, oak, bookcase, 0.011)
for y in (0.12, 0.59, 1.06, 1.53, 2.02):
    box("Shelf board", 0, y, 0, w, 0.055, d, oak, bookcase, 0.01)
    if y < 2:
        for i in range(22):
            if i in (4, 5, 10, 15, 16, 20) or (i == 14 and y == 1.06):
                continue
            h = RANDOM.uniform(0.19, 0.36)
            box("Book spine", (i - 10.5) * 0.133, y + 0.028 + h / 2, -0.04,
                RANDOM.uniform(0.055, 0.113), h, 0.24, RANDOM.choice(books), bookcase, 0.007)

def atlas(name, x, y, z, parent=None):
    group = empty(name, x, y, z, parent)
    box("Atlas cloth", 0, 0, 0, 0.162, 0.239, 0.055, books[2], group, 0.009)
    box("Atlas pages", 0.012, 0, 0, 0.132, 0.217, 0.048, paper, group)
    box("Atlas title stamp", 0, 0.051, -0.028, 0.104, 0.038, 0.003, teal_edge, group)
    return group


p = props["shelf"]
atlas("ShelfAtlas", p["x"], p["y"], p["z"])
hand_atlas = atlas("CarriedAtlas", -0.19, 0.07, 0, carried)
hand_atlas.rotation_euler.x = math.radians(-22)

picture = LAYOUT["picture"]
art = empty("Framed print", picture["x"], 1.73, picture["z"])
box("Picture frame", 0, 0, 0, 1.15, 0.81, 0.052, oak_edge, art, 0.018)
box("Paper mat", 0, 0, -0.033, 1.04, 0.70, 0.012, paper, art)
box("Ink field", 0, 0, -0.042, 0.83, 0.50, 0.009, teal, art)
for i, width in enumerate((0.56, 0.44, 0.33, 0.22)):
    box("Printed stripe", 0, -0.16 + i * 0.082, -0.05, width, 0.046, 0.008,
        books[i], art)
plant("Rear floor plant", LAYOUT["plant"]["x"], 0, LAYOUT["plant"]["z"], 1.28)
plant("Window plant", 1.73, 0.8, -3.21, 0.49)
plant("Table plant", -0.22, 0.77, 0.44, 0.4)

for x, z in ((-0.22, -0.95), (-0.22, 0.75), (3.74, -0.69), (3.74, 1.0)):
    cylinder("Pendant cord", x, 2.53, z, 0.013, 0.64, espresso, roof)
    cylinder("Pendant shade", x, 2.21, z, 0.22, 0.18, teal_edge, roof, top=0.08)
    cylinder("Pendant diffuser", x, 2.12, z, 0.185, 0.02, lamp, roof)

p = props["notebook"]
notebook = empty("Notebook", p["x"], p["y"], p["z"])
box("Notebook back cover", 0.101, -0.015, 0, 0.206, 0.012, 0.291, books[1], notebook, 0.004)
box("Notebook right paper", 0.102, -0.002, 0, 0.189, 0.021, 0.275, paper, notebook, 0.003)
cover = empty("NotebookCover", parent=notebook)
box("Notebook front cover", 0.103, 0.018, 0, 0.21, 0.012, 0.292, books[1], cover, 0.004)
box("Notebook title stamp", 0.103, 0.025, -0.043, 0.12, 0.003, 0.043, bronze, cover)
left_pages = empty("NotebookLeft", parent=notebook)
box("Left paper stack", -0.103, -0.001, 0, 0.186, 0.022, 0.274, paper, left_pages)
leaf = empty("NotebookPage", 0, 0.014, 0, notebook)
box("Turning paper", 0.101, 0, 0, 0.191, 0.003, 0.277, paper, leaf)
for x in (-0.101, 0.102):
    for i in range(5):
        box("Ruled ink", x, 0.011, -0.068 + i * 0.028, 0.127 - 0.01 * (i % 3),
            0.001, 0.004, books[3], left_pages if x < 0 else notebook)
cylinder("Window mug", -2.08, 0.86, -3.19, 0.065, 0.12, sand, top=0.076)
cylinder("Window coffee", -2.08, 0.921, -3.19, 0.057, 0.003, oak_edge)
bpy.ops.mesh.primitive_torus_add(
    major_segments=20, minor_segments=8, location=coords(-2.152, 0.86, -3.19),
    rotation=(math.pi / 2, 0, 0), major_radius=0.040, minor_radius=0.010,
)
finish(bpy.context.object, "Mug handle", sand, None)

laptop = props["laptop"]
computer = empty("Laptop", laptop["x"], laptop["y"], laptop["z"])
box("Laptop base", 0, -0.009, 0.184, 0.51, 0.031, 0.372, case, computer, 0.009)
box("Keyboard", 0, 0.006, 0.135, 0.418, 0.012, 0.164, keys, computer, 0.003)
for row in range(4):
    for column in range(12):
        box("Keycap", (column - 5.5) * 0.032, 0.012, 0.078 + row * 0.030,
            0.027, 0.004, 0.024, key_top, computer)
box("Space bar", 0, 0.012, 0.199, 0.166, 0.004, 0.023, key_top, computer)
box("Trackpad", 0, 0.008, 0.285, 0.16, 0.004, 0.092, case, computer)
hinge = empty("LaptopHinge", 0, 0.016, 0, computer)
box("Lid", 0, 0, 0.177, 0.51, 0.018, 0.355, case, hinge, 0.008)
box("Test display", 0, -0.011, 0.181, 0.462, 0.005, 0.302, display, hinge)
for row, width in enumerate((0.23, 0.31, 0.17, 0.27, 0.10)):
    box("Terminal test pattern", (width - 0.36) / 2, -0.015, 0.274 - row * 0.039,
        width, 0.002, 0.012, ink, hinge)

p = props["charger"]
charger = empty("Charger", p["x"], p["y"], p["z"])
box("Power brick", -0.11, 0.019, -0.08, 0.12, 0.045, 0.073, espresso, charger, 0.006)
box("Charge indicator", -0.106, 0.044, -0.08, 0.026, 0.008, 0.012, ink, charger)
for name, points in (
    ("CableLoose", [(-0.11, 0.024, -0.05), (-0.10, 0.017, 0.05), (-0.07, 0.017, 0.091),
                    (0.009, 0.02, 0.079), (0.028, 0.023, 0.041)]),
    ("CablePlugged", [(-0.11, 0.024, -0.05), (-0.09, 0.016, 0.03), (-0.027, 0.015, 0.073),
                       (0.06, 0.015, 0.036), (0.093, 0.013, -0.051), (0.145, 0.0, -0.09)]),
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
ginger = material("Miso ginger", "cf8548")
stripe = material("Miso stripe", "9d512c")
cream_fur = material("Miso cream", "f2d2a0")
box("Cat cushion", p["x"], 0.066, p["z"], 0.70, 0.135, 0.56, olive, bevel=0.055)


def fur(name, x, y, z, dims, mat, parent):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=coords(x, y, z))
    obj = finish(bpy.context.object, name, mat, parent)
    obj.scale = coords(dims[0], dims[1], -dims[2])
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


fur("Miso body", 0, 0.122, 0.022, (0.212, 0.121, 0.161), ginger, cat)
head = empty("MisoHead", 0.109, 0.16, -0.10, cat)
fur("Miso head", 0, 0.031, 0, (0.127, 0.105, 0.103), ginger, head)
fur("Miso muzzle", 0, 0.003, -0.083, (0.072, 0.048, 0.043), cream_fur, head)
fur("Miso nose", 0, 0.026, -0.118, (0.019, 0.013, 0.012), stripe, head)
for x in (-0.069, 0.069):
    ear = cylinder("Miso ear", x, 0.129, 0.013, 0.047, 0.104, ginger, head, top=0, sides=3)
    ear.rotation_euler.y = -math.copysign(0.24, x)
    fur("Miso eye", x * 0.83, 0.059, -0.084, (0.017, 0.009, 0.007), espresso, head)
    fur("Miso paw", x + 0.04, 0.026, -0.156, (0.048, 0.024, 0.065), cream_fur, cat)
tail = empty("MisoTail", -0.153, 0.094, 0.12, cat)
for i in range(9):
    angle = i * 0.22
    fur("Miso curled tail", -math.sin(angle) * 0.13, 0.014 + i * 0.008,
        (1 - math.cos(angle)) * 0.14, (0.038, 0.038, 0.038),
        stripe if i % 3 == 1 else ginger, tail)

def lettering(name, text, x, y, z, mat, parent):
    bpy.ops.object.text_add(location=coords(x, y, z), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = 0.14
    obj.data.space_character = 1.21
    bpy.ops.object.convert(target="MESH")
    finish(bpy.context.object, name, mat, parent)


street_group = empty("Street")
far_street = empty("FarStreet", parent=street_group)
box("Road", 0, -0.19, -9, 44, 0.20, 14, street, street_group)
box("Near sidewalk", 0, -0.09, -4.5, 36, 0.19, 1.58, sand, street_group)
box("Far sidewalk", 0, -0.09, -9, 40, 0.19, 1.48, sand, street_group)
for z in (-5.23, -8.29):
    box("Stone curb", 0, -0.035, z, 38, 0.13, 0.14, grout, street_group, 0.014)
for x in range(-14, 16, 3):
    box("Road marking", x, -0.087, -6.74, 1.08, 0.002, 0.05, sand, street_group)

for i in range(-4, 5):
    x = i * 3.8
    h = 4.8 + RANDOM.random() * 2.2
    box("Street building", x, h / 2, -12, 3.72, h, 3.6, facades[(i + 4) % 5], far_street)
    box("Cornice", x, h - 0.12, -10.17, 3.78, 0.23, 0.24, sand, far_street)
    box("Shopfront", x, 1.02, -10.16, 2.75, 1.75, 0.15, trim, far_street)
    box("Shop signboard", x, 2.31, -10.115, 2.20, 0.29, 0.13, trim, far_street, 0.015)
    lettering("Shop lettering", ("FLORIST", "BOOKS", "FRUIT & FLOWERS", "TAILOR", "BAKERY")[i % 5],
              x, 2.31, -10.042, sand, far_street)
    box("Shop door", x, 0.92, -10.054, 0.65, 1.78, 0.085, oak_edge, far_street, 0.02)
    box("Shop door glazing", x, 1.16, -10.002, 0.46, 1.16, 0.03, teal, far_street)
    box("Shop handle", x + 0.234, 0.92, -9.976, 0.038, 0.12, 0.05, bronze, far_street)
    if i % 2 == 0:
        for stripe_index in range(13):
            dx = (stripe_index - 6) * 0.20
            canvas = box("Striped awning", x + dx, 2.03, -9.75, 0.20, 0.055, 0.89,
                         sand if stripe_index % 2 else books[0], far_street)
            canvas.rotation_euler.x = math.radians(15)
            box("Awning valance", x + dx, 1.86, -9.32, 0.20, 0.17, 0.045,
                sand if stripe_index % 2 else books[0], far_street)
    for col in (-0.92, 0, 0.92):
        for y in ((2.94, 4.23) if col == 0 else (1.02, 2.94, 4.23)):
            box("Window surround", x + col, y, -10.11, 0.62, 0.99, 0.11, sand, far_street)
            box("Street glazing", x + col, y + 0.015, -10.04, 0.46, 0.81, 0.046, teal, far_street)
            box("Window muntin", x + col, y + 0.015, -10.009, 0.025, 0.81, 0.02, sand, far_street)
            box("Street sill", x + col, y - 0.45, -10.028, 0.68, 0.075, 0.23, sand, far_street)
for x in (-4.9, 2.55, 7.6):
    trunk = cylinder("Street tree trunk", x, 1.17, -8.8, 0.125, 2.34, oak_edge, street_group, top=0.065)
    for polygon in trunk.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    box("Tree bed", x, 0.011, -8.8, 0.90, 0.055, 0.85, oak_edge, street_group, 0.055)
    for dx, y in ((0, 2.98), (-0.61, 2.69), (0.55, 2.79), (0.17, 3.48), (-0.30, 2.45)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.81,
                                               location=coords(x + dx, y, -8.8))
        crown = finish(bpy.context.object, "Street tree canopy", RANDOM.choice(leaves), street_group)
        crown.scale = (0.89, 0.81, 1.13)
        for polygon in crown.data.polygons:
            polygon.use_smooth = True

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
background.inputs["Color"].default_value = (0.68, 0.78, 1.0, 1)
background.inputs["Strength"].default_value = 0.42


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


light("Afternoon sun", "SUN", (-5, 7, -10), (0, 0, 2), 3.1, (1.0, 0.82, 0.61), 0.065)
light("Sky through the window", "AREA", (-1.1, 2.4, -4.15), (-0.4, 0.6, 1),
      420, (1.0, 0.89, 0.76), 5)
light("Warm interior bounce", "AREA", (0, 2.73, 1.15), (0, 0, 0.9),
      105, (1.0, 0.83, 0.67), 4.4)

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
                    bpy.data.objects["Charge indicator"], bpy.data.objects["PourStream"]]
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


bake_floor_contact()
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
        if obj.type == "MESH" and len(obj.data.materials) == 1 and obj.name not in excluded:
            key = (obj.parent, obj.data.materials[0])
            groups.setdefault(key, []).append(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for (parent, mat), objects in groups.items():
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


batch_meshes()
bpy.ops.object.select_all(action="DESELECT")
far_members = {far_street, *far_street.children_recursive}
for obj in SCENE.objects:
    if obj.type not in {"LIGHT", "CAMERA"} and obj not in far_members:
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "cafe.glb"), export_format="GLB",
                          use_selection=True, export_yup=True)
bpy.ops.object.select_all(action="DESELECT")
for obj in far_members:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "street.glb"), export_format="GLB",
                          use_selection=True, export_yup=True)


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
    cx, cy, cz = 0, 3.85, -9.0
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
            point, *_ = tree.ray_cast(Vector(coords(x, y, cz)), Vector(coords(0, 0, -1)), 9)
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
    bpy.ops.export_scene.gltf(filepath=str(STUDIES / "street-depth.glb"), export_format="GLB",
                              use_selection=True, export_yup=True)


export_depth_street()
