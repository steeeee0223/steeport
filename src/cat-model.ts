import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  type Object3D,
  OrthographicCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { archivePose, walkPaws } from './leo-motion'
import { loadModel } from './load-model'

async function showModel(viewer: HTMLElement, viewport: HTMLElement) {
  const status = viewer.querySelector<HTMLElement>('[data-model-status]')
  const poster = viewport.querySelector<HTMLImageElement>('img')
  const toolbar = viewer.querySelector<HTMLElement>('.model-controls')
  const help = toolbar?.querySelector<HTMLElement>('p')
  const reset = toolbar?.querySelector<HTMLButtonElement>('button')
  const { model, label, fallback, background } = viewport.dataset
  if (
    !status ||
    !toolbar ||
    !help?.id ||
    !reset ||
    !model ||
    !label ||
    !fallback
  )
    return

  status.hidden = false
  let renderer: WebGLRenderer | undefined
  try {
    const graphics = new WebGLRenderer({ antialias: true })
    renderer = graphics
    graphics.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    graphics.toneMapping = ACESFilmicToneMapping
    const canvas = graphics.domElement
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', label)
    canvas.setAttribute('aria-describedby', help.id)

    const { scene: cat } = await loadModel(
      new GLTFLoader(),
      import.meta.env.BASE_URL + model,
    )
    const animation =
      'leo' in viewport.dataset ? leoPreview(viewer, cat) : undefined
    const bounds = new Box3().setFromObject(cat, Boolean(animation))
    if (bounds.isEmpty()) throw new Error('Missing cat geometry')

    const scene = new Scene()
    scene.background = new Color(background ?? '#e3ded2')
    scene.add(cat, new HemisphereLight('#fff7ec', '#b6a79c', 2.0))
    const key = new DirectionalLight('#fff1dd', 2.4)
    key.position.set(3, 5, 4)
    const rim = new DirectionalLight('#e7eeff', 1.4)
    rim.position.set(-3, 3, -4)
    scene.add(key, rim)

    const { center, radius } = bounds.getBoundingSphere(new Sphere())
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10)
    const view = animation
      ? new Vector3(0.94, 0.42, 1.24)
      : new Vector3(1.05, 0.46, 1.0)
    camera.position.copy(center).add(view)
    const orbit = new OrbitControls(camera, canvas)
    orbit.target.copy(center)
    orbit.enablePan = false
    orbit.rotateSpeed = 0.68
    orbit.minZoom = 0.7
    orbit.maxZoom = 4
    orbit.update()
    orbit.saveState()

    let frame = 0
    let contextAvailable = true
    function draw() {
      if (frame || !contextAvailable) return
      frame = requestAnimationFrame((now) => {
        frame = 0
        animation?.update(now)
        graphics.render(scene, camera)
        if (animation?.playing()) draw()
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
      if (animation) animation.controls.hidden = !available
      status.hidden = available
    }
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      contextAvailable = false
      status.textContent = fallback
      showCanvas(false)
    })
    canvas.addEventListener('webglcontextrestored', () => {
      contextAvailable = true
      showCanvas(true)
      draw()
    })

    animation?.connect(draw)
    orbit.addEventListener('change', draw)
    reset.addEventListener('click', () => orbit.reset())
    viewport.prepend(canvas)
    showCanvas(true)
    resize.observe(viewport)
  } catch {
    renderer?.dispose()
    status.textContent = fallback
  }
}

function leoPreview(viewer: HTMLElement, cat: Object3D) {
  const controls = viewer.querySelector<HTMLElement>('.leo-poses')
  const play = controls?.querySelector<HTMLButtonElement>('[data-play]')
  if (!controls || !play) throw new Error('Missing Leo pose controls')
  const poses = new Map(
    ['Standing', 'Walking', 'Stretching'].map((name) => [
      name,
      archivePose(cat, name),
    ]),
  )
  const buttons = controls.querySelectorAll<HTMLButtonElement>('[data-pose]')
  let selected = 'Standing'
  let lastFrame: number | undefined
  let seconds = 0
  let playing = false

  function update(now: number) {
    if (playing && lastFrame !== undefined)
      seconds += Math.min((now - lastFrame) / 1000, 0.12)
    lastFrame = playing ? now : undefined
    for (const [name, pose] of poses) pose.weight(Number(name === selected))
    const pose = poses.get(selected)
    if (!pose || !playing) return
    if (selected === 'Walking') {
      walkPaws(pose, seconds * 1.4, 1, () => 0)
      pose.morph('Tail sway', Math.sin(seconds * 8.8) * 0.38)
    } else if (selected === 'Stretching') {
      const phase = (seconds + 0.8) % 3.1
      pose.morph(
        'Recover',
        1 -
          MathUtils.smoothstep(phase, 0, 0.72) +
          MathUtils.smoothstep(phase, 1.9, 3.1),
      )
    } else {
      const phase = seconds % 5.5
      pose.morph(
        'Rest',
        1 -
          MathUtils.smoothstep(phase, 0, 1.1) +
          MathUtils.smoothstep(phase, 3.8, 5.5),
      )
      pose.morph('Tail sway', Math.sin(seconds * 2.4) * 0.16)
    }
  }

  function connect(draw: () => void) {
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const name = button.dataset.pose
        if (!name || !poses.has(name)) return
        selected = name
        lastFrame = undefined
        seconds = 0
        for (const item of buttons)
          item.setAttribute('aria-pressed', String(item === button))
        draw()
      })
    }
    play?.addEventListener('click', () => {
      playing = !playing
      lastFrame = undefined
      play.setAttribute('aria-pressed', String(playing))
      play.textContent = playing ? '暫停動作' : '播放動作'
      draw()
    })
  }

  return { controls, update, connect, playing: () => playing }
}

for (const viewer of document.querySelectorAll<HTMLElement>(
  '[data-model-viewer]',
)) {
  const viewport = viewer.querySelector<HTMLElement>('[data-model]')
  if (!viewport) continue
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some(({ isIntersecting }) => isIntersecting)) return
      observer.disconnect()
      void showModel(viewer, viewport)
    },
    { rootMargin: '320px' },
  )
  observer.observe(viewport)
}
