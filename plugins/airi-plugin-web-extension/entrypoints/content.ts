import { startContentObserver } from '../src/content'

export default defineContentScript({
  matches: [
    '*://*/*',
  ],
  runAt: 'document_idle',
  main() {
    let stop: (() => void) | undefined
    const setSharing = (enabled: boolean) => {
      if (enabled && !stop)
        stop = startContentObserver()
      if (!enabled) {
        stop?.()
        stop = undefined
      }
    }
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (message && typeof message === 'object' && 'type' in message && message.type === 'background:set-sharing' && 'enabled' in message)
        setSharing(message.enabled === true)
    })
    // A restarted background worker revokes sharing. The heartbeat also drives bounded reactions.
    const refresh = () => {
      void browser.runtime.sendMessage({ type: 'content:ready' }).then(shared => setSharing(shared === true)).catch(() => setSharing(false))
    }
    refresh()
    window.setInterval(refresh, 5000)
  },
})
