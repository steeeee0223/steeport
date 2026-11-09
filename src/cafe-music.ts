type MusicState = 'off' | 'loading' | 'on'

export function cafeMusic(
  changed: (state: MusicState) => void,
  unavailable: () => void,
) {
  let audio: { context: AudioContext; gain: GainNode } | undefined
  let recording: Promise<AudioBuffer> | undefined
  let source: AudioBufferSourceNode | undefined
  let state: MusicState = 'off'
  let revision = 0
  let pause: number | undefined

  function set(stateNext: MusicState) {
    state = stateNext
    changed(state)
  }

  function stop() {
    revision++
    set('off')
    if (!audio) return
    const { context, gain } = audio
    gain.gain.setTargetAtTime(0, context.currentTime, 0.055)
    window.clearTimeout(pause)
    pause = window.setTimeout(() => {
      void context.suspend().catch(() => undefined)
    }, 270)
  }

  async function toggle() {
    if (state !== 'off') {
      stop()
      return
    }
    const request = ++revision
    window.clearTimeout(pause)
    set('loading')
    try {
      if (!audio) {
        const context = new AudioContext()
        const gain = context.createGain()
        gain.gain.value = 0
        gain.connect(context.destination)
        audio = { context, gain }
      }
      const { context, gain } = audio
      const resumed = context.resume()
      recording ??= fetch(import.meta.env.BASE_URL + 'afternoon-loop.m4a')
        .then((response) => {
          if (!response.ok) throw new Error('Could not load café music')
          return response.arrayBuffer()
        })
        .then((bytes) => context.decodeAudioData(bytes))
        .catch((error: unknown) => {
          recording = undefined
          throw error
        })
      const [, buffer] = await Promise.all([resumed, recording])
      if (revision !== request) return
      if (!source) {
        source = context.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.connect(gain)
        source.start()
      }
      gain.gain.setTargetAtTime(0.42, context.currentTime, 0.1)
      set('on')
    } catch {
      if (revision !== request) return
      stop()
      unavailable()
    }
  }

  return { stop, toggle }
}
