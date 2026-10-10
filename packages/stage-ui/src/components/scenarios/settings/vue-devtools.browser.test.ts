import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import VueDevtools from './vue-devtools.vue'

function mountSettings() {
  return render(VueDevtools, {
    global: {
      plugins: [createI18n({
        legacy: false,
        locale: 'en',
        messages: { en: { settings: { pages: { page: { developers: { 'vue-devtools': {
          title: 'Vue DevTools',
          description: 'Inspect Vue components and application state.',
        } } } } } } },
      })],
    },
  })
}

it('moves an existing launcher into settings and restores it when settings close', async () => {
  const container = document.createElement('div')
  container.id = '__vue-devtools-container__'
  document.body.appendChild(container)
  const screen = mountSettings()

  try {
    await expect.element(screen.getByText('Vue DevTools', { exact: true })).toBeVisible()
    expect(container.parentElement?.classList.contains('vue-devtools-settings')).toBe(true)
    await screen.unmount()
    expect(container.parentElement).toBe(document.body)
  }
  finally {
    container.remove()
  }
})

it('hosts a launcher that initializes after settings open', async () => {
  const screen = mountSettings()
  const container = document.createElement('div')
  container.id = '__vue-devtools-container__'
  document.body.appendChild(container)

  try {
    await expect.poll(() => container.parentElement?.classList.contains('vue-devtools-settings')).toBe(true)
    await screen.unmount()
    expect(container.parentElement).toBe(document.body)
  }
  finally {
    container.remove()
  }
})
