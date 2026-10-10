import { build, createServer } from 'vite'
import { describe, expect, it } from 'vitest'

import { FuriganaDictionary } from './furigana'

describe('furigana dictionary assets', () => {
  it('serves local gzip bytes under the configured base without HTTP decompression', async () => {
    const server = await createServer({ configFile: false, base: '/airi/', plugins: [FuriganaDictionary()], server: { port: 0 } })
    try {
      await server.listen()
      const address = server.httpServer?.address()
      if (!address || typeof address === 'string')
        throw new Error('Expected a local HTTP server.')
      const origin = `http://localhost:${address.port}`
      const response = await fetch(`${origin}/airi/assets/furigana/base.dat.gz`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-encoding')).toBeNull()
      expect(Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 2))).toEqual([0x1F, 0x8B])
      const notice = await fetch(`${origin}/airi/assets/furigana/NOTICE.md`)
      expect(await notice.text()).toContain('mecab-ipadic')
      const missing = await fetch(`${origin}/airi/assets/furigana/missing.dat.gz`)
      expect(missing.status).toBe(404)
    }
    finally {
      await server.close()
    }
  })

  it('bundles all dictionary files and notices for offline application builds', async () => {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [FuriganaDictionary(), {
        name: 'furigana-build-entry',
        resolveId: id => id === 'test-entry' ? '\0test-entry' : undefined,
        load: id => id === '\0test-entry' ? 'export const ready = true' : undefined,
      }],
      build: { write: false, rolldownOptions: { input: 'test-entry' } },
    })
    if (Array.isArray(result) || !('output' in result))
      throw new Error('Expected a single application build.')
    const files = result.output.map(file => file.fileName)
    expect(files.filter(name => name.endsWith('.dat.gz'))).toHaveLength(12)
    expect(files).toContain('assets/furigana/NOTICE.md')
    expect(files).toContain('assets/furigana/THIRD_PARTY_LICENSES.md')
  })
})
