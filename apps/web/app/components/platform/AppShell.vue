<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem } from '@nuxt/ui'
import { useLocalStorage, useMediaQuery } from '@vueuse/core'
import type { NavItem } from '@elvine-sk/platform-nuxt/utils'

const props = withDefaults(
  defineProps<{ appName?: string; workspace?: string; userName?: string; userRole?: string }>(),
  {
    appName: undefined,
    workspace: undefined,
    userName: undefined,
    userRole: undefined,
  },
)

const { t, te, locale, locales } = useI18n()
const route = useRoute()
const nav = useNavigation()
const crumbs = useBreadcrumbs()
const theme = useTheme()
const { paletteOpen } = useCommands()

const collapsed = useLocalStorage('nelvine:sidebar-collapsed', false)
const isMobile = useMediaQuery('(max-width: 900px)')
const mobileOpen = ref(false)
const appearanceOpen = ref(false)
const rail = computed(() => collapsed.value && !isMobile.value)

const session = useSession()
const signOut = useSignOut()
const preferences = useLocalePreference()
const manifest = useManifest()
const inboxCount = useInboxCount()
watch(
  () => inboxCount.data.value,
  (n) => nav.setCount('approvals', n || null, !!n),
  { immediate: true },
)

const label = (text: string) => (te(text) ? t(text) : text)
const appTitle = computed(() => props.appName ?? t('shell.appName'))

// The brand block names the workspace I work in and, with several, switches between them (platform-tenancy).
const workspaces = useWorkspaces()
const access = useAccess()
const notify = useNotify()
watch(
  () => session.isAuthenticated.value && manifest.has('tenancy'),
  (on) => on && void workspaces.load().catch(() => undefined),
  { immediate: true },
)
const workspaceLabel = computed(
  () => workspaces.current.value?.name ?? props.workspace ?? t('shell.workspace'),
)
const canSwitch = computed(() => workspaces.tenants.value.length > 1)
const workspaceItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: t('tenancy.switcher.label'), type: 'label' }],
  workspaces.tenants.value.map((w) => ({
    label: w.name,
    type: 'checkbox' as const,
    checked: workspaces.current.value?.id === w.id,
    onSelect: () => {
      if (workspaces.current.value?.id !== w.id)
        workspaces.switchTo(w.id).then(
          () => notify.success(t('tenancy.switcher.switched', { name: w.name })),
          (error) => notify.error(error),
        )
    },
  })),
  ...(access.can('tenant.manage')
    ? [[{ label: t('tenancy.switcher.manage'), icon: 'i-lucide-settings-2', to: '/admin/workspaces' }]]
    : []),
])
const userLabel = computed(() => props.userName ?? session.user.value?.displayName ?? t('shell.guest'))
const userSub = computed(
  () => props.userRole ?? session.user.value?.email ?? session.user.value?.username ?? t('shell.guestRole'),
)
const initials = computed(() => initialsOf(userLabel.value))

function toggleSidebar() {
  if (isMobile.value) mobileOpen.value = !mobileOpen.value
  else collapsed.value = !collapsed.value
}

defineShortcuts({
  '[': toggleSidebar,
  meta_k: () => (paletteOpen.value = !paletteOpen.value),
})

watch(
  () => route.path,
  () => (mobileOpen.value = false),
)

const activeItem = computed(() => nav.match(route.path))
const isActive = (item: NavItem) => activeItem.value?.id === item.id

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const items: BreadcrumbItem[] = [{ label: t('shell.home'), to: '/' }]
  const item = activeItem.value
  if (item && item.to !== '/') items.push({ label: label(item.label), to: item.to })
  const override = crumbs.current.value
  if (override) items.push(...override.filter((c) => c.to !== item?.to))
  else if (typeof route.meta.title === 'string' && item?.to !== route.path && route.path !== '/')
    items.push({ label: label(route.meta.title) })
  const last = items.at(-1)
  if (items.length > 1 && last) items[items.length - 1] = { label: last.label }
  return items
})

const accountItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: userLabel.value, description: userSub.value, type: 'label' }],
  [
    { label: t('shell.profile'), icon: 'i-lucide-user', to: '/account' },
    { label: t('shell.security'), icon: 'i-lucide-shield', to: '/account?tab=security' },
    { label: t('shell.sessions'), icon: 'i-lucide-monitor-smartphone', to: '/account?tab=sessions' },
    {
      label: t('shell.preferences'),
      icon: 'i-lucide-sliders-horizontal',
      onSelect: () => (appearanceOpen.value = true),
    },
    {
      label: t('shell.language'),
      icon: 'i-lucide-languages',
      children: locales.value.map((l) => ({
        label: l.name ?? l.code,
        type: 'checkbox' as const,
        checked: locale.value === l.code,
        onSelect: () => preferences.change(l.code),
      })),
    },
  ],
  [
    {
      label: t('shell.signOut'),
      icon: 'i-lucide-log-out',
      color: 'error',
      disabled: !session.isAuthenticated.value,
      onSelect: () => signOut(),
    },
  ],
])
</script>

<template>
  <div class="shell" :class="{ 'is-rail': rail, 'is-mobile-open': mobileOpen }">
    <a href="#main" class="skip">{{ t('shell.skipToContent') }}</a>
    <div v-if="isMobile && mobileOpen" class="scrim" aria-hidden="true" @click="mobileOpen = false" />

    <aside id="platform-sidebar" class="side" :aria-label="t('shell.mainNav')">
      <UDropdownMenu v-if="canSwitch" :items="workspaceItems" :content="{ align: 'start' }">
        <button
          type="button"
          class="brand brand-switch"
          data-testid="workspace-switcher"
          :aria-label="t('tenancy.switcher.open', { name: workspaceLabel })"
        >
          <span class="logo" aria-hidden="true">{{ appTitle.charAt(0) }}</span>
          <span class="lbl">
            <b>{{ appTitle }}</b>
            <small>{{ workspaceLabel }}</small>
          </span>
          <UIcon
            name="i-lucide-chevrons-up-down"
            class="lbl ms-auto size-4 shrink-0 text-[var(--app-muted)]"
          />
        </button>
      </UDropdownMenu>
      <NuxtLink v-else to="/" class="brand">
        <span class="logo" aria-hidden="true">{{ appTitle.charAt(0) }}</span>
        <span class="lbl">
          <b>{{ appTitle }}</b>
          <small data-testid="workspace-name">{{ workspaceLabel }}</small>
        </span>
      </NuxtLink>

      <nav class="nav">
        <template v-for="group in nav.visibleGroups.value" :key="group.id">
          <div class="nav-g">{{ label(group.label) }}</div>
          <UTooltip
            v-for="item in group.items"
            :key="item.id"
            :text="label(item.label)"
            :disabled="!rail"
            :content="{ side: 'right', sideOffset: 10 }"
          >
            <NuxtLink
              :to="item.to"
              class="nav-a"
              :class="{ on: isActive(item) }"
              :aria-current="isActive(item) ? 'page' : undefined"
              :aria-label="rail ? label(item.label) : undefined"
            >
              <UIcon v-if="item.icon" :name="item.icon" class="ico" />
              <span class="lbl">{{ label(item.label) }}</span>
              <span v-if="item.count != null" class="count mono" :class="{ hot: item.hot }">{{
                item.count
              }}</span>
            </NuxtLink>
          </UTooltip>
        </template>
      </nav>

      <div class="side-foot">
        <slot name="sidebar-footer" />
        <div class="me">
          <span class="av" aria-hidden="true">{{ initials }}</span>
          <span class="lbl">
            <b>{{ userLabel }}</b>
            <small>{{ userSub }}</small>
          </span>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="top">
        <UButton
          color="neutral"
          variant="ghost"
          square
          :icon="isMobile ? 'i-lucide-menu' : 'i-lucide-panel-left'"
          :aria-label="isMobile ? t('shell.openMenu') : rail ? t('shell.expand') : t('shell.collapse')"
          aria-controls="platform-sidebar"
          :aria-expanded="isMobile ? mobileOpen : !rail"
          @click="toggleSidebar"
        />
        <UBreadcrumb :items="breadcrumbItems" class="crumbs" />

        <button
          type="button"
          class="search"
          :aria-label="t('shell.searchTrigger')"
          @click="paletteOpen = true"
        >
          <UIcon name="i-lucide-search" class="size-4 shrink-0" />
          <span class="search-text">{{ t('shell.searchTrigger') }}</span>
          <span class="search-kbd"><UKbd value="Ctrl" /><UKbd value="K" /></span>
        </button>

        <UTooltip :text="t('shell.appearance')">
          <UButton
            color="neutral"
            variant="ghost"
            square
            icon="i-lucide-palette"
            :aria-label="t('shell.appearance')"
            @click="appearanceOpen = true"
          />
        </UTooltip>
        <UTooltip :text="t('shell.toggleDark')">
          <UButton
            color="neutral"
            variant="ghost"
            square
            :icon="theme.isDark.value ? 'i-lucide-sun' : 'i-lucide-moon'"
            :aria-label="t('shell.toggleDark')"
            :aria-pressed="theme.isDark.value"
            @click="theme.toggleDark()"
          />
        </UTooltip>
        <PlatformNotificationsMenu v-if="manifest.has('notifications')" />
        <UDropdownMenu :items="accountItems" :content="{ align: 'end' }">
          <button type="button" class="av av-top" :aria-label="t('shell.account')">{{ initials }}</button>
        </UDropdownMenu>
      </header>

      <PlatformOfflineBanner />

      <main id="main" class="view" tabindex="-1">
        <slot />
      </main>
    </div>

    <PlatformCommandPalette @appearance="appearanceOpen = true" />
    <PlatformAppearancePanel v-model:open="appearanceOpen" />
  </div>
</template>

<style scoped>
.shell {
  --side: var(--app-side-w);
  display: grid;
  grid-template-columns: var(--side) minmax(0, 1fr);
  min-height: 100vh;
  transition: grid-template-columns var(--app-dur-moderate) ease;
}
.shell.is-rail {
  --side: var(--app-side-w-rail);
}

.skip {
  position: fixed;
  left: 12px;
  top: -60px;
  z-index: 200;
  padding: 8px 14px;
  border-radius: var(--app-r-sm);
  background: var(--app-text);
  color: var(--app-surface);
}
.skip:focus {
  top: 12px;
}

.side {
  position: sticky;
  top: 0;
  z-index: var(--app-z-sidebar);
  display: flex;
  height: 100vh;
  flex-direction: column;
  gap: 4px;
  overflow: hidden auto;
  padding: 16px 12px;
  border-right: 1px solid var(--app-border);
  background: color-mix(in oklab, var(--app-surface) 92%, transparent);
  backdrop-filter: blur(10px);
}

.brand {
  display: flex;
  min-height: 56px;
  align-items: center;
  gap: 11px;
  padding: 4px 6px 16px;
  text-decoration: none;
}
.brand-switch {
  width: 100%;
  border-radius: var(--app-r-sm);
  text-align: start;
  cursor: pointer;
}
.brand-switch:hover {
  background: var(--app-hover);
}
.logo {
  display: grid;
  width: 38px;
  height: 38px;
  flex: none;
  place-items: center;
  border-radius: calc(var(--app-r-sm) + 2px);
  background: var(--app-grad);
  color: var(--app-grad-fg);
  font-size: 17px;
  font-weight: 800;
  box-shadow: 0 6px 16px -6px var(--app-grad-from);
}
.brand b,
.me b {
  display: block;
  white-space: nowrap;
}
.brand b {
  font-size: 15px;
  font-weight: 700;
}
.brand small,
.me small {
  color: var(--app-muted);
  font-size: 12px;
  white-space: nowrap;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-g {
  height: 36px;
  padding: 14px 10px 6px;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0.8;
}
:global(html:lang(lo)) .nav-g {
  letter-spacing: 0;
  text-transform: none;
}
.nav-a {
  position: relative;
  display: flex;
  height: 38px;
  align-items: center;
  gap: 11px;
  padding: 0 10px;
  border-radius: var(--app-r-sm);
  color: var(--app-muted);
  font-size: 13.5px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background-color var(--app-dur-base),
    color var(--app-dur-base);
}
.nav-a .ico {
  width: 18px;
  height: 18px;
  flex: none;
}
.nav-a:hover {
  background: var(--app-hover);
  color: var(--app-text);
}
.nav-a.on {
  background: color-mix(in oklab, var(--app-accent) 11%, transparent);
  color: var(--app-text);
  font-weight: 600;
}
.nav-a.on .ico {
  color: var(--app-accent);
}
.nav-a.on::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--app-grad);
}
.count {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--app-surface-2);
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
}
.count.hot {
  background: var(--app-grad);
  color: var(--app-grad-fg);
}

.side-foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}
.me {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 6px 0;
  border-top: 1px solid var(--app-border);
  white-space: nowrap;
}
.me b {
  font-size: 13px;
}
.av {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in oklab, var(--app-accent) 16%, var(--app-surface));
  color: color-mix(in oklab, var(--app-accent) 70%, var(--app-text));
  font-size: 12px;
  font-weight: 600;
  box-shadow:
    0 0 0 2px var(--app-surface),
    0 0 0 3.5px var(--app-grad-from);
}
.av-top {
  width: 32px;
  height: 32px;
  margin-left: 6px;
  border: 0;
  font-size: 11px;
  cursor: pointer;
}

.is-rail .lbl {
  display: none;
}
.is-rail .nav-g {
  height: 17px;
  padding: 8px 14px;
  font-size: 0;
}
.is-rail .nav-g::after {
  content: '';
  display: block;
  height: 1px;
  background: var(--app-border);
}
.is-rail .nav-a {
  justify-content: center;
  padding: 0;
}
.is-rail .count {
  display: none;
}
.is-rail .count.hot {
  position: absolute;
  top: 5px;
  right: 9px;
  display: block;
  width: 8px;
  height: 8px;
  padding: 0;
  font-size: 0;
}
.is-rail .brand,
.is-rail .me {
  justify-content: center;
  padding-inline: 0;
}

.main {
  min-width: 0;
}
.top {
  position: sticky;
  top: 0;
  z-index: var(--app-z-sticky);
  display: flex;
  height: var(--app-topbar-h);
  align-items: center;
  gap: 6px;
  padding: 0 28px;
  border-bottom: 1px solid color-mix(in oklab, var(--app-border) 60%, transparent);
  background: color-mix(in oklab, var(--app-bg) 78%, transparent);
  backdrop-filter: blur(14px);
}
.crumbs {
  min-width: 0;
  overflow: hidden;
  margin-left: 4px;
}
.search {
  display: flex;
  width: min(360px, 34vw);
  height: 38px;
  flex: none;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  margin-right: 4px;
  padding: 0 6px 0 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-sm);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
  color: var(--app-muted);
  font-size: 13px;
  cursor: pointer;
  transition: border-color var(--app-dur-base);
}
.search:hover {
  border-color: color-mix(in oklab, var(--app-accent) 40%, var(--app-border));
}
.search-text {
  flex: 1;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-kbd {
  display: inline-flex;
  gap: 3px;
}

.view {
  max-width: var(--app-content-max);
  margin: 0 auto;
  padding: 22px 28px 64px;
  outline: none;
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: calc(var(--app-z-sidebar) - 1);
  background: rgb(10 10 20 / 0.35);
  backdrop-filter: blur(2px);
}

@media (max-width: 900px) {
  .shell,
  .shell.is-rail {
    grid-template-columns: minmax(0, 1fr);
  }
  .side {
    position: fixed;
    inset: 0 auto 0 0;
    width: var(--app-side-w-mobile);
    transform: translateX(-100%);
    transition: transform var(--app-dur-moderate) var(--app-ease);
    background: var(--app-surface);
  }
  .is-mobile-open .side {
    transform: none;
    box-shadow: var(--app-shadow-lg);
  }
  .top {
    padding: 0 16px;
  }
  .search {
    width: 38px;
    justify-content: center;
    padding: 0;
  }
  .search-text,
  .search-kbd {
    display: none;
  }
  .view {
    padding: 18px 16px 80px;
  }
}
</style>
