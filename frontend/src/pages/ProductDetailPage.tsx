import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Plus, Trash2, Edit2, Save, X, Package, TrendingUp, Link2, ShoppingCart, Factory } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

interface CompetitorUrl {
  url: string
  name: string
  market: string
}

interface Product {
  id: string
  name: string
  sku: string
  product_code?: string | null
  category?: string
  ean?: string
  thumbnail_url?: string
  url_reference?: string
  competitor_urls?: CompetitorUrl[]
  current_price?: number | null
  old_price?: number | null
  market?: string
  purchase_price_without_vat?: number | null
  purchase_vat_rate?: number | null
  purchase_price_with_vat?: number | null
  manufacturing_cost?: number | null
  manufacturing_cost_with_vat?: number | null
  min_price?: number | null
  margin?: number | null
  hero_score?: number | null
  lowest_competitor_price?: number | null
  stock_quantity?: number | null
  created_at: string
}

interface PriceRecord {
  id: string
  market: string
  currency: string
  current_price: number
  old_price?: number | null
  changed_at: string
}

function authHeaders() {
  return { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

function fmt(val: number | null | undefined, decimals = 2): string {
  if (val == null) return '—'
  return val.toLocaleString('cs-CZ', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// Hero Score component
function HeroScoreGauge({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 0), 100)
  const color = pct >= 80 ? '#16a34a' : pct >= 60 ? '#ca8a04' : pct >= 40 ? '#ea580c' : '#dc2626'
  const label = pct >= 80 ? 'Výborné' : pct >= 60 ? 'Dobré' : pct >= 40 ? 'Průměrné' : 'Slabé'

  // SVG arc gauge — half circle
  const r = 40
  const cx = 60, cy = 60
  const startAngle = -180
  const endAngle = startAngle + (pct / 100) * 180
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const arcX = (a: number) => cx + r * Math.cos(toRad(a))
  const arcY = (a: number) => cy + r * Math.sin(toRad(a))

  const trackPath = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 0 1 ${arcX(0)} ${arcY(0)}`
  const fillPath = pct > 0
    ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${arcX(endAngle)} ${arcY(endAngle)}`
    : ''

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-32 h-20">
        <path d={trackPath} fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
        {fillPath && (
          <path d={fillPath} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="18" fontWeight="700" fill={color}>
          {pct}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#6b7280">
          / 100
        </text>
      </svg>
      <span className="text-sm font-semibold mt-1" style={{ color }}>{label}</span>
    </div>
  )
}

// Score breakdown item
function ScoreItem({ label, pts, max }: { label: string; pts: number; max: number }) {
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-gray-600 flex-1">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(pts / max) * 100}%`, backgroundColor: pts >= max ? '#16a34a' : pts > 0 ? '#ca8a04' : '#e5e7eb' }}
          />
        </div>
        <span className={`font-semibold w-10 text-right ${pts >= max ? 'text-green-600' : pts > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>
          {pts}/{max}
        </span>
      </div>
    </div>
  )
}

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
    mutationFn: async (data: { purchase_price_without_vat?: number; purchase_vat_rate?: number; manufacturing_cost?: number; min_price?: number; clear_purchase_price?: boolean; clear_manufacturing_cost?: boolean }) => {
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
      setNewUrl(''); setShowAddUrl(false)
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
      const minPriceWithVat = cost * (1 + pvr / 100)
      setPricingMutation.mutate({ purchase_price_without_vat: cost, purchase_vat_rate: pvr, min_price: minPriceWithVat })
    } else if (showPricingForm === 'manufacturing') {
      const cost = parseFloat(pricingForm.manufacturing_cost.replace(',', '.'))
      if (isNaN(cost) || cost <= 0) return
      const minPriceWithVat = cost * (1 + pvr / 100)
      setPricingMutation.mutate({ manufacturing_cost: cost, purchase_vat_rate: pvr, min_price: minPriceWithVat })
    }
  }

  const handleClearPurchasePrice = () => {
    setPricingMutation.mutate({ clear_purchase_price: true })
  }

  const handleClearManufacturingCost = () => {
    setPricingMutation.mutate({ clear_manufacturing_cost: true })
  }

  if (isLoading || !product) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Načítám produkt...</p></div>
  }

  const currentPrice = product.current_price != null ? Number(product.current_price) : null
  const purchasePriceWithoutVat = product.purchase_price_without_vat != null ? Number(product.purchase_price_without_vat) : null
  const purchasePriceWithVat = product.purchase_price_with_vat != null ? Number(product.purchase_price_with_vat) : null
  const manufacturingCost = product.manufacturing_cost != null ? Number(product.manufacturing_cost) : null
  const manufacturingCostWithVat = product.manufacturing_cost_with_vat != null ? Number(product.manufacturing_cost_with_vat) : null
  const purchaseVatRate = product.purchase_vat_rate != null ? Number(product.purchase_vat_rate) : 12
  const minPrice = product.min_price != null ? Number(product.min_price) : null
  const lowestCompetitorPrice = product.lowest_competitor_price != null ? Number(product.lowest_competitor_price) : null
  const margin = product.margin != null ? Number(product.margin) : null
  const heroScore = product.hero_score ?? 0
  const competitorUrls = product.competitor_urls || []
  const latestPrices = (prices as PriceRecord[]).slice(0, 8)

  // Hero Score breakdown
  const priceSet = currentPrice != null ? 25 : 0
  const hasCost = (purchasePriceWithoutVat != null && purchasePriceWithoutVat > 0) || (manufacturingCost != null && manufacturingCost > 0)
  const purchaseSet = hasCost ? 15 : 0
  const competitorSet = competitorUrls.length >= 1 ? 15 : 0
  const minSet = minPrice != null ? 10 : 0
  const marginPts = heroScore - priceSet - purchaseSet - competitorSet - minSet

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/products')} className="hover:text-gray-900 flex items-center gap-1">
          <ArrowLeft size={15} /> Produkty
        </button>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate">{product.name}</span>
      </div>

      {/* Product Header */}
      <div className="flex items-start gap-4">
        {product.thumbnail_url ? (
          <img src={product.thumbnail_url} alt={product.name}
            className="w-16 h-16 object-contain rounded-lg bg-gray-50 border flex-shrink-0"
            onError={(e) => { e.currentTarget.style.display = 'none' }} />
        ) : (
          <div className="w-16 h-16 bg-blue-50 rounded-lg border flex items-center justify-center flex-shrink-0">
            <Package size={28} className="text-blue-300" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <span className="text-sm font-mono bg-gray-100 text-gray-700 px-2.5 py-1 rounded">SKU: {product.sku}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {product.product_code && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">PRODUCTNO: {product.product_code}</span>}
            {product.category && <span className="text-sm text-gray-500">· {product.category}</span>}
            {product.market && (
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${product.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                {product.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
              </span>
            )}
            {product.ean && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">EAN: {product.ean}</span>}
            {product.stock_quantity != null && (
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                product.stock_quantity > 10 ? 'bg-green-100 text-green-700'
                : product.stock_quantity > 0 ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-700'
              }`}>
                📦 Sklad: {product.stock_quantity} ks
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT: Cenotvorba */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Cenotvorba</h2>
            <div className="flex gap-2">
              <button onClick={() => { setShowPriceForm(!showPriceForm); setShowPricingForm(null) }}
                className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition">
                <Edit2 size={13} /> Upravit ručně
              </button>
              {product.url_reference && (
                <a href={product.url_reference} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-gray-600 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200 transition">
                  <ExternalLink size={13} /> Na e-shopu
                </a>
              )}
            </div>
          </div>

          {/* Selling price edit form */}
          {showPriceForm && (
            <div className="p-3 bg-blue-50 rounded-lg space-y-3">
              <p className="text-xs font-medium text-gray-700">Prodejní cena</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600">Aktuální cena *</label>
                  <input type="text" value={priceForm.current_price}
                    onChange={(e) => setPriceForm(p => ({ ...p, current_price: e.target.value }))}
                    placeholder="299.00"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Přeškrtnutá cena</label>
                  <input type="text" value={priceForm.old_price}
                    onChange={(e) => setPriceForm(p => ({ ...p, old_price: e.target.value }))}
                    placeholder="349.00"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {(['CZ', 'SK'] as const).map(m => (
                    <button key={m} onClick={() => setPriceForm(p => ({ ...p, market: m }))}
                      className={`px-2 py-1 rounded text-xs font-medium ${priceForm.market === m ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600'}`}>
                      {m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                    </button>
                  ))}
                </div>
                <button onClick={handleSetPrice} disabled={setPriceMutation.isPending}
                  className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs disabled:opacity-50">
                  <Save size={12} />{setPriceMutation.isPending ? 'Ukládám...' : 'Uložit'}
                </button>
                <button onClick={() => setShowPriceForm(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
              </div>
            </div>
          )}

          {/* Price boxes */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-lg p-3 text-center ${currentPrice != null ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-500 mb-1">AKTUÁLNÍ CENA</p>
              <p className={`text-xl font-bold ${currentPrice != null ? 'text-blue-700' : 'text-gray-400'}`}>
                {currentPrice != null ? `${currentPrice.toLocaleString('cs-CZ')} CZK` : '— CZK'}
              </p>
            </div>
            <div className={`rounded-lg p-3 text-center ${product.old_price != null ? 'bg-orange-50' : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-500 mb-1">PŘEŠKRTNUTÁ CENA</p>
              <p className={`text-xl font-bold ${product.old_price != null ? 'text-orange-600' : 'text-gray-400'}`}>
                {product.old_price != null ? `${Number(product.old_price).toLocaleString('cs-CZ')} CZK` : '— CZK'}
              </p>
            </div>
          </div>

          {/* Pricing details */}
          <div className="space-y-0">

            {/* Nákupní cena */}
            <div className="py-2 border-b border-gray-50">
              <div className="flex items-center justify-between group">
                <span className="text-sm text-gray-500 flex items-center gap-1.5">
                  <ShoppingCart size={13} className="text-gray-400" /> Nákupní cena (bez DPH)
                </span>
                <div className="flex items-center gap-1.5">
                  {purchasePriceWithoutVat != null ? (
                    <div className="text-right">
                      <span className="text-sm font-medium text-gray-800">{fmt(purchasePriceWithoutVat)} CZK</span>
                      <p className="text-xs text-gray-400">DPH: {fmt(purchaseVatRate, 0)}% → {fmt(purchasePriceWithVat)} CZK s DPH</p>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Nenastaveno</span>
                  )}
                  <button
                    onClick={() => { setShowPricingForm(showPricingForm === 'purchase' ? null : 'purchase'); setShowPriceForm(false); setPricingForm(p => ({ ...p, purchase_price_without_vat: purchasePriceWithoutVat ? String(purchasePriceWithoutVat) : '' })) }}
                    className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-blue-600 p-0.5">
                    <Edit2 size={12} />
                  </button>
                  {purchasePriceWithoutVat != null && (
                    <button
                      onClick={handleClearPurchasePrice}
                      disabled={setPricingMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-500 p-0.5">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Inline edit form – nákupní cena */}
              {showPricingForm === 'purchase' && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg space-y-2 border border-blue-100">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-600">Nákupní cena bez DPH *</label>
                      <input type="text" value={pricingForm.purchase_price_without_vat}
                        onChange={(e) => setPricingForm(p => ({ ...p, purchase_price_without_vat: e.target.value }))}
                        placeholder="200.00" autoFocus
                        className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Sazba DPH (%)</label>
                      <input type="text" value={pricingForm.purchase_vat_rate}
                        onChange={(e) => setPricingForm(p => ({ ...p, purchase_vat_rate: e.target.value }))}
                        placeholder={String(purchaseVatRate)}
                        className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Min. cena s DPH (auto)</label>
                      <div className="mt-1 w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm bg-white text-gray-700">
                        {(() => {
                          const c = parseFloat(pricingForm.purchase_price_without_vat.replace(',', '.'))
                          const v = parseFloat(pricingForm.purchase_vat_rate.replace(',', '.') || String(purchaseVatRate))
                          return !isNaN(c) && c > 0 ? fmt(c * (1 + v / 100)) : '—'
                        })()}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">* CZ potraviny obvykle 12%, ostatní položky 21%</p>
                  <div className="flex gap-2">
                    <button onClick={handleSetPricing} disabled={setPricingMutation.isPending}
                      className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs disabled:opacity-50">
                      <Save size={12} />{setPricingMutation.isPending ? 'Ukládám...' : 'Uložit'}
                    </button>
                    <button onClick={() => setShowPricingForm(null)} className="text-gray-500 px-3 py-1 rounded text-xs hover:bg-gray-100">Zrušit</button>
                  </div>
                </div>
              )}
            </div>

            {/* Výrobní cena */}
            <div className="py-2 border-b border-gray-50">
              <div className="flex items-center justify-between group">
                <span className="text-sm text-gray-500 flex items-center gap-1.5">
                  <Factory size={13} className="text-gray-400" /> Výrobní cena (bez DPH)
                </span>
                <div className="flex items-center gap-1.5">
                  {manufacturingCost != null ? (
                    <div className="text-right">
                      <span className="text-sm font-medium text-gray-800">{fmt(manufacturingCost)} CZK</span>
                      <p className="text-xs text-gray-400">DPH: {fmt(purchaseVatRate, 0)}% → {fmt(manufacturingCostWithVat)} CZK s DPH</p>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Nenastaveno</span>
                  )}
                  <button
                    onClick={() => { setShowPricingForm(showPricingForm === 'manufacturing' ? null : 'manufacturing'); setShowPriceForm(false); setPricingForm(p => ({ ...p, manufacturing_cost: manufacturingCost ? String(manufacturingCost) : '' })) }}
                    className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-blue-600 p-0.5">
                    <Edit2 size={12} />
                  </button>
                  {manufacturingCost != null && (
                    <button
                      onClick={handleClearManufacturingCost}
                      disabled={setPricingMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-500 p-0.5">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Inline edit form – výrobní cena */}
              {showPricingForm === 'manufacturing' && (
                <div className="mt-2 p-3 bg-orange-50 rounded-lg space-y-2 border border-orange-100">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-600">Výrobní cena bez DPH *</label>
                      <input type="text" value={pricingForm.manufacturing_cost}
                        onChange={(e) => setPricingForm(p => ({ ...p, manufacturing_cost: e.target.value }))}
                        placeholder="150.00" autoFocus
                        className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Sazba DPH (%)</label>
                      <input type="text" value={pricingForm.purchase_vat_rate}
                        onChange={(e) => setPricingForm(p => ({ ...p, purchase_vat_rate: e.target.value }))}
                        placeholder={String(purchaseVatRate)}
                        className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Min. cena s DPH (auto)</label>
                      <div className="mt-1 w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm bg-white text-gray-700">
                        {(() => {
                          const c = parseFloat(pricingForm.manufacturing_cost.replace(',', '.'))
                          const v = parseFloat(pricingForm.purchase_vat_rate.replace(',', '.') || String(purchaseVatRate))
                          return !isNaN(c) && c > 0 ? fmt(c * (1 + v / 100)) : '—'
                        })()}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">* CZ potraviny obvykle 12%, ostatní položky 21%</p>
                  <div className="flex gap-2">
                    <button onClick={handleSetPricing} disabled={setPricingMutation.isPending}
                      className="flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-xs disabled:opacity-50">
                      <Save size={12} />{setPricingMutation.isPending ? 'Ukládám...' : 'Uložit'}
                    </button>
                    <button onClick={() => setShowPricingForm(null)} className="text-gray-500 px-3 py-1 rounded text-xs hover:bg-gray-100">Zrušit</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-500">Minimální cena s DPH</span>
              {minPrice != null ? (
                <span className="text-sm font-medium text-gray-800">{fmt(minPrice)} CZK</span>
              ) : (
                <span className="text-xs text-gray-400">Nenastaveno</span>
              )}
            </div>

            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-500">Aktuální marže</span>
              {margin != null ? (
                <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
                  margin >= 20 ? 'bg-green-100 text-green-700' :
                  margin >= 10 ? 'bg-yellow-100 text-yellow-700' :
                  margin > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                }`}>
                  {fmt(margin, 1)} %
                </span>
              ) : (
                <span className="text-xs text-gray-400">— (nastav nákupní nebo výrobní cenu)</span>
              )}
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-500">Trh</span>
              <span className="text-sm font-medium text-gray-700">{product.market || 'CZ'}</span>
            </div>
          </div>
        </div>

        {/* MIDDLE: Ceny konkurentů */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Ceny konkurentů</h2>
            <button onClick={() => setShowAddUrl(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition">
              <Plus size={13} /> Přidat URL
            </button>
          </div>

          {lowestCompetitorPrice != null && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs text-gray-600 mb-1">Nejnižší cena konkurence:</p>
              <p className="text-lg font-bold text-blue-700">{lowestCompetitorPrice.toLocaleString('cs-CZ')} CZK</p>
              {currentPrice != null && (
                <p className="text-xs text-gray-600 mt-1">
                  {currentPrice > lowestCompetitorPrice ? '↑' : '↓'} {Math.abs(currentPrice - lowestCompetitorPrice).toLocaleString('cs-CZ')} CZK od nejnižší ceny
                </p>
              )}
            </div>
          )}

          {showAddUrl && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg space-y-2">
              <div className="flex gap-1 mb-2">
                {(['CZ', 'SK'] as const).map(m => (
                  <button key={m} onClick={() => setNewUrlMarket(m)}
                    className={`px-2 py-1 rounded text-xs font-medium ${newUrlMarket === m ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600'}`}>
                    {m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                  </button>
                ))}
              </div>
              <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://grizly.cz/produkt/..." autoFocus
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <button onClick={handleAddUrl} disabled={addingUrl || !newUrl.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs disabled:opacity-50">
                  {addingUrl ? 'Přidávám...' : 'Přidat'}
                </button>
                <button onClick={() => { setShowAddUrl(false); setNewUrl('') }}
                  className="text-gray-500 px-3 py-1 rounded text-xs hover:bg-gray-100">Zrušit</button>
              </div>
            </div>
          )}

          {competitorUrls.length === 0 ? (
            <div className="text-center py-8">
              <Link2 size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Zatím žádné ceny konkurentů.</p>
              <p className="text-xs text-gray-400 mt-1">Přidejte URL tohoto produktu u konkurentů.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {competitorUrls.map((item) => (
                <div key={item.url} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <img src={`https://www.google.com/s2/favicons?sz=32&domain_url=https://${getDomain(item.url)}`}
                    alt="" className="w-4 h-4 flex-shrink-0" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{item.name}</p>
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline truncate flex items-center gap-0.5">
                      <ExternalLink size={10} className="flex-shrink-0" />
                      {getDomain(item.url)}
                    </a>
                  </div>
                  {lowestCompetitorPrice != null && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-gray-900">
                        {lowestCompetitorPrice.toLocaleString('cs-CZ')} CZK
                      </p>
                      <p className="text-xs text-gray-400">konkurence</p>
                    </div>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                    item.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>{item.market === 'CZ' ? '🇨🇿' : '🇸🇰'}</span>
                  <button onClick={() => removeUrlMutation.mutate(item.url)}
                    className="text-gray-400 hover:text-red-600 flex-shrink-0 p-0.5">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Vývoj cen + Hero Score */}
        <div className="space-y-4">
          {/* Price history */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-gray-600" />
              <h2 className="font-semibold text-gray-900">Vývoj cen</h2>
            </div>
            {latestPrices.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Zatím žádná historie cen.</p>
            ) : (
              <div className="space-y-0">
                {latestPrices.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-500">{new Date(p.changed_at).toLocaleDateString('cs-CZ')}</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-900">
                        {Number(p.current_price).toLocaleString('cs-CZ')} {p.currency}
                      </span>
                      {p.old_price && (
                        <span className="text-xs text-gray-400 line-through ml-1.5">
                          {Number(p.old_price).toLocaleString('cs-CZ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hero Score */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Hero skóre</h2>
            <HeroScoreGauge score={heroScore} />
            <div className="mt-4 space-y-0 border-t border-gray-50 pt-3">
              <ScoreItem label="Aktuální cena nastavena" pts={priceSet} max={25} />
              <ScoreItem label="Nákupní cena nastavena" pts={purchaseSet} max={15} />
              <ScoreItem label="Kvalita marže" pts={Math.max(marginPts, 0)} max={35} />
              <ScoreItem label="Minimální cena nastavena" pts={minSet} max={10} />
              <ScoreItem label="Sleduje konkurenty" pts={competitorSet} max={15} />
            </div>
            {heroScore < 60 && (
              <div className="mt-3 p-2.5 bg-orange-50 rounded-lg text-xs text-orange-700">
                {!currentPrice && '• Nastav prodejní cenu. '}
                {!purchasePriceWithVat && '• Nastav nákupní cenu pro výpočet marže. '}
                {competitorUrls.length === 0 && '• Přidej URL konkurenta pro sledování cen.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
