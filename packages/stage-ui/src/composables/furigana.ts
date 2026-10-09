import { errorMessageFrom } from '@moeru/std'
import { shallowRef, watch } from 'vue'

import { furigana } from '../libs/furigana'

/**
 * Shows source HTML immediately and adds readings after a short pause in streaming updates.
 * Watcher cleanup discards stale results and stops pending work when the component unmounts.
 * The caller must sanitize HTML before passing it here.
 */
export function useFurigana(html: () => string, enabled: () => boolean = () => true) {
  const content = shallowRef('')
  watch([html, enabled], ([source, enabled], _, onCleanup) => {
    content.value = source
    if (!enabled || !/\p{Script=Han}/u.test(source))
      return
    let current = true
    const timer = setTimeout(async () => {
      try {
        const result = await furigana.annotate(source)
        if (current)
          content.value = result
      }
      catch (error) {
        // Reading failures retain the source HTML. They never block reply display or speech.
        console.warn('Failed to add furigana:', errorMessageFrom(error))
      }
    }, 100)
    onCleanup(() => {
      current = false
      clearTimeout(timer)
    })
  }, { immediate: true, flush: 'sync' })
  return content
}
