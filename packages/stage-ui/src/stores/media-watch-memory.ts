import type { MediaWatchState, WatchHint } from '../libs/media-watch-memory'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { airiTimePeriodKey } from '../libs/media-vision'
import { MediaWatchMemory, MediaWatchSession } from '../libs/media-watch-memory'

/** Local profile storage only. Fresh snapshots let the main window observe a settings-window forget action. */
export const useMediaWatchMemoryStore = defineStore('media-watch-memory', () => {
  const enabled = useLocalStorage('hybrid/watch-memory-enabled', true)
  const habitProvider = useLocalStorage<'local' | 'brain' | 'gemini' | 'kimi'>('hybrid/watch-habit-provider', 'local')
  const timeAwareTeasing = useLocalStorage('hybrid/watch-time-aware', false)
  const timeTeasePeriods = useLocalStorage<string[]>('hybrid/watch-time-tease-periods', [])
  const state = useLocalStorage<MediaWatchState>('hybrid/watch-memory', { version: 1, videos: [], lastPlaylistHint: 0 })
  const session = new MediaWatchSession()
  let lastHintAt = 0
  let lastAttemptAt = 0
  let pending: { url: string, hint: WatchHint } | undefined
  function memory() {
    return new MediaWatchMemory(JSON.parse(JSON.stringify(state.value)))
  }
  const preferences = computed(() => memory().preferences())
  const playlist = computed(() => memory().playlist())
  const musicPreferences = computed(() => memory().musicPreferences())
  function observe(input: unknown) {
    if (!enabled.value) {
      session.clear()
      return
    }
    session.observe(input)
    const current = memory()
    if (current.observe(input))
      state.value = current.snapshot()
  }
  function takeHint(url: string) {
    const now = Date.now()
    if (!enabled.value || pending || now - lastHintAt < 120_000 || now - lastAttemptAt < 30_000)
      return undefined
    const current = memory()
    // Persistent song and playlist context takes priority over session replay and channel counts.
    const hint = current.takeHint(url) ?? session.takeHint(url)
    if (hint) {
      pending = { url, hint }
      lastAttemptAt = now
    }
    return hint
  }
  function completeHint(url: string, hint: WatchHint) {
    if (!enabled.value || pending?.url !== url || pending.hint !== hint)
      return
    const current = memory()
    current.completeHint(url, hint)
    session.completeHint(url, hint)
    state.value = current.snapshot()
    lastHintAt = Date.now()
    pending = undefined
  }
  function releaseHint(url: string, hint: WatchHint) {
    if (pending?.url === url && pending.hint === hint)
      pending = undefined
  }
  function observeMusic(url: string, observations: readonly string[]) {
    if (!enabled.value)
      return
    const current = memory()
    if (current.observeMusic(url, observations))
      state.value = current.snapshot()
  }
  function recent(url: string) {
    return enabled.value ? memory().recent(url) : []
  }
  function remember(url: string, text: string) {
    if (!enabled.value)
      return true
    const current = memory()
    const accepted = current.remember(url, text)
    if (accepted)
      state.value = current.snapshot()
    return accepted
  }
  function clear() {
    session.clear()
    lastHintAt = 0
    lastAttemptAt = 0
    pending = undefined
    state.value = { version: 1, videos: [], lastPlaylistHint: 0 }
    timeTeasePeriods.value = []
  }
  function canTimeTease(now: Date) {
    return enabled.value && timeAwareTeasing.value && !timeTeasePeriods.value.includes(airiTimePeriodKey(now))
  }
  function rememberTimeTease(period: string) {
    if (timeTeasePeriods.value.includes(period))
      return false
    timeTeasePeriods.value = [...timeTeasePeriods.value, period].slice(-10)
    return true
  }
  return { enabled, habitProvider, timeAwareTeasing, preferences, playlist, musicPreferences, observe, observeMusic, takeHint, completeHint, releaseHint, recent, remember, canTimeTease, rememberTimeTease, clear }
})
