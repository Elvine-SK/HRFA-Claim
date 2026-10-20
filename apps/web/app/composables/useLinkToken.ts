/** The token from an emailed link (`#token=…`), removed from the address bar once read. */
export function useLinkToken() {
  const token = ref<string | null>(null)
  if (import.meta.client) {
    token.value = tokenFromHash(window.location.hash)
    if (token.value)
      history.replaceState(history.state, '', window.location.pathname + window.location.search)
  }
  return token
}
