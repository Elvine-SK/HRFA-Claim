<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

const emit = defineEmits<{ appearance: [] }>()

const { t, te } = useI18n()
const nav = useNavigation()
const theme = useTheme()
const { commands, paletteOpen } = useCommands()
const label = (text: string) => (te(text) ? t(text) : text)

function close() {
  paletteOpen.value = false
}

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const pages: CommandPaletteItem[] = nav.pages.value.map(({ item, trail }) => ({
    id: `page:${item.id}`,
    label: label(item.label),
    // Child pages show where they sit: "Notes › Reports".
    suffix: trail.length ? trail.map(label).join(' › ') : undefined,
    icon: item.icon,
    to: item.to,
    onSelect: close,
  }))
  const builtIn: CommandPaletteItem[] = [
    {
      id: 'theme:toggle',
      label: t('palette.toggleTheme'),
      icon: 'i-lucide-sun-moon',
      onSelect: () => {
        theme.toggleDark()
        close()
      },
    },
    {
      id: 'theme:appearance',
      label: t('palette.openAppearance'),
      icon: 'i-lucide-palette',
      onSelect: () => {
        close()
        emit('appearance')
      },
    },
  ]
  const byGroup = new Map<string, CommandPaletteItem[]>()
  for (const command of commands.value) {
    const group = command.group ?? t('palette.actions')
    byGroup.set(group, [
      ...(byGroup.get(group) ?? []),
      {
        id: command.id,
        label: command.label,
        icon: command.icon,
        kbds: command.kbds,
        onSelect: async () => {
          close()
          await command.run()
        },
      },
    ])
  }
  const actions = [...(byGroup.get(t('palette.actions')) ?? []), ...builtIn]
  byGroup.delete(t('palette.actions'))
  return [
    { id: 'pages', label: t('palette.pages'), items: pages },
    { id: 'actions', label: t('palette.actions'), items: actions },
    ...[...byGroup].map(([id, items]) => ({ id, label: id, items })),
  ]
})
</script>

<template>
  <UModal
    v-model:open="paletteOpen"
    :title="t('palette.placeholder')"
    :ui="{
      content: 'sm:max-w-[620px] sm:top-[12vh] sm:translate-y-0 max-h-[70vh] p-0 divide-y-0',
      body: 'p-0 sm:p-0',
    }"
  >
    <template #content>
      <UCommandPalette
        :groups="groups"
        :placeholder="t('palette.placeholder')"
        close
        class="max-h-[70vh]"
        @update:open="(value: boolean) => (paletteOpen = value)"
      >
        <template #footer>
          <p class="mono px-2.5 py-1.5 text-[11.5px] text-muted">{{ t('palette.hints') }}</p>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
