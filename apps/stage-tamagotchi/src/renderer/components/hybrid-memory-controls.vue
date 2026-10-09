<script setup lang="ts">
import { useMediaWatchMemoryStore } from '@proj-airi/stage-ui/stores/media-watch-memory'
import { usePrivacyRoutingStore } from '@proj-airi/stage-ui/stores/privacy-routing'
import { useUserProfileStore } from '@proj-airi/stage-ui/stores/user-profile'
import { FieldCheckbox, FieldTextArea, GhostButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { useCaptionVisibility } from '../composables/use-caption-visibility'

const memory = useMediaWatchMemoryStore()
const privacy = usePrivacyRoutingStore()
const profile = useUserProfileStore()
const captionsVisible = useCaptionVisibility()
const { t } = useI18n()
const providers = [
  { id: 'local', label: 'Qwen' },
  ...(import.meta.env.VITE_AIRI_MODEL_ROLES_ENABLED === 'true' ? [{ id: 'brain', label: 'GLM' } as const] : []),
  { id: 'gemini', label: 'Gemini' },
  { id: 'kimi', label: 'Kimi' },
] as const
</script>

<template>
  <FieldCheckbox v-model="captionsVisible" :label="t('stage.hybrid.show-captions')" />
  <FieldCheckbox v-model="privacy.idleMusings" :label="t('stage.hybrid.idle-musings')" />
  <details :class="['w-full text-xs text-neutral-500 dark:text-neutral-400']">
    <summary :class="['cursor-pointer py-1']">
      {{ t('stage.hybrid.user-profile') }}
    </summary>
    <div :class="['flex flex-col gap-2 p-2']">
      <FieldTextArea
        v-model="profile.text"
        :label="t('stage.hybrid.user-profile-card')"
        :description="t('stage.hybrid.user-profile-local')"
        :required="false"
        :rows="8"
        data-testid="hybrid-user-profile"
      />
      <FieldCheckbox v-model="profile.shareWithCloud" :label="t('stage.hybrid.user-profile-cloud')" />
      <p v-if="profile.shareWithCloud">
        {{ t('stage.hybrid.user-profile-cloud-scope') }}
      </p>
    </div>
  </details>
  <details :class="['w-full text-xs text-neutral-500 dark:text-neutral-400']">
    <summary :class="['cursor-pointer py-1']">
      {{ t('stage.hybrid.watch-memory') }}
    </summary>
    <div :class="['flex flex-col gap-2 p-2']">
      <FieldCheckbox v-model="privacy.mediaContinuity" :label="t('stage.hybrid.media-continuity')" />
      <FieldCheckbox v-model="privacy.sharedTitleChat" :label="t('stage.hybrid.shared-title-chat')" />
      <p>{{ t('stage.hybrid.media-continuity-scope') }}</p>
      <FieldCheckbox v-model="memory.enabled" :label="t('stage.hybrid.watch-memory-enabled')" />
      <p>{{ t('stage.hybrid.watch-memory-private') }}</p>
      <p>{{ t('stage.hybrid.watch-habit-provider') }}</p>
      <div :class="['flex flex-wrap gap-1']">
        <GhostButton
          v-for="provider in providers" :key="provider.id"
          :data-testid="`hybrid-habit-${provider.id}`"
          :aria-pressed="memory.habitProvider === provider.id"
          :disabled="!memory.enabled"
          :class="['px-2 py-1', memory.habitProvider === provider.id ? 'bg-primary-100 dark:bg-primary-900' : '']"
          @click="memory.habitProvider = provider.id"
        >
          {{ provider.label }}
        </GhostButton>
      </div>
      <p v-if="memory.habitProvider !== 'local'">
        {{ t('stage.hybrid.watch-habit-shared') }}
      </p>
      <FieldCheckbox v-model="memory.timeAwareTeasing" :disabled="!memory.enabled" :label="t('stage.hybrid.watch-time-aware')" />
      <p v-if="memory.timeAwareTeasing">
        {{ t('stage.hybrid.watch-time-shared') }}
      </p>
      <ul v-if="memory.preferences.favorites.length" :class="['list-disc pl-4']">
        <li v-for="favorite in memory.preferences.favorites" :key="favorite.id">
          {{ favorite.title }} — {{ t('stage.hybrid.watch-memory-days', { count: favorite.days }) }}
        </li>
      </ul>
      <GhostButton :class="['self-start px-2 py-1']" @click="memory.clear()">
        {{ t('stage.hybrid.watch-memory-forget') }}
      </GhostButton>
    </div>
  </details>
</template>
