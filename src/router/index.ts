import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Shown in the top bar and the browser tab. */
    title?: string
    /** 'bare' renders without the tab bar / sidebar (login, auth callback). */
    layout?: 'app' | 'bare'
    requiresAuth?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash }
    return { top: 0 }
  },
  routes: [
    { path: '/', redirect: '/inventory' },

    // Public, bare layout
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: 'Sign in', layout: 'bare' },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/views/AuthCallbackView.vue'),
      meta: { title: 'Signing in', layout: 'bare' },
    },
    {
      path: '/not-authorized',
      name: 'not-authorized',
      component: () => import('@/views/NotAuthorizedView.vue'),
      meta: { title: 'No access', layout: 'bare' },
    },

    // App
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/inventory/InventoryListView.vue'),
      meta: { title: 'Inventory', requiresAuth: true },
    },
    {
      path: '/inventory/new',
      name: 'item-new',
      component: () => import('@/views/inventory/ItemNewView.vue'),
      meta: { title: 'Add item', requiresAuth: true },
    },
    {
      path: '/inventory/:id',
      name: 'item-detail',
      component: () => import('@/views/inventory/ItemDetailView.vue'),
      props: true,
      meta: { title: 'Item', requiresAuth: true },
    },
    {
      path: '/inventory/:id/edit',
      name: 'item-edit',
      component: () => import('@/views/inventory/ItemEditView.vue'),
      props: true,
      meta: { title: 'Edit item', requiresAuth: true },
    },
    {
      path: '/templates',
      name: 'templates',
      component: () => import('@/views/templates/TemplateListView.vue'),
      meta: { title: 'Sets', requiresAuth: true },
    },
    {
      path: '/templates/new',
      name: 'template-new',
      component: () => import('@/views/templates/TemplateNewView.vue'),
      meta: { title: 'New set', requiresAuth: true },
    },
    {
      path: '/templates/:id',
      name: 'template-detail',
      component: () => import('@/views/templates/TemplateDetailView.vue'),
      props: true,
      meta: { title: 'Set', requiresAuth: true },
    },
    {
      path: '/templates/:id/edit',
      name: 'template-edit',
      component: () => import('@/views/templates/TemplateEditView.vue'),
      props: true,
      meta: { title: 'Edit set', requiresAuth: true },
    },
    {
      path: '/templates/:id/add-volumes',
      name: 'template-add-volumes',
      component: () => import('@/views/templates/TemplateAddVolumesView.vue'),
      props: true,
      meta: { title: 'Add volumes', requiresAuth: true },
    },
    {
      path: '/sales',
      name: 'sales',
      component: () => import('@/views/SalesView.vue'),
      meta: { title: 'Sales', requiresAuth: true },
    },
    {
      path: '/lots',
      name: 'lots',
      component: () => import('@/views/LotsView.vue'),
      meta: { title: 'Lots', requiresAuth: true },
    },
    {
      path: '/expenses',
      name: 'expenses',
      component: () => import('@/views/ExpensesView.vue'),
      meta: { title: 'Expenses', requiresAuth: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: 'Dashboard', requiresAuth: true },
    },
    {
      path: '/ask/:threadId?',
      name: 'ask',
      component: () => import('@/views/AskView.vue'),
      props: true,
      meta: { title: 'Ask Kura', requiresAuth: true },
    },
    {
      path: '/tools',
      name: 'tools',
      component: () => import('@/views/ToolsView.vue'),
      meta: { title: 'Tools', requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: 'Settings', requiresAuth: true },
    },
    {
      path: '/more',
      name: 'more',
      component: () => import('@/views/MoreView.vue'),
      meta: { title: 'More', requiresAuth: true },
    },

    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Not found', requiresAuth: true },
    },
  ],
})

// Auth gate. Waits for the session to load before the first navigation.
//  * signed out + requiresAuth -> /login (remembering where you were going)
//  * signed in but not an admin -> /not-authorized
//  * admins never see /login or /not-authorized
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  const signedIn = auth.session !== null

  if (to.name === 'auth-callback') return true

  if (to.name === 'login') {
    if (!signedIn) return true
    return auth.isAdmin ? { name: 'inventory' } : { name: 'not-authorized' }
  }

  if (to.name === 'not-authorized') {
    if (!signedIn) return { name: 'login' }
    return auth.isAdmin ? { name: 'inventory' } : true
  }

  if (to.meta.requiresAuth) {
    if (!signedIn) {
      auth.rememberRedirect(to.fullPath)
      return { name: 'login' }
    }
    if (!auth.isAdmin) return { name: 'not-authorized' }
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Kura` : 'Kura'
})

export default router
