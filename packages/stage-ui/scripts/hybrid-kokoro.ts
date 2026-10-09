import type { VoiceKey } from '../src/workers/kokoro/types'

import { Buffer } from 'node:buffer'
import { resolve } from 'node:path'

import { env } from '@huggingface/transformers'
import { KokoroTTS } from 'kokoro-js'

let loading: Promise<KokoroTTS> | undefined
let queue = Promise.resolve()

/** Uses AIRI's installed Kokoro runtime on CPU. Models and bundled voice embeddings load from local files only. */
export function synthesizeKokoro(root: string, input: string, voice: string, speed: number, signal: AbortSignal): Promise<Buffer> {
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = `${resolve(root, '.local/models')}/`
  env.useFSCache = false
  const operation = queue.then(async () => {
    signal.throwIfAborted()
    loading ??= KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' }).catch((error) => {
      loading = undefined
      throw error
    })
    const model = await loading
    if (!(voice in model.voices))
      throw new Error('Select an installed Kokoro voice.')
    signal.throwIfAborted()
    const audio = await model.generate(input, { voice: voice as VoiceKey, speed })
    signal.throwIfAborted()
    return Buffer.from(await audio.toBlob().arrayBuffer())
  })
  queue = operation.then(() => {}, () => {})
  return operation
}
