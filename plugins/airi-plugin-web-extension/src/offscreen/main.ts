import type { TabAudioMessage, TabAudioStartResult } from '../shared/types'

import { errorMessageFrom } from '@moeru/std'
import { browser } from 'wxt/browser'

let context: AudioContext | undefined
let stream: MediaStream | undefined
let worklet: AudioWorkletNode | undefined
let scope: { sharingId: string, url: string, generation: number } | undefined
let generation = 0

async function stop() {
  scope = undefined
  if (worklet)
    worklet.port.onmessage = null
  worklet = undefined
  stream?.getTracks().forEach(track => track.stop())
  stream = undefined
  await context?.close()
  context = undefined
}

function encodeWav(samples: Float32Array) {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const data = new DataView(bytes.buffer)
  const write = (offset: number, text: string) => [...text].forEach((char, i) => data.setUint8(offset + i, char.charCodeAt(0)))
  write(0, 'RIFF')
  data.setUint32(4, bytes.length - 8, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, 1, true)
  data.setUint32(24, 16000, true)
  data.setUint32(28, 32000, true)
  data.setUint16(32, 2, true)
  data.setUint16(34, 16, true)
  write(36, 'data')
  data.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++)
    data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i]!)) * 32767, true)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}

browser.runtime.onMessage.addListener((message: TabAudioMessage, sender) => {
  if (sender.id !== browser.runtime.id || !('target' in message) || message.target !== 'offscreen')
    return
  if (message.type === 'audio:stop')
    return stop().then(() => true)
  if (message.type === 'audio:scope') {
    if (!context || !worklet || !scope)
      return Promise.resolve(false)
    scope = { sharingId: message.sharingId, url: message.url, generation: ++generation }
    // Generation tags reject chunks already queued before the worklet receives this reset.
    worklet.port.postMessage({ type: 'reset', generation })
    return Promise.resolve(true)
  }
  if (message.type !== 'audio:start')
    return
  return (async (): Promise<TabAudioStartResult> => {
    await stop()
    let stage = 'tab stream'
    try {
      // NOTICE:
      // Chrome rejects tab constraints mixed with standard microphone-processing fields as a malformed constraints TypeError.
      // Use the tab-only format from https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture.
      // Remove this constraint format when Chrome exposes a standard tab-stream selection API.
      const constraints = { audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId } }, video: false }
      stream = await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints)
      stage = 'playback setup'
      // Playback keeps the device's full sample rate and stereo channels. Only the worklet's analysis copy becomes mono 16 kHz.
      context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      // tabCapture mutes native tab playback. Reconnect the captured stream so the user still hears the video.
      source.connect(context.destination)
      stage = 'audio worklet'
      await context.audioWorklet.addModule(new URL('tab-audio-worklet.js', browser.runtime.getURL('/popup.html')))
      worklet = new AudioWorkletNode(context, 'airi-tab-audio')
      scope = { sharingId: message.sharingId, url: message.url, generation: ++generation }
      worklet.port.postMessage({ type: 'reset', generation })
      source.connect(worklet)
      worklet.connect(context.destination)
      worklet.port.onmessage = (event: MessageEvent<{ generation: number, samples: Float32Array }>) => {
        if (!scope || event.data.generation !== scope.generation)
          return
        const packet: TabAudioMessage = { type: 'audio:chunk', sharingId: scope.sharingId, url: scope.url, capturedAt: Date.now(), audio: encodeWav(event.data.samples) }
        void browser.runtime.sendMessage(packet).catch(() => {})
      }
      stage = 'audio playback'
      await context.resume()
      return { ok: true }
    }
    catch (error) {
      await stop()
      // Redact the opaque stream credential before an operational error reaches the popup.
      const detail = (errorMessageFrom(error) ?? 'Unknown capture error').replaceAll(message.streamId, '[stream]').slice(0, 160)
      return { ok: false, error: `${stage}: ${error instanceof Error ? error.name : 'UnknownError'}: ${detail}` }
    }
  })()
})
