import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types'
import { apiClient } from '@/api/client'

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, full_name: string, company_name: string) => Promise<void>
  logout: () => void
  setUser: (user: User | null) => void
}

export const useAuthStore = create<AuthStore>(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const response = await apiClient.login(email, password)
        apiClient.setToken(response.access_token)
        set({
          token: response.access_token,
          isAuthenticated: true,
        })
      },

      register: async (email: string, password: string, full_name: string, company_name: string) => {
        const response = await apiClient.register(email, password, full_name, company_name)
        apiClient.setToken(response.access_token)
        set({
          token: response.access_token,
          isAuthenticated: true,
        })
      },

      logout: () => {
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
    }),
    {
      name: 'auth-store',
    }
  )
)
