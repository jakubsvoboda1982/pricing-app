// Pokud je stránka servírována přes HTTPS, vždy použij HTTPS pro API (ochrana proti špatně nastavené env proměnné)
const _rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
export const API_BASE_URL =
  typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? _rawApiUrl.replace(/^http:\/\//, 'https://')
    : _rawApiUrl

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

    // Always read fresh token from localStorage to handle cases where token was set after construction
    const currentToken = this.token || localStorage.getItem('access_token')
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`
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
      // Token vypršel nebo je neplatný - přesměruj na login
      if (response.status === 401) {
        this.clearToken()
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login'
        }
        throw new Error('Relace vypršela. Prosím přihlaš se znovu.')
      }
      // Přečti detail chyby z JSON těla (FastAPI vrací { "detail": "..." })
      try {
        const errBody = await response.json()
        const detail = errBody?.detail ?? errBody?.message ?? JSON.stringify(errBody)
        throw new Error(String(detail))
      } catch (parseErr) {
        if (parseErr instanceof SyntaxError) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`)
        }
        throw parseErr
      }
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

  async addCompetitorUrl(productId: string, url: string, name?: string, market?: string) {
    return this.request('POST', `/products/${productId}/competitor-urls`, { url, name, market: market || 'CZ' })
  }

  async previewCompetitorUrl(url: string): Promise<{
    ok: boolean
    error: string | null
    detected_name: string | null
    detected_price: number | null
    detected_currency: string
    detected_description: string | null
    detected_ingredients: string | null
    variants: Array<{ label: string; url: string | null; price: number | null }>
  }> {
    return this.request('POST', '/competitor-prices/preview', { url })
  }

  async fetchProductUrlData(productId: string, url: string, market: string): Promise<{
    ok: boolean
    updated: Record<string, string | number>
    product: any
  }> {
    return this.request('POST', `/products/${productId}/fetch-url-data`, { url, market })
  }

  async setOwnMarketUrl(productId: string, market: string, url: string) {
    return this.request('PUT', `/products/${productId}/own-market-url`, { market, url })
  }

  async trackCompetitorUrl(productId: string, url: string, variantLabel?: string) {
    return this.request('POST', `/competitor-prices/${productId}/track`, { url, variant_label: variantLabel ?? null })
  }

  async removeCompetitorUrl(productId: string, url: string) {
    return this.request('DELETE', `/products/${productId}/competitor-urls?url=${encodeURIComponent(url)}`)
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

  async fixCompetitorCurrencies() {
    return this.request('POST', '/competitors/fix-currencies')
  }

  async runMatchAllProducts(competitorId: string) {
    return this.request('POST', `/competitors/${competitorId}/match-all-products`)
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

  // Baselinker
  async getBaselinkerConfig() {
    return this.request('GET', '/baselinker/config')
  }

  async saveBaselinkerConfig(data: { api_token: string; inventory_id: number | null }) {
    return this.request('POST', '/baselinker/config', data)
  }

  async getBaselinkerInventories() {
    return this.request('GET', '/baselinker/inventories')
  }

  async syncBaselinkerStock() {
    return this.request('POST', '/baselinker/sync-stock')
  }

  async syncBaselinkerStockByEan() {
    return this.request('POST', '/baselinker/sync-by-ean')
  }

  async saveBaselinkerInventory(inventory_id: number | null) {
    return this.request('POST', '/baselinker/save-inventory', { inventory_id })
  }

  async getBaselinkerProducts() {
    return this.request('GET', '/baselinker/products')
  }

  async saveBaselinkerMatch(data: {
    bl_product_id: string
    bl_sku?: string
    bl_ean?: string
    bl_name?: string
    product_id?: string | null
  }) {
    return this.request('POST', '/baselinker/matches', data)
  }

  async deleteBaselinkerMatch(matchId: string) {
    return this.request('DELETE', `/baselinker/matches/${matchId}`)
  }

  // Recommendations
  async generateRecommendation(productId: string) {
    return this.request('POST', `/recommendations/generate/${productId}`)
  }

  async generateAllRecommendations() {
    return this.request('POST', '/recommendations/generate-all')
  }

  async getRecommendations(status?: string) {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    const qs = params.toString()
    return this.request('GET', `/recommendations${qs ? `?${qs}` : ''}`)
  }

  async approveRecommendation(recommendationId: string, overridePriceWithVat?: number) {
    return this.request('POST', `/recommendations/${recommendationId}/approve`,
      overridePriceWithVat != null ? { override_price_with_vat: overridePriceWithVat } : undefined)
  }

  async rejectRecommendation(recommendationId: string) {
    return this.request('POST', `/recommendations/${recommendationId}/reject`)
  }

  async applyRecommendation(recommendationId: string) {
    return this.request('POST', `/recommendations/${recommendationId}/apply`)
  }

  async listRecommendations(status?: string) {
    return this.getRecommendations(status)
  }

  // Watchlist
  async addToWatchlist(productId: string) {
    return this.request('POST', `/watchlist/${productId}`)
  }

  async getWatchlist() {
    return this.request('GET', '/watchlist')
  }

  async listWatchlist() {
    return this.getWatchlist()
  }

  async removeFromWatchlist(productId: string) {
    return this.request('DELETE', `/watchlist/${productId}`)
  }

  async togglePriceAlert(productId: string) {
    return this.request('PUT', `/watchlist/${productId}/toggle-price-alert`)
  }

  async toggleStockAlert(productId: string) {
    return this.request('PUT', `/watchlist/${productId}/toggle-stock-alert`)
  }

  // Hero
  async calculateHeroScore(productId: string) {
    return this.request('POST', `/hero/${productId}/calculate`)
  }

  async listHeroes() {
    return this.request('GET', '/hero')
  }

  async getHeroScore(productId: string) {
    return this.request('GET', `/hero/${productId}`)
  }

  // Seasonality
  async listSeasonalityRules(category?: string) {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    return this.request('GET', `/seasonality/rules${qs}`)
  }

  async createSeasonalityRule(data: {
    month: number
    price_multiplier: number
    season_type?: string
    name?: string
    description?: string
    category?: string
  }) {
    return this.request('POST', '/seasonality/rules', data)
  }

  async updateSeasonalityRule(ruleId: string, data: {
    price_multiplier?: number
    season_type?: string
    name?: string
    description?: string
    is_active?: boolean
  }) {
    return this.request('PUT', `/seasonality/rules/${ruleId}`, data)
  }

  async deleteSeasonalityRule(ruleId: string) {
    return this.request('DELETE', `/seasonality/rules/${ruleId}`)
  }

  async getSeasonalityCalendar(category?: string) {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    return this.request('GET', `/seasonality/calendar${qs}`)
  }

  // Keep legacy aliases
  async getAnnualCalendar() {
    return this.getSeasonalityCalendar()
  }

  // Matching
  async getMatches(params?: {
    product_id?: string
    competitor_id?: string
    status?: string
    grade?: string
    market?: string
    product_market?: string
    is_active?: boolean
    skip?: number
    limit?: number
  }) {
    const p = new URLSearchParams()
    if (params?.product_id) p.set('product_id', params.product_id)
    if (params?.competitor_id) p.set('competitor_id', params.competitor_id)
    if (params?.status) p.set('status', params.status)
    if (params?.grade) p.set('grade', params.grade)
    if (params?.market) p.set('market', params.market)
    if (params?.product_market) p.set('product_market', params.product_market)
    if (params?.is_active !== undefined) p.set('is_active', String(params.is_active))
    if (params?.skip !== undefined) p.set('skip', String(params.skip))
    if (params?.limit !== undefined) p.set('limit', String(params.limit))
    const qs = p.toString()
    return this.request('GET', `/matching/matches${qs ? `?${qs}` : ''}`)
  }

  async getProductMatches(productId: string, status?: string) {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    const qs = p.toString()
    return this.request('GET', `/matching/product/${productId}/matches${qs ? `?${qs}` : ''}`)
  }

  async approveMatch(matchId: string, notes?: string) {
    return this.request('POST', `/matching/matches/${matchId}/approve`, { notes })
  }

  async rejectMatch(matchId: string, reason: string, notes?: string) {
    return this.request('POST', `/matching/matches/${matchId}/reject`, { reason, notes })
  }

  async deactivateMatch(matchId: string) {
    return this.request('POST', `/matching/matches/${matchId}/deactivate`)
  }

  async deleteMatch(matchId: string) {
    return this.request('DELETE', `/matching/matches/${matchId}`)
  }

  async updateCandidateUrl(candidateId: string, url: string) {
    return this.request('PATCH', `/matching/candidates/${candidateId}/url`, { url })
  }

  async getMatchStats(params?: { product_id?: string; competitor_id?: string; market?: string; product_market?: string }) {
    const p = new URLSearchParams()
    if (params?.product_id) p.set('product_id', params.product_id)
    if (params?.competitor_id) p.set('competitor_id', params.competitor_id)
    if (params?.market) p.set('market', params.market)
    if (params?.product_market) p.set('product_market', params.product_market)
    const qs = p.toString()
    return this.request('GET', `/matching/stats${qs ? `?${qs}` : ''}`)
  }

  async runDiscovery(competitorId: string, listingUrl: string, maxCandidates = 50) {
    return this.request('POST', '/matching/run-discovery', {
      competitor_id: competitorId,
      listing_url: listingUrl,
      max_candidates: maxCandidates,
    })
  }

  async runMatchingPipeline(productId: string, competitorId: string, listingUrls?: string[]) {
    return this.request('POST', '/matching/run-pipeline', {
      product_id: productId,
      competitor_id: competitorId,
      listing_urls: listingUrls,
    })
  }

  async rescoreMatches(productId: string, competitorId: string) {
    return this.request('POST', `/matching/rescore/${productId}/${competitorId}`)
  }

  // Bulk link to catalog
  async bulkLinkCatalog(productIds?: string[], force = false) {
    return this.request('POST', '/products/bulk-link-catalog', {
      product_ids: productIds ?? null,
      force,
    })
  }
}

export const apiClient = new APIClient()

// Helper: fetch s automatickým Authorization headerem
// Použij všude místo přímého fetch() pro chráněné endpointy
export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('access_token')
  const headers = new Headers(options.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...options, headers }).then(res => {
    if (res.status === 401) {
      localStorage.removeItem('access_token')
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return res
  })
}
