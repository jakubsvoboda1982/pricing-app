import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Plus, Trash2, Edit2, Save, X, Package, TrendingUp, Link2, CheckCircle } from 'lucide-react'
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
  category?: string
  ean?: string
  thumbnail_url?: string
  url_reference?: string
  competitor_urls?: CompetitorUrl[]
  current_price?: number | null
  old_price?: number | null
  market?: string
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

interface PriceEditForm {
  current_price: string
  old_price: string
  market: string
}

function authHeaders() {
  return { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showPriceForm, setShowPriceForm] = useState(false)
  const [priceForm, setPriceForm] = useState<PriceEditForm>({ current_price: '', old_price: '', market: 'CZ' })
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

  const removeUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(`${API_BASE_URL}/products/${id}/competitor-urls?url=${encodeURIComponent(url)}`, {
        method: 'DELETE',
        headers: authHeaders(),
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
      setNewUrl('')
      setShowAddUrl(false)
    } catch { /* ignore */ } finally {
      setAddingUrl(false)
    }
  }

  const handleSetPrice = () => {
    const cp = parseFloat(priceForm.current_price.replace(',', '.'))
    if (isNaN(cp)) return
    const op = priceForm.old_price ? parseFloat(priceForm.old_price.replace(',', '.')) : undefined
    setPriceMutation.mutate({ current_price: cp, old_price: op, market: priceForm.market })
  }

  if (isLoading || !product) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Načítám produkt...</p>
      </div>
    )
  }

  const currentPrice = product.current_price != null ? Number(product.current_price) : null
  const competitorUrls = product.competitor_urls || []
  const latestPrices = (prices as PriceRecord[]).slice(0, 5)

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/products')} className="hover:text-gray-900 flex items-center gap-1">
          <ArrowLeft size={15} />
          Produkty
        </button>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate">{product.name}</span>
      </div>

      {/* Product Header */}
      <div>
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
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-gray-500">{product.sku}</span>
              {product.category && <span className="text-sm text-gray-500">· {product.category}</span>}
              {product.market && (
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  product.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {product.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                </span>
              )}
              {product.ean && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">EAN: {product.ean}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT: Cenotvorba */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Cenotvorba</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPriceForm(!showPriceForm)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition"
              >
                <Edit2 size={13} />
                Upravit ručně
              </button>
              {product.url_reference && (
                <a
                  href={product.url_reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-gray-600 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200 transition"
                  title="Otevřít na e-shopu"
                >
                  <ExternalLink size={13} />
                  Na e-shopu
                </a>
              )}
            </div>
          </div>

          {/* Price edit form */}
          {showPriceForm && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600 font-medium">Aktuální cena *</label>
                  <input
                    type="text"
                    value={priceForm.current_price}
                    onChange={(e) => setPriceForm(p => ({ ...p, current_price: e.target.value }))}
                    placeholder="49.90"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 font-medium">Slevová cena</label>
                  <input
                    type="text"
                    value={priceForm.old_price}
                    onChange={(e) => setPriceForm(p => ({ ...p, old_price: e.target.value }))}
                    placeholder="59.90"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
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
                  <Save size={12} />
                  {setPriceMutation.isPending ? 'Ukládám...' : 'Uložit'}
                </button>
                <button onClick={() => setShowPriceForm(false)}
                  className="p-1 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Price boxes */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={`rounded-lg p-3 text-center ${currentPrice != null ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-500 mb-1">AKTUÁLNÍ CENA</p>
              <p className={`text-xl font-bold ${currentPrice != null ? 'text-blue-700' : 'text-gray-400'}`}>
                {currentPrice != null ? `${currentPrice.toLocaleString('cs-CZ')} CZK` : '— CZK'}
              </p>
            </div>
            <div className={`rounded-lg p-3 text-center ${product.old_price != null ? 'bg-orange-50' : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-500 mb-1">SLEVOVÁ CENA</p>
              <p className={`text-xl font-bold ${product.old_price != null ? 'text-orange-600' : 'text-gray-400'}`}>
                {product.old_price != null ? `${Number(product.old_price).toLocaleString('cs-CZ')} CZK` : '— CZK'}
              </p>
            </div>
          </div>

          {/* Additional fields - placeholder rows */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
              <span className="text-gray-500">Nákupní cena</span>
              <span className="text-gray-400 text-xs">Nenastaveno</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
              <span className="text-gray-500">Minimální cena</span>
              <span className="text-gray-400 text-xs">Nenastaveno</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
              <span className="text-gray-500">Aktuální marže</span>
              <span className="text-gray-400 text-xs">—</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-gray-500">Trh</span>
              <span className="text-gray-700 font-medium text-xs">{product.market || 'CZ'}</span>
            </div>
          </div>
        </div>

        {/* MIDDLE: Ceny konkurentů */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Ceny konkurentů</h2>
            <button
              onClick={() => setShowAddUrl(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition"
            >
              <Link2 size={13} />
              Přidat URL
            </button>
          </div>

          {/* Add URL form */}
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
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://grizly.cz/produkt/..."
                autoFocus
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button onClick={handleAddUrl} disabled={addingUrl || !newUrl.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs disabled:opacity-50">
                  {addingUrl ? 'Přidávám...' : 'Přidat'}
                </button>
                <button onClick={() => { setShowAddUrl(false); setNewUrl('') }}
                  className="text-gray-500 px-3 py-1 rounded text-xs hover:bg-gray-100">
                  Zrušit
                </button>
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
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                    item.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {item.market === 'CZ' ? '🇨🇿' : '🇸🇰'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{item.name}</p>
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline truncate flex items-center gap-0.5">
                      <ExternalLink size={10} className="flex-shrink-0" />
                      {getDomain(item.url)}
                    </a>
                  </div>
                  <button onClick={() => removeUrlMutation.mutate(item.url)}
                    className="text-gray-400 hover:text-red-600 flex-shrink-0 p-0.5">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Vývoj cen */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-gray-600" />
              <h2 className="font-semibold text-gray-900">Vývoj cen</h2>
            </div>

            {latestPrices.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400">Not enough history data to plot a chart.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {latestPrices.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-500">
                      {new Date(p.changed_at).toLocaleDateString('cs-CZ')}
                    </span>
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

          {/* Hero Score placeholder */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-gray-600" />
              <h2 className="font-semibold text-gray-900">Hero skóre</h2>
            </div>
            <p className="text-sm text-gray-400 text-center py-4">Pro tento produkt zatím není hero skóre.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
