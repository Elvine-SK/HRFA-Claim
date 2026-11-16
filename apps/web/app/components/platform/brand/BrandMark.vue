<script setup lang="ts">
import type { ResolvedBrand } from '@elvine-sk/platform-nuxt/utils'

// The brand image: `logo` (the dark one in dark mode), falling back to the mark; `mark` alone for tight spots.
// No image at all: a letter tile from the short name.
const props = withDefaults(
  defineProps<{ variant?: 'logo' | 'mark'; size?: number; brand?: ResolvedBrand }>(),
  { variant: 'logo', size: 38, brand: undefined },
)
const { brand: current } = useBrand()
const theme = useTheme()
const b = computed(() => props.brand ?? current.value)
const src = computed(() => {
  const i = b.value.images
  if (props.variant === 'mark') return i.mark
  return (theme.isDark.value && i.logoDark) || i.logo || i.mark
})
</script>

<template>
  <img
    v-if="src"
    :src="src"
    alt=""
    class="brand-img"
    :style="{ height: `${size}px`, maxWidth: variant === 'logo' ? `${size * 4}px` : `${size}px` }"
  />
  <span
    v-else
    class="brand-tile"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.45}px` }"
  >
    {{ b.shortName.charAt(0) }}
  </span>
</template>

<style scoped>
.brand-img {
  flex: none;
  object-fit: contain;
}
.brand-tile {
  display: grid;
  flex: none;
  place-items: center;
  border-radius: calc(var(--app-r-sm) + 2px);
  background: var(--app-grad);
  color: var(--app-grad-fg);
  font-weight: 800;
  box-shadow: 0 6px 16px -6px var(--app-grad-from);
}
</style>
