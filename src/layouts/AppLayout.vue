<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useAppSettings } from '@/composables/useAppSettings'
import { useDataVersion } from '@/composables/useDataChanged'
import { useKeyboardOpen } from '@/composables/useKeyboardOpen'
import { useStaleBadge } from '@/composables/useStale'
import { useAuthStore } from '@/stores/auth'
import AccountPanel from './AccountPanel.vue'
import AddMenuSheet from './AddMenuSheet.vue'
import { isAddRoute, isNavActive, primaryNav, secondaryNav, tabItems } from './navigation'

const route = useRoute()
const auth = useAuthStore()
const keyboardOpen = useKeyboardOpen()
const accountOpen = ref(false)
const addOpen = ref(false)

const title = computed(() => route.meta.title ?? 'Tillki')
const fullBleed = computed(() => route.meta.fullBleed === true)

// A badge on the Dashboard tab while items are sitting past the stale limit.
const stale = useStaleBadge()
async function refreshStale() {
  // The shell can mount for a moment before the sign-in redirect; only ask when signed in.
  if (!auth.isAdmin) return
  const settings = useAppSettings()
  await settings.reload()
  await stale.refresh(settings.staleDays.value)
}
onMounted(refreshStale)
watch([useDataVersion(), () => auth.isAdmin], refreshStale)
const staleLabel = computed(() => `${stale.count.value} stale items`)
const path = computed(() => route.path)
</script>

<template>
  <div class="min-h-dvh lg:flex">
    <!-- Skip link for keyboard users -->
    <a
      href="#main"
      class="sr-only z-[70] rounded-lg bg-primary px-4 py-3 font-semibold text-primary-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to content
    </a>

    <!-- ===== Desktop sidebar (lg+) ===== -->
    <aside
      class="sticky top-0 hidden h-dvh print:hidden w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex"
      aria-label="Main"
    >
      <RouterLink to="/inventory" class="mb-6 flex items-center gap-2.5 rounded-lg px-3 py-1">
        <span
          class="grid size-9 rotate-[-4deg] place-items-center rounded-md border-2 border-accent text-lg font-black text-accent"
          aria-hidden="true"
          >蔵</span
        >
        <span class="text-xl font-black tracking-tight">Tillki</span>
      </RouterLink>

      <button
        type="button"
        class="mb-4 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-ink hover:opacity-90"
        aria-haspopup="dialog"
        @click="addOpen = true"
      >
        <Plus class="size-5" aria-hidden="true" />
        Add
      </button>

      <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        <template v-for="(group, i) in [primaryNav, secondaryNav]" :key="i">
          <div v-if="i > 0" class="mx-3 my-3 border-t border-line" />
          <RouterLink
            v-for="item in group"
            :key="item.to"
            :to="item.to"
            class="relative flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
            active-class=""
            exact-active-class=""
            :class="{ 'bg-surface-2 font-bold text-ink': isNavActive(item.to, path) }"
            :aria-current="isNavActive(item.to, path) ? 'page' : undefined"
          >
            <span
              v-if="isNavActive(item.to, path)"
              class="absolute top-2 bottom-2 left-0 w-1 rounded-full bg-accent"
              aria-hidden="true"
            />
            <component :is="item.icon" class="size-5" aria-hidden="true" />
            {{ item.label }}
            <span
              v-if="item.to === '/dashboard' && stale.visible.value"
              class="ml-auto rounded-full bg-accent px-2 text-xs font-bold text-white"
              :aria-label="staleLabel"
              >{{ stale.count.value }}</span
            >
          </RouterLink>
        </template>
      </nav>

      <button
        type="button"
        class="mt-2 flex min-h-11 items-center gap-3 rounded-lg px-3 text-left font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
        @click="accountOpen = true"
      >
        <UserAvatar :src="auth.avatarUrl" :name="auth.displayName" size="sm" />
        <span class="min-w-0 truncate">{{ auth.displayName || 'Account' }}</span>
      </button>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- ===== Mobile top bar ===== -->
      <header
        class="sticky top-0 z-30 border-b border-line bg-bg/90 pt-safe backdrop-blur lg:hidden print:hidden"
      >
        <div class="flex h-14 items-center gap-3 pr-safe pl-safe">
          <h1 class="min-w-0 flex-1 truncate pl-4 text-lg font-bold">{{ title }}</h1>
          <!-- Pages can add their own top bar buttons here (Teleport to #topbar-actions). -->
          <div id="topbar-actions" class="flex items-center" />
          <button
            type="button"
            class="mr-2 grid size-11 place-items-center rounded-full"
            aria-label="Account menu"
            @click="accountOpen = true"
          >
            <UserAvatar :src="auth.avatarUrl" :name="auth.displayName" />
          </button>
        </div>
      </header>

      <!-- ===== Content ===== -->
      <main
        id="main"
        tabindex="-1"
        class="flex-1 outline-none"
        :class="
          fullBleed
            ? 'min-h-0'
            : 'px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-12'
        "
      >
        <h1 v-if="!fullBleed" class="mb-6 hidden text-3xl font-black tracking-tight lg:block">
          {{ title }}
        </h1>
        <slot />
      </main>
    </div>

    <!-- ===== Mobile bottom tab bar ===== -->
    <nav
      class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur transition-transform duration-200 lg:hidden print:hidden"
      :class="{ 'translate-y-full': keyboardOpen }"
      aria-label="Main"
    >
      <ul class="mx-auto grid h-16 max-w-lg grid-cols-5 items-stretch pr-safe pl-safe">
        <li v-for="item in tabItems.left" :key="item.to">
          <RouterLink
            :to="item.to"
            class="relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted"
            :class="{ 'font-bold text-ink': isNavActive(item.to, path, { mobile: true }) }"
            :aria-current="isNavActive(item.to, path, { mobile: true }) ? 'page' : undefined"
          >
            <span
              v-if="item.to === '/dashboard' && stale.visible.value"
              class="absolute top-1.5 left-1/2 ml-2 min-w-5 rounded-full bg-accent px-1 text-center text-[10px] leading-5 font-bold text-white"
              :aria-label="staleLabel"
              >{{ stale.count.value }}</span
            >
            <span
              v-if="isNavActive(item.to, path, { mobile: true })"
              class="absolute top-0 h-1 w-8 rounded-b-full bg-accent"
              aria-hidden="true"
            />
            <component
              :is="item.icon"
              class="size-6"
              :stroke-width="isNavActive(item.to, path, { mobile: true }) ? 2.5 : 1.75"
              aria-hidden="true"
            />
            {{ item.label }}
          </RouterLink>
        </li>
        <li class="flex items-start justify-center">
          <button
            type="button"
            class="-mt-5 grid size-14 place-items-center rounded-full bg-primary text-primary-ink shadow-lg ring-4 ring-bg"
            :class="{ 'ring-accent': isAddRoute(path) }"
            aria-label="Add"
            aria-haspopup="dialog"
            @click="addOpen = true"
          >
            <Plus class="size-7" :stroke-width="2.5" aria-hidden="true" />
          </button>
        </li>
        <li v-for="item in tabItems.right" :key="item.to">
          <RouterLink
            :to="item.to"
            class="relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted"
            :class="{ 'font-bold text-ink': isNavActive(item.to, path, { mobile: true }) }"
            :aria-current="isNavActive(item.to, path, { mobile: true }) ? 'page' : undefined"
          >
            <span
              v-if="isNavActive(item.to, path, { mobile: true })"
              class="absolute top-0 h-1 w-8 rounded-b-full bg-accent"
              aria-hidden="true"
            />
            <component
              :is="item.icon"
              class="size-6"
              :stroke-width="isNavActive(item.to, path, { mobile: true }) ? 2.5 : 1.75"
              aria-hidden="true"
            />
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <AddMenuSheet v-model:open="addOpen" />

    <BaseSheet v-model:open="accountOpen" title="Account">
      <AccountPanel @signed-out="accountOpen = false" />
    </BaseSheet>
  </div>
</template>
