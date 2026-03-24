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

export const useAuthStore = create<AuthStore>(
  (set) => ({
    user: null,
    token: localStorage.getItem('access_token'),
    isAuthenticated: false,
    isLoading: true,

    login: async (email: string, password: string) => {
      const response = await apiClient.login(email, password)
      const token = response.access_token
      localStorage.setItem('access_token', token)
      apiClient.setToken(token)

      const user = await apiClient.getCurrentUser()
      set({
        token,
        user,
        isAuthenticated: true,
      })
    },

    logout: () => {
      localStorage.removeItem('access_token')
      apiClient.clearToken()
      set({
        user: null,
        token: null,
        isAuthenticated: false,
      })
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
        set({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
        })
      } catch {
        localStorage.removeItem('access_token')
        apiClient.clearToken()
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })
      }
    },
  })
)
