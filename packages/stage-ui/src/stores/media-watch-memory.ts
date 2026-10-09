import type { MediaWatchState } from '../libs/media-watch-memory'

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
  const state = useLocalStorage<MediaWatchState>('hybrid/watch-memory', { version: 1, videos: [] })
  const session = new MediaWatchSession()
  let lastHintAt = 0
  function memory() {
    return new MediaWatchMemory(JSON.parse(JSON.stringify(state.value)))
  }
  const preferences = computed(() => memory().preferences())
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
    if (!enabled.value || Date.now() - lastHintAt < 120_000)
      return undefined
    const sessionHint = session.takeHint(url)
    if (sessionHint) {
      lastHintAt = Date.now()
      return sessionHint
    }
    const current = memory()
    const hint = current.takeHint(url)
    if (hint) {
      lastHintAt = Date.now()
      state.value = current.snapshot()
    }
    return hint
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
    state.value = { version: 1, videos: [] }
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
  return { enabled, habitProvider, timeAwareTeasing, preferences, observe, takeHint, recent, remember, canTimeTease, rememberTimeTease, clear }
})
