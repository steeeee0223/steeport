import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  VideoTexture,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export function televisionModel(desk: Object3D, requestDraw: () => void) {
  const root = new Group()
  root.name = 'Retro television'
  const films = [
    { title: 'Tokyo 2026', file: 'tokyo-2026', aspect: 16 / 9 },
    { title: '0523', file: 'film-0523', aspect: 9 / 16 },
  ]
  const video = document.createElement('video')
  video.hidden = true
  video.playsInline = true
  video.autoplay = true
  video.defaultMuted = video.muted = true
  video.preload = 'auto'
  video.setAttribute('aria-hidden', 'true')
  let filmIndex = 0
  let audible = false
  let active = true
  let disposed = false
  let pausedByVisitor = false
  let videoFrame: number | undefined
  let fallbackFrame: number | undefined
  let poster: ReturnType<TextureLoader['load']> | undefined
  let texture = new VideoTexture(video)
  texture.colorSpace = SRGBColorSpace
  const picture = new MeshStandardMaterial({
    color: '#282c28',
    roughness: 0.27,
    emissive: '#ffffff',
    toneMapped: false,
  })
  const crtFrame = { value: 0 }
  const crtLines = { value: 240 }
  const interference = { value: 0 }
  const bandCenter = { value: 0.5 }
  const bandTravel = { value: 0 }
  let nextInterference = performance.now() + 700 + Math.random() * 1600
  let burstStarted = -Infinity
  let burstDuration = 180
  let sound:
    { context: AudioContext; gain: GainNode; noise: AudioBuffer } | undefined
  let muteTimer: number | undefined

  function setSound(value: boolean) {
    audible = value
    window.clearTimeout(muteTimer)
    if (value && !sound) {
      const context = new AudioContext()
      const gain = context.createGain()
      gain.gain.value = 0
      context.createMediaElementSource(video).connect(gain)
      gain.connect(context.destination)
      const noise = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * 0.3),
        context.sampleRate,
      )
      const samples = noise.getChannelData(0)
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.random() * 2 - 1
      sound = { context, gain, noise }
    }
    if (!sound) {
      video.muted = true
      return
    }
    const { context, gain } = sound
    const now = context.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(value && active ? 1 : 0, now + 0.16)
    if (value && active) {
      video.muted = false
      void context.resume().catch(requestDraw)
    } else
      muteTimer = window.setTimeout(() => {
        video.muted = true
        requestDraw()
      }, 170)
  }

  function staticSound(duration: number) {
    if (!sound || !audible || !active || video.paused) return
    const { context, gain, noise } = sound
    const source = context.createBufferSource()
    source.buffer = noise
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1500 + Math.random() * 1400
    filter.Q.value = 0.6
    const envelope = context.createGain()
    const now = context.currentTime
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(
      0.025 + Math.random() * 0.025,
      now + 0.018,
    )
    envelope.gain.linearRampToValueAtTime(0, now + duration)
    source.connect(filter).connect(envelope).connect(gain)
    source.onended = () => {
      source.disconnect()
      filter.disconnect()
      envelope.disconnect()
    }
    source.start(now)
    source.stop(now + duration)
  }
  picture.onBeforeCompile = (shader) => {
    shader.uniforms.crtFrame = crtFrame
    shader.uniforms.crtLines = crtLines
    shader.uniforms.interference = interference
    shader.uniforms.bandCenter = bandCenter
    shader.uniforms.bandTravel = bandTravel
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <emissivemap_pars_fragment>',
        `#include <emissivemap_pars_fragment>
      uniform float crtFrame;
      uniform float crtLines;
      uniform float interference;
      uniform float bandCenter;
      uniform float bandTravel;
      float crtNoise(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#ifdef USE_EMISSIVEMAP
        vec2 uv = vEmissiveMapUv;
        float bandY = bandCenter + bandTravel * 0.12;
        float band = exp(-pow((uv.y - bandY) / 0.018, 2.0));
        band += 0.55 * exp(-pow((uv.y - bandY - 0.047) / 0.005, 2.0));
        float lineJitter = crtNoise(vec2(floor(uv.y * 480.0), crtFrame)) - 0.5;
        uv.x = clamp(uv.x + interference * band * (0.012 + lineJitter * 0.022), 0.0, 1.0);
        vec2 fringe = vec2(0.0012 + interference * band * 0.003, 0.0);
        vec4 emissiveColor = texture2D(emissiveMap, uv);
        emissiveColor.r = texture2D(emissiveMap, clamp(uv + fringe, 0.0, 1.0)).r;
        emissiveColor.b = texture2D(emissiveMap, clamp(uv - fringe, 0.0, 1.0)).b;
        #ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
          emissiveColor = sRGBTransferEOTF(emissiveColor);
        #endif
        // Fade subpixel scanlines at a distance to prevent moiré while walking.
        float lineVisibility = 1.0 - smoothstep(0.4, 1.0, fwidth(uv.y) * crtLines);
        float scanline = 1.0 - 0.19 * lineVisibility * (0.5 + 0.5 * cos(uv.y * crtLines * 6.283185));
        vec2 grainCell = floor(uv * vec2(640.0, 480.0));
        float grain = crtNoise(grainCell + vec2(crtFrame * 17.0, crtFrame * 3.0)) - 0.5;
        float grainVisibility = 1.0 - smoothstep(0.002, 0.009, max(fwidth(uv.x), fwidth(uv.y)));
        vec2 edge = (uv - 0.5) * 2.0;
        float vignette = 1.0 - 0.12 * dot(edge * edge, edge * edge);
        float luminance = dot(emissiveColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 faded = mix(vec3(luminance), emissiveColor.rgb, 0.76);
        faded = faded * vec3(0.94, 0.88, 0.76) + vec3(0.014, 0.016, 0.012);
        vec3 phosphor = faded * scanline * vignette;
        phosphor += grain * 0.009 * grainVisibility;
        float streak = crtNoise(vec2(floor(uv.x * 180.0), floor(uv.y * 480.0) + crtFrame));
        phosphor = mix(phosphor, vec3(streak * 0.4), clamp(interference * band * 0.72, 0.0, 0.8));
        totalEmissiveRadiance *= max(phosphor, vec3(0.0));
      #endif`,
      )
  }
  picture.customProgramCacheKey = () => 'television-crt'
  const pictureMesh = new Mesh(new PlaneGeometry(1, 1, 16, 12), picture)
  pictureMesh.name = 'Film screen'
  pictureMesh.position.set(-0.035, 0.17, 0.195)
  const picturePositions = pictureMesh.geometry.getAttribute('position')
  for (let index = 0; index < picturePositions.count; index++) {
    const x = picturePositions.getX(index)
    const y = picturePositions.getY(index)
    picturePositions.setZ(index, 0.004 * (1 - 4 * x * x - 4 * y * y))
  }
  pictureMesh.geometry.computeVertexNormals()
  root.add(pictureMesh)

  function fitPicture(aspect: number) {
    pictureMesh.scale.set(
      Math.min(0.318, 0.204 * aspect),
      Math.min(0.204, 0.318 / aspect),
      1,
    )
    crtLines.value = 240 * Math.min(1, 0.318 / aspect / 0.204)
  }

  function stopFrames() {
    if (videoFrame !== undefined) video.cancelVideoFrameCallback(videoFrame)
    window.clearInterval(fallbackFrame)
    videoFrame = fallbackFrame = undefined
  }

  function nextFrame() {
    videoFrame = undefined
    if (disposed || !active || video.paused) return
    crtFrame.value = Math.floor(video.currentTime * 30)
    requestDraw()
    videoFrame = video.requestVideoFrameCallback(nextFrame)
  }

  function playing() {
    stopFrames()
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype)
      videoFrame = video.requestVideoFrameCallback(nextFrame)
    else
      fallbackFrame = window.setInterval(() => {
        crtFrame.value = Math.floor(video.currentTime * 30)
        requestDraw()
      }, 1000 / 30)
    requestDraw()
  }

  function play() {
    if (!active || disposed) return
    void video.play().catch(requestDraw)
  }

  function showPicture() {
    if (disposed) return
    fitPicture(video.videoWidth / video.videoHeight)
    picture.emissiveMap = texture
    picture.needsUpdate = true
    poster?.dispose()
    poster = undefined
    requestDraw()
  }

  function selectFilm(index: number) {
    const film = films[index]
    if (!film || disposed) return
    filmIndex = index
    pausedByVisitor = false
    stopFrames()
    video.pause()
    texture.dispose()
    texture = new VideoTexture(video)
    texture.colorSpace = SRGBColorSpace
    const base = import.meta.env.BASE_URL + 'films/' + film.file
    fitPicture(film.aspect)
    poster?.dispose()
    poster = new TextureLoader().load(base + '.jpg', requestDraw)
    poster.colorSpace = SRGBColorSpace
    picture.emissiveMap = poster
    picture.needsUpdate = true
    video.src = base + '.mp4'
    video.load()
    play()
    requestDraw()
  }

  function nextFilm() {
    channelAngle -= Math.PI / 4
    selectFilm((filmIndex + 1) % films.length)
  }

  video.addEventListener('loadeddata', showPicture)
  video.addEventListener('playing', playing)
  video.addEventListener('pause', stopFrames)
  video.addEventListener('ended', nextFilm)
  video.addEventListener('error', requestDraw)
  video.addEventListener('seeked', requestDraw)
  const wood = new MeshStandardMaterial({ color: '#70442d', roughness: 0.82 })
  desk.traverse((part) => {
    if (
      part instanceof Mesh &&
      part.material instanceof MeshStandardMaterial &&
      part.material.name === 'Honey oak' &&
      part.material.map
    ) {
      wood.map = part.material.map
      wood.color.set('#8e785e')
    }
  })
  const bakelite = new MeshStandardMaterial({
    color: '#3e3529',
    roughness: 0.76,
  })
  const brass = new MeshStandardMaterial({
    color: '#70644e',
    roughness: 0.72,
    metalness: 0.45,
  })
  const glass = new MeshStandardMaterial({
    color: '#282c28',
    roughness: 0.27,
  })
  const grille = new MeshStandardMaterial({
    color: '#1d1814',
    roughness: 0.85,
  })
  const dialMetal = new MeshStandardMaterial({
    color: '#89785b',
    roughness: 0.38,
    metalness: 0.65,
  })

  for (const material of [wood, bakelite, brass, dialMetal]) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.woodSurface = { value: material === wood ? 1 : 0 }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 wornPosition;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nwornPosition = position;',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
        varying vec3 wornPosition;
        uniform float woodSurface;
        float wearHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 39.425))) * 43758.5453); }
        float wearNoise(vec3 p) {
          vec3 cell = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float lower = mix(
            mix(wearHash(cell), wearHash(cell + vec3(1,0,0)), f.x),
            mix(wearHash(cell + vec3(0,1,0)), wearHash(cell + vec3(1,1,0)), f.x), f.y);
          float upper = mix(
            mix(wearHash(cell + vec3(0,0,1)), wearHash(cell + vec3(1,0,1)), f.x),
            mix(wearHash(cell + vec3(0,1,1)), wearHash(cell + vec3(1,1,1)), f.x), f.y);
          return mix(lower, upper, f.z);
        }`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec3 p = wornPosition;
          float mottling = wearNoise(p * mix(vec3(48.0), vec3(7.0, 100.0, 180.0), woodSurface));
          float pores = wearNoise(p * vec3(220.0, 400.0, 380.0));
          float edgeWear = smoothstep(0.205, 0.229, abs(p.x)) * smoothstep(0.22, 0.32, p.y);
          edgeWear += smoothstep(0.142, 0.169, abs(p.z + 0.012)) * smoothstep(0.29, 0.323, p.y);
          float scratch = (1.0-smoothstep(0.02,0.09,abs(fract(p.x*127.0+p.z*17.0)-0.5))) * smoothstep(0.72,0.86,wearNoise(p*vec3(110.0,14.0,35.0)));
          diffuseColor.rgb *= 0.82 + mottling * 0.18 + pores * 0.06;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24,0.18,0.11), clamp(edgeWear * (0.3 + mottling * 0.6) + scratch * 0.35,0.0,0.7));
        `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (wearNoise(wornPosition*90.0)-0.5)*0.06,0.32,0.95);
        `,
        )
    }
    material.customProgramCacheKey = () => 'aged-television-cabinet'
  }

  const details: Mesh<BufferGeometry, MeshStandardMaterial>[] = []
  function addDetail(mesh: Mesh<BufferGeometry, MeshStandardMaterial>) {
    details.push(mesh)
    root.add(mesh)
  }

  function box(
    name: string,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    radius: number,
  ) {
    const mesh = new Mesh(
      new RoundedBoxGeometry(width, height, depth, 3, radius),
      material,
    )
    mesh.name = name
    mesh.position.set(x, y, z)
    addDetail(mesh)
  }

  box('Wood cabinet', wood, 0, 0.169, -0.012, 0.46, 0.308, 0.316, 0.025)
  box('Face trim', brass, 0, 0.17, 0.141, 0.443, 0.292, 0.024, 0.009)
  box('Front panel', bakelite, 0, 0.17, 0.153, 0.432, 0.28, 0.021, 0.009)
  box(
    'Screen surround',
    grille,
    -0.035,
    0.17,
    0.164,
    0.348,
    0.244,
    0.019,
    0.008,
  )
  box('Picture tube', glass, -0.035, 0.17, 0.175, 0.33, 0.22, 0.028, 0.013)

  const channelDial = new Group()
  const playbackDial = new Group()
  let channelAngle = 0
  let pressedAt = -Infinity
  for (const [group, y, radius] of [
    [channelDial, 0.24, 0.018],
    [playbackDial, 0.187, 0.014],
  ] as const) {
    group.position.set(0.176, y, 0.173)
    root.add(group)
    const gripGeometry = new CylinderGeometry(radius, radius, 0.019, 96)
    const vertices = gripGeometry.getAttribute('position')
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i),
        z = vertices.getZ(i)
      const tooth = Math.cos(Math.atan2(z, x) * 32)
      const scale = 1 - 0.045 * (0.5 + 0.5 * tooth)
      vertices.setX(i, x * scale)
      vertices.setZ(i, z * scale)
    }
    gripGeometry.computeVertexNormals()
    const grip = new Mesh(gripGeometry, bakelite)
    grip.rotation.x = Math.PI / 2
    group.add(grip)
    const face = new Mesh(
      new CylinderGeometry(radius * 0.82, radius * 0.9, 0.004, 64),
      dialMetal,
    )
    face.rotation.x = Math.PI / 2
    face.position.z = 0.009
    group.add(face)
    const rim = new Mesh(new TorusGeometry(radius * 0.89, 0.0008, 8, 64), brass)
    rim.position.z = 0.01
    group.add(rim)
    const mark = new Mesh(
      new RoundedBoxGeometry(0.0013, radius * 0.52, 0.001, 2, 0.0003),
      grille,
    )
    mark.position.set(0, radius * 0.42, 0.012)
    group.add(mark)
    for (let tick = -3; tick <= 3; tick++) {
      const angle = (tick * Math.PI) / 7
      box(
        'Tuning scale',
        brass,
        0.176 + Math.sin(angle) * (radius + 0.005),
        y + Math.cos(angle) * (radius + 0.005),
        0.165,
        0.001,
        0.0025,
        0.001,
        0.0002,
      )
    }
  }

  for (let vent = 0; vent < 12; vent++) {
    box(
      'Side ventilation',
      grille,
      0.2302,
      0.16,
      -0.11 + vent * 0.014,
      0.001,
      0.075,
      0.004,
      0.0004,
    )
  }
  const cable = new Mesh(
    new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(0.13, 0.075, -0.17),
        new Vector3(0.15, 0.025, -0.23),
        new Vector3(0.21, 0.008, -0.25),
        new Vector3(0.29, 0.008, -0.27),
        new Vector3(0.34, -0.035, -0.32),
        new Vector3(0.34, -0.27, -0.33),
      ]),
      28,
      0.003,
      6,
      false,
    ),
    grille,
  )
  cable.name = 'Power cable'
  addDetail(cable)

  for (let row = 0; row < 6; row++) {
    box(
      'Speaker grille',
      grille,
      0.176,
      0.078 + row * 0.008,
      0.164,
      0.044,
      0.003,
      0.003,
      0.001,
    )
  }
  for (const x of [-0.153, 0.153]) {
    for (const z of [-0.112, 0.09]) {
      box('Rubber foot', grille, x, 0.009, z, 0.05, 0.018, 0.046, 0.005)
    }
  }

  // Batch the static cabinet details by material, keeping the film independent.
  for (const material of new Set(details.map((part) => part.material))) {
    const geometries: BufferGeometry[] = []
    for (const child of details) {
      if (child.material !== material) continue
      const source = child.geometry
      child.updateMatrix()
      const geometry = source.index ? source.toNonIndexed() : source.clone()
      geometries.push(geometry.applyMatrix4(child.matrix))
      source.dispose()
      root.remove(child)
    }
    const geometry = mergeGeometries(geometries)
    for (const part of geometries) part.dispose()
    if (geometry) root.add(new Mesh(geometry, material))
  }

  function togglePlayback() {
    pressedAt = performance.now()
    pausedByVisitor = !video.paused
    if (!pausedByVisitor) play()
    else video.pause()
    requestDraw()
  }

  function dispose() {
    disposed = true
    window.clearTimeout(muteTimer)
    if (sound) void sound.context.close().catch(() => undefined)
    stopFrames()
    video.removeEventListener('loadeddata', showPicture)
    video.removeEventListener('playing', playing)
    video.removeEventListener('pause', stopFrames)
    video.removeEventListener('ended', nextFilm)
    video.removeEventListener('error', requestDraw)
    video.removeEventListener('seeked', requestDraw)
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
    texture.dispose()
    poster?.dispose()
    picture.dispose()
    root.traverse((child) => {
      if (child instanceof Mesh && child.geometry instanceof BufferGeometry)
        child.geometry.dispose()
    })
    for (const material of [wood, bakelite, brass, glass, grille, dialMetal]) {
      material.dispose()
    }
  }
  return {
    root,
    video,
    dispose,
    start: () => selectFilm(0),
    nextFilm,
    isAudible: () => audible,
    dialAction(object: Object3D) {
      if (object.parent === channelDial) {
        nextFilm()
        return true
      }
      if (object.parent === playbackDial) {
        togglePlayback()
        return true
      }
      return false
    },
    update(now: number, dt: number, reduce: boolean) {
      if (active && !video.paused && now >= nextInterference) {
        burstStarted = now
        burstDuration = 120 + Math.random() * 150
        bandCenter.value = 0.12 + Math.random() * 0.68
        nextInterference = now + 1100 + Math.random() * 2100
        if (Math.random() < 0.55) staticSound(burstDuration / 1000)
      }
      const phase = (now - burstStarted) / burstDuration
      bandTravel.value = Math.min(1, phase)
      interference.value =
        active && !video.paused && phase < 1
          ? Math.sin(Math.max(0, phase) * Math.PI)
          : 0
      channelDial.rotation.z = reduce
        ? channelAngle
        : MathUtils.damp(channelDial.rotation.z, channelAngle, 16, dt || 1 / 60)
      if (Math.abs(channelDial.rotation.z - channelAngle) < 0.002)
        channelDial.rotation.z = channelAngle
      const press = Math.min(1, (now - pressedAt) / 220)
      playbackDial.position.z = 0.173 - Math.sin(press * Math.PI) * 0.005
      return (
        channelDial.rotation.z !== channelAngle ||
        press < 1 ||
        interference.value > 0
      )
    },
    returnToAmbient() {
      pausedByVisitor = false
      setSound(false)
      play()
    },
    setAudible(value: boolean) {
      setSound(value)
      if (value) {
        if (video.error) video.load()
        if (!pausedByVisitor) play()
      }
    },
    setActive(value: boolean) {
      active = value
      setSound(audible)
      if (!active) video.muted = true
      if (active && !pausedByVisitor) play()
      else {
        video.pause()
        stopFrames()
      }
    },
    togglePlayback,
  }
}
