import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { userProfilePrompt } from '../libs/user-profile'

/**
 * Owns the user's own card in local profile storage. It does not replicate through AIRI account sync.
 * The local lane always receives the card. A cloud lane receives it only after the user enables sharing.
 */
export const useUserProfileStore = defineStore('user-profile', () => {
  const text = useLocalStorage('hybrid/user-profile', '')
  const shareWithCloud = useLocalStorage('hybrid/user-profile-cloud', false)
  const cloudProfile = computed(() => shareWithCloud.value && text.value.trim() ? text.value : undefined)
  const localPrompt = computed(() => userProfilePrompt(text.value))
  return { text, shareWithCloud, cloudProfile, localPrompt }
})
