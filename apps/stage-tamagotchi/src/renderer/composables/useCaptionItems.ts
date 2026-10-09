import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { readonly, shallowRef } from 'vue'

export interface CaptionItem {
  id: number
  type: CaptionChannelEvent['type']
  text: string
}

export interface UseCaptionItemsOptions {
  /** Time since the last nonempty update before the entire bubble clears. @default 10000 */
  ttlMs?: number
}

/** Captions stay together while updates arrive. The owner calls dispose when its window closes. */
export function useCaptionItems(options: UseCaptionItemsOptions = {}) {
  const ttlMs = options.ttlMs ?? 10_000
  const items = shallowRef<CaptionItem[]>([])
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  let nextId = 1

  function clearType(type: CaptionChannelEvent['type']) {
    items.value = items.value.filter(item => item.type !== type)
  }

  function dispose() {
    clearTimeout(expiryTimer)
    expiryTimer = undefined
    items.value = []
  }

  function add(event: CaptionChannelEvent) {
    if (!event.text.trim()) {
      clearType(event.type)
      return
    }
    const current = event.operation === 'replace' ? items.value.findLast(item => item.type === event.type) : undefined
    const item: CaptionItem = { id: current?.id ?? nextId++, type: event.type, text: event.text }
    items.value = event.operation === 'replace'
      ? [...items.value.filter(previous => previous.type !== event.type), item]
      : [...items.value, item]
    clearTimeout(expiryTimer)
    expiryTimer = setTimeout(dispose, ttlMs)
  }

  return { items: readonly(items), add, clearType, dispose }
}
