import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { onUnauthorized } from './lib/supabase'
import { useAuthStore } from './stores/auth'
import { useToast } from './composables/useToast'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// A data request came back 401: the session expired or was revoked.
const auth = useAuthStore(pinia)
let handlingExpiry = false
onUnauthorized(async () => {
  if (handlingExpiry || !auth.session) return
  handlingExpiry = true
  try {
    await auth.signOut()
    useToast().error('Your session expired. Please sign in again.')
    await router.push({ name: 'login' })
  } finally {
    handlingExpiry = false
  }
})

// Anything that slips through: log it and tell the person in plain words.
function reportError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return // e.g. Stop in chat
  console.error(error)
  // Chunk loads fail after a deploy while an old tab is open; a reload fixes it.
  const message = error instanceof Error ? error.message : String(error)
  if (
    /Failed to fetch dynamically imported module|Importing a module script failed/i.test(message)
  ) {
    useToast().error('Tillki was updated. Reload the page to continue.', {
      action: { label: 'Reload', onClick: () => window.location.reload() },
    })
    return
  }
  useToast().error('Something went wrong. Try again, or reload the page if it keeps happening.')
}
app.config.errorHandler = (error) => reportError(error)
window.addEventListener('unhandledrejection', (event) => reportError(event.reason))
router.onError((error) => reportError(error))

app.mount('#app')
