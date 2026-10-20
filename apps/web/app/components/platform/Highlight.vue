<script setup lang="ts">
const props = defineProps<{ text: string | number | null | undefined; query?: string }>()

const parts = computed(() => {
  const text = props.text == null ? '' : String(props.text)
  const q = props.query?.trim()
  if (!q) return [{ text, match: false }]
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    .split(new RegExp(`(${escaped})`, 'gi'))
    .filter(Boolean)
    .map((part) => ({ text: part, match: part.toLowerCase() === q.toLowerCase() }))
})
</script>

<template>
  <span
    ><template v-for="(part, i) in parts" :key="i"
      ><mark v-if="part.match" class="rounded-[3px] bg-(--app-warn)/25 px-px text-inherit">{{
        part.text
      }}</mark
      ><template v-else>{{ part.text }}</template></template
    ></span
  >
</template>
