import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import * as SecureStore from 'expo-secure-store'

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080'

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Secure token storage ──────────────────────────────────────────────────────

const ACCESS_KEY  = 'stride_access_token'
const REFRESH_KEY = 'stride_refresh_token'

export const tokenStorage = {
  getAccess:  ()          => SecureStore.getItemAsync(ACCESS_KEY),
  getRefresh: ()          => SecureStore.getItemAsync(REFRESH_KEY),
  setAccess:  (v: string) => SecureStore.setItemAsync(ACCESS_KEY, v),
  setRefresh: (v: string) => SecureStore.setItemAsync(REFRESH_KEY, v),
  clearAll:   ()          => Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]),
}

// ── Request interceptor: attach Bearer token ──────────────────────────────────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenStorage.getAccess()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: silent refresh on 401 ───────────────────────────────
// Uses a queue so concurrent requests during a refresh aren't dropped.

let isRefreshing = false
let pendingQueue: Array<{
  resolve: (token: string) => void
  reject:  (err: unknown)  => void
}> = []

function flushQueue(token: string | null, err: unknown = null) {
  pendingQueue.forEach(({ resolve, reject }) =>
    token ? resolve(token) : reject(err)
  )
  pendingQueue = []
}

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean }

// ── Response envelope unwrapper ───────────────────────────────────────────────
// The backend wraps every response in { "data": { ... } }.
// Unwrap it here once so every api.* call gets the inner object directly.
api.interceptors.response.use(
  (res: AxiosResponse) => {
    if (
      res.data !== null &&
      typeof res.data === 'object' &&
      'data' in res.data &&
      Object.keys(res.data).length === 1   // only strip when the sole key is "data"
    ) {
      res.data = res.data.data
    }
    return res
  },
  async (error) => {
    const original = error.config as RetryConfig

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    // Never try to refresh on auth endpoints — avoids infinite loops
    if ((original.url ?? '').startsWith('/auth/')) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          },
          reject,
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const refreshToken = await tokenStorage.getRefresh()
      if (!refreshToken) throw new Error('No refresh token stored')

      // Use a raw axios call so we don't trigger our own interceptor
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      })

      await Promise.all([
        tokenStorage.setAccess(data.access_token),
        tokenStorage.setRefresh(data.refresh_token),
      ])

      flushQueue(data.access_token)
      original.headers.Authorization = `Bearer ${data.access_token}`
      return api(original)
    } catch (refreshErr) {
      flushQueue(null, refreshErr)
      await tokenStorage.clearAll()
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)
