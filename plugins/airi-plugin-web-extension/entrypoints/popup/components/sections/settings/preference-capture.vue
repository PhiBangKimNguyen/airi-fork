<script lang="ts" setup>
import type { ExtensionSettings } from '../../../../../src/shared/types'

import { Button, FieldCheckbox, FieldSelect } from '@proj-airi/ui'
import { computed } from 'vue'

import { mediaMessages } from '../../../../../src/shared/constants'

const emit = defineEmits<{
  (event: 'capture'): void
}>()
const sendPageContextModel = defineModel<boolean>('send-page-context', { required: true })
const sendVideoContextModel = defineModel<boolean>('send-video-context', { required: true })
const sendSubtitlesModel = defineModel<boolean>('send-subtitles', { required: true })
const sendSparkNotifyModel = defineModel<boolean>('send-spark-notify', { required: true })
const enableVisionModel = defineModel<boolean>('enable-vision', { required: true })
const cloudVideoVisionModel = defineModel<boolean>('cloud-video-vision', { required: true })
const cloudVideoProviderModel = defineModel<ExtensionSettings['cloudVideoProvider']>('cloud-video-provider', { required: true })
const audioEarsModel = defineModel<boolean>('audio-ears', { required: true })
const inklingResearchMediaModel = defineModel<boolean>('inkling-research-media', { required: true })
const followYouTubeVideosModel = defineModel<boolean>('follow-youtube-videos', { required: true })
const cloudModels = computed(() => [
  { value: 'gemini' as const, label: mediaMessages.cloudVideoModels.gemini },
  { value: 'kimi' as const, label: mediaMessages.cloudVideoModels.kimi },
  { value: 'gemma31' as const, label: mediaMessages.cloudVideoModels.gemma31 },
  { value: 'gemma26' as const, label: mediaMessages.cloudVideoModels.gemma26 },
  { value: 'inkling' as const, label: mediaMessages.cloudVideoModels.inkling, disabled: !inklingResearchMediaModel.value },
])
</script>

<template>
  <section :class="['rounded-2xl', 'bg-white/6', 'border', 'border-white/10', 'p-3', 'flex', 'flex-col', 'gap-3']">
    <h2 :class="['text-sm', 'font-600']">
      Capture Controls
    </h2>
    <div :class="['grid', 'grid-cols-1', 'gap-3']">
      <FieldCheckbox v-model="sendPageContextModel" label="Page context" />
      <FieldCheckbox v-model="sendVideoContextModel" label="Video context" />
      <FieldCheckbox v-model="sendSubtitlesModel" label="Subtitles" />
      <FieldCheckbox v-model="sendSparkNotifyModel" label="Notify character" />
      <FieldCheckbox v-model="followYouTubeVideosModel" :label="mediaMessages.followYouTubeVideos" />
      <FieldCheckbox v-model="cloudVideoVisionModel" :label="mediaMessages.cloudVideoVision" />
      <FieldSelect
        v-model="cloudVideoProviderModel"
        :label="mediaMessages.cloudVideoModel"
        :description="mediaMessages.cloudVideoModelDescription"
        :options="cloudModels"
        :disabled="!cloudVideoVisionModel"
        layout="vertical"
      />
      <FieldCheckbox v-model="audioEarsModel" :label="mediaMessages.audioEars" />
      <FieldCheckbox v-model="inklingResearchMediaModel" :label="mediaMessages.inklingResearchMedia" />
      <FieldCheckbox v-model="enableVisionModel" :label="mediaMessages.localVideoVision" />
    </div>
    <Button
      variant="secondary"
      size="sm"
      :disabled="!enableVision"
      @click="emit('capture')"
    >
      Capture frame
    </Button>
  </section>
</template>
