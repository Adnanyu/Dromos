import axios from 'axios'

export function userMessageFromError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const data = error.response?.data as any
    const raw = data?.error?.message ?? data?.detail?.message ?? data?.detail ?? data?.message

    if (status === 400 && typeof raw === 'string') return raw
    if (status === 401) return 'Your session expired. Please sign in again.'
    if (status === 403) return 'You do not have access to that yet.'
    if (status === 404) return 'We could not find that item.'
    if (status === 408 || status === 504) return 'The request took too long. Check your connection and try again.'
    if (status && status >= 500) return 'Dromos is having trouble reaching the service. Please try again shortly.'
    if (error.code === 'ECONNABORTED') return 'The network is slow right now. Please try again.'
    if (!error.response) return 'You appear to be offline. Check your connection and try again.'
  }

  if (error instanceof Error && error.message && !/request failed|network error/i.test(error.message)) {
    return error.message
  }

  return fallback
}
