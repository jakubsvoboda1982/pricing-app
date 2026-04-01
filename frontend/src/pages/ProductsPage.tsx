import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Link2, Upload, Trash2, ExternalLink, Package, AlertCircle, TrendingDown, X } from 'lucide-react'
import { apiClient } from '@/api/client'
import { useNavigate } from 'react-router-dom'
import { useMarketStore, shouldShowMarket } from '@/store/market'

interface CompetitorUrl { url: string; name: string; market: string }

interface Product {
  id: string; name: string; sku: string; product_code?: string | null
  category?: string; ean?: string; thumbnail_url?: string; url_reference?: string
  competitor_urls?: CompetitorUrl[]; current_price?: number | null
  old_price?: number | null; market?: string; purchase_price_without_vat?: number | null
  purchase_vat_rate?: number | null; purchase_price_with_vat?: number | null
  min_price?: number | null; margin?: number | null; hero_score?: number | null
  lowest_competitor_price?: number | null; stock_quantity?: number | null
  manufacturer?: string | null; catalog_price_vat?: number | null
  catalog_quantity_in_stock?: number | null; created_at: string
}

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const selectedMarket = useMarketStore(state => state.selectedMarket)

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiClient.getProducts(),
  })

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
    return matchSearch && shouldShowMarket(p.market, selectedMarket)
  })

  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map(p => p.id)))
  const toggleOne = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const all = products as Product[]
  const withPrice    = all.filter(p => p.current_price != null).length
  const noPrice      = all.length - withPrice
  const withMarginArr = all.filter(p => p.margin != null)
  const avgMargin    = withMarginArr.length ? withMarginArr.reduce((s, p) => s + Number(p.margin), 0) / withMarginArr.length : null
  const lowMargin    = withMarginArr.filter(p => Number(p.margin) < 10).length
  const noComp       = all.filter(p => !p.competitor_urls || p.competitor_urls.length === 0).length

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sledované produkty</h1>
          <p className="text-sm text-gray-400 mt-0.5">Produkty s aktuálními cenami a doporučeními.</p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      {all.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Celkem</p>
            <p className="text-2xl font-bold text-gray-900">{all.length}</p>
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
        {filtered.length !== all.length && (
          <span className="text-xs text-gray-400">{filtered.length} z {all.length}</span>
        )}
      </div>

      {/* ── TABLE ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Načítám produkty...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package size={44} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium mb-1">
            {all.length === 0 ? 'Zatím žádné sledované produkty' : 'Žádné výsledky hledání'}
          </p>
          <p className="text-sm text-gray-400 mb-5">
            {all.length === 0 ? 'Přidejte produkty z katalogu nebo je importujte.' : 'Zkuste jiný výraz.'}
          </p>
          {all.length === 0 && (
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
            <div className="w-28 text-right">Cena</div>
            <div className="w-24 text-right">Skladem</div>
            <div className="w-32 text-right">Konkurence</div>
            <div className="w-24 text-right">Marže</div>
            <div className="w-28 text-right">Hero</div>
            <div className="w-20 text-right">Akce</div>
          </div>

          <div className="divide-y divide-gray-50">
            {filtered.map(product => {
              const isSelected = selectedIds.has(product.id)
              const isConfirmDelete = confirmDeleteId === product.id
              const cp = product.current_price != null ? Number(product.current_price) : null
              const score = product.hero_score ?? 0

              return (
                <div key={product.id}>
                  <div
                    className={`flex items-center px-4 py-3.5 transition cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
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
                          {product.market && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${product.market === 'CZ' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                              {product.market === 'CZ' ? '🇨🇿' : '🇸🇰'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="w-28 text-right flex-shrink-0">
                      {cp != null ? (
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{cp.toLocaleString('cs-CZ')} CZK</span>
                          {product.old_price != null && Number(product.old_price) !== cp && (
                            <p className="text-xs text-gray-400 line-through">{Number(product.old_price).toLocaleString('cs-CZ')}</p>
                          )}
                        </div>
                      ) : product.catalog_price_vat != null ? (
                        <div>
                          <span className="text-sm font-medium text-gray-500">{Number(product.catalog_price_vat).toLocaleString('cs-CZ')} CZK</span>
                          <p className="text-xs text-indigo-400">katalog</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 bg-gray-50 px-2 py-0.5 rounded">—</span>
                      )}
                    </div>

                    {/* Skladem */}
                    <div className="w-24 text-right flex-shrink-0">
                      {(() => {
                        const qty = product.stock_quantity ?? product.catalog_quantity_in_stock
                        const fromBl = product.stock_quantity != null
                        if (qty == null) return <span className="text-xs text-gray-300">—</span>
                        return (
                          <div>
                            <span className={`text-sm font-semibold ${qty > 10 ? 'text-green-700' : qty > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {qty} ks
                            </span>
                            {!fromBl && <p className="text-xs text-gray-400">katalog</p>}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Competitors */}
                    <div className="w-36 flex-shrink-0 text-right">
                      {product.lowest_competitor_price != null ? (
                        <div>
                          <span className="text-sm font-semibold text-gray-700">{Number(product.lowest_competitor_price).toLocaleString('cs-CZ')} CZK</span>
                          <p className="text-xs text-gray-400">{product.competitor_urls?.length ?? 0} URL</p>
                        </div>
                      ) : product.competitor_urls && product.competitor_urls.length > 0 ? (
                        <span className="text-xs text-gray-400">{product.competitor_urls.length} URL</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>

                    {/* Margin */}
                    <div className="w-24 text-right flex-shrink-0">
                      {product.margin != null ? (
                        <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                          Number(product.margin) >= 20 ? 'bg-green-100 text-green-700'
                          : Number(product.margin) >= 10 ? 'bg-yellow-100 text-yellow-700'
                          : Number(product.margin) > 0 ? 'bg-orange-100 text-orange-700'
                          : 'bg-red-100 text-red-700'
                        }`}>{Number(product.margin).toFixed(1)} %</span>
                      ) : <span className="text-sm text-gray-300">—</span>}
                    </div>

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

      {/* Bulk bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selectedIds.size} produktů vybráno</span>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
            <X size={12} /> Zrušit výběr
          </button>
          <button onClick={() => { selectedIds.forEach(id => deleteMutation.mutate(id)); setSelectedIds(new Set()) }}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium transition">
            <Trash2 size={13} /> Odebrat vše
          </button>
        </div>
      )}
    </div>
  )
}
