<script setup lang="ts">
/** Saved views of a list as tabs: All, built-in, personal, then Save view (UI spec §5.3). */
import { sameQuery, toViewQuery, type ApiError } from '@elvine-sk/platform-nuxt/utils'
import type { SavedView } from '../../types/platform'

const props = defineProps<{
  list: ReturnType<typeof useListQuery>
  listKey: string
  /** The query parameter that names the open view; a page that uses `view` itself passes another. */
  param?: string
}>()
const { t } = useI18n()
const notify = useNotify()
const confirm = useConfirm()
const saved = useSavedViews(() => props.listKey)
const viewId = useQueryParam(props.param ?? 'view')

const current = computed(() => toViewQuery(props.list.query.value))
const active = computed(() => saved.views.value.find((v) => v.id === viewId.value) ?? null)
const modified = computed(
  () => !!active.value && !sameQuery(current.value, active.value.query, props.list.defaultSort),
)
// "All" is the open tab only when nothing narrows or reorders the list.
const allActive = computed(() => !viewId.value && props.list.pristine.value)

// A link to a view that is gone (or someone else's): keep the filters in the URL, drop the name.
watch(
  [() => saved.query.isSuccess.value, viewId, () => saved.views.value.length],
  ([loaded, id]) => {
    if (loaded && id && !saved.views.value.some((v) => v.id === id)) viewId.value = undefined
  },
  { immediate: true },
)

async function openView(view: SavedView | null) {
  if (view?.invalid) return
  await props.list.applyView(view?.query ?? null, { [props.param ?? 'view']: view?.id })
}

const dialog = ref<{ mode: 'save' | 'rename'; view?: SavedView } | null>(null)
const name = ref('')
const error = ref('')
const busy = ref(false)
function ask(mode: 'save' | 'rename', view?: SavedView) {
  dialog.value = { mode, view }
  name.value = mode === 'rename' ? (view?.name ?? '') : ''
  error.value = ''
}
async function submit() {
  const state = dialog.value
  if (!state || !name.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    if (state.mode === 'rename' && state.view) {
      await saved.update(state.view.id, { name: name.value.trim() })
    } else {
      const view = await saved.create(name.value.trim(), current.value)
      viewId.value = view.id
      notify.success(t('lists.views.saved'))
    }
    dialog.value = null
  } catch (err) {
    error.value = (err as ApiError).message
  } finally {
    busy.value = false
  }
}

async function updateView(view: SavedView) {
  try {
    await saved.update(view.id, { query: current.value })
    notify.success(t('lists.views.updated'))
  } catch (err) {
    notify.error(err)
  }
}
async function removeView(view: SavedView) {
  const ok = await confirm({
    title: t('lists.views.deleteTitle', { name: view.name }),
    description: t('lists.views.deleteText'),
    confirmLabel: t('lists.views.delete'),
  })
  if (!ok) return
  try {
    await saved.remove(view.id)
    if (viewId.value === view.id) viewId.value = undefined
    notify.success(t('lists.views.deleted'))
  } catch (err) {
    notify.error(err)
  }
}

const isOpenAndChanged = (view: SavedView) => active.value?.id === view.id && modified.value
function menu(view: SavedView) {
  const remove = {
    label: t('lists.views.delete'),
    icon: 'i-lucide-trash-2',
    onSelect: () => removeView(view),
  }
  if (view.invalid) return [[remove]]
  if (view.builtIn)
    return [[{ label: t('lists.views.saveAsNew'), icon: 'i-lucide-plus', onSelect: () => ask('save') }]]
  return [
    [
      { label: t('lists.views.rename'), icon: 'i-lucide-pencil', onSelect: () => ask('rename', view) },
      {
        label: t('lists.views.update'),
        icon: 'i-lucide-save',
        disabled: !isOpenAndChanged(view),
        onSelect: () => updateView(view),
      },
    ],
    [remove],
  ]
}
// A built-in view has a menu only once it was changed (to save the change as a view of one's own).
const hasMenu = (view: SavedView) => !view.builtIn || isOpenAndChanged(view)
</script>

<template>
  <div v-if="saved.enabled.value" class="vtabs" data-testid="view-tabs">
    <div class="vtabs-row" role="tablist" :aria-label="t('lists.views.label')">
      <button
        type="button"
        role="tab"
        class="vtab"
        :aria-selected="allActive ? 'true' : 'false'"
        @click="openView(null)"
      >
        {{ t('lists.views.all') }}
      </button>
      <span
        v-for="view in saved.views.value"
        :key="view.id"
        class="vtab-wrap"
        :data-view="view.id"
        :data-modified="isOpenAndChanged(view) ? 'true' : 'false'"
      >
        <button
          type="button"
          role="tab"
          class="vtab"
          :aria-selected="active?.id === view.id ? 'true' : 'false'"
          :aria-disabled="view.invalid ? 'true' : undefined"
          :title="view.invalid ? t('lists.views.invalid') : undefined"
          @click="openView(view)"
        >
          <UIcon v-if="view.invalid" name="i-lucide-triangle-alert" class="size-3.5 text-warn" />
          {{ view.name }}
          <span v-if="isOpenAndChanged(view)" class="vdot" :title="t('lists.views.modified')" />
        </button>
        <UDropdownMenu v-if="hasMenu(view)" :items="menu(view)" :content="{ align: 'start' }">
          <button type="button" class="vtab-menu" :aria-label="t('lists.views.menu', { name: view.name })">
            <UIcon name="i-lucide-chevron-down" />
          </button>
        </UDropdownMenu>
      </span>
      <button
        v-if="saved.query.isError.value"
        type="button"
        class="vtab vtab-err"
        @click="saved.query.refetch()"
      >
        <UIcon name="i-lucide-rotate-cw" class="size-3.5" />
        {{ t('lists.views.loadFailed') }}
      </button>
      <button type="button" class="vtab vtab-add" :disabled="list.pristine.value" @click="ask('save')">
        <UIcon name="i-lucide-plus" class="size-3.5" />
        {{ t('lists.views.save') }}
      </button>
    </div>

    <UModal
      :open="!!dialog"
      :title="dialog?.mode === 'rename' ? t('lists.views.renameTitle') : t('lists.views.saveTitle')"
      :description="dialog?.mode === 'rename' ? undefined : t('lists.views.saveText')"
      @update:open="(open: boolean) => !open && (dialog = null)"
    >
      <template #body>
        <form class="flex flex-col gap-3" @submit.prevent="submit">
          <UFormField :label="t('lists.views.name')" :error="error || undefined">
            <UInput v-model="name" maxlength="80" autofocus class="w-full" />
          </UFormField>
          <UButton type="submit" :loading="busy" :disabled="!name.trim()" class="self-end">
            {{ dialog?.mode === 'rename' ? t('lists.views.rename') : t('lists.views.save') }}
          </UButton>
        </form>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.vtabs-row {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  padding: 6px var(--app-pad) 0;
  border-bottom: 1px solid var(--app-border);
  scrollbar-width: none;
}
.vtab-wrap {
  display: inline-flex;
  flex: none;
  align-items: center;
}
.vtab {
  display: inline-flex;
  height: 42px;
  flex: none;
  align-items: center;
  gap: 6px;
  margin-bottom: -1px;
  padding: 0 12px;
  border-bottom: 2px solid transparent;
  color: var(--app-muted);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.vtab:hover:not(:disabled) {
  color: var(--app-text);
}
.vtab[aria-selected='true'] {
  border-bottom-color: var(--app-accent);
  color: var(--app-text);
  font-weight: 600;
}
.vtab[aria-disabled='true'] {
  cursor: default;
  opacity: 0.7;
}
.vtab:disabled {
  cursor: default;
  opacity: 0.45;
}
.vtab-menu {
  display: grid;
  width: 22px;
  height: 22px;
  margin-left: -8px;
  place-items: center;
  border-radius: var(--app-r-sm);
  color: var(--app-muted);
  cursor: pointer;
}
.vtab-menu:hover {
  background: var(--app-hover);
  color: var(--app-text);
}
.vtab-add {
  margin-left: auto;
  color: var(--app-accent);
}
.vtab-err {
  color: var(--app-bad);
}
.vdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-accent);
}
</style>
