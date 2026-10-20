<script setup lang="ts">
definePageMeta({ title: 'files.nav.mine' })

const { t } = useI18n()
const manifest = useManifest()
const router = useRouter()
const route = useRoute()
useHead({ title: () => t('files.mine.title') })

// The trash is its own list: switching drops the other list's search, filters and page from the URL.
const view = computed<'files' | 'trash'>({
  get: () => (route.query.view === 'trash' ? 'trash' : 'files'),
  set: (v) => void router.replace({ query: v === 'trash' ? { view: 'trash' } : {} }),
})
</script>

<template>
  <PlatformErrorPage v-if="manifest.data.value && !manifest.has('files')" :status="404" />
  <div v-else>
    <PlatformPageHeader :title="t('files.mine.title')" :subtitle="t('files.mine.subtitle')" />
    <PlatformSegmented
      v-model="view"
      class="mb-3"
      :options="[
        { value: 'files', label: t('files.mine.title'), icon: 'i-lucide-paperclip' },
        { value: 'trash', label: t('files.trash.title'), icon: 'i-lucide-trash-2' },
      ]"
      :label="t('files.trash.viewLabel')"
    />
    <PlatformFilesTrashTable v-if="view === 'trash'" source="/files/mine/trash" :admin="false" />
    <PlatformFilesFileTable v-else source="/files/mine" :admin="false" />
  </div>
</template>
