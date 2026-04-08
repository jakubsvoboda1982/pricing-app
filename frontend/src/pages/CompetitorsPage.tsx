import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2, ExternalLink, AlertCircle, Globe, WifiOff, Bell, Play, CheckCircle, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL, authFetch } from '@/api/client'
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

const MARKET_CURRENCY: Record<string, string> = { CZ: 'Kč', SK: '€', HU: 'Ft' }
const MARKET_DECIMALS: Record<string, number> = { CZ: 0, SK: 2, HU: 0 }

function fmtCompPrice(price: number, market?: string): string {
  const m = market ?? 'CZ'
  const sym = MARKET_CURRENCY[m] ?? 'Kč'
  const dec = MARKET_DECIMALS[m] ?? 0
  const locale = m === 'SK' ? 'sk-SK' : m === 'HU' ? 'hu-HU' : 'cs-CZ'
  return `${price.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${sym}`
}

export default function CompetitorsPage() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [marketInput, setMarketInput] = useState<'CZ' | 'SK'>('CZ')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isAddingCompetitor, setIsAddingCompetitor] = useState(false)
  const [addError, setAddError] = useState('')
  // pipeline state: competitorId → status
  const [pipelineStatus, setPipelineStatus] = useState<Record<string, 'running' | 'done' | 'error'>>({})
  // after-add: offer to run pipeline immediately
  const [justAddedId, setJustAddedId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const selectedMarket = useMarketStore((state) => state.selectedMarket)
  const navigate = useNavigate()

  const { data: competitors = [], isLoading } = useQuery({
    queryKey: ['competitors', selectedCategory, selectedMarket],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedCategory) params.set('category', selectedCategory)
      if (selectedMarket !== 'ALL') params.set('market', selectedMarket)
      const response = await authFetch(
        `${API_BASE_URL}/competitors${params.toString() ? `?${params.toString()}` : ''}`,
        { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } }
      )
      if (!response.ok) throw new Error('Chyba při načítání konkurentů')
      return await response.json()
    },
  })

  const addCompetitorMutation = useMutation({
    mutationFn: async (data: { url: string; market: string }) => {
      const response = await authFetch(`${API_BASE_URL}/competitors`, {
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
      setUrlInput('')
      setMarketInput('CZ')
      setShowAddModal(false)
      setAddError('')
      setJustAddedId(data.id)
    },
    onError: (error: any) => {
      setAddError(error.message || 'Neznámá chyba')
    },
  })

  const deleteCompetitorMutation = useMutation({
    mutationFn: async (competitorId: string) => {
      const response = await authFetch(`${API_BASE_URL}/competitors/${competitorId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      if (!response.ok) throw new Error('Chyba při smazání')
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
    },
  })

  const rescrapeMutation = useMutation({
    mutationFn: async (competitorId: string) => {
      const response = await authFetch(`${API_BASE_URL}/competitors/${competitorId}/rescrape`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      if (!response.ok) throw new Error('Chyba při re-scrape')
      return await response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
    },
  })

  const runMatchAll = async (competitorId: string) => {
    setPipelineStatus(s => ({ ...s, [competitorId]: 'running' }))
    try {
      const res = await authFetch(`${API_BASE_URL}/competitors/${competitorId}/match-all-products`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
      })
      if (!res.ok) throw new Error()
      setPipelineStatus(s => ({ ...s, [competitorId]: 'done' }))
      // reset after 5s
      setTimeout(() => setPipelineStatus(s => { const n = { ...s }; delete n[competitorId]; return n }), 5000)
    } catch {
      setPipelineStatus(s => ({ ...s, [competitorId]: 'error' }))
      setTimeout(() => setPipelineStatus(s => { const n = { ...s }; delete n[competitorId]; return n }), 4000)
    }
  }

  // Oprav měny starých záznamů na pozadí (jednorázová migrace)
  useEffect(() => {
    authFetch(`${API_BASE_URL}/competitors/fix-currencies`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
    }).catch(() => {/* silent */})
  }, [])

  const categories = [...new Set(competitors.map((c: Competitor) => c.category).filter(Boolean) as string[])]
  const filteredCompetitors = competitors.filter((c: Competitor) => shouldShowMarket(c.market, selectedMarket))

  const onlineCount  = filteredCompetitors.filter((c: Competitor) => !c.scrape_error).length
  const offlineCount = filteredCompetitors.filter((c: Competitor) => !!c.scrape_error).length
  const totalAlerts  = filteredCompetitors.reduce((sum: number, c: Competitor) => sum + (c.unread_alerts_count || 0), 0)

  const handleAddCompetitor = async () => {
    if (!urlInput.trim()) { setAddError('Zadej prosím URL'); return }
    setIsAddingCompetitor(true)
    await addCompetitorMutation.mutateAsync({ url: urlInput, market: marketInput })
    setIsAddingCompetitor(false)
  }

  // The just-added competitor (for the banner)
  const justAdded = justAddedId ? (competitors as Competitor[]).find(c => c.id === justAddedId) : null

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Konkurence</h1>
          <p className="text-sm text-gray-400 mt-0.5">Sleduj ceny a pozice konkurentů</p>
        </div>
        <div className="flex items-center gap-3">
          <MarketSelector />
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            <Plus size={15} /> Přidat konkurenta
          </button>
        </div>
      </div>

      {/* ── POST-ADD BANNER ────────────────────────────────────────────── */}
      {justAdded && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                {justAdded.name} ({justAdded.market}) přidán
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                Chceš teď spustit párování s tvými produkty? Pipeline dohledá shody a navrhne propojení.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { runMatchAll(justAdded.id); setJustAddedId(null) }}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
            >
              <Play size={13} /> Spustit párování
            </button>
            <button onClick={() => setJustAddedId(null)}
              className="text-xs text-green-600 hover:text-green-800 px-2 py-1.5">
              Přeskočit
            </button>
          </div>
        </div>
      )}

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Celkem</p>
            <Globe size={14} className="text-gray-300" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{filteredCompetitors.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">konkurentů</p>
        </div>
        <div className={`border border-gray-200 rounded-xl p-4 ${onlineCount > 0 ? 'bg-green-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Online</p>
            <Globe size={14} className={onlineCount > 0 ? 'text-green-400' : 'text-gray-300'} />
          </div>
          <p className={`text-2xl font-bold ${onlineCount > 0 ? 'text-green-700' : 'text-gray-300'}`}>{onlineCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">aktivních</p>
        </div>
        <div className={`border border-gray-200 rounded-xl p-4 ${offlineCount > 0 ? 'bg-red-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Offline</p>
            <WifiOff size={14} className={offlineCount > 0 ? 'text-red-400' : 'text-gray-300'} />
          </div>
          <p className={`text-2xl font-bold ${offlineCount > 0 ? 'text-red-600' : 'text-gray-300'}`}>{offlineCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">s chybou</p>
        </div>
        <div className={`border border-gray-200 rounded-xl p-4 ${totalAlerts > 0 ? 'bg-orange-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Upozornění</p>
            <Bell size={14} className={totalAlerts > 0 ? 'text-orange-400' : 'text-gray-300'} />
          </div>
          <p className={`text-2xl font-bold ${totalAlerts > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{totalAlerts}</p>
          <p className="text-xs text-gray-400 mt-0.5">nepřečtených</p>
        </div>
      </div>

      {/* ── ALERT STRIP ────────────────────────────────────────────────── */}
      {totalAlerts > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-orange-500 flex-shrink-0" />
          <p className="text-sm text-orange-800">
            <span className="font-semibold">{totalAlerts} nových upozornění</span>
            {' '}— někteří konkurenti změnili cenu nebo pozici
          </p>
        </div>
      )}

      {/* ── CATEGORY FILTER ────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-1">Kategorie:</span>
          <button onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              selectedCategory === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            Všechny
          </button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* ── CONTENT ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Načítám...</div>
      ) : filteredCompetitors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Globe size={44} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-500 font-medium mb-1">
            {competitors.length === 0 ? 'Žádní konkurenti' : 'Žádní konkurenti v tomto trhu'}
          </p>
          <p className="text-xs text-gray-400 mb-5">Přidejte konkurenta a sledujte jeho ceny.</p>
          <button onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            Přidat konkurenta
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center px-5 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <div className="flex-1">Konkurent</div>
            <div className="w-32 text-right">Poslední cena</div>
            <div className="w-24 text-center">Pozice</div>
            <div className="w-24 text-center">Stav</div>
            <div className="w-32 text-center">Aktualizace</div>
            <div className="w-32 text-center">Akce</div>
          </div>

          <div className="divide-y divide-gray-50">
            {filteredCompetitors.map((competitor: Competitor) => {
              const isOffline = !!competitor.scrape_error
              let hostname = ''
              try { hostname = new URL(competitor.url).hostname } catch {}
              const ps = pipelineStatus[competitor.id]

              return (
                <div key={competitor.id}
                  className="flex items-center px-5 py-3.5 hover:bg-gray-50 transition cursor-pointer"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return
                    navigate(`/competitors/${competitor.id}`)
                  }}>

                  {/* Name + URL */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{competitor.name}</span>
                      {competitor.market && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                          competitor.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {competitor.market === 'CZ' ? '🇨🇿' : '🇸🇰'} {competitor.market}
                        </span>
                      )}
                      {competitor.category && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
                          {competitor.category}
                        </span>
                      )}
                      {competitor.unread_alerts_count > 0 && (
                        <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {competitor.unread_alerts_count}
                        </span>
                      )}
                    </div>
                    <a href={competitor.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                      onClick={e => e.stopPropagation()}>
                      {hostname} <ExternalLink size={10} />
                    </a>
                  </div>

                  {/* Latest price — správná měna dle trhu */}
                  <div className="w-32 text-right">
                    {competitor.latest_price != null
                      ? <span className="text-sm font-semibold text-gray-800">
                          {fmtCompPrice(competitor.latest_price, competitor.market)}
                        </span>
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </div>

                  {/* Rank */}
                  <div className="w-24 text-center">
                    {competitor.latest_rank
                      ? <span className="text-sm text-gray-600">{competitor.latest_rank}/100</span>
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </div>

                  {/* Status */}
                  <div className="w-24 flex justify-center">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                      isOffline ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500'}`} />
                      {isOffline ? 'Offline' : 'Online'}
                    </span>
                  </div>

                  {/* Last scraped */}
                  <div className="w-32 text-center text-xs text-gray-400">
                    {competitor.last_scrape_date
                      ? new Date(competitor.last_scrape_date).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' })
                      : '—'
                    }
                  </div>

                  {/* Actions: rescrape + match-all + delete */}
                  <div className="w-32 flex justify-center gap-1">
                    {/* Match all products */}
                    <button
                      onClick={() => runMatchAll(competitor.id)}
                      disabled={ps === 'running'}
                      title="Párovat s produkty"
                      className={`p-1.5 rounded-lg transition text-xs flex items-center gap-1 font-medium ${
                        ps === 'running' ? 'text-blue-400 bg-blue-50 cursor-wait'
                        : ps === 'done' ? 'text-green-600 bg-green-50'
                        : ps === 'error' ? 'text-red-500 bg-red-50'
                        : 'text-purple-500 hover:text-purple-700 hover:bg-purple-50'
                      }`}
                    >
                      {ps === 'running' ? <Loader2 size={14} className="animate-spin" />
                        : ps === 'done' ? <CheckCircle size={14} />
                        : <Play size={14} />}
                    </button>
                    <button onClick={() => rescrapeMutation.mutate(competitor.id)}
                      disabled={rescrapeMutation.isPending}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                      title="Znovu stáhnout">
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={() => deleteCompetitorMutation.mutate(competitor.id)}
                      disabled={deleteCompetitorMutation.isPending}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                      title="Smazat">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ADD MODAL ──────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Přidat konkurenta</h2>
            <p className="text-xs text-gray-400 mb-4">
              Po přidání nabídneme spuštění automatického párování s tvými produkty.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Trh</label>
              <div className="flex gap-2">
                <button onClick={() => setMarketInput('CZ')} disabled={isAddingCompetitor}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    marketInput === 'CZ' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  🇨🇿 Česko (Kč)
                </button>
                <button onClick={() => setMarketInput('SK')} disabled={isAddingCompetitor}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    marketInput === 'SK' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  🇸🇰 Slovensko (€)
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">URL webu</label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCompetitor()}
                placeholder={marketInput === 'SK' ? 'https://konkurent.sk' : 'https://konkurent.cz'}
                disabled={isAddingCompetitor}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {addError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                <p className="text-xs text-red-700">{addError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setShowAddModal(false); setUrlInput(''); setMarketInput('CZ'); setAddError('') }}
                disabled={isAddingCompetitor}
                className="flex-1 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
                Zrušit
              </button>
              <button onClick={handleAddCompetitor}
                disabled={isAddingCompetitor || !urlInput.trim()}
                className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50">
                {isAddingCompetitor ? 'Přidávám...' : 'Přidat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
