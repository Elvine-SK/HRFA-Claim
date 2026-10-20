<script setup lang="ts">
import type {
  LockableField,
  ThemeDensity,
  ThemeFont,
  ThemeMode,
  ThemePreset,
  ThemeSettings,
} from '@elvine-sk/platform-nuxt/utils'

/** The appearance settings, for one person (`personal`) or as the look everyone starts from (`workspace`). */
const props = defineProps<{ scope: 'personal' | 'workspace' }>()

const { t } = useI18n()
const theme = useTheme()
const personal = computed(() => props.scope === 'personal')
const current = computed(() => (personal.value ? theme.effective.value : theme.workspaceEffective.value))

function patch(values: Partial<ThemeSettings>) {
  if (personal.value) theme.patch(values)
  else theme.editWorkspace(values)
}
/** A person can't change what the workspace locked; the workspace tab changes anything. */
const locked = (group: LockableField) => personal.value && theme.isLocked(group)

const PRESET_PREVIEW: Record<ThemePreset, { a: string; b: string; c: string; d: string }> = {
  aurora: { a: '#F4F5FB', b: '#FFFFFF', c: '#5B4CF5', d: '#F2559A' },
  nightfall: { a: '#08080A', b: '#17171B', c: '#C6F432', d: '#2BD4F5' },
  graphite: { a: '#F7F8FA', b: '#FFFFFF', c: '#2563EB', d: '#06B6D4' },
}

const modeOptions = computed(() => [
  { value: 'light' as ThemeMode, label: t('appearance.light'), icon: 'i-lucide-sun' },
  { value: 'dark' as ThemeMode, label: t('appearance.dark'), icon: 'i-lucide-moon' },
  { value: 'system' as ThemeMode, label: t('appearance.system'), icon: 'i-lucide-monitor' },
])
const densityOptions = computed(() =>
  THEME_DENSITIES.map((value) => ({ value: value as ThemeDensity, label: t(`appearance.${value}`) })),
)
const fontOptions = THEME_FONTS.map((value) => ({ value: value as ThemeFont, label: FONT_LABELS[value] }))

const mode = computed({ get: () => current.value.mode, set: (v: ThemeMode) => patch({ mode: v }) })
const density = computed({
  get: () => current.value.density,
  set: (v: ThemeDensity) => patch({ density: v }),
})
const font = computed({ get: () => current.value.font, set: (v: ThemeFont) => patch({ font: v }) })
const radius = computed({
  get: () => current.value.radius,
  set: (v: number | number[] | undefined) =>
    patch({ radius: Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }),
})
const gradient = computed({ get: () => current.value.gradient, set: (v: boolean) => patch({ gradient: v }) })

/** The two gradient colours in use, whether chosen or the preset's own. */
const stops = computed<[string, string]>(() => {
  const preset = PRESET_DEFAULTS[current.value.preset].gradient[theme.isDark.value ? 'dark' : 'light']
  return [
    current.value.gradientFrom ?? current.value.brand ?? preset[0],
    current.value.gradientTo ?? preset[1],
  ]
})
const activeGradient = computed(() =>
  GRADIENT_PRESETS.find((g) => g.from === current.value.gradientFrom && g.to === current.value.gradientTo),
)
const picked = (event: Event) => (event.target as HTMLInputElement).value.toUpperCase()
</script>

<template>
  <div class="tc" :data-testid="`appearance-${scope}`">
    <section class="tc-sec" :class="{ locked: locked('preset') }">
      <h4>
        {{ t('appearance.preset') }}
        <PlatformAppearanceGroupAction group="preset" :scope="scope" />
      </h4>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="preset in THEME_PRESETS"
          :key="preset"
          type="button"
          class="tc-preset"
          :aria-pressed="current.preset === preset"
          :disabled="locked('preset')"
          @click="patch({ preset })"
        >
          <span
            class="tc-mini"
            :style="{
              '--a': PRESET_PREVIEW[preset].a,
              '--b': PRESET_PREVIEW[preset].b,
              '--c': PRESET_PREVIEW[preset].c,
              '--d': PRESET_PREVIEW[preset].d,
            }"
            aria-hidden="true"
          >
            <i /><i /><i />
          </span>
          <b class="capitalize">{{ preset }}</b>
          <small>{{ t(`appearance.presets.${preset}`) }}</small>
        </button>
      </div>
    </section>

    <section v-if="personal" class="tc-sec">
      <h4>{{ t('appearance.mode') }}</h4>
      <PlatformSegmented v-model="mode" :options="modeOptions" :label="t('appearance.mode')" block />
    </section>

    <section class="tc-sec" :class="{ locked: locked('brand') }">
      <h4>
        {{ t('appearance.brand') }}
        <PlatformAppearanceGroupAction group="brand" :scope="scope" />
      </h4>
      <div class="tc-sw">
        <button
          v-if="!personal"
          type="button"
          class="tc-def"
          :aria-pressed="!current.brand"
          :aria-label="t('appearance.presetDefault')"
          :title="t('appearance.presetDefault')"
          @click="patch({ brand: null })"
        >
          <UIcon name="i-lucide-rotate-ccw" class="size-3.5" />
        </button>
        <button
          v-for="swatch in BRAND_SWATCHES"
          :key="swatch"
          type="button"
          :style="{ '--sw': swatch }"
          :aria-pressed="current.brand === swatch"
          :aria-label="swatch"
          :title="swatch"
          :disabled="locked('brand')"
          @click="patch({ brand: swatch })"
        />
        <label class="tc-custom" :title="t('appearance.custom')">
          <span class="sr-only">{{ t('appearance.custom') }}</span>
          <input
            type="color"
            :value="current.brand ?? '#5B4CF5'"
            :disabled="locked('brand')"
            @change="(e) => patch({ brand: picked(e) })"
          />
        </label>
      </div>
    </section>

    <section class="tc-sec" :class="{ locked: locked('gradient') }">
      <h4>
        {{ t('appearance.gradient') }}
        <PlatformAppearanceGroupAction group="gradient" :scope="scope" />
      </h4>
      <USwitch
        v-model="gradient"
        :disabled="locked('gradient')"
        :label="t('appearance.gradientOn')"
        class="mb-3"
      />
      <div :class="{ 'opacity-50': !current.gradient }">
        <div class="grid grid-cols-6 gap-1.5">
          <button
            v-for="g in GRADIENT_PRESETS"
            :key="g.id"
            type="button"
            class="tc-grad"
            :style="{ '--ga': g.from, '--gb': g.to }"
            :aria-pressed="activeGradient?.id === g.id"
            :aria-label="g.label"
            :title="g.label"
            :disabled="locked('gradient') || !current.gradient"
            @click="patch({ gradientFrom: g.from, gradientTo: g.to })"
          />
        </div>
        <div class="tc-stops">
          <span>{{ t('appearance.from') }}</span>
          <label class="tc-stop" :style="{ '--sw': stops[0] }">
            <span class="sr-only">{{ t('appearance.gradientFrom') }}</span>
            <input
              type="color"
              :value="stops[0]"
              :disabled="locked('gradient') || !current.gradient"
              @change="(e) => patch({ gradientFrom: picked(e), gradientTo: stops[1] })"
            />
          </label>
          <i class="tc-bar" :style="{ '--ga': stops[0], '--gb': stops[1] }" aria-hidden="true" />
          <label class="tc-stop" :style="{ '--sw': stops[1] }">
            <span class="sr-only">{{ t('appearance.gradientTo') }}</span>
            <input
              type="color"
              :value="stops[1]"
              :disabled="locked('gradient') || !current.gradient"
              @change="(e) => patch({ gradientFrom: stops[0], gradientTo: picked(e) })"
            />
          </label>
          <span>{{ t('appearance.to') }}</span>
        </div>
      </div>
    </section>

    <section class="tc-sec" :class="{ locked: locked('radius') }">
      <h4>
        <span>
          {{ t('appearance.radius') }}
          <output class="mono normal-case">{{ current.radius }}px</output>
        </span>
        <PlatformAppearanceGroupAction group="radius" :scope="scope" />
      </h4>
      <USlider
        v-model="radius"
        :min="RADIUS_MIN"
        :max="RADIUS_MAX"
        :step="1"
        :disabled="locked('radius')"
        :aria-label="t('appearance.radius')"
      />
      <div class="mt-2 flex gap-2" aria-hidden="true">
        <i v-for="n in 3" :key="n" class="tc-radius" />
      </div>
    </section>

    <section class="tc-sec" :class="{ locked: locked('density') }">
      <h4>
        {{ t('appearance.density') }}
        <PlatformAppearanceGroupAction group="density" :scope="scope" />
      </h4>
      <PlatformSegmented
        v-model="density"
        :options="densityOptions"
        :label="t('appearance.density')"
        :disabled="locked('density')"
        block
      />
    </section>

    <section class="tc-sec" :class="{ locked: locked('font') }">
      <h4>
        {{ t('appearance.font') }}
        <PlatformAppearanceGroupAction group="font" :scope="scope" />
      </h4>
      <PlatformSegmented
        v-model="font"
        :options="fontOptions"
        :label="t('appearance.font')"
        :disabled="locked('font')"
        block
      />
    </section>
  </div>
</template>

<style scoped>
.tc-sec {
  padding: 14px 0;
  border-top: 1px solid var(--app-border);
}
.tc-sec:first-child {
  border-top: 0;
}
.tc-sec.locked > :not(h4) {
  opacity: 0.55;
}
.tc-sec h4 {
  display: flex;
  min-height: 26px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--app-muted);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
:global(html:lang(lo)) .tc-sec h4 {
  letter-spacing: 0;
}
.tc-sec h4 output {
  margin-inline-start: 6px;
  color: var(--app-text);
  font-size: 12px;
  letter-spacing: 0;
}
.tc-preset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 6px 8px;
  border: 1.5px solid var(--app-border);
  border-radius: var(--app-r-sm);
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--app-dur-base),
    box-shadow var(--app-dur-base);
}
.tc-preset:disabled {
  cursor: default;
}
.tc-preset b {
  padding: 0 2px;
  font-size: 12.5px;
}
.tc-preset small {
  padding: 0 2px;
  color: var(--app-muted);
  font-size: 11.5px;
  line-height: 1.35;
}
.tc-preset[aria-pressed='true'] {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--app-accent) 18%, transparent);
}
.tc-mini {
  display: grid;
  height: 48px;
  grid-template-columns: 22% 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 3px;
  padding: 4px;
  border-radius: max(0px, calc(var(--app-r-sm) - 3px));
  background: var(--a);
}
.tc-mini i {
  border-radius: 3px;
  background: var(--b);
}
.tc-mini i:nth-child(1) {
  grid-row: span 2;
}
.tc-mini i:nth-child(2) {
  background: linear-gradient(90deg, var(--c), var(--d));
}
.tc-sw {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tc-sw button,
.tc-custom,
.tc-stop {
  position: relative;
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--sw);
  cursor: pointer;
  transition: transform 0.1s;
}
.tc-sw button:hover:not(:disabled) {
  transform: scale(1.1);
}
.tc-sw button[aria-pressed='true'] {
  box-shadow:
    0 0 0 2px var(--app-surface),
    0 0 0 4px var(--sw, var(--app-text));
}
.tc-sw .tc-def {
  background: var(--app-surface-2);
  box-shadow: inset 0 0 0 1px var(--app-border);
  color: var(--app-muted);
}
.tc-sw .tc-def[aria-pressed='true'] {
  box-shadow:
    0 0 0 2px var(--app-surface),
    0 0 0 4px var(--app-text);
}
.tc-custom {
  background: conic-gradient(red, #ff0, lime, cyan, blue, #f0f, red);
}
.tc-custom input,
.tc-stop input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.tc-grad {
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: max(0px, calc(var(--app-r-sm) - 2px));
  background: linear-gradient(135deg, var(--ga), var(--gb));
  cursor: pointer;
}
.tc-grad[aria-pressed='true'] {
  box-shadow:
    0 0 0 2px var(--app-surface),
    0 0 0 4px var(--app-text);
}
.tc-stops {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  color: var(--app-muted);
  font-size: 12px;
}
.tc-stop {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--app-text) 18%, transparent);
}
.tc-bar {
  height: 8px;
  flex: 1;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ga), var(--gb));
}
.tc-radius {
  height: 26px;
  flex: 1;
  border: 1.5px solid var(--app-border);
  border-radius: var(--app-r-sm);
  background: var(--app-surface-2);
}
</style>
