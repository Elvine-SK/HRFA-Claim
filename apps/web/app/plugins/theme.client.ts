import type { DataResponse } from '@elvine-sk/platform-core'
import {
  SESSION_STATE_KEY,
  themeAttributes,
  themeVariables,
  type SessionInfo,
  type UserTheme,
  type WorkspaceTheme,
} from '@elvine-sk/platform-nuxt/utils'

/** The only writer of theme state on <html> (attributes, `.dark`, inline variables). */
export default defineNuxtPlugin({
  name: 'platform:theme',
  enforce: 'pre',
  setup(nuxtApp) {
    const theme = useTheme()
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    theme.state.value.systemDark = media.matches
    media.addEventListener('change', (event) => (theme.state.value.systemDark = event.matches))
    theme.hydrate(theme.readCache())

    // `nuxt.config.ts` gives <html> the default theme attributes for the first paint, and the head manager
    // writes its attributes again on every head update (navigation, title, locale). Declaring the current
    // ones here keeps it from putting the defaults back.
    useHead(() => ({
      htmlAttrs: themeAttributes(theme.effective.value) as Record<`data-${string}`, string>,
    }))

    let applied: string[] = []
    watch(
      [theme.effective, theme.isDark],
      ([effective, dark]) => {
        for (const [name, value] of Object.entries(themeAttributes(effective))) root.setAttribute(name, value)
        root.classList.toggle('dark', dark)
        root.style.colorScheme = dark ? 'dark' : 'light'
        const vars = themeVariables(effective, dark)
        for (const name of applied) if (!(name in vars)) root.style.removeProperty(name)
        for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
        applied = Object.keys(vars)
      },
      { immediate: true },
    )

    // The workspace look is shared and a person's own look follows their account (`/auth/appearance`).
    // An app that keeps themes elsewhere calls `setThemeAdapter` from a plugin of its own.
    const session = useState<SessionInfo | null>(SESSION_STATE_KEY, () => null)
    const api = () => nuxtApp.$api as ReturnType<typeof useApi>
    if (!Object.keys(getThemeAdapter()).length)
      setThemeAdapter({
        async load() {
          const { data } =
            await api()<DataResponse<{ workspace: WorkspaceTheme; user: UserTheme | null }>>(
              '/auth/appearance',
            )
          return { workspace: data.workspace, user: data.user ?? undefined }
        },
        async saveUser(user) {
          if (session.value?.state === 'active')
            await api()('/auth/appearance/me', { method: 'PUT', body: user })
        },
        async saveWorkspace(workspace) {
          await api()('/auth/appearance/workspace', { method: 'PUT', body: workspace })
        },
      })

    async function load() {
      try {
        const remote = await getThemeAdapter().load?.()
        if (remote) theme.hydrate(remote)
      } catch {
        // Offline or no appearance API: the cached theme stays.
      }
    }
    nuxtApp.hook('app:mounted', () => {
      void load()
      // Signing in brings that person's own look.
      watch(
        () => `${session.value?.state}:${session.value?.user?.id}`,
        () => void load(),
      )
    })
  },
})
