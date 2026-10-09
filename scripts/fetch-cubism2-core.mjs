// The Live2D Cubism 2 core is proprietary, so the repository does not commit it.
// This script downloads a pinned copy and verifies its SHA-256 before it writes the file.
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = 'https://raw.githubusercontent.com/dylanNew/live2d/fd9fd400845e9a00bb194fdac0b6635c753a1e8a/webgl/Live2D/lib/live2d.min.js'
const expectedSha256 = 'e4ea1f18bdd44b65394ffd5a1bab16982e88757d45134d1bd0737c8a6b3ddd08'
const destination = resolve(root, 'packages/stage-ui-live2d/src/assets/js/cubism2-core.js')
const sha256 = data => createHash('sha256').update(data).digest('hex')

if (existsSync(destination) && sha256(readFileSync(destination)) === expectedSha256) {
  console.info('Cubism 2 core: present and verified.')
}
else {
  const response = await fetch(source, { signal: AbortSignal.timeout(120000) })
  if (!response.ok)
    throw new Error(`Cubism 2 core download: HTTP ${response.status}`)
  const data = Buffer.from(await response.arrayBuffer())
  const actual = sha256(data)
  // A changed upstream file is never written.
  if (actual !== expectedSha256)
    throw new Error(`Cubism 2 core checksum mismatch: expected ${expectedSha256}, received ${actual}. No file was written.`)
  writeFileSync(`${destination}.partial`, data)
  renameSync(`${destination}.partial`, destination)
  console.info('Cubism 2 core: downloaded and verified.')
}
