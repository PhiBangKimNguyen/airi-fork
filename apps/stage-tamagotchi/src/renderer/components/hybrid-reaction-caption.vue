<script setup lang="ts">
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useCharacterStore } from '@proj-airi/stage-ui/stores/character'
import { useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import { useCaptionVisibility } from '../composables/use-caption-visibility'

const character = useCharacterStore()
const text = computed(() => character.reactionCaption)
const captionsVisible = useCaptionVisibility()
const { nowSpeaking } = storeToRefs(useSpeakingStore())
const recent = shallowRef(false)
const { start, stop } = useTimeoutFn(() => recent.value = false, 10_000, { immediate: false })

watch([text, () => character.reactions.at(-1)?.id, nowSpeaking], ([caption, id, speaking], [previous, previousId]) => {
  if (!caption.trim()) {
    recent.value = false
    stop()
    return
  }
  if (caption !== previous || id !== previousId)
    recent.value = true
  if (!recent.value)
    return
  if (speaking)
    stop()
  else
    start()
})
</script>

<template>
  <div
    v-if="text && recent && captionsVisible"
    data-testid="spontaneous-reaction-caption"
    role="status"
    aria-live="polite"
    :class="[
      'absolute bottom-12 left-3 right-3 z-50 max-h-36 overflow-y-auto rounded-xl px-3 py-2',
      'whitespace-pre-line text-sm leading-relaxed select-text',
      'bg-white/90 text-neutral-900 dark:bg-neutral-950/90 dark:text-neutral-100 backdrop-blur-md',
    ]"
  >
    {{ text }}
  </div>
</template>
