/** Field errors and a top-level message for hand-built forms, filled from API errors. */
export function useFormErrors<F extends string>() {
  const { t, te } = useI18n()
  const notify = useNotify()
  const fields = reactive({}) as Partial<Record<F, string>>
  const message = ref<string | null>(null)

  function translate(code: string | undefined, fallback: string) {
    const key = code ? `errors.${code.replaceAll('.', '_')}` : ''
    return key && te(key) ? t(key) : fallback
  }

  function clear() {
    for (const key of Object.keys(fields)) delete fields[key as F]
    message.value = null
  }

  /** Puts errors next to known fields; anything else becomes the banner message. Returns true if handled. */
  function apply(error: unknown, known: readonly F[] = []) {
    clear()
    if (!isApiError(error)) {
      message.value = notify.messageOf(error)
      return
    }
    const rest: string[] = []
    for (const field of fieldErrorsOf(error)) {
      const path = field.path as F
      if (known.includes(path)) fields[path] = translate(field.code, field.message)
      else rest.push(translate(field.code, field.message))
    }
    if (rest.length) message.value = rest.join(' ')
    else if (!Object.keys(fields).length) message.value = translate(error.code, notify.messageOf(error))
  }

  return { fields, message, apply, clear, translate }
}
