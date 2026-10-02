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

app.mount('#app')
