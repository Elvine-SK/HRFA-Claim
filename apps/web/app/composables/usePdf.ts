/** Downloads a record's PDF form (`/agreements/{id}/pdf`, `/settlements/{id}/pdf`) and saves it as `fileName`. */
export function usePdf() {
  const api = useApi()
  const notify = useNotify()
  const busy = ref(false)
  async function download(path: string, fileName: string) {
    busy.value = true
    try {
      saveBlob(await api<Blob>(path, { responseType: 'blob' }), fileName)
    } catch (error) {
      notify.error(error)
    } finally {
      busy.value = false
    }
  }
  return { busy, download }
}
