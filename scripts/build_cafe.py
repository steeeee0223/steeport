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
sys.path.insert(0, str(ROOT / "scripts"))
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
box("Transom glazing", (entry["left"] + entry["right"]) / 2, 2.21, -half_d,
    door_width, 0.25, 0.02, glass, front)
box("Transom rail", (entry["left"] + entry["right"]) / 2, 2.08, -half_d,
    door_width + 0.06, 0.06, 0.12, trim, front, 0.008)


def table(name, rect, height=0.77, desk=False):
    group = empty(name, rect["x"], 0, rect["z"])
    w, d = rect["width"], rect["depth"]
    top = box("Oak top", 0, height - 0.045, 0, w, 0.09, d, oak, group, 0.027)
    top["placement_surface"] = True
    for i in range(1, 5):
        seam = box("Plank seam", 0, height + 0.0003, d * (i / 5 - 0.5),
                   w - 0.06, 0.001, 0.005, oak_edge, group)
        seam["placement_ignore"] = True
    for x in (-w / 2 + 0.09, w / 2 - 0.09, *((0,) if desk else ())):
        for z in (-d / 2 + 0.08, d / 2 - 0.08):
            box("Table leg", x, (height - 0.08) / 2, z, 0.083, height - 0.08,
                0.083, oak_edge, group, 0.012)
    return group


def chair(rect):
    group = empty("Chair", rect["x"], 0, rect["z"])
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
top = box("Countertop", 0, 1.08, 0, bar["width"], 0.11, bar["depth"], oak, counter, 0.022)
top["placement_surface"] = True
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
    sides = 40
    verts = [coords(r * math.cos(a * math.tau / sides), y,
                    r * math.sin(a * math.tau / sides))
             for r, y in profile for a in range(sides)]
    faces = [(i * sides + a, (i + 1) * sides + a,
              (i + 1) * sides + (a + 1) % sides, i * sides + (a + 1) % sides)
             for i in range(len(profile) - 1) for a in range(sides)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for face in mesh.polygons:
        face.use_smooth = face.index // sides in (1, 3)
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
steel = material("Brushed stainless steel", "a6a6a1", 0.33)
steel.node_tree.nodes.get("Principled BSDF").inputs["Metallic"].default_value = 0.72
chrome = material("Polished fittings", "c8c8c5", 0.2)
chrome.node_tree.nodes.get("Principled BSDF").inputs["Metallic"].default_value = 0.83
machine = empty("Two-group espresso machine", -0.04, 1.025, -1.28, machine)
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

shelf = LAYOUT["shelf"]
bookcase = empty("Bookcase", shelf["x"], 0, shelf["z"])
w, d = shelf["width"], shelf["depth"]
box("Bookcase back", 0, 1.03, d / 2 - 0.025, w, 2.06, 0.05, oak_edge, bookcase)
for x in (-w / 2 + 0.03, 0, w / 2 - 0.03):
    box("Shelf upright", x, 1.04, 0, 0.065, 2.08, d, oak, bookcase, 0.011)
for y in (0.12, 0.59, 1.06, 1.53, 2.02):
    board = box("Shelf board", 0, y, 0, w, 0.055, d, oak, bookcase, 0.01)
    board["placement_surface"] = True
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
            0.019, 0.003, 0.020, key_top, computer, 0.001)
box("Space bar", 0, -0.001, 0.151, 0.17, 0.003, 0.020, key_top, computer, 0.001)
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

roof_tile = material("Weathered charcoal roof tile", "554f46", 0.82)
stone_courses = [material(f"Street limestone {i}", color) for i, color in enumerate(
    ["ae9f88", "bfb09a", "a99a83", "c5b49b", "a39784"])]
for row in range(5):
    for col in range(18):
        x = -10.4 + col * 0.62 + (row % 2) * 0.31
        block = box("Limestone course", x, 0.128 + row * 0.253, -8.98,
                    0.609, 0.245, 0.22, RANDOM.choice(stone_courses), far_street, 0.01)
        block.rotation_euler.z = RANDOM.uniform(-0.02, 0.02)
for x in range(65):
    tile = cylinder("Rounded wall coping", -10.55 + x * 0.17, 1.31, -8.98,
                    0.09, 0.31, roof_tile, far_street, sides=10)
    tile.rotation_euler.x = math.pi / 2

for i in range(-4, 5):
    x = i * 4.2 + (3.0 if i > 0 else -0.7)
    h = (3.72 if i == 0 else 4.55) + RANDOM.random() * 1.25
    box("Street building", x, h / 2, -12, 4.03, h, 3.6, facades[(i + 4) % 5], far_street)
    box("Stone foundation", x, 0.72, -10.18, 4.08, 1.42, 0.12, stone_courses[1], far_street)
    box("Cornice", x, h - 0.12, -10.17, 4.06, 0.23, 0.24, sand, far_street)
    if i in (-2, 0, 2):
        for side in (-1, 1):
            eave = box("Pitched tile roof", x, h + 0.35, -12 + side * 0.99,
                       4.41, 0.105, 2.32, roof_tile, far_street)
            eave.rotation_euler.x = side * 0.32
            for row in range(7):
                rafter = box("Roof tile course", x, h + 0.71 - row * 0.105,
                             -12 + side * (0.06 + row * 0.31), 4.45, 0.063, 0.15,
                             roof_tile, far_street, 0.025)
                rafter.rotation_euler.x = side * 0.32
    box("Shopfront", x, 1.02, -10.16, 2.75, 1.75, 0.15, trim, far_street)
    if i in (-3, 2):
        box("Shop signboard", x, 2.31, -10.115, 2.20, 0.29, 0.13, trim, far_street, 0.015)
        lettering("Shop lettering", "BAKERY" if i == 2 else "BOOKS",
                  x, 2.31, -10.042, sand, far_street)
    box("Shop door", x, 0.92, -10.054, 0.65, 1.78, 0.085, oak_edge, far_street, 0.02)
    box("Shop door glazing", x, 1.16, -10.002, 0.46, 1.16, 0.03, teal, far_street)
    box("Shop handle", x + 0.234, 0.92, -9.976, 0.038, 0.12, 0.05, bronze, far_street)
    if i in (-3, 2):
        for stripe_index in range(13):
            dx = (stripe_index - 6) * 0.20
            canvas = box("Striped awning", x + dx, 2.03, -9.75, 0.20, 0.055, 0.89,
                         sand if stripe_index % 2 else books[0], far_street)
            canvas.rotation_euler.x = math.radians(15)
            box("Awning valance", x + dx, 1.86, -9.32, 0.20, 0.17, 0.045,
                sand if stripe_index % 2 else books[0], far_street)
    for col in (-0.92, 0, 0.92):
        for y in ((2.78, h - 0.66) if col == 0 else (1.02, 2.78, h - 0.66)):
            if y > 2.8 and y - 2.78 < 0.9:
                continue
            box("Window surround", x + col, y, -10.11, 0.62, 0.99, 0.11, sand, far_street)
            box("Street glazing", x + col, y + 0.015, -10.04, 0.46, 0.81, 0.046, teal, far_street)
            box("Window muntin", x + col, y + 0.015, -10.009, 0.025, 0.81, 0.02, sand, far_street)
            box("Street sill", x + col, y - 0.45, -10.028, 0.68, 0.075, 0.23, sand, far_street)
lane = box("Rising side lane", 3.45, 0.53, -15.76, 4.0, 0.12, 12.0, street, far_street)
lane.rotation_euler.x = 0.095
box("Uphill ground", 3.45, 0.72, -25.1, 26.0, 1.42, 8.75, stone_courses[2], far_street)
for step in range(4):
    box("Residence stair", 3.45, 1.06 + step * 0.05, -20.43 - step * 0.19,
        2.05, 0.11, 0.21, stone_courses[1], far_street, 0.009)
for index, x in enumerate((-5.3, -2.3, 0.9, 4.0, 7.7, 11.0)):
    h = 5.5 + index % 3 * 1.17
    box("Uphill residences", x, 1.45 + h / 2, -23.2 - index % 2,
        3.1, h, 4.4, facades[index % 5], far_street)
    for y in (3.05, 4.52, 5.95):
        for dx in (-0.8, 0.8):
            box("Upper residence window", x + dx, y, -20.98 - index % 2, 0.68, 0.78, 0.08,
                trim, far_street)


def branch(start, end, radius, tip):
    a, b = Vector(coords(*start)), Vector(coords(*end))
    mid = (a + b) / 2
    twig = cylinder("Tree branch", mid.x, mid.z, -mid.y, radius, (b - a).length,
                    oak_edge, street_group, top=tip, sides=12)
    twig.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    for face in twig.data.polygons:
        face.use_smooth = len(face.vertices) == 4


tree_rng = random.Random(479)
autumn = [material(f"Autumn leaf {i}", color, 0.72) for i, color in enumerate(
    ["827237", "a58b40", "bc9747", "6c723c", "9c7438"])]
for x, z, scale in ((-3.68, -5.04, 1.0), (1.2, -8.7, 0.71), (8.6, -8.72, 0.82)):
    bend = (x - 0.16 * scale, 1.17 * scale, z + 0.07 * scale)
    fork = (x + 0.06 * scale, 2.07 * scale, z + 0.24 * scale)
    crown = (x + 0.38 * scale, 2.95 * scale, z + 0.43 * scale)
    branch((x, -0.02, z), bend, 0.22 * scale, 0.15 * scale)
    branch(bend, fork, 0.15 * scale, 0.104 * scale)
    branch(fork, crown, 0.104 * scale, 0.041 * scale)
    vertices, faces = [], []
    for index in range(14):
        angle = index * 2.39996
        reach = (1.05 + (index % 5) * 0.30) * scale
        end = (fork[0] + math.cos(angle) * reach,
               (2.94 + index % 4 * 0.32) * scale, z + math.sin(angle) * reach)
        start = fork if index % 3 else crown
        joint = tuple(a * 0.52 + b * 0.48 for a, b in zip(start, end))
        branch(start, joint, 0.057 * scale, 0.032 * scale)
        branch(joint, end, 0.034 * scale, 0.011 * scale)
        for _ in range(230):
            dx, dy, dz = (tree_rng.uniform(-1, 1) for _ in range(3))
            if dx * dx + dy * dy + dz * dz > 1:
                continue
            px, py, pz = end[0] + dx * scale, end[1] + dy * 0.45 * scale, end[2] + dz * scale
            a = tree_rng.uniform(0, math.tau)
            size = tree_rng.uniform(0.049, 0.10) * scale
            vx, vz = math.cos(a) * size, math.sin(a) * size
            start = len(vertices)
            vertices.extend([coords(px - vx, py - size * 0.4, pz - vz),
                             coords(px - vz * 0.52, py + size * 0.31, pz + vx * 0.52),
                             coords(px + vx, py + size * 0.46, pz + vz),
                             coords(px + vz * 0.52, py, pz - vx * 0.52)])
            faces.extend(((start, start + 1, start + 2), (start, start + 2, start + 3)))
    mesh = bpy.data.meshes.new("Leaf clusters")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    canopy = bpy.data.objects.new("Open canopy", mesh)
    SCENE.collection.objects.link(canopy)
    canopy.parent = street_group
    for mat in autumn:
        mesh.materials.append(mat)
    for face in mesh.polygons:
        face.material_index = (face.index // 2) % len(autumn)

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


light("Afternoon sun", "SUN", (-5, 8.6, -9), (0, 0, 1), 3.5, (1.0, 0.89, 0.73), 0.048)
light("Sky through the window", "AREA", (-1.1, 2.4, -4.15), (-0.4, 0.6, 1),
      310, (1.0, 0.94, 0.88), 4.8)
light("Warm interior bounce", "AREA", (0, 2.73, 1.15), (0, 0, 0.9),
      100, (1.0, 0.9, 0.78), 4.4)

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


apply_surfaces(SCENE)
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
        if (obj.type == "MESH" and len(obj.data.materials) == 1
                and obj.name not in excluded and not obj.get("placement_surface")
                and not obj.get("placement_ignore")):
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
                          use_selection=True, export_yup=True, export_extras=True,
                          export_image_format="JPEG", export_image_quality=92)
bpy.ops.object.select_all(action="DESELECT")
for obj in far_members:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "street.glb"), export_format="GLB",
                          use_selection=True, export_yup=True,
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
    bpy.ops.export_scene.gltf(filepath=str(STUDIES / "street-depth.glb"), export_format="GLB",
                              use_selection=True, export_yup=True)


export_depth_street()
