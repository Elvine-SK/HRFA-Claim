<script setup lang="ts">
import type { DelegateCandidate } from '../../../types/approval'

/** Hands my pending assignment on a request to a colleague. */
const props = defineProps<{ requestId: string }>()
const emit = defineEmits<{ done: [person: DelegateCandidate] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const { delegate } = useApprovalActions()
const errors = useFormErrors<'userId' | 'comment'>()

const userId = ref<string>()
const person = ref<DelegateCandidate | null>(null)
const comment = ref('')
watch(open, (isOpen) => {
  if (!isOpen) return
  userId.value = undefined
  person.value = null
  comment.value = ''
  errors.clear()
})

async function submit() {
  if (!userId.value || !person.value) return
  try {
    await delegate.mutateAsync({ id: props.requestId, userId: userId.value, comment: comment.value })
    open.value = false
    emit('done', person.value)
  } catch (error) {
    errors.apply(error, ['userId', 'comment'])
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('approval.delegate.title')"
    :description="t('approval.delegate.text')"
  >
    <template #body>
      <form id="delegate-form" class="grid gap-4" novalidate @submit.prevent="submit">
        <UFormField :label="t('approval.delegate.to')" :error="errors.fields.userId" required>
          <PlatformApprovalDelegatePicker
            v-model="userId"
            :invalid="!!errors.fields.userId"
            @pick="(p) => (person = p)"
          />
        </UFormField>
        <UFormField :label="t('approval.decide.comment')" :error="errors.fields.comment">
          <UTextarea v-model="comment" :rows="2" autoresize :maxlength="2000" class="w-full" />
        </UFormField>
        <UAlert v-if="errors.message.value" color="error" variant="subtle" :title="errors.message.value" />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          {{ t('platform.actions.cancel') }}
        </UButton>
        <UButton
          type="submit"
          form="delegate-form"
          icon="i-lucide-forward"
          :disabled="!userId"
          :loading="delegate.isPending.value"
        >
          {{ t('approval.delegate.button') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
