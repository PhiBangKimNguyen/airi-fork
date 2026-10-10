<script setup lang="ts">
import { useFurigana } from '../../composables/furigana'

const props = defineProps<{ text: string }>()
const content = useFurigana(() => {
  const template = document.createElement('template')
  template.content.textContent = props.text
  return template.innerHTML
})
</script>

<template>
  <span :class="['furigana-text', 'whitespace-pre-wrap leading-loose']" v-html="content" />
</template>

<style scoped>
.furigana-text :deep(ruby) {
  ruby-position: over;
}

.furigana-text :deep(rt) {
  font-size: 0.55em;
  text-align: center;
  -webkit-text-stroke: 0;
}
</style>
