<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { Callout, FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Alert from '../../misc/alert.vue'
import SpeechPlayground from './speech-playground.vue'
import SpeechProviderSettings from './speech-provider-settings.vue'

import { useProviderValidation } from '../../../composables/use-provider-validation'
import { useSpeechStore } from '../../../stores/modules/speech'
import { useProviderConfigStore } from '../../../stores/providers/config'
import { useProviderStore } from '../../../stores/providers/provider'

const props = defineProps<{
  providerId: string
  /** Translation key for the `intonationScale` label. Each engine reads that field differently. */
  intonationLabelKey: string
  intonationDescriptionKey: string
  defaultText: string
}>()

const { t } = useI18n()
const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()

// These engines need no credentials. The address is in Advanced settings.
const apiKeyConfigured = true

// Browser requests require the engine to allow this origin.
const showOriginCallout = computed(() => !isStageTamagotchi())

const showJReelControl = computed(() => import.meta.env.VITE_AIRI_HYBRID_ENABLED === 'true' && props.providerId === 'voicevox')

const availableVoices = computed(() => speechStore.availableVoices[props.providerId] || [])

// Validation marks the provider as configured before the voice catalogue loads.
const { forceValid, isValid, isValidating, validationMessage } = useProviderValidation(props.providerId)

// Validation can finish after mount. Load voices when the provider becomes configured.
watch(() => providerStore.configuredProviders[props.providerId], async (configured) => {
  if (configured)
    await speechStore.loadVoicesForProvider(props.providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string) {
  const provider = await providersStore.getProviderInstance(props.providerId) as SpeechProvider
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  return await speechStore.speech(
    provider,
    'default',
    input,
    voiceId,
    { ...providerStore.getProviderConfig(props.providerId) },
  )
}
</script>

<template>
  <Callout
    v-if="showOriginCallout"
    theme="violet"
    :label="t(`settings.pages.providers.provider.${props.providerId}.callout_origin_title`)"
  >
    {{ t(`settings.pages.providers.provider.${props.providerId}.callout_origin`) }}
  </Callout>

  <SpeechProviderSettings
    :provider-id="props.providerId"
    :additional-settings="showJReelControl ? { prosody: 'j' } : {}"
    default-model="default"
    hide-api-key
  >
    <!-- Keep connection errors visible when Advanced settings are collapsed. -->
    <template #basic-settings>
      <Alert v-if="isValidating > 0" type="loading">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationRunning') }}
        </template>
      </Alert>
      <Alert v-else-if="!isValid && validationMessage" type="error">
        <template #title>
          <div :class="['w-full flex items-center justify-between']">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              :class="[
                'ml-2 rounded px-2 py-0.5',
                'text-xs font-medium transition-colors',
                'bg-red-100 text-red-600 hover:bg-red-200',
                'dark:bg-red-800/30 dark:text-red-300 dark:hover:bg-red-700/40',
              ]"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template #content>
          <div :class="['whitespace-pre-wrap break-all']">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
      <Alert v-else-if="isValid" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>
    </template>

    <template #voice-settings="{ voiceSettings }">
      <div :class="['flex flex-col gap-4']">
        <FieldCheckbox
          v-if="showJReelControl"
          :model-value="voiceSettings.prosody !== 'original'"
          :label="t('settings.pages.providers.provider.voicevox.fields.field.j-reel.label')"
          :description="t('settings.pages.providers.provider.voicevox.fields.field.j-reel.description')"
          @update:model-value="voiceSettings.prosody = $event ? 'j' : 'original'"
        />

        <FieldRange
          v-model="voiceSettings.speed"
          :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
          :min="0.5" :max="2" :step="0.01"
        />

        <!-- The engine reads pitchScale in a narrow range around zero. -->
        <FieldRange
          v-model="voiceSettings.pitch"
          :label="t('settings.pages.providers.provider.common.fields.field.pitch.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.pitch.description')"
          :min="-0.15" :max="0.15" :step="0.01"
        />

        <FieldRange
          v-model="voiceSettings.intonation"
          :label="t(props.intonationLabelKey)"
          :description="t(props.intonationDescriptionKey)"
          :min="0" :max="2" :step="0.01"
        />

        <FieldRange
          v-model="voiceSettings.volume"
          :label="t('settings.pages.providers.provider.common.fields.field.volume.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.volume.description')"
          :min="0" :max="2" :step="0.01"
        />
      </div>
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :use-ssml="false"
        :default-text="props.defaultText"
      />
    </template>
  </SpeechProviderSettings>
</template>
