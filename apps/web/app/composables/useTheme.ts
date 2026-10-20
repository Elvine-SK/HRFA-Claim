import {
  followsWorkspace,
  isDarkMode,
  lockOf,
  resolveTheme,
  THEME_SNAPSHOT_KEY,
  themeSnapshot,
  withoutGroup,
  type EffectiveTheme,
  type LockableField,
  type ThemeSettings,
  type UserTheme,
  type WorkspaceTheme,
} from '@elvine-sk/platform-nuxt/utils'

const STORAGE_KEY = 'nelvine:theme'
const SAVE_DELAY = 500

/** Where themes are kept besides the localStorage cache; the theme plugin installs the API-backed one. */
export interface ThemeAdapter {
  load?: () => Promise<{ workspace?: WorkspaceTheme; user?: UserTheme } | undefined>
  saveUser?: (user: UserTheme) => Promise<void>
  saveWorkspace?: (workspace: WorkspaceTheme) => Promise<void>
}

let adapter: ThemeAdapter = {}

export function setThemeAdapter(next: ThemeAdapter) {
  adapter = next
}

export function getThemeAdapter(): ThemeAdapter {
  return adapter
}

interface ThemeState {
  workspace: WorkspaceTheme
  user: UserTheme
  systemDark: boolean
  /** Unsaved workspace changes an administrator is trying out; previewed live, shared only once saved. */
  draft?: WorkspaceTheme | null
}

type UserField = keyof UserTheme

let saveTimer: ReturnType<typeof setTimeout> | undefined

export function useTheme() {
  const state = useState<ThemeState>('platform:theme', () => ({ workspace: {}, user: {}, systemDark: false }))
  const editedWorkspace = computed(() => state.value.draft ?? state.value.workspace)
  const effective = computed<EffectiveTheme>(() => resolveTheme(editedWorkspace.value, state.value.user))
  /** The workspace look on its own, as the Workspace tab edits it. */
  const workspaceEffective = computed<EffectiveTheme>(() => resolveTheme(editedWorkspace.value))
  const isDark = computed(() => isDarkMode(effective.value.mode, state.value.systemDark))
  const locks = computed(() => new Set(editedWorkspace.value.locks ?? []))

  function isLocked(field: keyof ThemeSettings): boolean {
    const lock = lockOf(field)
    return !!lock && locks.value.has(lock)
  }

  function persist() {
    if (!import.meta.client) return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ workspace: state.value.workspace, user: state.value.user }),
    )
    // The no-flash snapshot is what is saved, never an unsaved workspace draft.
    const saved = resolveTheme(state.value.workspace, state.value.user)
    localStorage.setItem(THEME_SNAPSHOT_KEY, JSON.stringify(themeSnapshot(saved)))
  }

  /** Caches now and sends to the server once changes pause (a slider drag is many changes). */
  function saveUser() {
    persist()
    if (!import.meta.client) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void adapter.saveUser?.(state.value.user)?.catch(() => {}), SAVE_DELAY)
  }

  function set<K extends UserField>(field: K, value: UserTheme[K]) {
    if (isLocked(field)) return
    state.value.user = { ...state.value.user, [field]: value }
    saveUser()
  }

  function patch(values: UserTheme) {
    for (const [field, value] of Object.entries(values) as [UserField, UserTheme[UserField]][]) {
      if (!isLocked(field)) state.value.user = { ...state.value.user, [field]: value }
    }
    saveUser()
  }

  /** The person has no override of their own for this setting. */
  function inherits(group: LockableField): boolean {
    return followsWorkspace(state.value.user, group)
  }

  /** "Workspace default" on one setting: drops the personal override. */
  function clear(group: LockableField) {
    state.value.user = withoutGroup(state.value.user, group)
    saveUser()
  }

  /** "Reset to workspace": drops personal overrides but keeps the personal light/dark choice. */
  function resetToWorkspace() {
    const { mode } = state.value.user
    state.value.user = mode ? { mode } : {}
    saveUser()
  }

  function toggleDark() {
    set('mode', isDark.value ? 'light' : 'dark')
  }

  // ── Workspace (administrators) ───────────────────────────────────────

  function editWorkspace(values: Partial<WorkspaceTheme>) {
    state.value.draft = { ...editedWorkspace.value, ...values }
  }

  function toggleLock(group: LockableField) {
    const next = new Set(locks.value)
    if (next.has(group)) next.delete(group)
    else next.add(group)
    editWorkspace({ locks: [...next] })
  }

  const workspaceDirty = computed(
    () => !!state.value.draft && JSON.stringify(state.value.draft) !== JSON.stringify(state.value.workspace),
  )

  function discardWorkspace() {
    state.value.draft = null
  }

  async function saveWorkspace() {
    const draft = state.value.draft
    if (!draft) return
    await adapter.saveWorkspace?.(draft)
    state.value.workspace = draft
    state.value.draft = null
    persist()
  }

  function hydrate(values: { workspace?: WorkspaceTheme; user?: UserTheme }) {
    if (values.workspace) state.value.workspace = values.workspace
    if (values.user) state.value.user = values.user
    persist()
  }

  function readCache(): { workspace?: WorkspaceTheme; user?: UserTheme } {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {}
    } catch {
      return {}
    }
  }

  return {
    state,
    effective,
    workspaceEffective,
    isDark,
    locks,
    isLocked,
    set,
    patch,
    inherits,
    clear,
    resetToWorkspace,
    toggleDark,
    editWorkspace,
    toggleLock,
    workspaceDirty,
    discardWorkspace,
    saveWorkspace,
    hydrate,
    readCache,
    persist,
  }
}
