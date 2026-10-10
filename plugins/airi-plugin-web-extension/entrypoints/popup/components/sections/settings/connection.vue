<script lang="ts" setup>
import { Button, FieldInput } from '@proj-airi/ui'

import { mediaMessages } from '../../../../../src/shared/constants'

defineProps<{
  enabled: boolean
  syncing: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle'): void
  (event: 'apply'): void
}>()
const wsUrlModel = defineModel<string>('ws-url', { required: true })
const tokenModel = defineModel<string>('token', { required: true })
</script>

<template>
  <section :class="['rounded-2xl', 'bg-white/6', 'border', 'border-white/10', 'p-3', 'flex', 'flex-col', 'gap-3']">
    <div :class="['flex', 'items-center', 'justify-between']">
      <h2 :class="['text-sm', 'font-600']">
        Connection
      </h2>
      <Button variant="secondary" size="sm" :disabled="syncing" @click="emit('toggle')">
        {{ enabled ? mediaMessages.stopSharing : mediaMessages.shareTab }}
      </Button>
    </div>
    <p :class="['text-xs opacity-80']">
      {{ mediaMessages.sharingDescription }}
    </p>
    <FieldInput v-model="wsUrlModel" label="WebSocket URL" placeholder="ws://127.0.0.1:6121/ws" />
    <FieldInput v-model="tokenModel" label="Access Token" placeholder="optional" />
    <Button variant="primary" size="sm" :disabled="syncing" @click="emit('apply')">
      Apply settings
    </Button>
  </section>
</template>
