<script setup lang="ts">
import type { RequestAction } from '../../../composables/useApprovals'
import type { RequestDetail } from '../../../types/approval'

const props = defineProps<{ request: RequestDetail; busy?: RequestAction | null; shortcuts?: boolean }>()
const emit = defineEmits<{ act: [action: RequestAction, comment: string]; delegate: [] }>()
const { t } = useI18n()

const COMMENT_MAX = 2000
const comment = ref('')
const needComment = ref<RequestAction | null>(null)
const shake = ref(false)
const textarea = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>('textarea')
const pending = computed(() => props.request.status === 'pending')

watch(
  () => props.request.id,
  () => {
    comment.value = ''
    needComment.value = null
  },
)
watch(comment, (c) => c.trim() && (needComment.value = null))

function run(action: RequestAction) {
  if ((commentRequired(action) || action === 'comment') && !comment.value.trim()) {
    needComment.value = action
    shake.value = false
    requestAnimationFrame(() => (shake.value = true))
    textarea.value?.textareaRef?.focus()
    return
  }
  emit('act', action, comment.value)
}

function clear() {
  comment.value = ''
}
function focus() {
  textarea.value?.textareaRef?.focus()
}

defineExpose({ run, clear, focus })
</script>

<template>
  <div class="decide">
    <UFormField
      :error="
        needComment
          ? t(needComment === 'comment' ? 'approval.decide.commentEmpty' : 'approval.decide.commentRequired')
          : undefined
      "
      :label="t('approval.decide.comment')"
      :hint="t('platform.input.chars', { n: comment.length, max: COMMENT_MAX })"
      size="sm"
    >
      <UTextarea
        ref="textarea"
        v-model="comment"
        :rows="2"
        autoresize
        :maxrows="8"
        :maxlength="COMMENT_MAX"
        class="w-full"
        :class="{ shake }"
        :placeholder="
          request.can.approve ? t('approval.decide.placeholder') : t('approval.decide.placeholderComment')
        "
        @animationend="shake = false"
        @keydown.ctrl.enter.prevent="request.can.approve ? run('approve') : run('comment')"
        @keydown.meta.enter.prevent="request.can.approve ? run('approve') : run('comment')"
      />
    </UFormField>
    <div class="decide-row">
      <span v-if="shortcuts && request.can.approve" class="kbd-hint">
        <UKbd value="J" /> <UKbd value="K" /> {{ t('approval.decide.move') }} · <UKbd value="A" />
        {{ t('approval.decide.approve') }} · <UKbd value="R" /> {{ t('approval.decide.reject') }}
      </span>
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-message-square"
        :loading="busy === 'comment'"
        :disabled="!!busy"
        :class="{ 'ms-auto': !(shortcuts && request.can.approve) }"
        @click="run('comment')"
      >
        {{ t('approval.decide.commentOnly') }}
      </UButton>
      <template v-if="request.can.cancel && pending">
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-ban"
          :loading="busy === 'cancel'"
          :disabled="!!busy"
          @click="run('cancel')"
        >
          {{ t('approval.decide.cancel') }}
        </UButton>
      </template>
      <UButton
        v-if="request.can.resubmit"
        size="sm"
        icon="i-lucide-rotate-cw"
        :loading="busy === 'resubmit'"
        :disabled="!!busy"
        @click="run('resubmit')"
      >
        {{ t('approval.decide.resubmit') }}
      </UButton>
      <template v-if="request.can.approve">
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-forward"
          :disabled="!!busy"
          @click="emit('delegate')"
        >
          {{ t('approval.delegate.button') }}
        </UButton>
        <UButton
          color="warning"
          variant="soft"
          size="sm"
          icon="i-lucide-undo-2"
          :loading="busy === 'return'"
          :disabled="!!busy"
          @click="run('return')"
        >
          {{ t('approval.decide.return') }}
        </UButton>
        <UButton
          color="error"
          variant="soft"
          size="sm"
          icon="i-lucide-x"
          :loading="busy === 'reject'"
          :disabled="!!busy"
          @click="run('reject')"
        >
          {{ t('approval.decide.reject') }}
        </UButton>
        <UButton
          color="success"
          size="sm"
          icon="i-lucide-check"
          :loading="busy === 'approve'"
          :disabled="!!busy"
          @click="run('approve')"
        >
          {{ t('approval.decide.approve') }}
        </UButton>
      </template>
    </div>
  </div>
</template>

<style scoped>
.decide {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: grid;
  gap: 10px;
  margin-top: auto;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface);
  box-shadow: 0 -12px 24px -18px rgb(0 0 0 / 0.35);
}
.decide-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.kbd-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-inline-end: auto;
  color: var(--app-muted);
  font-size: 12px;
}
.shake {
  animation: shake 0.35s;
}
@keyframes shake {
  20%,
  60% {
    transform: translateX(-4px);
  }
  40%,
  80% {
    transform: translateX(4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .shake {
    animation: none;
  }
}
</style>
