<script setup lang="ts">
import { useMutationObserver } from '@vueuse/core'
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const host = useTemplateRef<HTMLDivElement>('host')
const development = import.meta.env.DEV
let container: HTMLElement | null = null

// The observer covers delayed plugin initialization and stops after relocation.
// Unmount returns the plugin-owned root to the body, where stage styles hide it.
const { stop } = useMutationObserver(() => development ? document.body : undefined, () => mountLauncher(), { childList: true })

// NOTICE:
// Vue DevTools 8 mounts its launcher directly under document.body.
// The plugin has no option for a custom launcher host.
// Source: vite-plugin-vue-devtools/src/overlay/devtools-overlay.mjs.
// Remove this DOM relocation when the plugin supports a custom host.
function mountLauncher() {
  if (!host.value)
    return

  container = document.getElementById('__vue-devtools-container__')
  if (container) {
    host.value.appendChild(container)
    stop()
  }
}

onMounted(mountLauncher)
onUnmounted(() => {
  if (container)
    document.body.appendChild(container)
})
</script>

<template>
  <div
    v-if="development"
    :class="[
      'mb-2 rounded-lg px-4 py-3',
      'flex items-center justify-between gap-4',
      'bg-neutral-50 dark:bg-neutral-800',
    ]"
  >
    <div>
      <div :class="['text-sm']">
        {{ t('settings.pages.page.developers.vue-devtools.title') }}
      </div>
      <div :class="['text-sm text-neutral-500']">
        {{ t('settings.pages.page.developers.vue-devtools.description') }}
      </div>
    </div>
    <div ref="host" class="vue-devtools-settings" />
  </div>
</template>

<style scoped>
.vue-devtools-settings :deep(.vue-devtools__anchor) {
  position: static !important;
  display: flex !important;
  transform: none !important;
}

.vue-devtools-settings :deep(.vue-devtools__panel) {
  position: static !important;
  transform: none !important;
}

.vue-devtools-settings :deep(.panel-entry-btn) {
  transform: none !important;
}

.vue-devtools-settings :deep(.vue-devtools__anchor--glowing) {
  display: none;
}
</style>
