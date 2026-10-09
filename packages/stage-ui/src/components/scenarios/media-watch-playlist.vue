<script setup lang="ts">
import type { MediaWatchMemory } from '../../libs/media-watch-memory'

import { useI18n } from 'vue-i18n'

defineProps<{
  playlist: ReturnType<MediaWatchMemory['playlist']>
  preferences: ReturnType<MediaWatchMemory['musicPreferences']>
}>()

const { t } = useI18n()
</script>

<template>
  <details :class="['flex flex-col gap-2']">
    <summary :class="['cursor-pointer py-1']">
      {{ t('stage.hybrid.music-playlist') }}
    </summary>
    <p :class="['py-1']">
      {{ t('stage.hybrid.music-playlist-scope') }}
    </p>
    <p v-if="!playlist.length">
      {{ t('stage.hybrid.music-playlist-empty') }}
    </p>
    <ul v-else :class="['max-h-64 overflow-y-auto', 'flex flex-col gap-2 py-2']">
      <li v-for="song in playlist" :key="song.id">
        <details>
          <summary :class="['cursor-pointer break-words']">
            {{ song.title }} — {{ t('stage.hybrid.music-versions', { count: song.versions.length }) }}
          </summary>
          <ul :class="['list-disc pl-4']">
            <li v-for="version in song.versions" :key="version.id">
              <a :href="version.url" target="_blank" rel="noopener noreferrer" :class="['break-words underline', 'hover:text-primary-500']">
                {{ version.title }}
              </a>
              <span v-if="version.channel"> — {{ version.channel }}</span>
            </li>
          </ul>
        </details>
      </li>
    </ul>
    <p :class="['py-1 font-medium']">
      {{ t('stage.hybrid.music-genres') }}
    </p>
    <p v-if="!preferences.genres.length">
      {{ t('stage.hybrid.music-genres-empty') }}
    </p>
    <ul v-else :class="['list-disc pl-4']">
      <li v-for="genre in preferences.genres" :key="genre.name">
        {{ t(`stage.hybrid.music-genre-labels.${genre.name}`) }} — {{ t('stage.hybrid.music-genre-songs', { count: genre.songs }) }}
      </li>
    </ul>
    <p v-if="preferences.unknownGenreSongs" :class="['py-1']">
      {{ t('stage.hybrid.music-genres-unknown', { count: preferences.unknownGenreSongs }) }}
    </p>
  </details>
</template>
