import en from '@proj-airi/i18n/locales/en'

import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import MediaWatchPlaylist from './media-watch-playlist.vue'

import { MediaWatchMemory } from '../../libs/media-watch-memory'

import 'virtual:uno.css'

it('expands a collected song into watched links and shows genre evidence', async () => {
  const memory = new MediaWatchMemory({ version: 1, videos: [] })
  const original = { url: 'https://www.youtube.com/watch?v=songfixture', title: 'Artist - Летний дождь (Official Video)', isPlaying: true }
  const live = { ...original, url: 'https://www.youtube.com/watch?v=livefixture', title: 'Artist - Летний дождь (Live)' }
  const now = Date.now()
  memory.observe(original, now)
  memory.observe(original, now + 30_000)
  memory.observeMusic(original.url, ['MUSIC: A folk arrangement.'], now + 30_000)
  memory.observe(live, now + 60_000)
  memory.observe(live, now + 90_000)
  const screen = render(MediaWatchPlaylist, {
    props: { playlist: memory.playlist(), preferences: memory.musicPreferences() },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  await screen.getByText('Collected music playlist', { exact: true }).click()
  await expect.element(screen.getByText('Folk — 1 song', { exact: true })).toBeVisible()
  await expect.element(screen.getByText(original.title, { exact: true })).not.toBeVisible()
  await screen.getByText('Летний дождь — 2 versions', { exact: true }).click()
  await expect.element(screen.getByRole('link', { name: original.title })).toBeVisible()
  await expect.element(screen.getByRole('link', { name: original.title })).toHaveAttribute('href', original.url)
  await expect.element(screen.getByRole('link', { name: live.title })).toHaveAttribute('href', live.url)
})
