import { create } from 'zustand'
import { User } from '@/types'
import { apiClient } from '@/api/client'

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User | null) => void
  checkAuth: () => Promise<void>
}

const _token = localStorage.getItem('access_token')
// Pokud máme token, okamžitě nastavíme isAuthenticated=true a isLoading=true
// (ověříme na pozadí — app se renderuje hned, nezobrazuje spinner)
// Pokud token nemáme, rovnou isLoading=false a jdeme na login
if (_token) apiClient.setToken(_token)

export const useAuthStore = create<AuthStore>(
  (set) => ({
    user: null,
    token: _token,
    isAuthenticated: !!_token,
    isLoading: !!_token,

    login: async (email: string, password: string) => {
      const response = await apiClient.login(email, password)
      const token = response.access_token
      localStorage.setItem('access_token', token)
      apiClient.setToken(token)

      const user = await apiClient.getCurrentUser()
      set({ token, user, isAuthenticated: true, isLoading: false })
    },

    logout: () => {
      localStorage.removeItem('access_token')
      apiClient.clearToken()
      set({ user: null, token: null, isAuthenticated: false, isLoading: false })
    },

    setUser: (user: User | null) => {
      set({ user })
    },

    checkAuth: async () => {
      const token = localStorage.getItem('access_token')
      if (!token) {
        set({ user: null, token: null, isAuthenticated: false, isLoading: false })
        return
      }

      apiClient.setToken(token)
      try {
        const user = await apiClient.getCurrentUser()
        set({ user, token, isAuthenticated: true, isLoading: false })
      } catch {
        // Token expiroval nebo je neplatný — odhlásíme
        localStorage.removeItem('access_token')
        apiClient.clearToken()
        set({ user: null, token: null, isAuthenticated: false, isLoading: false })
      }
    },
  })
)
