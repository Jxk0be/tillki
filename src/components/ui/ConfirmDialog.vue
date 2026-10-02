<script setup lang="ts">
import BaseButton from './BaseButton.vue'
import BaseSheet from './BaseSheet.vue'

withDefaults(
  defineProps<{
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    loading?: boolean
  }>(),
  { confirmLabel: 'Confirm', cancelLabel: 'Cancel', danger: false, loading: false },
)

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: []; cancel: [] }>()

function cancel() {
  open.value = false
  emit('cancel')
}
</script>

<template>
  <BaseSheet v-model:open="open" :title="title">
    <p v-if="message" class="text-ink-2">{{ message }}</p>
    <template #footer>
      <div class="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end">
        <BaseButton variant="secondary" :disabled="loading" @click="cancel">
          {{ cancelLabel }}
        </BaseButton>
        <BaseButton
          :variant="danger ? 'danger' : 'primary'"
          :loading="loading"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </BaseButton>
      </div>
    </template>
  </BaseSheet>
</template>
