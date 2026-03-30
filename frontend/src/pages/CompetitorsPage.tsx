import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2, ExternalLink, AlertCircle, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiClient, API_BASE_URL } from '@/api/client'
import MarketSelector from '@/components/MarketSelector'
import { useMarketStore, shouldShowMarket } from '@/store/market'

interface Competitor {
  id: string
  name: string
  url: string
  logo_url?: string
  category?: string
  market?: string
  is_active: boolean
  last_scrape_date?: string
  scrape_error?: string
  latest_price?: number
  latest_rank?: number
  unread_alerts_count: number
}

export default function CompetitorsPage() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [marketInput, setMarketInput] = useState<'CZ' | 'SK'>('CZ')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isAddingCompetitor, setIsAddingCompetitor] = useState(false)
  const [addError, setAddError] = useState('')
  const queryClient = useQueryClient()
  const selectedMarket = useMarketStore((state) => state.selectedMarket)
  const navigate = useNavigate()

  // Načti konkurenty
  const { data: competitors = [], isLoading } = useQuery({
    queryKey: ['competitors', selectedCategory, selectedMarket],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedCategory) params.set('category', selectedCategory)
      if (selectedMarket !== 'ALL') params.set('market', selectedMarket)

      const response = await fetch(
        `${API_BASE_URL}/competitors${params.toString() ? `?${params.toString()}` : ''}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      )
      if (!response.ok) throw new Error('Chyba při načítání konkurentů')
      return await response.json()
    },
  })

  // Mutace pro přidání konkurenta
  const addCompetitorMutation = useMutation({
    mutationFn: async (data: { url: string; market: string }) => {
      const response = await fetch(`${API_BASE_URL}/competitors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Chyba při přidávání konkurenta')
      }
      return await response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
      setUrlInput('')
      setMarketInput('CZ')
      setShowAddModal(false)
      setAddError('')
    },
    onError: (error: any) => {
      setAddError(error.message || 'Neznámá chyba')
    },
  })

  // Mutace pro smazání konkurenta
  const deleteCompetitorMutation = useMutation({
    mutationFn: async (competitorId: string) => {
      const response = await fetch(`${API_BASE_URL}/competitors/${competitorId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      if (!response.ok) throw new Error('Chyba při smazání')
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
    },
  })

  // Mutace pro re-scrape
  const rescrapeMutation = useMutation({
    mutationFn: async (competitorId: string) => {
      const response = await fetch(`${API_BASE_URL}/competitors/${competitorId}/rescrape`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      if (!response.ok) throw new Error('Chyba při re-scrape')
      return await response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
    },
  })

  // Načti kategorie
  const categories = [...new Set(competitors.map((c: Competitor) => c.category).filter(Boolean) as string[])]
  const totalUnreadAlerts = competitors.reduce((sum: number, c: Competitor) => sum + (c.unread_alerts_count || 0), 0)

  const handleAddCompetitor = async () => {
    if (!urlInput.trim()) {
      setAddError('Zadej prosím URL')
      return
    }
    setIsAddingCompetitor(true)
    await addCompetitorMutation.mutateAsync({ url: urlInput, market: marketInput })
    setIsAddingCompetitor(false)
  }

  // Filtrované konkurenty podle vybraného trhu
  const filteredCompetitors = competitors.filter((c: Competitor) =>
    shouldShowMarket(c.market, selectedMarket)
  )

  return (
    <div className="space-y-6">
      {/* Header + Market Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Konkurence</h1>
          <p className="text-gray-600 mt-1">
            {filteredCompetitors.length} konkurentů sledujeme
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <MarketSelector />
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center space-x-2 transition"
          >
            <Plus size={20} />
            <span>Přidat konkurenta</span>
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {totalUnreadAlerts > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle size={24} className="text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-orange-900">
              {totalUnreadAlerts} nových upozornění
            </p>
            <p className="text-sm text-orange-700 mt-1">
              Některé konkurenty změnily svou pozici nebo cenu
            </p>
          </div>
        </div>
      )}

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => {}}
          className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-blue-900">Cenové srovnění</p>
          <p className="text-xs text-blue-700 mt-1">Porovnej vaše ceny s konkurencí</p>
        </button>
        <button
          onClick={() => {}}
          className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-green-900">Sleduj ceny</p>
          <p className="text-xs text-green-700 mt-1">Monitoruj vývoj cen v čase</p>
        </button>
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Kategorie</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 rounded-full text-sm transition ${
                selectedCategory === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Všechny
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm transition ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Competitors Grid */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Načítám konkurenty...</p>
          </div>
        ) : filteredCompetitors.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg">
            <p className="text-gray-500 mb-4">
              {competitors.length === 0 ? 'Žádní konkurenti' : 'Žádní konkurenti v tomto trhu'}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
            >
              {competitors.length === 0 ? 'Přidat prvního konkurenta' : 'Přidat konkurenta'}
            </button>
          </div>
        ) : (
          filteredCompetitors.map((competitor: Competitor) => (
            <div
              key={competitor.id}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition p-6 border-l-4 border-l-green-500 cursor-pointer"
              onClick={(e) => {
                // Don't navigate when clicking action buttons
                if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return
                navigate(`/competitors/${competitor.id}`)
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start space-x-4 flex-1">
                  {competitor.logo_url && (
                    <img
                      src={competitor.logo_url}
                      alt={competitor.name}
                      className="w-12 h-12 rounded-lg object-cover bg-gray-100"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{competitor.name}</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <a
                        href={competitor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center space-x-1"
                      >
                        <span>{new URL(competitor.url).hostname}</span>
                        <ExternalLink size={14} />
                      </a>
                      {competitor.market && (
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          competitor.market === 'CZ'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {competitor.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                        </span>
                      )}
                      {competitor.category && (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          {competitor.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {competitor.unread_alerts_count > 0 && (
                  <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-1 rounded-full">
                    {competitor.unread_alerts_count}
                  </span>
                )}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {competitor.latest_price && (
                  <div className="bg-blue-50 rounded p-3">
                    <p className="text-xs text-blue-600">Poslední cena</p>
                    <p className="font-semibold text-blue-900">{competitor.latest_price} Kč</p>
                  </div>
                )}
                {competitor.latest_rank && (
                  <div className="bg-green-50 rounded p-3">
                    <p className="text-xs text-green-600">Pozice</p>
                    <p className="font-semibold text-green-900">{competitor.latest_rank}/100</p>
                  </div>
                )}
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-600">Stav</p>
                  <p className="font-semibold text-gray-900">
                    {competitor.scrape_error ? 'Offline' : 'Online'}
                  </p>
                </div>
              </div>

              {/* Scrape Status */}
              {competitor.last_scrape_date && (
                <p className="text-xs text-gray-600 mb-4">
                  Naposledy staženo: {new Date(competitor.last_scrape_date).toLocaleDateString('cs-CZ')}
                </p>
              )}

              {competitor.scrape_error && (
                <div className="bg-red-50 border border-red-200 rounded p-2 mb-4">
                  <p className="text-xs text-red-700">{competitor.scrape_error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => rescrapeMutation.mutate(competitor.id)}
                  disabled={rescrapeMutation.isPending}
                  className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded transition disabled:opacity-50"
                  title="Znovu stáhnout metadata"
                >
                  <RefreshCw size={18} />
                </button>
                <button
                  onClick={() => deleteCompetitorMutation.mutate(competitor.id)}
                  disabled={deleteCompetitorMutation.isPending}
                  className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded transition disabled:opacity-50"
                  title="Smazat konkurenta"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Competitor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Přidat konkurenta</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trh
              </label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setMarketInput('CZ')}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${
                    marketInput === 'CZ'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  disabled={isAddingCompetitor}
                >
                  🇨🇿 Česko
                </button>
                <button
                  onClick={() => setMarketInput('SK')}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${
                    marketInput === 'SK'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  disabled={isAddingCompetitor}
                >
                  🇸🇰 Slovensko
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL webových stránek
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://konkurent.cz"
                disabled={isAddingCompetitor}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {addError && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                <p className="text-sm text-red-700">{addError}</p>
              </div>
            )}

            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setUrlInput('')
                  setMarketInput('CZ')
                  setAddError('')
                }}
                disabled={isAddingCompetitor}
                className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                onClick={handleAddCompetitor}
                disabled={isAddingCompetitor || !urlInput.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
              >
                {isAddingCompetitor ? 'Stahování...' : 'Stáhnout a přidat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
