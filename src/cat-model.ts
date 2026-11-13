import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { loadModel } from './load-model'

async function showModel(viewport: HTMLElement) {
  const status = document.querySelector<HTMLElement>('#model-status')
  const poster = document.querySelector<HTMLImageElement>('#model-poster')
  const toolbar = document.querySelector<HTMLElement>('#model-controls')
  const reset = document.querySelector<HTMLButtonElement>('#model-reset')
  if (!status || !toolbar || !reset) return

  status.hidden = false
  let renderer: WebGLRenderer | undefined
  try {
    const graphics = new WebGLRenderer({ antialias: true })
    renderer = graphics
    graphics.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    graphics.toneMapping = ACESFilmicToneMapping
    const canvas = graphics.domElement
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', '雷歐的 3D 模型')
    canvas.setAttribute('aria-describedby', 'model-help')

    const { scene: cat } = await loadModel(
      new GLTFLoader(),
      import.meta.env.BASE_URL + 'models/leo.glbz',
    )
    const bounds = new Box3().setFromObject(cat)
    if (bounds.isEmpty()) throw new Error('Missing cat geometry')

    const scene = new Scene()
    scene.background = new Color('#e3ded2')
    scene.add(cat, new HemisphereLight('#fff7ec', '#b6a79c', 2.0))
    const key = new DirectionalLight('#fff1dd', 2.4)
    key.position.set(3, 5, 4)
    const rim = new DirectionalLight('#e7eeff', 1.4)
    rim.position.set(-3, 3, -4)
    scene.add(key, rim)

    const { center, radius } = bounds.getBoundingSphere(new Sphere())
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10)
    camera.position.copy(center).add(new Vector3(1.05, 0.46, 1.0))
    const orbit = new OrbitControls(camera, canvas)
    orbit.target.copy(center)
    orbit.enablePan = false
    orbit.rotateSpeed = 0.68
    orbit.minZoom = 0.7
    orbit.maxZoom = 4
    orbit.update()
    orbit.saveState()

    let frame = 0
    function draw() {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        graphics.render(scene, camera)
      })
    }

    const resize = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = viewport
      if (!width || !height) return
      const aspect = width / height
      const span = radius
      camera.top = span * Math.max(1, 1 / aspect)
      camera.bottom = -camera.top
      camera.right = camera.top * aspect
      camera.left = -camera.right
      camera.updateProjectionMatrix()
      graphics.setSize(width, height, false)
      draw()
    })

    const keys = new Map<string, () => void>([
      ['ArrowLeft', () => orbit.rotateLeft(0.18)],
      ['ArrowRight', () => orbit.rotateLeft(-0.18)],
      ['ArrowUp', () => orbit.rotateUp(0.18)],
      ['ArrowDown', () => orbit.rotateUp(-0.18)],
      ['+', () => zoom(1.15)],
      ['=', () => zoom(1.15)],
      ['-', () => zoom(1 / 1.15)],
      ['Home', () => orbit.reset()],
    ])
    function zoom(factor: number) {
      camera.zoom = Math.min(
        orbit.maxZoom,
        Math.max(orbit.minZoom, camera.zoom * factor),
      )
      camera.updateProjectionMatrix()
      draw()
    }
    canvas.addEventListener('keydown', (event) => {
      const action = keys.get(event.key)
      if (!action) return
      event.preventDefault()
      action()
    })

    const showCanvas = (available: boolean) => {
      canvas.hidden = !available
      if (poster) poster.hidden = available
      toolbar.hidden = !available
      status.hidden = available
    }
    canvas.addEventListener('webglcontextlost', () => {
      status.textContent = '3D 預覽暫時中斷。也可以下載 Blender 檔查看模型。'
      showCanvas(false)
    })
    canvas.addEventListener('webglcontextrestored', () => {
      showCanvas(true)
      draw()
    })

    orbit.addEventListener('change', draw)
    reset.addEventListener('click', () => orbit.reset())
    viewport.prepend(canvas)
    showCanvas(true)
    resize.observe(viewport)
  } catch {
    renderer?.dispose()
    status.textContent = '目前無法顯示 3D 預覽。可下載 Blender 檔查看模型。'
  }
}

const viewport = document.querySelector<HTMLElement>('#model-viewport')
if (viewport) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some(({ isIntersecting }) => isIntersecting)) return
      observer.disconnect()
      void showModel(viewport)
    },
    { rootMargin: '320px' },
  )
  observer.observe(viewport)
}
