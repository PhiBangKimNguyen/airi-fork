<script setup lang="ts">
import type { InferenceLane } from '@proj-airi/stage-ui/libs/privacy-routing'

import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { usePrivacyRoutingStore } from '@proj-airi/stage-ui/stores/privacy-routing'
import { GhostButton } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import HybridMemoryControls from './hybrid-memory-controls.vue'

const routing = usePrivacyRoutingStore()
const consciousness = useConsciousnessStore()
const card = useAiriCardStore()
const { t } = useI18n()
const saving = shallowRef(false)
const selected = computed(() => routing.mode === 'local' ? 'local' : routing.selectedProvider)
const lanes: InferenceLane[] = import.meta.env.VITE_AIRI_MODEL_ROLES_ENABLED === 'true'
  ? ['local', 'brain', 'kimi', 'gemini', 'gemma31', 'gemma26', 'inkling']
  : ['local', 'kimi', 'gemini', 'gemma31', 'gemma26', 'inkling']

async function select(lane: InferenceLane) {
  saving.value = true
  routing.mode = lane === 'local' ? 'local' : 'cloud'
  if (lane !== 'local')
    routing.switchProvider(lane)
  // Capture the next turn immediately. Card persistence does not require a hosted model request.
  consciousness.activeProvider = `hybrid-${lane}`
  consciousness.activeModel = `airi-${lane}`
  try {
    await card.updateActiveCardConsciousness({ provider: `hybrid-${lane}`, model: `airi-${lane}` })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-wrap items-center gap-1 px-1']" :aria-label="t('stage.hybrid.model-picker')">
    <GhostButton
      v-for="lane in lanes"
      :key="lane"
      :data-testid="`hybrid-provider-${lane}`"
      :active="selected === lane"
      :aria-pressed="selected === lane"
      :disabled="saving"
      size="unset"
      :class="['px-2 py-1 text-xs']"
      :title="t('stage.hybrid.private-always-local')"
      @click="select(lane)"
    >
      {{ lane === 'brain' ? 'GLM' : lane.toUpperCase() }}
    </GhostButton>
    <span :class="['ml-auto text-xs text-neutral-500 dark:text-neutral-400']" data-testid="inference-lane" aria-live="polite">
      {{ t('stage.hybrid.last-route', { model: routing.status }) }}
    </span>
    <HybridMemoryControls />
  </div>
</template>
