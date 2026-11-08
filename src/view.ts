import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { type Cafe, atLaptop, layout, position } from './cafe'

export async function loadView(
  viewport: HTMLElement,
  marker: HTMLElement,
  onFailure: () => void,
) {
  const gltf = await new GLTFLoader().loadAsync(
    import.meta.env.BASE_URL + 'cafe.glb',
  )
  const room = gltf.scene
  function node(name: string) {
    const object = room.getObjectByName(name)
    if (!object) throw new Error('Missing café model node ' + name)
    return object
  }

  const walls = [
    node('WallFront'),
    node('WallBack'),
    node('WallLeft'),
    node('WallRight'),
  ]
  const ceiling = node('Ceiling')
  const street = node('Street')
  const visitor = node('Visitor')
  const torso = node('VisitorTorso')
  const legs = [node('VisitorLeg0'), node('VisitorLeg1')]
  const hinge = node('LaptopHinge')
  const laptop = node('Laptop')
  const art = node('Framed_print')

  const renderer = new WebGLRenderer({ antialias: true, alpha: false })
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.32
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  const canvas = renderer.domElement
  canvas.setAttribute('aria-label', 'Café view. Drag to turn the camera.')
  canvas.setAttribute('role', 'img')
  canvas.addEventListener('webglcontextlost', onFailure)
  viewport.prepend(canvas)

  const scene = new Scene()
  scene.add(room)
  scene.add(new HemisphereLight(0xffeed8, 0xb6a199, 2.02))
  const sunlight = new DirectionalLight(0xffd5a1, 2.6)
  sunlight.position.set(-4.5, 6, -8)
  sunlight.target.position.set(0, 0, 1)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(1024, 1024)
  sunlight.shadow.camera.left = -9
  sunlight.shadow.camera.right = 9
  sunlight.shadow.camera.top = 8
  sunlight.shadow.camera.bottom = -7
  sunlight.shadow.normalBias = 0.022
  sunlight.shadow.bias = -0.0002
  scene.add(sunlight, sunlight.target)

  room.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })

  const first = new PerspectiveCamera(62, 1, 0.035, 64)
  first.rotation.order = 'YXZ'
  const pixel = new OrthographicCamera(-1, 1, 1, -1, 0.1, 60)
  const pixelBackground = new Color('#d3bb95')
  const realisticBackground = new Color('#bdd3da')
  const indicator = new Vector3()
  const ray = new Raycaster()
  const click = new Vector2()
  let activeCamera: PerspectiveCamera | OrthographicCamera = first

  function draw(cafe: Cafe) {
    const retro = cafe.view === 'pixel'
    const width = viewport.clientWidth
    const height = viewport.clientHeight
    if (!width || !height) return

    const density = retro
      ? Math.min(0.65, 390 / width)
      : Math.min(devicePixelRatio, 1.65)
    const bufferWidth = Math.floor(width * density)
    const bufferHeight = Math.floor(height * density)
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      renderer.setSize(bufferWidth, bufferHeight, false)
    }

    const p = position(cafe.visitor)
    const seated = cafe.visitor.kind === 'seated'
    visitor.visible = retro
    visitor.position.set(p.x, 0, p.z)
    visitor.rotation.y = cafe.visitor.yaw
    torso.position.set(0, seated ? -0.28 : 0, 0)
    for (const leg of legs) {
      leg.position.y = seated ? 0.47 : 0.73
      leg.rotation.x = seated ? Math.PI * 0.37 : 0
    }
    hinge.rotation.x = cafe.laptopOpen ? -1.85 : 0
    ceiling.visible = street.visible = !retro
    scene.background = retro ? pixelBackground : realisticBackground

    if (retro) {
      const x = Math.sin(cafe.orbit)
      const z = -Math.cos(cafe.orbit)
      for (const [i, direction] of [
        z > -0.14,
        z < 0.14,
        x > -0.14,
        x < 0.14,
      ].entries()) {
        const wall = walls[i]
        if (wall) wall.visible = direction
      }
      art.visible = z < 0.14
      // When the street wall is cut, leave a low sill to mark the window from any orbit.
      const front = walls[0]
      if (front) {
        front.visible = true
        front.scale.y = z > -0.14 ? 1 : 0.24
      }
      pixel.position.set(x * 14, 9.5, z * 14)
      pixel.lookAt(0, 0.96, 0)
      const halfHeight = Math.max(4.97, 7.05 / (width / height))
      pixel.top = halfHeight
      pixel.bottom = -halfHeight
      pixel.left = -halfHeight * (width / height)
      pixel.right = -pixel.left
      pixel.updateProjectionMatrix()
      activeCamera = pixel
    } else {
      for (const wall of walls) wall.visible = true
      const front = walls[0]
      if (front) front.scale.y = 1
      art.visible = true
      first.position.set(p.x, seated ? layout.seat.eye : layout.stand.eye, p.z)
      first.rotation.set(cafe.visitor.pitch, cafe.visitor.yaw, 0)
      first.aspect = width / height
      first.fov = width / height < 1.1 ? 81 : 62
      first.updateProjectionMatrix()
      activeCamera = first
    }

    renderer.render(scene, activeCamera)

    indicator.set(
      layout.laptop.x,
      cafe.laptopOpen ? 1.27 : 0.97,
      layout.laptop.z + 0.17,
    )
    indicator.project(activeCamera)
    marker.hidden =
      !(retro || atLaptop(cafe.visitor)) ||
      Math.abs(indicator.x) > 0.98 ||
      Math.abs(indicator.y) > 0.98 ||
      Math.abs(indicator.z) > 1
    marker.style.left = ((indicator.x + 1) * width) / 2 + 'px'
    marker.style.top = ((1 - indicator.y) * height) / 2 + 'px'
  }

  function hitsLaptop(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect()
    click.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    )
    ray.setFromCamera(click, activeCamera)
    const hit = ray.intersectObject(laptop, true)[0]
    return hit !== undefined
  }

  return { canvas, draw, hitsLaptop }
}
