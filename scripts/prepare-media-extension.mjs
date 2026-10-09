/**
 * Pairs the built extension with this desktop profile without including hosted API keys.
 *
 * Call stack:
 * prepare-media-extension.mjs
 *   -> read local AIRI channel config
 *     -> write ignored extension pairing.json
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const config = JSON.parse(await readFile(new URL('../.local/hybrid-user-data/server-channel-config.json', import.meta.url), 'utf8'))
if (typeof config.authToken !== 'string' || config.authToken.length < 32)
  throw new Error('Launch the hybrid desktop first to initialize its local channel credential.')
if (config.hostname !== '127.0.0.1')
  throw new Error('The media channel requires the loopback desktop profile.')
const destination = new URL('../plugins/airi-plugin-web-extension/.output/chrome-mv3/pairing.json', import.meta.url)
const settings = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'))
await writeFile(destination, JSON.stringify({ token: config.authToken, cloudVideoVision: settings.AIRI_CLOUD_VIDEO_VISION === 'true', audioEars: settings.AIRI_AUDIO_EARS === 'true' }), { mode: 0o600 })
console.info(`Paired extension folder: ${fileURLToPath(new URL('.', destination))}`)
