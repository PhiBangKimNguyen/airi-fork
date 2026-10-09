import type { Plugin } from 'vite'

import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Serves and bundles the local reading dictionary, including its redistribution notices. */
export function FuriganaDictionary(): Plugin {
  const require = createRequire(import.meta.url)
  const analyzerEntry = require.resolve('kuroshiro-analyzer-kuromoji')
  const analyzerRequire = createRequire(analyzerEntry)
  const dictionaryRoot = dirname(analyzerRequire.resolve('kuromoji/package.json'))
  const files = new Map<string, Uint8Array>()
  let base = '/'

  return {
    name: 'airi-furigana-dictionary',
    async configResolved(config) {
      base = config.base
      const dictionaryFiles = (await readdir(join(dictionaryRoot, 'dict'))).filter(name => name.endsWith('.dat.gz'))
      await Promise.all(dictionaryFiles.map(async (name) => {
        files.set(name, await readFile(join(dictionaryRoot, 'dict', name)))
      }))
      files.set('NOTICE.md', await readFile(join(dictionaryRoot, 'NOTICE.md')))
      files.set('THIRD_PARTY_LICENSES.md', await readFile(join(dirname(analyzerEntry), 'dist', 'THIRD_PARTY_LICENSES.md')))
    },
    configureServer(server) {
      const prefix = `${base}assets/furigana/`
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0]
        if (!pathname?.startsWith(prefix))
          return next()
        const name = pathname.slice(prefix.length)
        const data = files.get(name)
        if (!data) {
          response.statusCode = 404
          response.end()
          return
        }
        // Kuromoji decompresses the stored bytes itself. HTTP content encoding must remain unset.
        response.setHeader('Content-Type', name.endsWith('.gz') ? 'application/octet-stream' : 'text/plain')
        response.end(data)
      })
    },
    generateBundle() {
      for (const [name, source] of files)
        this.emitFile({ type: 'asset', fileName: `assets/furigana/${name}`, source })
    },
  }
}
