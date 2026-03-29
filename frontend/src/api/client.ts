export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export class APIClient {
  private token: string | null = null

  constructor() {
    this.token = localStorage.getItem('access_token')
  }

  setToken(token: string) {
    this.token = token
    localStorage.setItem('access_token', token)
  }

  clearToken() {
    this.token = null
    localStorage.removeItem('access_token')
  }

  private async request(
    method: string,
    endpoint: string,
    data?: any,
  ) {
    const url = `${API_BASE_URL}${endpoint}`
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (data) {
      options.body = JSON.stringify(data)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  // Auth
  async login(email: string, password: string) {
    return this.request('POST', '/auth/login', { email, password })
  }

  async register(email: string, password: string, full_name: string, company_name: string) {
    return this.request('POST', '/auth/register', {
      email,
      password,
      full_name,
      company_name,
    })
  }

  async verifyEmail(token: string, email: string) {
    return this.request('POST', '/auth/verify-email', { token, email })
  }

  async getCurrentUser() {
    return this.request('GET', '/auth/me')
  }

  // Products
  async getProducts() {
    return this.request('GET', '/products')
  }

  async getProduct(id: string) {
    return this.request('GET', `/products/${id}`)
  }

  async createProduct(data: any) {
    return this.request('POST', '/products', data)
  }

  async updateProduct(id: string, data: any) {
    return this.request('PUT', `/products/${id}`, data)
  }

  async deleteProduct(id: string) {
    return this.request('DELETE', `/products/${id}`)
  }

  // Prices
  async getPrices(productId: string) {
    return this.request('GET', `/products/${productId}/prices`)
  }

  async updatePrice(productId: string, priceId: string, data: any) {
    return this.request('PUT', `/products/${productId}/prices/${priceId}`, data)
  }

  // Audit logs
  async getAuditLogs() {
    return this.request('GET', '/audit-logs')
  }

  // Analytics
  async getAnalytics(productId: string) {
    return this.request('GET', `/analytics/${productId}`)
  }

  // Users
  async getUsers() {
    return this.request('GET', '/users')
  }

  async createUser(data: any) {
    return this.request('POST', '/users', data)
  }

  async deleteUser(id: string) {
    return this.request('DELETE', `/users/${id}`)
  }

  async updateUserRole(id: string, role: string) {
    return this.request('PUT', `/users/${id}`, { role })
  }

  async getPendingUsers(statusFilter?: string) {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status_filter', statusFilter)
    const qs = params.toString()
    return this.request('GET', `/users/pending${qs ? `?${qs}` : ''}`)
  }

  async approveUser(id: string) {
    return this.request('POST', `/users/${id}/approve`)
  }

  async rejectUser(id: string) {
    return this.request('POST', `/users/${id}/reject`)
  }

  // Admin
  async getLoginAttempts(params?: { email?: string; days?: number; page?: number; per_page?: number }) {
    const searchParams = new URLSearchParams()
    if (params?.email) searchParams.set('email', params.email)
    if (params?.days) searchParams.set('days', String(params.days))
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.per_page) searchParams.set('per_page', String(params.per_page))
    const qs = searchParams.toString()
    return this.request('GET', `/admin/login-attempts${qs ? `?${qs}` : ''}`)
  }

  async deleteLoginAttempt(id: string) {
    return this.request('DELETE', `/admin/login-attempts/${id}`)
  }

  async getAdminUsers() {
    return this.request('GET', '/admin/users')
  }

  async createAdminUser(data: { email: string; password: string; full_name: string; role: string }) {
    return this.request('POST', '/admin/users', data)
  }

  async updateAdminUser(id: string, data: { role?: string; is_active?: boolean; full_name?: string }) {
    return this.request('PUT', `/admin/users/${id}`, data)
  }

  async deleteAdminUser(id: string) {
    return this.request('DELETE', `/admin/users/${id}`)
  }

  // Competitors
  async getCompetitors(category?: string, market?: string) {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (market) params.set('market', market)
    const qs = params.toString()
    return this.request('GET', `/competitors${qs ? `?${qs}` : ''}`)
  }

  async addCompetitor(url: string, market?: string) {
    return this.request('POST', '/competitors', { url, market: market || 'CZ' })
  }

  async getCompetitor(id: string) {
    return this.request('GET', `/competitors/${id}`)
  }

  async updateCompetitor(id: string, data: any) {
    return this.request('PUT', `/competitors/${id}`, data)
  }

  async deleteCompetitor(id: string) {
    return this.request('DELETE', `/competitors/${id}`)
  }

  async rescapeCompetitor(id: string) {
    return this.request('POST', `/competitors/${id}/rescrape`)
  }

  async getCompetitorPrices(id: string, daysBack: number = 30) {
    return this.request('GET', `/competitors/${id}/prices?days_back=${daysBack}`)
  }

  async getCompetitorAlerts(competitorId?: string) {
    const params = new URLSearchParams()
    if (competitorId) params.set('competitor_id', competitorId)
    const qs = params.toString()
    return this.request('GET', `/competitors/alerts${qs ? `?${qs}` : ''}`)
  }

  async dismissAlert(alertId: string) {
    return this.request('PUT', `/competitors/alerts/${alertId}/dismiss`)
  }

  // Catalog - import by URL
  async importProductFromUrl(url: string, market: string = 'CZ', productType: 'own' | 'competitor' = 'own', name?: string) {
    return this.request('POST', '/catalog/import-url', { url, market, product_type: productType, name })
  }

  // Catalog - feed subscriptions
  async getFeedSubscriptions() {
    return this.request('GET', '/catalog/feeds')
  }

  async createFeedSubscription(data: { name: string; feed_url: string; market: string; merge_existing: boolean }) {
    return this.request('POST', '/catalog/feeds', data)
  }

  async updateFeedSubscription(id: string, data: Partial<{ name: string; feed_url: string; market: string; merge_existing: boolean; is_active: boolean }>) {
    return this.request('PUT', `/catalog/feeds/${id}`, data)
  }

  async deleteFeedSubscription(id: string) {
    return this.request('DELETE', `/catalog/feeds/${id}`)
  }

  async triggerFeedFetch(id: string) {
    return this.request('POST', `/catalog/feeds/${id}/fetch`)
  }

  // Catalog - import
  async importHeureaFeed(file: File, market: string = 'CZ', mergeExisting: boolean = false) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('market', market)
    formData.append('merge_existing', String(mergeExisting))

    const url = `${API_BASE_URL}/catalog/import-heureka`
    const headers: HeadersInit = {}

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }
}

export const apiClient = new APIClient()
