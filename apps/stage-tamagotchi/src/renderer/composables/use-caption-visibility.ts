import { useLocalStorage } from '@vueuse/core'

/** The chat control and caption window share a saved visibility preference through storage events. */
export function useCaptionVisibility() {
  return useLocalStorage('stage/captions-visible', true)
}
