import { toApiError, type ApiError } from '@elvine-sk/platform-nuxt/utils'
import type { FileMeta } from '../types/platform'

export const FILES_KEY = 'files'

export type UploadState = 'uploading' | 'done' | 'failed' | 'cancelled'

export interface UploadHandle {
  progress: Ref<number>
  state: Ref<UploadState>
  error: Ref<ApiError | null>
  cancel: () => void
  done: Promise<FileMeta | null>
}

/**
 * Uploads with XMLHttpRequest for progress; same base URL, cookies, CSRF and language headers as `$api`.
 * Uploads still running when the calling component unmounts are cancelled.
 */
export function useUpload() {
  const config = useRuntimeConfig()
  const csrf = useCsrfToken()
  const { locale } = useI18n()
  const nuxtApp = useNuxtApp()
  const running = new Set<XMLHttpRequest>()
  if (getCurrentScope()) onScopeDispose(() => running.forEach((xhr) => xhr.abort()))
  /** Without `entityId` the upload is a draft for a record of `entityType` that does not exist yet. */
  function start(file: File, target: { entityType: string; entityId?: string }): UploadHandle {
    const progress = ref(0)
    const state = ref<UploadState>('uploading')
    const error = ref<ApiError | null>(null)
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    form.append('entityType', target.entityType)
    if (target.entityId) form.append('entityId', target.entityId)
    running.add(xhr)
    xhr.onloadend = () => running.delete(xhr)
    const done = new Promise<FileMeta | null>((resolve) => {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100)
      }
      xhr.onload = () => {
        let body: any = null
        try {
          body = xhr.responseText ? JSON.parse(xhr.responseText) : null
        } catch {
          body = null
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          state.value = 'done'
          progress.value = 100
          resolve((body?.data ?? null) as FileMeta | null)
          return
        }
        state.value = 'failed'
        error.value = toApiError({
          status: xhr.status,
          body,
          requestId: xhr.getResponseHeader('x-request-id'),
        })
        if (xhr.status === 401) void nuxtApp.callHook('platform:unauthenticated', error.value)
        resolve(null)
      }
      xhr.onerror = () => {
        state.value = 'failed'
        error.value = toApiError({ status: 0, body: null })
        resolve(null)
      }
      xhr.onabort = () => {
        state.value = 'cancelled'
        resolve(null)
      }
    })
    xhr.open('POST', `${config.public.platform.apiBase}/files`)
    xhr.withCredentials = true
    if (csrf.value) xhr.setRequestHeader('X-CSRF-Token', csrf.value)
    xhr.setRequestHeader('Accept-Language', locale.value)
    xhr.send(form)
    return { progress, state, error, cancel: () => xhr.abort(), done }
  }
  return { start }
}
