export interface PlatformCommand {
  id: string
  label: string
  icon?: string
  kbds?: string[]
  /** Group heading; defaults to "Actions". */
  group?: string
  run: () => void | Promise<void>
}

/** Command registry for the palette. Pages and modules register actions; they unregister on unmount. */
export function useCommands() {
  const commands = useState<PlatformCommand[]>('platform:commands', () => [])
  const paletteOpen = useState('platform:palette-open', () => false)

  function register(list: PlatformCommand[]) {
    const ids = new Set(list.map((c) => c.id))
    commands.value = [...commands.value.filter((c) => !ids.has(c.id)), ...list]
    if (getCurrentScope()) {
      onScopeDispose(() => {
        commands.value = commands.value.filter((c) => !ids.has(c.id))
      })
    }
  }

  return { commands, paletteOpen, register }
}
