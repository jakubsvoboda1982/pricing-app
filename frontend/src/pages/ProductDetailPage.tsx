import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ExternalLink, Plus, Trash2, Edit2, Save, X, Package,
  TrendingUp, Link2, ShoppingCart, Factory, RefreshCw, Clock,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle, BarChart2,
} from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

// ── Interfaces ─────────────────────────────────────────────────────────────

interface CompetitorUrl { url: string; name: string; market: string }

interface Product {
  id: string; name: string; sku: string; product_code?: string | null
  category?: string; ean?: string; thumbnail_url?: string; url_reference?: string
  competitor_urls?: CompetitorUrl[]; current_price?: number | null
  old_price?: number | null; market?: string
  purchase_price_without_vat?: number | null; purchase_vat_rate?: number | null
  purchase_price_with_vat?: number | null; manufacturing_cost?: number | null
  manufacturing_cost_with_vat?: number | null; min_price?: number | null
  margin?: number | null; hero_score?: number | null
  lowest_competitor_price?: number | null; stock_quantity?: number | null
  created_at: string
}

interface PriceRecord {
  id: string; market: string; currency: string
  current_price: number; old_price?: number | null; changed_at: string
}

interface CompetitorPriceRecord {
  id: string; competitor_url: string; price: number | null
  currency: string; market: string; last_fetched_at: string | null
  fetch_status: string | null; fetch_error: string | null
}

interface PriceHistoryEntry { price: number; recorded_at: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function authHeaders() {
  return { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
}
function getDomain(url: string) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}
function fmt(val: number | null | undefined, decimals = 2): string {
  if (val == null) return '—'
  return val.toLocaleString('cs-CZ', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MiniGauge({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 0), 100)
  const color = pct >= 80 ? '#16a34a' : pct >= 60 ? '#ca8a04' : pct >= 40 ? '#ea580c' : '#dc2626'
  const label = pct >= 80 ? 'Výborné' : pct >= 60 ? 'Dobré' : pct >= 40 ? 'Průměrné' : 'Slabé'
  const r = 28; const cx = 36; const cy = 36
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const arcX = (a: number) => cx + r * Math.cos(toRad(a))
  const arcY = (a: number) => cy + r * Math.sin(toRad(a))
  const trackPath = `M ${arcX(-180)} ${arcY(-180)} A ${r} ${r} 0 0 1 ${arcX(0)} ${arcY(0)}`
  const endAngle = -180 + (pct / 100) * 180
  const fillPath = pct > 0 ? `M ${arcX(-180)} ${arcY(-180)} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${arcX(endAngle)} ${arcY(endAngle)}` : ''
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 72 44" className="w-20 h-12">
        <path d={trackPath} fill="none" stroke="#e5e7eb" strokeWidth="7" strokeLinecap="round" />
        {fillPath && <path d={fillPath} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" />}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>{pct}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize="7" fill="#9ca3af">/ 100</text>
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  )
}

function ScoreRow({ label, pts, max }: { label: string; pts: number; max: number }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">{label}</span>
      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full" style={{
          width: `${(pts / max) * 100}%`,
          backgroundColor: pts >= max ? '#16a34a' : pts > 0 ? '#ca8a04' : '#e5e7eb'
        }} />
      </div>
      <span className={`text-xs font-semibold w-9 text-right flex-shrink-0 ${pts >= max ? 'text-green-600' : pts > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>
        {pts}/{max}
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showPriceForm, setShowPriceForm] = useState(false)
  const [priceForm, setPriceForm] = useState({ current_price: '', old_price: '', market: 'CZ' })
  const [showPricingForm, setShowPricingForm] = useState<'purchase' | 'manufacturing' | null>(null)
  const [pricingForm, setPricingForm] = useState({ purchase_price_without_vat: '', purchase_vat_rate: '', manufacturing_cost: '' })
  const [showAddUrl, setShowAddUrl] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newUrlMarket, setNewUrlMarket] = useState<'CZ' | 'SK'>('CZ')
  const [addingUrl, setAddingUrl] = useState(false)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [manualPriceInput, setManualPriceInput] = useState('')
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [historyData, setHistoryData] = useState<Record<string, PriceHistoryEntry[]>>({})

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/products/${id}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Chyba')
      return await res.json() as Product
    },
  })

  const { data: prices = [] } = useQuery({
    queryKey: ['product-prices', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/products/${id}/prices`, { headers: authHeaders() })
      if (!res.ok) return []
      return await res.json() as PriceRecord[]
    },
  })

  const { data: competitorPrices = [], refetch: refetchCompetitorPrices } = useQuery({
    queryKey: ['competitor-prices', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/competitor-prices/${id}`, { headers: authHeaders() })
      if (!res.ok) return []
      return await res.json() as CompetitorPriceRecord[]
    },
    enabled: !!id,
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const setPriceMutation = useMutation({
    mutationFn: async (data: { current_price: number; old_price?: number; market: string }) => {
      const res = await fetch(`${API_BASE_URL}/products/${id}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Chyba při ukládání ceny')
      return await res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['product-prices', id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowPriceForm(false)
      setPriceForm({ current_price: '', old_price: '', market: 'CZ' })
    },
  })

  const setPricingMutation = useMutation({
    mutationFn: async (data: {
      purchase_price_without_vat?: number; purchase_vat_rate?: number
      manufacturing_cost?: number; min_price?: number
      clear_purchase_price?: boolean; clear_manufacturing_cost?: boolean
    }) => {
      const res = await fetch(`${API_BASE_URL}/products/${id}/pricing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Chyba při ukládání')
      return await res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowPricingForm(null)
    },
  })

  const removeUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(`${API_BASE_URL}/products/${id}/competitor-urls?url=${encodeURIComponent(url)}`, {
        method: 'DELETE', headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Chyba')
      return await res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product', id] }),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAddUrl = async () => {
    if (!newUrl.trim()) return
    setAddingUrl(true)
    try {
      const res = await fetch(`${API_BASE_URL}/products/${id}/competitor-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ url: newUrl, market: newUrlMarket }),
      })
      if (!res.ok) throw new Error('Chyba')
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['competitor-prices', id] })
      setNewUrl(''); setShowAddUrl(false)
      setTimeout(() => refetchCompetitorPrices(), 2000)
    } catch { /* ignore */ } finally { setAddingUrl(false) }
  }

  const handleSetPrice = () => {
    const cp = parseFloat(priceForm.current_price.replace(',', '.'))
    if (isNaN(cp)) return
    const op = priceForm.old_price ? parseFloat(priceForm.old_price.replace(',', '.')) : undefined
    setPriceMutation.mutate({ current_price: cp, old_price: op, market: priceForm.market })
  }

  const handleSetPricing = () => {
    const pvr = pricingForm.purchase_vat_rate ? parseFloat(pricingForm.purchase_vat_rate.replace(',', '.')) : purchaseVatRate
    if (showPricingForm === 'purchase') {
      const cost = parseFloat(pricingForm.purchase_price_without_vat.replace(',', '.'))
      if (isNaN(cost) || cost <= 0) return
      setPricingMutation.mutate({ purchase_price_without_vat: cost, purchase_vat_rate: pvr, min_price: cost * (1 + pvr / 100) })
    } else if (showPricingForm === 'manufacturing') {
      const cost = parseFloat(pricingForm.manufacturing_cost.replace(',', '.'))
      if (isNaN(cost) || cost <= 0) return
      setPricingMutation.mutate({ manufacturing_cost: cost, purchase_vat_rate: pvr, min_price: cost * (1 + pvr / 100) })
    }
  }

  const handleRefreshUrl = async (url: string) => {
    await fetch(`${API_BASE_URL}/competitor-prices/${id}/refresh-url?url=${encodeURIComponent(url)}`, {
      method: 'POST', headers: authHeaders(),
    })
    refetchCompetitorPrices()
    queryClient.invalidateQueries({ queryKey: ['product', id] })
  }

  const handleRefreshAll = async () => {
    await fetch(`${API_BASE_URL}/competitor-prices/${id}/refresh`, {
      method: 'POST', headers: authHeaders(),
    })
    refetchCompetitorPrices()
    queryClient.invalidateQueries({ queryKey: ['product', id] })
  }

  const handleSaveManualPrice = async (compPriceId: string) => {
    const price = parseFloat(manualPriceInput.replace(',', '.'))
    if (isNaN(price) || price <= 0) return
    await fetch(`${API_BASE_URL}/competitor-prices/by-url/${compPriceId}/manual`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ price }),
    })
    setEditingPriceId(null); setManualPriceInput('')
    refetchCompetitorPrices()
    queryClient.invalidateQueries({ queryKey: ['product', id] })
  }

  const handleToggleHistory = async (compPriceId: string) => {
    if (expandedHistoryId === compPriceId) { setExpandedHistoryId(null); return }
    setExpandedHistoryId(compPriceId)
    if (!historyData[compPriceId]) {
      const res = await fetch(`${API_BASE_URL}/competitor-prices/by-url/${compPriceId}/history`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setHistoryData(prev => ({ ...prev, [compPriceId]: data }))
      }
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading || !product) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Načítám produkt...</p>
      </div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const currentPrice       = product.current_price != null ? Number(product.current_price) : null
  const purchasePriceWithoutVat = product.purchase_price_without_vat != null ? Number(product.purchase_price_without_vat) : null
  const purchasePriceWithVat    = product.purchase_price_with_vat != null ? Number(product.purchase_price_with_vat) : null
  const manufacturingCost       = product.manufacturing_cost != null ? Number(product.manufacturing_cost) : null
  const manufacturingCostWithVat = product.manufacturing_cost_with_vat != null ? Number(product.manufacturing_cost_with_vat) : null
  const purchaseVatRate  = product.purchase_vat_rate != null ? Number(product.purchase_vat_rate) : 12
  const minPrice         = product.min_price != null ? Number(product.min_price) : null
  const lowestComp       = product.lowest_competitor_price != null ? Number(product.lowest_competitor_price) : null
  const margin           = product.margin != null ? Number(product.margin) : null
  const heroScore        = product.hero_score ?? 0
  const competitorUrls   = product.competitor_urls || []
  const latestPrices     = (prices as PriceRecord[]).slice(0, 10)

  // Hero score breakdown
  const priceSet      = currentPrice != null ? 25 : 0
  const hasCost       = (purchasePriceWithoutVat != null && purchasePriceWithoutVat > 0) || (manufacturingCost != null && manufacturingCost > 0)
  const purchaseSet   = hasCost ? 15 : 0
  const competitorSet = competitorUrls.length >= 1 ? 15 : 0
  const minSet        = minPrice != null ? 10 : 0
  const marginPts     = Math.max(heroScore - priceSet - purchaseSet - competitorSet - minSet, 0)

  // Margin color
  const marginColor = margin == null ? 'text-gray-400'
    : margin >= 20 ? 'text-green-700' : margin >= 10 ? 'text-yellow-700' : margin > 0 ? 'text-orange-600' : 'text-red-600'
  const marginBg = margin == null ? 'bg-gray-50'
    : margin >= 20 ? 'bg-green-50' : margin >= 10 ? 'bg-yellow-50' : margin > 0 ? 'bg-orange-50' : 'bg-red-50'

  // Price vs competitor comparison
  const priceDiff = currentPrice != null && lowestComp != null ? currentPrice - lowestComp : null
  const priceVsComp = priceDiff == null ? null : priceDiff <= 0 ? 'cheaper' : 'expensive'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── BREADCRUMB ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/products')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft size={15} />
          <span>Produkty</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium truncate max-w-xs">{product.name}</span>
        </button>
        {product.url_reference && (
          <a href={product.url_reference} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition bg-white">
            <ExternalLink size={13} /> Na e-shopu
          </a>
        )}
      </div>

      {/* ── PRODUCT HEADER ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4">
        {product.thumbnail_url ? (
          <img src={product.thumbnail_url} alt={product.name}
            className="w-14 h-14 object-contain rounded-lg bg-gray-50 border flex-shrink-0"
            onError={(e) => { e.currentTarget.style.display = 'none' }} />
        ) : (
          <div className="w-14 h-14 bg-blue-50 rounded-lg border flex items-center justify-center flex-shrink-0">
            <Package size={24} className="text-blue-300" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{product.name}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">SKU: {product.sku}</span>
            {product.product_code && (
              <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">PRODUCTNO: {product.product_code}</span>
            )}
            {product.ean && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">EAN: {product.ean}</span>
            )}
            {product.category && (
              <span className="text-xs text-gray-400">· {product.category}</span>
            )}
            {product.market && (
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                {product.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

        {/* Aktuální cena */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Aktuální cena</p>
          {currentPrice != null ? (
            <>
              <p className="text-2xl font-bold text-blue-700 leading-none">{currentPrice.toLocaleString('cs-CZ')}</p>
              <p className="text-sm text-gray-400 mt-0.5">CZK</p>
              {product.old_price != null && (
                <p className="text-xs text-gray-400 line-through mt-1">
                  {Number(product.old_price).toLocaleString('cs-CZ')} CZK
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-1">Nenastaveno</p>
          )}
          <button
            onClick={() => { setShowPriceForm(!showPriceForm); setShowPricingForm(null) }}
            className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-0.5">
            <Edit2 size={10} /> Upravit
          </button>
        </div>

        {/* Marže */}
        <div className={`border border-gray-200 rounded-xl p-4 ${marginBg}`}>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Marže</p>
          {margin != null ? (
            <>
              <p className={`text-2xl font-bold leading-none ${marginColor}`}>{fmt(margin, 1)}</p>
              <p className={`text-sm mt-0.5 ${marginColor}`}>%</p>
              <p className="text-xs text-gray-400 mt-1">
                {margin >= 20 ? 'Zdravá marže' : margin >= 10 ? 'Nízká marže' : margin > 0 ? 'Kritická marže' : 'Záporná marže'}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-1">Nastav nákupní cenu</p>
          )}
        </div>

        {/* Nejnižší konkurent */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Nejnižší konkurent</p>
          {lowestComp != null ? (
            <>
              <p className="text-2xl font-bold text-gray-900 leading-none">{lowestComp.toLocaleString('cs-CZ')}</p>
              <p className="text-sm text-gray-400 mt-0.5">CZK</p>
              {priceDiff != null && (
                <p className={`text-xs mt-1 font-medium ${priceVsComp === 'cheaper' ? 'text-green-600' : 'text-orange-600'}`}>
                  {priceVsComp === 'cheaper' ? '✓ Jsi nejlevnější' : `+${priceDiff.toLocaleString('cs-CZ')} CZK nad min.`}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-1">
              {competitorUrls.length === 0 ? 'Přidej konkurenty' : 'Načítám...'}
            </p>
          )}
        </div>

        {/* Skladem */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Skladem</p>
          {product.stock_quantity != null ? (
            <>
              <p className={`text-2xl font-bold leading-none ${
                product.stock_quantity > 10 ? 'text-green-700'
                : product.stock_quantity > 0 ? 'text-yellow-600' : 'text-red-600'
              }`}>{product.stock_quantity}</p>
              <p className="text-sm text-gray-400 mt-0.5">ks</p>
              <p className="text-xs text-gray-400 mt-1">
                {product.stock_quantity > 10 ? 'Dostatek' : product.stock_quantity > 0 ? 'Docházející' : 'Vyprodáno'}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-1">Nepropojeno</p>
          )}
        </div>

        {/* Hero skóre */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1 self-start w-full">Hero skóre</p>
          <MiniGauge score={heroScore} />
        </div>
      </div>

      {/* ── PRICE EDIT FORM (inline, full-width) ───────────────────────── */}
      {showPriceForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Nastavit prodejní cenu</p>
            <button onClick={() => setShowPriceForm(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-600 font-medium">Aktuální cena *</label>
              <input type="text" value={priceForm.current_price}
                onChange={(e) => setPriceForm(p => ({ ...p, current_price: e.target.value }))}
                placeholder="299.00" autoFocus
                className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium">Přeškrtnutá cena</label>
              <input type="text" value={priceForm.old_price}
                onChange={(e) => setPriceForm(p => ({ ...p, old_price: e.target.value }))}
                placeholder="349.00"
                className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium">Trh</label>
              <div className="mt-1 flex gap-1">
                {(['CZ', 'SK'] as const).map(m => (
                  <button key={m} onClick={() => setPriceForm(p => ({ ...p, market: m }))}
                    className={`flex-1 py-1.5 rounded text-xs font-medium border transition ${priceForm.market === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                    {m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <button onClick={handleSetPrice} disabled={setPriceMutation.isPending}
                className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition">
                <Save size={13} />{setPriceMutation.isPending ? 'Ukládám...' : 'Uložit cenu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN GRID: Cenotvorba + Konkurenti ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* LEFT: Cenotvorba */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp size={15} className="text-blue-500" /> Cenotvorba
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPricingForm(showPricingForm === 'purchase' ? null : 'purchase'); setShowPriceForm(false); setPricingForm(p => ({ ...p, purchase_price_without_vat: purchasePriceWithoutVat ? String(purchasePriceWithoutVat) : '' })) }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition ${showPricingForm === 'purchase' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                <ShoppingCart size={12} /> Nákupní cena
              </button>
              <button
                onClick={() => { setShowPricingForm(showPricingForm === 'manufacturing' ? null : 'manufacturing'); setShowPriceForm(false); setPricingForm(p => ({ ...p, manufacturing_cost: manufacturingCost ? String(manufacturingCost) : '' })) }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition ${showPricingForm === 'manufacturing' ? 'bg-orange-500 text-white border-orange-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                <Factory size={12} /> Výrobní cena
              </button>
            </div>
          </div>

          <div className="p-5 space-y-0">

            {/* Inline edit: Nákupní cena */}
            {showPricingForm === 'purchase' && (
              <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
                <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5"><ShoppingCart size={13} /> Nákupní cena bez DPH</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Cena bez DPH *</label>
                    <input type="text" value={pricingForm.purchase_price_without_vat}
                      onChange={(e) => setPricingForm(p => ({ ...p, purchase_price_without_vat: e.target.value }))}
                      placeholder="200.00" autoFocus
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Sazba DPH (%)</label>
                    <input type="text" value={pricingForm.purchase_vat_rate}
                      onChange={(e) => setPricingForm(p => ({ ...p, purchase_vat_rate: e.target.value }))}
                      placeholder={String(purchaseVatRate)}
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Min. cena s DPH</label>
                    <div className="mt-1 w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700">
                      {(() => {
                        const c = parseFloat(pricingForm.purchase_price_without_vat.replace(',', '.'))
                        const v = parseFloat(pricingForm.purchase_vat_rate.replace(',', '.') || String(purchaseVatRate))
                        return !isNaN(c) && c > 0 ? fmt(c * (1 + v / 100)) : '—'
                      })()}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">CZ potraviny 12 %, ostatní položky 21 %</p>
                <div className="flex gap-2">
                  <button onClick={handleSetPricing} disabled={setPricingMutation.isPending}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
                    <Save size={12} />{setPricingMutation.isPending ? 'Ukládám...' : 'Uložit'}
                  </button>
                  <button onClick={() => setShowPricingForm(null)} className="text-gray-500 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-100">Zrušit</button>
                </div>
              </div>
            )}

            {/* Inline edit: Výrobní cena */}
            {showPricingForm === 'manufacturing' && (
              <div className="mb-4 p-4 bg-orange-50 rounded-xl border border-orange-100 space-y-3">
                <p className="text-sm font-semibold text-orange-900 flex items-center gap-1.5"><Factory size={13} /> Výrobní cena bez DPH</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Cena bez DPH *</label>
                    <input type="text" value={pricingForm.manufacturing_cost}
                      onChange={(e) => setPricingForm(p => ({ ...p, manufacturing_cost: e.target.value }))}
                      placeholder="150.00" autoFocus
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Sazba DPH (%)</label>
                    <input type="text" value={pricingForm.purchase_vat_rate}
                      onChange={(e) => setPricingForm(p => ({ ...p, purchase_vat_rate: e.target.value }))}
                      placeholder={String(purchaseVatRate)}
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Min. cena s DPH</label>
                    <div className="mt-1 w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700">
                      {(() => {
                        const c = parseFloat(pricingForm.manufacturing_cost.replace(',', '.'))
                        const v = parseFloat(pricingForm.purchase_vat_rate.replace(',', '.') || String(purchaseVatRate))
                        return !isNaN(c) && c > 0 ? fmt(c * (1 + v / 100)) : '—'
                      })()}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">CZ potraviny 12 %, ostatní položky 21 %</p>
                <div className="flex gap-2">
                  <button onClick={handleSetPricing} disabled={setPricingMutation.isPending}
                    className="flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
                    <Save size={12} />{setPricingMutation.isPending ? 'Ukládám...' : 'Uložit'}
                  </button>
                  <button onClick={() => setShowPricingForm(null)} className="text-gray-500 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-100">Zrušit</button>
                </div>
              </div>
            )}

            {/* Pricing rows */}
            {[
              {
                icon: <ShoppingCart size={13} className="text-gray-400" />,
                label: 'Nákupní cena (bez DPH)',
                value: purchasePriceWithoutVat,
                valueStr: purchasePriceWithoutVat != null ? `${fmt(purchasePriceWithoutVat)} CZK` : null,
                sub: purchasePriceWithVat != null ? `DPH ${fmt(purchaseVatRate, 0)} % → ${fmt(purchasePriceWithVat)} CZK` : null,
                onClear: () => setPricingMutation.mutate({ clear_purchase_price: true }),
              },
              {
                icon: <Factory size={13} className="text-gray-400" />,
                label: 'Výrobní cena (bez DPH)',
                value: manufacturingCost,
                valueStr: manufacturingCost != null ? `${fmt(manufacturingCost)} CZK` : null,
                sub: manufacturingCostWithVat != null ? `DPH ${fmt(purchaseVatRate, 0)} % → ${fmt(manufacturingCostWithVat)} CZK` : null,
                onClear: () => setPricingMutation.mutate({ clear_manufacturing_cost: true }),
              },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50 group">
                <span className="text-sm text-gray-500 flex items-center gap-1.5">{row.icon}{row.label}</span>
                <div className="flex items-center gap-2">
                  {row.valueStr ? (
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-800">{row.valueStr}</span>
                      {row.sub && <p className="text-xs text-gray-400">{row.sub}</p>}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Nenastaveno</span>
                  )}
                  {row.value != null && (
                    <button onClick={row.onClear} disabled={setPricingMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between py-3 border-b border-gray-50">
              <span className="text-sm text-gray-500">Minimální cena s DPH</span>
              {minPrice != null
                ? <span className="text-sm font-semibold text-gray-800">{fmt(minPrice)} CZK</span>
                : <span className="text-xs text-gray-400 italic">Nenastaveno</span>}
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Trh</span>
              <span className="text-sm font-medium text-gray-700">{product.market || 'CZ'}</span>
            </div>
          </div>

          {/* Hero Score breakdown */}
          <div className="border-t border-gray-100 px-5 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <BarChart2 size={12} /> Složení hero skóre
            </p>
            <div className="space-y-0">
              <ScoreRow label="Aktuální cena nastavena" pts={priceSet} max={25} />
              <ScoreRow label="Nákupní / výrobní cena" pts={purchaseSet} max={15} />
              <ScoreRow label="Kvalita marže" pts={marginPts} max={35} />
              <ScoreRow label="Minimální cena" pts={minSet} max={10} />
              <ScoreRow label="Sleduje konkurenty" pts={competitorSet} max={15} />
            </div>
            {heroScore < 60 && (
              <div className="mt-3 flex items-start gap-1.5 p-2.5 bg-orange-50 rounded-lg text-xs text-orange-700">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>
                  {!currentPrice && 'Nastav prodejní cenu. '}
                  {!hasCost && 'Nastav nákupní nebo výrobní cenu. '}
                  {competitorUrls.length === 0 && 'Přidej URL konkurentů.'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Ceny konkurentů */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Link2 size={15} className="text-green-500" /> Ceny konkurentů
              {competitorUrls.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{competitorUrls.length}</span>
              )}
            </h2>
            <div className="flex gap-2">
              {competitorUrls.length > 0 && (
                <button onClick={handleRefreshAll}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg border border-gray-200 transition">
                  <RefreshCw size={12} /> Aktualizovat vše
                </button>
              )}
              <button onClick={() => setShowAddUrl(!showAddUrl)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition">
                <Plus size={13} /> Přidat URL
              </button>
            </div>
          </div>

          {/* Add URL form */}
          {showAddUrl && (
            <div className="mx-5 mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
              <div className="flex gap-1">
                {(['CZ', 'SK'] as const).map(m => (
                  <button key={m} onClick={() => setNewUrlMarket(m)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${newUrlMarket === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                    {m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                  </button>
                ))}
              </div>
              <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                placeholder="https://grizly.cz/produkt/..." autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <button onClick={handleAddUrl} disabled={addingUrl || !newUrl.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition">
                  {addingUrl ? 'Přidávám...' : 'Přidat a načíst cenu'}
                </button>
                <button onClick={() => { setShowAddUrl(false); setNewUrl('') }}
                  className="text-gray-500 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-100">Zrušit</button>
              </div>
            </div>
          )}

          {/* Lowest price banner */}
          {lowestComp != null && currentPrice != null && (
            <div className={`mx-5 mt-4 px-4 py-3 rounded-xl border flex items-center justify-between text-sm ${
              priceVsComp === 'cheaper' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
            }`}>
              <div className="flex items-center gap-2">
                {priceVsComp === 'cheaper'
                  ? <CheckCircle size={14} className="text-green-600" />
                  : <AlertCircle size={14} className="text-orange-500" />
                }
                <span className={`text-xs font-medium ${priceVsComp === 'cheaper' ? 'text-green-800' : 'text-orange-800'}`}>
                  {priceVsComp === 'cheaper'
                    ? `Jsi nejlevnější — min. o ${Math.abs(priceDiff!).toLocaleString('cs-CZ')} CZK`
                    : `Jsi dražší o ${priceDiff!.toLocaleString('cs-CZ')} CZK než nejlevnější konkurent`
                  }
                </span>
              </div>
              <span className={`text-xs font-bold ${priceVsComp === 'cheaper' ? 'text-green-700' : 'text-orange-700'}`}>
                min. {lowestComp.toLocaleString('cs-CZ')} CZK
              </span>
            </div>
          )}

          {/* Competitor list */}
          <div className="p-5 space-y-2">
            {competitorUrls.length === 0 && !showAddUrl ? (
              <div className="text-center py-10">
                <Link2 size={36} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400 font-medium">Zatím žádní konkurenti</p>
                <p className="text-xs text-gray-400 mt-1">Přidejte URL produktu u vašich konkurentů.</p>
                <button onClick={() => setShowAddUrl(true)}
                  className="mt-3 flex items-center gap-1 mx-auto text-xs text-blue-600 hover:underline">
                  <Plus size={12} /> Přidat první URL
                </button>
              </div>
            ) : (
              competitorUrls.map((item) => {
                const priceRecord = competitorPrices.find(cp => cp.competitor_url === item.url)
                const isEditing = editingPriceId === (priceRecord?.id ?? item.url)
                const isHistoryOpen = expandedHistoryId === priceRecord?.id
                const history = priceRecord ? (historyData[priceRecord.id] ?? []) : []
                const hasPrice = priceRecord?.price != null
                const isCheaper = hasPrice && currentPrice != null && Number(priceRecord!.price) < currentPrice
                const isExpensive = hasPrice && currentPrice != null && Number(priceRecord!.price) > currentPrice

                return (
                  <div key={item.url} className={`rounded-xl border overflow-hidden transition ${
                    isCheaper ? 'border-red-200 bg-red-50' :
                    isExpensive ? 'border-green-100 bg-green-50' : 'border-gray-100 bg-gray-50'
                  }`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Favicon */}
                      <img src={`https://www.google.com/s2/favicons?sz=32&domain_url=https://${getDomain(item.url)}`}
                        alt="" className="w-5 h-5 flex-shrink-0 rounded"
                        onError={(e) => { e.currentTarget.style.display = 'none' }} />

                      {/* Name + link */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.name || getDomain(item.url)}</p>
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 truncate">
                          <ExternalLink size={9} className="flex-shrink-0" /> {getDomain(item.url)}
                        </a>
                      </div>

                      {/* Price + date */}
                      <div className="text-right flex-shrink-0">
                        {hasPrice ? (
                          <p className={`text-base font-bold ${isCheaper ? 'text-red-600' : isExpensive ? 'text-green-700' : 'text-gray-800'}`}>
                            {Number(priceRecord!.price).toLocaleString('cs-CZ')} CZK
                          </p>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            priceRecord?.fetch_status === 'error' ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-500'
                          }`}>
                            {priceRecord?.fetch_status === 'error' ? 'Chyba' : 'Nenačteno'}
                          </span>
                        )}
                        {priceRecord?.last_fetched_at && (
                          <p className="text-xs text-gray-400 flex items-center gap-0.5 justify-end mt-0.5">
                            <Clock size={9} />
                            {new Date(priceRecord.last_fetched_at).toLocaleDateString('cs-CZ')}
                            {priceRecord.fetch_status === 'manual' && <span className="text-yellow-600 ml-0.5">✎</span>}
                          </p>
                        )}
                      </div>

                      {/* Market badge */}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${item.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {item.market === 'CZ' ? '🇨🇿' : '🇸🇰'}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={() => handleRefreshUrl(item.url)} title="Znovu načíst"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition">
                          <RefreshCw size={13} />
                        </button>
                        <button
                          onClick={() => { setEditingPriceId(isEditing ? null : (priceRecord?.id ?? item.url)); setManualPriceInput(priceRecord?.price ? String(priceRecord.price) : '') }}
                          title="Zadat ručně"
                          className={`p-1.5 rounded-lg transition ${isEditing ? 'text-blue-600 bg-white' : 'text-gray-400 hover:text-blue-600 hover:bg-white'}`}>
                          <Edit2 size={13} />
                        </button>
                        {priceRecord && (
                          <button onClick={() => handleToggleHistory(priceRecord.id)} title="Historie"
                            className={`p-1.5 rounded-lg transition ${isHistoryOpen ? 'text-blue-600 bg-white' : 'text-gray-400 hover:text-blue-600 hover:bg-white'}`}>
                            {isHistoryOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        )}
                        <button onClick={() => removeUrlMutation.mutate(item.url)} title="Odebrat"
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Error */}
                    {priceRecord?.fetch_error && priceRecord.fetch_status === 'error' && (
                      <p className="px-4 pb-2 text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle size={10} /> {priceRecord.fetch_error}
                      </p>
                    )}

                    {/* Manual price edit */}
                    {isEditing && (
                      <div className="px-4 pb-3 pt-2 border-t border-gray-200 bg-white flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-600 font-medium">Cena s DPH (ruční zadání)</label>
                          <input type="text" value={manualPriceInput}
                            onChange={(e) => setManualPriceInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveManualPrice(priceRecord?.id ?? '')}
                            placeholder="299.00" autoFocus
                            className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <button onClick={() => handleSaveManualPrice(priceRecord?.id ?? '')} disabled={!priceRecord}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs disabled:opacity-50">
                          <Save size={11} /> Uložit
                        </button>
                        <button onClick={() => setEditingPriceId(null)} className="p-2 text-gray-400 hover:text-gray-600">
                          <X size={13} />
                        </button>
                      </div>
                    )}

                    {/* Price history */}
                    {isHistoryOpen && (
                      <div className="border-t border-gray-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                          <Clock size={11} /> Historie cen
                        </p>
                        {history.length === 0 ? (
                          <p className="text-xs text-gray-400">Zatím žádná historie.</p>
                        ) : (
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {history.map((h, i) => (
                              <div key={i} className="flex items-center justify-between text-xs py-0.5">
                                <span className="text-gray-400">{new Date(h.recorded_at).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                                <span className="font-semibold text-gray-700">{Number(h.price).toLocaleString('cs-CZ')} CZK</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── FULL-WIDTH PRICE HISTORY ────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <TrendingUp size={15} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">Vývoj cen</h2>
          {latestPrices.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{latestPrices.length} záznamů</span>
          )}
        </div>

        {latestPrices.length === 0 ? (
          <div className="text-center py-10">
            <TrendingUp size={32} className="mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">Zatím žádná historie cen.</p>
            <p className="text-xs text-gray-400 mt-1">Změny cen se budou zobrazovat zde.</p>
          </div>
        ) : (
          <div className="p-5">
            {/* Mini bar chart */}
            {(() => {
              const maxP = Math.max(...latestPrices.map(p => Number(p.current_price)))
              const minP = Math.min(...latestPrices.map(p => Number(p.current_price)))
              const range = maxP - minP || 1
              return (
                <div className="flex items-end gap-1.5 h-16 mb-4">
                  {[...latestPrices].reverse().map((p, i) => {
                    const h = Math.max(((Number(p.current_price) - minP) / range) * 100, 8)
                    const isLast = i === latestPrices.length - 1
                    return (
                      <div key={p.id} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                        <div className="absolute bottom-full mb-1 hidden group-hover:flex bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                          {Number(p.current_price).toLocaleString('cs-CZ')} {p.currency} · {new Date(p.changed_at).toLocaleDateString('cs-CZ')}
                        </div>
                        <div className="w-full rounded-t transition"
                          style={{ height: `${h}%`, backgroundColor: isLast ? '#2563eb' : '#bfdbfe' }} />
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs font-medium text-gray-400">Datum</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-400">Cena</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-400">Přeškrtnutá</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-400">Trh</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-400">Změna</th>
                  </tr>
                </thead>
                <tbody>
                  {latestPrices.map((p, i) => {
                    const prev = latestPrices[i + 1]
                    const diff = prev ? Number(p.current_price) - Number(prev.current_price) : null
                    return (
                      <tr key={p.id} className={`border-b border-gray-50 last:border-0 ${i === 0 ? 'bg-blue-50' : ''}`}>
                        <td className="py-2 text-gray-500">{new Date(p.changed_at).toLocaleDateString('cs-CZ')}</td>
                        <td className="py-2 text-right font-semibold text-gray-900">
                          {Number(p.current_price).toLocaleString('cs-CZ')} {p.currency}
                        </td>
                        <td className="py-2 text-right text-gray-400 line-through">
                          {p.old_price ? `${Number(p.old_price).toLocaleString('cs-CZ')} ${p.currency}` : '—'}
                        </td>
                        <td className="py-2 text-right text-gray-500">{p.market}</td>
                        <td className="py-2 text-right">
                          {diff != null && diff !== 0 ? (
                            <span className={`text-xs font-medium ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {diff > 0 ? '+' : ''}{diff.toLocaleString('cs-CZ')} CZK
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
