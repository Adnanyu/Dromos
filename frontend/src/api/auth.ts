import { api } from './client'
import type {
  RegisterRequest, LoginRequest, RefreshRequest, AuthResponse, PublicUser, UpdateProfileRequest,
} from '../types/api'

export const authApi = {
  register: (body: RegisterRequest) =>
    api.post<AuthResponse>('/auth/register', body).then(r => r.data),

  login: (body: LoginRequest) =>
    api.post<AuthResponse>('/auth/login', body).then(r => r.data),

  refresh: (body: RefreshRequest) =>
    api.post<AuthResponse>('/auth/refresh', body).then(r => r.data),

  logout: (body: RefreshRequest) =>
    api.post<void>('/auth/logout', body).then(r => r.data),

  getMe: () =>
    api.get<PublicUser>('/users/me').then(r => r.data),

  updateMe: (body: UpdateProfileRequest) =>
    api.patch<PublicUser>('/users/me', body).then(r => r.data),
}
