import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const revision = '1939ad2a8e416c0acfeecc08a694d14ef25f2231'
const names = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']
const catalog = await fetch(`https://huggingface.co/api/models/${repository}/revision/${revision}?blobs=true`).then((response) => {
  if (!response.ok)
    throw new Error(`Model catalog HTTP ${response.status}`)
  return response.json()
})
for (const name of names) {
  const metadata = catalog.siblings.find(file => file.rfilename === name)
  const destination = resolve(root, '.local/models', repository, name)
  const valid = data => data.length === metadata.size && (!metadata.lfs || createHash('sha256').update(data).digest('hex') === metadata.lfs.sha256)
  if (existsSync(destination) && valid(readFileSync(destination)))
    continue
  mkdirSync(dirname(destination), { recursive: true })
  const response = await fetch(`https://huggingface.co/${repository}/resolve/${revision}/${name}`, { signal: AbortSignal.timeout(600000) })
  if (!response.ok)
    throw new Error(`Download ${name}: HTTP ${response.status}`)
  const data = Buffer.from(await response.arrayBuffer())
  if (!valid(data))
    throw new Error(`Size or checksum mismatch: ${name}`)
  writeFileSync(`${destination}.partial`, data)
  renameSync(`${destination}.partial`, destination)
  console.info(`Cached ${name}: ${data.length} bytes`)
}
console.info('Local Kokoro Q8 model ready. Voice embeddings come from AIRI\'s installed kokoro-js package.')
