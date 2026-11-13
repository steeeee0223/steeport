import { type GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export async function loadModel(loader: GLTFLoader, url: string) {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Could not load model (${response.status}): ${url}`)
  if (response.body && typeof DecompressionStream === 'function') {
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'))
    return loader.parseAsync(await new Response(stream).arrayBuffer(), '')
  }
  const { gunzipSync } = await import('three/addons/libs/fflate.module.js')
  const compressed = new Uint8Array(await response.arrayBuffer())
  return loader.parseAsync(Uint8Array.from(gunzipSync(compressed)).buffer, '')
}
