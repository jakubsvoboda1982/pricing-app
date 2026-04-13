import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Link2, Upload, Trash2, ExternalLink, Package, AlertCircle, X, RefreshCw, CheckCircle, Globe, Play, ChevronDown } from 'lucide-react'
import { apiClient, API_BASE_URL, authFetch } from '@/api/client'
import { useNavigate } from 'react-router-dom'
import { useMarketStore, shouldShowMarket } from '@/store/market'
import { useDisplayStore } from '@/store/display'

interface CompetitorUrl { url: string; name: string; market: string }

interface Product {
  id: string; name: string; sku: string; product_code?: string | null
  category?: string; ean?: string; thumbnail_url?: string; url_reference?: string
  competitor_urls?: CompetitorUrl[]; current_price?: number | null
  old_price?: number | null; market?: string; currency?: string
  purchase_price_without_vat?: number | null
  purchase_vat_rate?: number | null; purchase_price_with_vat?: number | null
  min_price?: number | null; margin?: number | null
  margin_by_market?: Record<string, number> | null; hero_score?: number | null
  lowest_competitor_price?: number | null; stock_quantity?: number | null
  manufacturer?: string | null; catalog_price_vat?: number | null
  catalog_quantity_in_stock?: number | null
  market_names?: Record<string, string>
  stock_divisor?: number | null
  prices_by_market?: Record<string, { price: number | null; currency: string }>
  created_at: string
}

interface LinkResult {
  linked: number
  already_linked: number
  not_found: number
  details: { id: string; name: string; catalog_name: string; match_reason: string }[]
  not_found_list: { id: string; name: string }[]
}

interface Competitor {
  id: string
  name: string
  url: string
  market?: string
}

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [refreshingAll, setRefreshingAll] = useState(false)
  // Bulk competitor panel
  const [bulkPanel, setBulkPanel] = useState<'competitor' | 'pipeline' | null>(null)
  const [bulkCompetitorId, setBulkCompetitorId] = useState('')
  const [bulkListingUrl, setBulkListingUrl] = useState('')
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; action: string } | null>(null)
  const [bulkMsg, setBulkMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const selectedMarket = useMarketStore(state => state.selectedMarket)
  const { viewMode } = useDisplayStore()

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiClient.getProducts(),
  })

  const { data: competitors = [] } = useQuery<Competitor[]>({
    queryKey: ['competitors'],
    queryFn: () => apiClient.getCompetitors(),
  })

  // Auto-fill listing URL when competitor changes
  useEffect(() => {
    const c = (competitors as Competitor[]).find(c => c.id === bulkCompetitorId)
    if (c) setBulkListingUrl(c.url || '')
  }, [bulkCompetitorId, competitors])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteProduct(id),
    onSuccess: () => {
      setConfirmDeleteId(null)
      setSelectedIds(prev => { const n = new Set(prev); n.delete(confirmDeleteId!); return n })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const filtered = (products as Product[]).filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !search || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      || (p.product_code ?? '').toLowerCase().includes(q)
    // Trh: filtrujeme striktně podle market produktu (trh jeho ceny z feedu)
    const matchMarket = selectedMarket === 'ALL'
      || (p.market || 'CZ') === selectedMarket
    return matchSearch && matchMarket
  })

  // Seskupit produkty podle product_code (PRODUCTNO) — stejný produkt pro více trhů zobrazit jen 1x
  interface GroupedProduct extends Product {
    _grouped_ids: string[]
    _markets: string[]
  }
  const groupedFiltered: GroupedProduct[] = (() => {
    const groups = new Map<string, Product[]>()
    const noCodeProducts: Product[] = []
    for (const p of filtered) {
      if (p.product_code) {
        const key = p.product_code
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(p)
      } else {
        noCodeProducts.push(p)
      }
    }
    const result: GroupedProduct[] = []
    for (const group of groups.values()) {
      // Primární produkt: preferuj CZ, pak první
      const primary = group.find(p => (p.market || 'CZ') === 'CZ') ?? group[0]
      // Sloučení prices_by_market a margin_by_market ze všech trhů
      const mergedPrices: Record<string, { price: number | null; currency: string }> = { ...(primary.prices_by_market ?? {}) }
      const mergedMargins: Record<string, number> = { ...(primary.margin_by_market ?? {}) }
      let mergedStock = primary.stock_quantity
      let mergedLowest = primary.lowest_competitor_price
      let mergedCompUrls = [...(primary.competitor_urls ?? [])]
      for (const p of group) {
        if (p.id === primary.id) continue
        // Přidej ceny z ostatních trhů
        for (const [mkt, mktData] of Object.entries(p.prices_by_market ?? {})) {
          if (!mergedPrices[mkt]) mergedPrices[mkt] = mktData
        }
        for (const [mkt, margin] of Object.entries(p.margin_by_market ?? {})) {
          if (mergedMargins[mkt] == null) mergedMargins[mkt] = margin
        }
        // Sečti sklady
        if (p.stock_quantity != null) {
          mergedStock = (mergedStock ?? 0) + p.stock_quantity
        }
        // Nejnižší konkurent přes všechny trhy
        if (p.lowest_competitor_price != null) {
          if (mergedLowest == null || p.lowest_competitor_price < mergedLowest) {
            mergedLowest = p.lowest_competitor_price
          }
        }
        // Konkurentní URL
        mergedCompUrls = [...mergedCompUrls, ...(p.competitor_urls ?? [])]
      }
      result.push({
        ...primary,
        prices_by_market: mergedPrices,
        margin_by_market: mergedMargins,
        stock_quantity: mergedStock,
        lowest_competitor_price: mergedLowest,
        competitor_urls: mergedCompUrls,
        _grouped_ids: group.map(p => p.id),
        _markets: group.map(p => p.market || 'CZ'),
      })
    }
    // Produkty bez product_code přidej na konec (bez slučování)
    for (const p of noCodeProducts) {
      result.push({ ...p, _grouped_ids: [p.id], _markets: [p.market || 'CZ'] })
    }
    return result
  })()

  const handleBulkLink = async (ids?: string[]) => {
    setLinkLoading(true)
    setLinkResult(null)
    try {
      const result = await apiClient.bulkLinkCatalog(ids)
      setLinkResult(result)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch (e: any) {
      setLinkResult({ linked: 0, already_linked: 0, not_found: 0, details: [], not_found_list: [] })
    } finally {
      setLinkLoading(false)
    }
  }

  const handleRefreshAll = async () => {
    setRefreshingAll(true)
    try {
      await authFetch(`${API_BASE_URL}/competitor-prices/refresh-all-now`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    } finally {
      setRefreshingAll(false)
    }
  }

  // Bulk: add competitor URL to each selected product
  const handleBulkAddCompetitor = async () => {
    if (!bulkCompetitorId) return
    const competitor = (competitors as Competitor[]).find(c => c.id === bulkCompetitorId)
    if (!competitor) return
    const ids = [...selectedIds]
    const url = bulkListingUrl.trim() || competitor.url
    setBulkProgress({ done: 0, total: ids.length, action: 'Přidávám URL' })
    setBulkMsg(null)
    let done = 0; let errors = 0
    for (const productId of ids) {
      try {
        await apiClient.addCompetitorUrl(productId, url, competitor.name, competitor.market || 'CZ')
      } catch { errors++ }
      done++
      setBulkProgress({ done, total: ids.length, action: 'Přidávám URL' })
    }
    setBulkProgress(null)
    setBulkMsg({ type: errors === 0 ? 'ok' : 'err', text: errors === 0 ? `✓ URL konkurenta přidáno k ${done} produktům.` : `Přidáno k ${done - errors}/${done}, ${errors} chyb.` })
    queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  // Bulk: run matching pipeline for each selected product
  const handleBulkRunPipeline = async () => {
    if (!bulkCompetitorId) return
    const ids = [...selectedIds]
    const listingUrls = bulkListingUrl.trim() ? [bulkListingUrl.trim()] : undefined
    setBulkProgress({ done: 0, total: ids.length, action: 'Spouštím pipeline' })
    setBulkMsg(null)
    let done = 0; let errors = 0
    for (const productId of ids) {
      try {
        await apiClient.runMatchingPipeline(productId, bulkCompetitorId, listingUrls)
      } catch { errors++ }
      done++
      setBulkProgress({ done, total: ids.length, action: 'Spouštím pipeline' })
    }
    setBulkProgress(null)
    setBulkMsg({
      type: errors === 0 ? 'ok' : 'err',
      text: errors === 0
        ? `✓ Pipeline spuštěn pro ${done} produktů na pozadí. Výsledky v Párovacím centru.`
        : `Spuštěno ${done - errors}/${done}, ${errors} selhalo.`
    })
  }

  const allSelected = groupedFiltered.length > 0 && groupedFiltered.every(p => selectedIds.has(p.id))
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(groupedFiltered.map(p => p.id)))
  const toggleOne = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // ── Helpers ────────────────────────────────────────────────────────────────
  /** Vrátí nejrelevantnější marži pro produkt: přednostně pro zvolený trh, jinak první dostupnou */
  const getMargin = (p: Product, market?: string): number | null => {
    const mbm = p.margin_by_market
    if (mbm) {
      if (market && mbm[market] != null) return mbm[market]
      const keys = Object.keys(mbm)
      if (keys.length > 0) return mbm[keys[0]]
    }
    return p.margin != null ? Number(p.margin) : null
  }

  function marginBadge(m: number | null) {
    if (m == null) return <span className="text-sm text-gray-300">—</span>
    return (
      <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
        m >= 20 ? 'bg-green-100 text-green-700'
        : m >= 10 ? 'bg-yellow-100 text-yellow-700'
        : m > 0 ? 'bg-orange-100 text-orange-700'
        : 'bg-red-100 text-red-700'
      }`}>{m.toFixed(1)} %</span>
    )
  }

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const all = products as Product[]
  // KPI pracuje nad seskupenými produkty (groupedFiltered není k dispozici tady, ale groupAll ano)
  const groupAll = (() => {
    const groups = new Map<string, Product[]>()
    const noCode: Product[] = []
    for (const p of all) {
      if (p.product_code) {
        if (!groups.has(p.product_code)) groups.set(p.product_code, [])
        groups.get(p.product_code)!.push(p)
      } else { noCode.push(p) }
    }
    const res: Product[] = []
    for (const g of groups.values()) {
      const primary = g.find(p => (p.market || 'CZ') === 'CZ') ?? g[0]
      const mergedPrices: Record<string, { price: number | null; currency: string }> = { ...(primary.prices_by_market ?? {}) }
      const mergedMargins: Record<string, number> = { ...(primary.margin_by_market ?? {}) }
      for (const p of g) {
        if (p.id === primary.id) continue
        for (const [mkt, d] of Object.entries(p.prices_by_market ?? {})) { if (!mergedPrices[mkt]) mergedPrices[mkt] = d }
        for (const [mkt, m] of Object.entries(p.margin_by_market ?? {})) { if (mergedMargins[mkt] == null) mergedMargins[mkt] = m }
      }
      res.push({ ...primary, prices_by_market: mergedPrices, margin_by_market: mergedMargins,
        competitor_urls: g.flatMap(p => p.competitor_urls ?? []) })
    }
    return [...res, ...noCode]
  })()
  const withPrice    = groupAll.filter(p => p.current_price != null || Object.keys(p.prices_by_market ?? {}).length > 0).length
  const noPrice      = groupAll.length - withPrice
  // KPI marže: použij relevantní trh (selectedMarket nebo first available)
  const withMarginArr = groupAll.map(p => getMargin(p, selectedMarket !== 'ALL' ? selectedMarket : undefined)).filter(m => m != null) as number[]
  const avgMargin    = withMarginArr.length ? withMarginArr.reduce((s, m) => s + m, 0) / withMarginArr.length : null
  const lowMargin    = withMarginArr.filter(m => m < 10).length
  const noComp       = groupAll.filter(p => !p.competitor_urls || p.competitor_urls.length === 0).length

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sledované produkty</h1>
          <p className="text-sm text-gray-400 mt-0.5">Produkty s aktuálními cenami a doporučeními.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshAll}
            disabled={refreshingAll}
            title="Aktualizuje ceny konkurentů + vlastní ceny na nuties.cz/sk pro všechny produkty"
            className="flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-60 disabled:cursor-wait">
            <RefreshCw size={14} className={refreshingAll ? 'animate-spin' : ''} />
            {refreshingAll ? 'Aktualizuji…' : 'Aktualizovat vše'}
          </button>
          <button
            onClick={() => handleBulkLink()}
            disabled={linkLoading}
            title="Automaticky propojí všechny nepropojené produkty s Katalogem dle EAN / PRODUCTNO / SKU / jména"
            className="flex items-center gap-1.5 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-60">
            {linkLoading
              ? <><RefreshCw size={14} className="animate-spin" /> Propojuji…</>
              : <><Link2 size={14} /> Propojit s katalogem</>}
          </button>
          <button onClick={() => navigate('/catalog')}
            className="flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-sm transition">
            <Plus size={14} /> Přidat
          </button>
          <button onClick={() => navigate('/import')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition">
            <Upload size={14} /> Import
          </button>
        </div>
      </div>

      {/* ── LINK RESULT TOAST ─────────────────────────────────────────── */}
      {linkResult && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-sm font-semibold text-gray-800">Výsledek propojení</span>
            </div>
            <button onClick={() => setLinkResult(null)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center bg-green-50 rounded-lg p-3 border border-green-100">
              <p className="text-2xl font-bold text-green-700">{linkResult.linked}</p>
              <p className="text-xs text-green-600 mt-0.5">Nově propojeno</p>
            </div>
            <div className="text-center bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-2xl font-bold text-gray-600">{linkResult.already_linked}</p>
              <p className="text-xs text-gray-500 mt-0.5">Již propojeno</p>
            </div>
            <div className={`text-center rounded-lg p-3 border ${linkResult.not_found > 0 ? 'bg-yellow-50 border-yellow-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-2xl font-bold ${linkResult.not_found > 0 ? 'text-yellow-700' : 'text-gray-400'}`}>{linkResult.not_found}</p>
              <p className={`text-xs mt-0.5 ${linkResult.not_found > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>Nenalezeno v katalogu</p>
            </div>
          </div>
          {linkResult.details.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Propojené produkty:</p>
              {linkResult.details.map(d => {
                const reason = d.match_reason.startsWith('name_jaccard')
                  ? `jméno ${d.match_reason.replace('name_jaccard_', '')}` : d.match_reason
                return (
                  <div key={d.id} className="flex items-center gap-2 text-xs">
                    <CheckCircle size={11} className="text-green-500 flex-shrink-0" />
                    <span className="text-gray-700 truncate flex-1">{d.name}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-600 truncate flex-1">{d.catalog_name}</span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded flex-shrink-0">{reason}</span>
                  </div>
                )
              })}
            </div>
          )}
          {linkResult.not_found_list.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              <p className="text-xs font-medium text-yellow-600 uppercase tracking-wide">Nenalezeno (doplňte ručně nebo importujte z XML feedu):</p>
              {linkResult.not_found_list.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-xs">
                  <AlertCircle size={11} className="text-yellow-500 flex-shrink-0" />
                  <span className="text-gray-600 truncate">{d.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      {groupAll.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Celkem</p>
            <p className="text-2xl font-bold text-gray-900">{groupAll.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">{withPrice} s cenou · {noPrice} bez ceny</p>
          </div>
          <div className={`border border-gray-200 rounded-xl p-4 ${avgMargin != null && avgMargin < 10 ? 'bg-red-50' : avgMargin != null && avgMargin < 20 ? 'bg-yellow-50' : 'bg-white'}`}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Prům. marže</p>
            {avgMargin != null ? (
              <><p className={`text-2xl font-bold ${avgMargin >= 20 ? 'text-green-700' : avgMargin >= 10 ? 'text-yellow-700' : 'text-red-600'}`}>{avgMargin.toFixed(1)} %</p>
              <p className="text-xs text-gray-400 mt-0.5">{lowMargin} pod 10 %</p></>
            ) : <p className="text-2xl font-bold text-gray-300">—</p>}
          </div>
          <div className={`border border-gray-200 rounded-xl p-4 ${lowMargin > 0 ? 'bg-red-50' : 'bg-white'}`}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Nízká marže</p>
            <p className={`text-2xl font-bold ${lowMargin > 0 ? 'text-red-600' : 'text-green-700'}`}>{lowMargin}</p>
            <p className="text-xs text-gray-400 mt-0.5">produktů pod 10 %</p>
          </div>
          <div className={`border border-gray-200 rounded-xl p-4 ${noComp > 0 ? 'bg-orange-50' : 'bg-white'}`}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Bez konkurence</p>
            <p className={`text-2xl font-bold ${noComp > 0 ? 'text-orange-600' : 'text-green-700'}`}>{noComp}</p>
            <p className="text-xs text-gray-400 mt-0.5">produktů bez URL</p>
          </div>
        </div>
      )}

      {/* ── SEARCH + FILTER ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Hledat název, SKU, PRODUCTNO..."
            className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {(['ALL', 'CZ', 'SK'] as const).map(m => (
            <button key={m} onClick={() => useMarketStore.setState({ selectedMarket: m })}
              className={`px-3 py-1 rounded text-sm font-medium transition ${selectedMarket === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {m === 'ALL' ? 'Vše' : m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
            </button>
          ))}
        </div>
        {groupedFiltered.length !== groupAll.length && (
          <span className="text-xs text-gray-400">{groupedFiltered.length} z {groupAll.length}</span>
        )}
      </div>

      {/* ── TABLE ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Načítám produkty...</div>
      ) : groupedFiltered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package size={44} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium mb-1">
            {groupAll.length === 0 ? 'Zatím žádné sledované produkty' : 'Žádné výsledky hledání'}
          </p>
          <p className="text-sm text-gray-400 mb-5">
            {groupAll.length === 0 ? 'Přidejte produkty z katalogu nebo je importujte.' : 'Zkuste jiný výraz.'}
          </p>
          {groupAll.length === 0 && (
            <button onClick={() => navigate('/catalog')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Vybrat z katalogu
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <div className="w-8 flex-shrink-0">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-300" />
            </div>
            <div className="flex-1">Produkt</div>
            {viewMode === 'tabs' ? (
              <>
                <div className="w-28 text-right">Cena</div>
                <div className="w-24 text-right">Skladem</div>
                <div className="w-32 text-right">Konkurence</div>
                <div className="w-24 text-right">Marže</div>
              </>
            ) : (
              <>
                <div className="w-24 text-right">Sklad</div>
                <div className="w-28 text-right">🇨🇿 CZ</div>
                <div className="w-20 text-right text-green-600">Marže</div>
                <div className="w-28 text-right">🇸🇰 SK</div>
                <div className="w-20 text-right text-blue-600">Marže</div>
              </>
            )}
            <div className="w-28 text-right">Hero</div>
            <div className="w-20 text-right">Akce</div>
          </div>

          <div className="divide-y divide-gray-50">
            {groupedFiltered.map(product => {
              const isSelected = selectedIds.has(product.id)
              const isConfirmDelete = confirmDeleteId === product.id
              const cp = product.current_price != null ? Number(product.current_price) : null
              const cur = product.currency ?? (product.market === 'SK' ? 'EUR' : product.market === 'HU' ? 'HUF' : 'CZK')
              const fmtPrice = (v: number) => v.toLocaleString(cur === 'EUR' ? 'sk-SK' : cur === 'HUF' ? 'hu-HU' : 'cs-CZ', {
                minimumFractionDigits: cur === 'CZK' ? 0 : 2, maximumFractionDigits: cur === 'CZK' ? 0 : 2
              })
              const score = product.hero_score ?? 0
              const lowestComp = product.lowest_competitor_price != null ? Number(product.lowest_competitor_price) : null
              const isPriceAlert = cp != null && lowestComp != null && lowestComp < cp

              return (
                <div key={product.id}>
                  <div
                    className={`flex items-center px-4 py-3.5 transition cursor-pointer border-l-2 ${
                      isSelected ? 'bg-blue-50 border-l-blue-400'
                      : isPriceAlert ? 'bg-red-50 border-l-red-400 hover:bg-red-100'
                      : 'border-l-transparent hover:bg-gray-50'
                    }`}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest('input,button,a')) return
                      navigate(`/products/${product.id}`)
                    }}
                  >
                    {/* Checkbox */}
                    <div className="w-8 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleOne(product.id)} className="rounded border-gray-300" />
                    </div>

                    {/* Product */}
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      {product.thumbnail_url ? (
                        <img src={product.thumbnail_url} alt="" className="w-9 h-9 object-contain rounded bg-gray-50 border flex-shrink-0"
                          onError={e => { e.currentTarget.style.display = 'none' }} />
                      ) : (
                        <div className="w-9 h-9 bg-blue-50 rounded border flex items-center justify-center flex-shrink-0">
                          <Package size={15} className="text-blue-300" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                          <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">{product.sku}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {product.product_code && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">#{product.product_code}</span>}
                          {product.manufacturer && <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{product.manufacturer}</span>}
                          {(product as any)._markets?.length > 1 && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              {(product as any)._markets.join(' + ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {viewMode === 'tabs' ? (
                      <>
                    {/* Price */}
                    <div className="w-28 text-right flex-shrink-0">
                      {cp != null ? (
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{fmtPrice(cp)} {cur}</span>
                          {product.old_price != null && Number(product.old_price) !== cp && (
                            <p className="text-xs text-gray-400 line-through">{fmtPrice(Number(product.old_price))}</p>
                          )}
                        </div>
                      ) : product.catalog_price_vat != null ? (
                        <div>
                          <span className="text-sm font-medium text-gray-500">{fmtPrice(Number(product.catalog_price_vat))} {cur}</span>
                          <p className="text-xs text-indigo-400">katalog</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 bg-gray-50 px-2 py-0.5 rounded">—</span>
                      )}
                    </div>

                    {/* Skladem */}
                    <div className="w-24 text-right flex-shrink-0">
                      {(() => {
                        const rawQty = product.stock_quantity ?? product.catalog_quantity_in_stock
                        const divisor = (product.stock_divisor ?? 1) >= 1 ? (product.stock_divisor ?? 1) : 1
                        const qty = rawQty != null ? Math.floor(rawQty / divisor) : null
                        const fromBl = product.stock_quantity != null
                        if (qty == null) return <span className="text-xs text-gray-300">—</span>
                        return (
                          <div>
                            <span className={`text-sm font-semibold ${qty > 10 ? 'text-green-700' : qty > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {qty} ks
                            </span>
                            {divisor > 1 && <p className="text-xs text-blue-400">÷{divisor}</p>}
                            {!fromBl && divisor === 1 && <p className="text-xs text-gray-400">katalog</p>}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Competitors */}
                    <div className="w-36 flex-shrink-0 text-right">
                      {lowestComp != null ? (
                        <div>
                          <span className={`text-sm font-semibold ${isPriceAlert ? 'text-red-600' : 'text-gray-700'}`}>
                            {fmtPrice(lowestComp)} {cur}
                          </span>
                          {isPriceAlert && cp != null ? (
                            <p className="text-xs text-red-500 font-medium">▲ +{fmtPrice(cp - lowestComp)} {cur}</p>
                          ) : (
                            <p className="text-xs text-gray-400">{product.competitor_urls?.length ?? 0} URL</p>
                          )}
                        </div>
                      ) : product.competitor_urls && product.competitor_urls.length > 0 ? (
                        <span className="text-xs text-gray-400">{product.competitor_urls.length} URL</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>

                    {/* Margin (tabs mode — trh z filtru) */}
                    <div className="w-24 text-right flex-shrink-0">
                      {marginBadge(getMargin(product, selectedMarket !== 'ALL' ? selectedMarket : (product.market ?? undefined)))}
                    </div>
                      </>
                    ) : (
                      <>
                    {/* Sklad (multi mode) */}
                    <div className="w-24 text-right flex-shrink-0">
                      {(() => {
                        const rawQty = product.stock_quantity ?? product.catalog_quantity_in_stock
                        const divisor = (product.stock_divisor ?? 1) >= 1 ? (product.stock_divisor ?? 1) : 1
                        const qty = rawQty != null ? Math.floor(rawQty / divisor) : null
                        if (qty == null) return <span className="text-xs text-gray-300">—</span>
                        return (
                          <span className={`text-sm font-semibold ${qty > 10 ? 'text-green-700' : qty > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {qty} ks
                          </span>
                        )
                      })()}
                    </div>
                    {/* CZ price + CZ margin (multi mode) */}
                    <div className="w-28 text-right flex-shrink-0">
                      {(() => {
                        const czData = product.prices_by_market?.['CZ']
                        if (!czData) return <span className="text-xs text-gray-300">—</span>
                        return (
                          <span className="text-sm font-semibold text-gray-800">
                            {czData.price != null ? `${czData.price.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč` : '—'}
                          </span>
                        )
                      })()}
                    </div>
                    <div className="w-20 text-right flex-shrink-0">
                      {marginBadge(product.margin_by_market?.['CZ'] ?? null)}
                    </div>
                    {/* SK price + SK margin (multi mode) */}
                    <div className="w-28 text-right flex-shrink-0">
                      {(() => {
                        const skData = product.prices_by_market?.['SK']
                        if (!skData) return <span className="text-xs text-gray-300">—</span>
                        return (
                          <span className="text-sm font-semibold text-blue-700">
                            {skData.price != null ? `${skData.price.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'}
                          </span>
                        )
                      })()}
                    </div>
                    <div className="w-20 text-right flex-shrink-0">
                      {marginBadge(product.margin_by_market?.['SK'] ?? null)}
                    </div>
                      </>
                    )}

                    {/* Hero */}
                    <div className="w-28 text-right flex-shrink-0">
                      {product.hero_score != null ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-400' : score >= 40 ? 'bg-orange-400' : 'bg-red-400'}`}
                              style={{ width: `${score}%` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-600 w-6 text-right">{score}</span>
                        </div>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </div>

                    {/* Actions */}
                    <div className="w-20 flex items-center justify-end gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {product.url_reference && (
                        <a href={product.url_reference} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="E-shop">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button onClick={() => setConfirmDeleteId(product.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Odebrat">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Confirm delete */}
                  {isConfirmDelete && (
                    <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-t border-red-100">
                      <div className="flex items-center gap-2 text-sm text-red-700">
                        <AlertCircle size={14} />
                        <span>Odebrat <strong>{product.name}</strong> ze sledování?</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Zrušit</button>
                        <button onClick={() => deleteMutation.mutate(product.id)} disabled={deleteMutation.isPending}
                          className="px-3 py-1 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">
                          {deleteMutation.isPending ? 'Odebírám...' : 'Odebrat'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── BULK BAR ─────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2" style={{ minWidth: 520 }}>

          {/* Competitor panel — shown when bulkPanel is open */}
          {bulkPanel && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-2xl p-4 w-full space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">
                  {bulkPanel === 'competitor' ? '🌐 Přidat URL konkurenta' : '▶ Spustit párování'}
                  <span className="ml-2 text-xs font-normal text-gray-400">pro {selectedIds.size} produktů</span>
                </p>
                <button onClick={() => { setBulkPanel(null); setBulkMsg(null) }} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
              </div>

              {/* Competitor select */}
              <div className="relative">
                <select
                  value={bulkCompetitorId}
                  onChange={e => setBulkCompetitorId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white pr-8"
                >
                  <option value="">— Vyber konkurenta —</option>
                  {(competitors as Competitor[]).map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.url})</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* Listing / product URL */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  {bulkPanel === 'competitor' ? 'URL produktu u konkurenta (nebo homepage)' : 'Listing / kategorie URL pro discovery'}
                </label>
                <input
                  type="url"
                  value={bulkListingUrl}
                  onChange={e => setBulkListingUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Progress / message */}
              {bulkProgress && (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                  <RefreshCw size={13} className="animate-spin flex-shrink-0" />
                  <span>{bulkProgress.action}: {bulkProgress.done}/{bulkProgress.total}…</span>
                </div>
              )}
              {bulkMsg && (
                <div className={`text-sm rounded-lg px-3 py-2 ${bulkMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {bulkMsg.text}
                </div>
              )}

              {/* Action button */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setBulkPanel(null); setBulkMsg(null) }}
                  className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  Zavřít
                </button>
                {bulkPanel === 'competitor' ? (
                  <button
                    onClick={handleBulkAddCompetitor}
                    disabled={!bulkCompetitorId || !!bulkProgress}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                  >
                    <Globe size={13} /> Přidat URL ke {selectedIds.size} produktům
                  </button>
                ) : (
                  <button
                    onClick={handleBulkRunPipeline}
                    disabled={!bulkCompetitorId || !!bulkProgress}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                  >
                    <Play size={13} /> Spustit pro {selectedIds.size} produktů
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main action strip */}
          <div className="bg-gray-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 w-full flex-wrap">
            <span className="text-sm font-medium whitespace-nowrap">{selectedIds.size} produktů vybráno</span>
            <button onClick={() => { setSelectedIds(new Set()); setBulkPanel(null); setBulkMsg(null) }}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
              <X size={12} /> Zrušit
            </button>
            <div className="flex-1" />

            {/* Propojit s katalogem */}
            <button
              onClick={() => { handleBulkLink([...selectedIds]) }}
              disabled={linkLoading}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition">
              {linkLoading ? <RefreshCw size={13} className="animate-spin" /> : <Link2 size={13} />}
              Propojit s katalogem
            </button>

            {/* Přidat konkurenci */}
            <button
              onClick={() => { setBulkPanel(p => p === 'competitor' ? null : 'competitor'); setBulkMsg(null) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                bulkPanel === 'competitor' ? 'bg-blue-500 text-white' : 'bg-blue-700 hover:bg-blue-600 text-white'
              }`}>
              <Globe size={13} /> Přidat konkurenci
            </button>

            {/* Spustit párování */}
            <button
              onClick={() => { setBulkPanel(p => p === 'pipeline' ? null : 'pipeline'); setBulkMsg(null) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                bulkPanel === 'pipeline' ? 'bg-green-500 text-white' : 'bg-green-700 hover:bg-green-600 text-white'
              }`}>
              <Play size={13} /> Spustit párování
            </button>

            {/* Odebrat */}
            <button onClick={() => { selectedIds.forEach(id => deleteMutation.mutate(id)); setSelectedIds(new Set()); setBulkPanel(null) }}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition">
              <Trash2 size={13} /> Odebrat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
