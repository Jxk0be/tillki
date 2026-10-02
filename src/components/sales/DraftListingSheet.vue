<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, Sparkles } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import ChipSelect from '@/components/ui/ChipSelect.vue'
import { useToast } from '@/composables/useToast'
import {
  draftListing,
  saveItemDescription,
  type DraftResponse,
  type ListingPlatform,
} from '@/composables/useListings'

/**
 * Drafts a listing for one item, or a bundle of volumes from one set, with the
 * draft-listing Edge Function. Each field can be copied; a single item's
 * description can be saved back to it.
 */
const props = defineProps<{ itemIds: string[]; title: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()

type Platform = ListingPlatform

const PLATFORM_KEY = 'kura-draft-platform'
const platformOptions: { value: Platform; label: string }[] = [
  { value: 'ebay', label: 'eBay' },
  { value: 'mercari', label: 'Mercari' },
  { value: 'fb_marketplace', label: 'Facebook' },
]
function rememberedPlatform(): Platform {
  try {
    const v = localStorage.getItem(PLATFORM_KEY)
    if (v === 'ebay' || v === 'mercari' || v === 'fb_marketplace') return v
  } catch {
    // storage blocked
  }
  return 'ebay'
}

const platform = ref<Platform | null>(rememberedPlatform())
const result = ref<DraftResponse | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const bundle = computed(() => props.itemIds.length > 1)

watch(open, (isOpen) => {
  if (isOpen) {
    result.value = null
    error.value = ''
  }
})

async function draft() {
  if (!platform.value) return
  try {
    localStorage.setItem(PLATFORM_KEY, platform.value)
  } catch {
    // fine
  }
  loading.value = true
  error.value = ''
  try {
    result.value = await draftListing(props.itemIds, platform.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't draft the listing."
  } finally {
    loading.value = false
  }
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied.`)
  } catch {
    toast.error("Couldn't copy. Select the text instead.")
  }
}

const allText = computed(() => {
  const d = result.value?.draft
  if (!d) return ''
  return [
    d.title,
    '',
    d.description,
    d.condition_notes ? `\nCondition: ${d.condition_notes}` : '',
    d.suggested_tags.length ? `\nTags: ${d.suggested_tags.join(', ')}` : '',
  ]
    .filter((x) => x !== '')
    .join('\n')
})

async function saveDescription() {
  const d = result.value?.draft
  const id = props.itemIds[0]
  if (!d || !id || bundle.value) return
  saving.value = true
  try {
    await saveItemDescription(id, d.description)
    toast.success('Description saved to the item.')
    emit('saved')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't save the description.")
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseSheet
    v-model:open="open"
    :title="bundle ? 'Draft bundle listing' : 'Draft listing'"
    :description="title"
  >
    <div class="space-y-4">
      <ChipSelect v-model="platform" label="Where it's going" :options="platformOptions" />
      <BaseButton block :loading="loading" :disabled="!platform" @click="draft">
        <Sparkles class="size-4" aria-hidden="true" />
        {{ result ? 'Draft again' : 'Draft it' }}
      </BaseButton>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>

      <template v-if="result">
        <p
          v-if="result.photos.examples"
          class="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2"
        >
          This copy has no photos of its own, so the set's example photos were used and condition
          wasn't judged from them.
        </p>
        <p v-else-if="result.photos.count === 0" class="text-sm text-ink-2">
          No photos, so the draft is from the item's details only.
        </p>

        <section class="space-y-1">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-ink-2">
              Title
              <span class="font-normal text-muted"
                >({{ result.draft.title.length }} characters)</span
              >
            </h3>
            <button
              type="button"
              class="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-primary"
              @click="copy(result.draft.title, 'Title')"
            >
              <Copy class="size-4" aria-hidden="true" /> Copy
            </button>
          </div>
          <p class="rounded-lg border border-line bg-surface p-3 font-medium">
            {{ result.draft.title }}
          </p>
        </section>

        <section class="space-y-1">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-ink-2">Description</h3>
            <button
              type="button"
              class="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-primary"
              @click="copy(result.draft.description, 'Description')"
            >
              <Copy class="size-4" aria-hidden="true" /> Copy
            </button>
          </div>
          <p class="rounded-lg border border-line bg-surface p-3 whitespace-pre-wrap">
            {{ result.draft.description }}
          </p>
        </section>

        <section v-if="result.draft.condition_notes" class="space-y-1">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-ink-2">Condition notes</h3>
            <button
              type="button"
              class="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-primary"
              @click="copy(result.draft.condition_notes, 'Condition notes')"
            >
              <Copy class="size-4" aria-hidden="true" /> Copy
            </button>
          </div>
          <p class="rounded-lg border border-line bg-surface p-3">
            {{ result.draft.condition_notes }}
          </p>
        </section>

        <section v-if="result.draft.suggested_tags.length" class="space-y-1">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-ink-2">Tags</h3>
            <button
              type="button"
              class="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-primary"
              @click="copy(result.draft.suggested_tags.join(', '), 'Tags')"
            >
              <Copy class="size-4" aria-hidden="true" /> Copy
            </button>
          </div>
          <ul class="flex flex-wrap gap-1.5">
            <li
              v-for="t in result.draft.suggested_tags"
              :key="t"
              class="rounded-full bg-surface-2 px-3 py-1 text-sm"
            >
              {{ t }}
            </li>
          </ul>
        </section>

        <section
          v-if="result.draft.flaws_seen.length"
          class="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm"
        >
          <h3 class="font-semibold text-danger">Flaws seen in the photos</h3>
          <ul class="mt-1 list-disc pl-5">
            <li v-for="f in result.draft.flaws_seen" :key="f">{{ f }}</li>
          </ul>
        </section>
      </template>
    </div>

    <template v-if="result" #footer>
      <div class="flex flex-wrap gap-2">
        <BaseButton
          v-if="!bundle"
          variant="secondary"
          class="flex-1"
          :loading="saving"
          @click="saveDescription"
          >Save description</BaseButton
        >
        <BaseButton class="flex-1" @click="copy(allText, 'Listing')">
          <Copy class="size-4" aria-hidden="true" /> Copy all
        </BaseButton>
      </div>
    </template>
  </BaseSheet>
</template>
