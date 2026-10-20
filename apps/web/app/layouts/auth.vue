<script setup lang="ts">
const { t, locale, locales } = useI18n()
const theme = useTheme()
const preferences = useLocalePreference()

const languageOptions = computed(() => locales.value.map((l) => ({ value: l.code, label: l.name ?? l.code })))
const features = computed(() => [
  { icon: 'i-lucide-stamp', title: t('auth.brand.f1'), text: t('auth.brand.f1Text') },
  { icon: 'i-lucide-shield-check', title: t('auth.brand.f2'), text: t('auth.brand.f2Text') },
  { icon: 'i-lucide-scroll-text', title: t('auth.brand.f3'), text: t('auth.brand.f3Text') },
])
</script>

<template>
  <div class="auth">
    <div class="auth-form">
      <header class="auth-top">
        <span class="logo" aria-hidden="true">{{ t('shell.appName').charAt(0) }}</span>
        <b>{{ t('shell.appName') }}</b>
        <div class="auth-tools">
          <PlatformSegmented
            :model-value="locale"
            :options="languageOptions"
            :label="t('shell.language')"
            @update:model-value="(code: string) => preferences.change(code)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            square
            :icon="theme.isDark.value ? 'i-lucide-sun' : 'i-lucide-moon'"
            :aria-label="t('shell.toggleDark')"
            :aria-pressed="theme.isDark.value"
            @click="theme.toggleDark()"
          />
        </div>
      </header>
      <main id="main" class="auth-body">
        <slot />
      </main>
      <footer class="auth-foot">{{ t('auth.footer', { year: new Date().getFullYear() }) }}</footer>
    </div>

    <aside class="auth-brand" aria-hidden="true">
      <div class="ab-in">
        <div class="ab-logo">{{ t('shell.appName').charAt(0) }}</div>
        <h2>{{ t('auth.brand.title') }}</h2>
        <p>{{ t('auth.brand.text') }}</p>
        <div class="ab-cards">
          <div v-for="f in features" :key="f.icon" class="glass ab-feature">
            <UIcon :name="f.icon" class="size-5 flex-none" />
            <div>
              <b>{{ f.title }}</b>
              <span>{{ f.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.auth {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
  min-height: 100vh;
}
.auth-form {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  padding: 24px clamp(20px, 5vw, 64px);
}
.auth-top {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
}
.logo {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: calc(var(--app-r-sm) + 2px);
  background: var(--app-grad);
  color: var(--app-grad-fg);
  font-size: 15px;
  font-weight: 800;
}
.auth-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.auth-body {
  display: flex;
  width: 100%;
  max-width: 400px;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  margin: 0 auto;
  padding: 36px 0;
  outline: none;
}
.auth-foot {
  color: var(--app-muted);
  font-size: 12px;
  text-align: center;
}
.auth-brand {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin: 12px;
  padding: 48px;
  border-radius: calc(var(--app-r-lg) + 6px);
  background: var(--app-grad);
  color: var(--app-grad-fg);
}
.auth-brand::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgb(255 255 255 / 0.22) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: radial-gradient(ellipse at 70% 30%, #000, transparent 70%);
}
.auth-brand::after {
  content: '';
  position: absolute;
  right: -180px;
  bottom: -220px;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(255 255 255 / 0.22), transparent 65%);
}
.ab-in {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 460px;
}
.ab-logo {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 28px;
  border-radius: 16px;
  background: rgb(255 255 255 / 0.2);
  font-size: 22px;
  font-weight: 800;
  backdrop-filter: blur(6px);
}
.ab-in h2 {
  margin: 0;
  font-size: clamp(28px, 3vw, 40px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
:global(html:lang(lo)) .ab-in h2 {
  letter-spacing: 0;
  line-height: 1.45;
}
.ab-in > p {
  margin: 14px 0 30px;
  font-size: 15px;
  line-height: 1.6;
  opacity: 0.85;
}
.ab-cards {
  display: grid;
  gap: 12px;
}
.glass {
  padding: 16px;
  border: 1px solid rgb(255 255 255 / 0.28);
  border-radius: var(--app-r-md);
  background: rgb(255 255 255 / 0.16);
  box-shadow: 0 20px 40px -20px rgb(0 0 0 / 0.35);
  backdrop-filter: blur(12px);
}
:global(.dark) .glass {
  background: rgb(0 0 0 / 0.16);
}
.ab-feature {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.ab-feature b {
  display: block;
  font-size: 14px;
}
.ab-feature span {
  font-size: 12.5px;
  line-height: 1.5;
  opacity: 0.88;
}
@media (max-width: 900px) {
  .auth {
    grid-template-columns: minmax(0, 1fr);
  }
  .auth-brand {
    display: none;
  }
}
</style>
