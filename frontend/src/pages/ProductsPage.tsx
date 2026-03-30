import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Link2, Upload, Trash2, ExternalLink, Package, Star } from 'lucide-react'
import { apiClient } from '@/api/client'
import { useNavigate } from 'react-router-dom'
import { useMarketStore, shouldShowMarket } from '@/store/market'

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
  purchase_price?: number | null
  min_price?: number | null
  margin?: number | null
  hero_score?: number | null
  created_at: string
}

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const selectedMarket = useMarketStore((state) => state.selectedMarket)

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

  const filtered = (products as Product[]).filter((p) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    const matchMarket = shouldShowMarket(p.market, selectedMarket)
    return matchSearch && matchMarket
  })

  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const formatPrice = (price?: number | null) => {
    if (price == null) return '—'
    return `${Number(price).toLocaleString('cs-CZ')} CZK`
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sledované produkty</h1>
          <p className="text-sm text-gray-500 mt-0.5">Produkty, které sledujete — s aktuálními cenami a doporučeními.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Count badge */}
          <span className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">
            <Star size={14} />
            {products.length} produktů
          </span>
          {/* Margin summary */}
          {(() => {
            const withMargin = (products as Product[]).filter(p => p.margin != null)
            if (withMargin.length === 0) return null
            const avg = withMargin.reduce((s, p) => s + Number(p.margin), 0) / withMargin.length
            return (
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                avg >= 20 ? 'bg-green-100 text-green-700' : avg >= 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
              }`}>
                Ø marže {avg.toFixed(1)} %
              </span>
            )
          })()}
          <button
            onClick={() => navigate('/import')}
            className="flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-sm transition"
          >
            <Link2 size={15} />
            Přidat z URL
          </button>
          <button
            onClick={() => navigate('/catalog')}
            className="flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-sm transition"
          >
            <Plus size={15} />
            Přidat produkty
          </button>
          <button
            onClick={() => navigate('/import')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
          >
            <Upload size={15} />
            Importovat produkty
          </button>
        </div>
      </div>

      {/* Search + Market Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat ve sledovaných produktech..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {(['ALL', 'CZ', 'SK'] as const).map((m) => (
            <button
              key={m}
              onClick={() => useMarketStore.setState({ selectedMarket: m })}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                selectedMarket === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {m === 'ALL' ? 'Všechny trhy' : m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          Načítám produkty...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium mb-1">
            {products.length === 0 ? 'Zatím žádné sledované produkty' : 'Žádné výsledky hledání'}
          </p>
          <p className="text-sm text-gray-400 mb-5">
            {products.length === 0 ? 'Přidejte produkty z katalogu nebo je importujte.' : 'Zkuste jiný vyhledávací výraz.'}
          </p>
          {products.length === 0 && (
            <button
              onClick={() => navigate('/catalog')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              Vybrat z katalogu
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div className="w-8 flex-shrink-0">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-gray-300"
              />
            </div>
            <div className="flex-1">Produkt</div>
            <div className="w-36 text-right">Cena</div>
            <div className="w-28 text-right">Marže</div>
            <div className="w-36 text-right">Hero Score</div>
            <div className="w-24 text-right">Akce</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-50">
            {filtered.map((product) => {
              const isSelected = selectedIds.has(product.id)
              const isConfirmDelete = confirmDeleteId === product.id
              const currentPrice = product.current_price != null ? Number(product.current_price) : null

              return (
                <div key={product.id}>
                  <div
                    className={`flex items-center px-4 py-3.5 hover:bg-gray-50 transition cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('input[type="checkbox"]') ||
                          (e.target as HTMLElement).closest('button') ||
                          (e.target as HTMLElement).closest('a')) return
                      navigate(`/products/${product.id}`)
                    }}
                  >
                    {/* Checkbox */}
                    <div className="w-8 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(product.id)}
                        className="rounded border-gray-300"
                      />
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      {product.thumbnail_url ? (
                        <img
                          src={product.thumbnail_url}
                          alt={product.name}
                          className="w-9 h-9 object-contain rounded bg-gray-50 border flex-shrink-0"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-9 h-9 bg-blue-50 rounded border flex items-center justify-center flex-shrink-0">
                          <Package size={16} className="text-blue-300" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-400">{product.sku}</span>
                          {product.category && (
                            <span className="text-xs text-gray-500">· {product.category}</span>
                          )}
                          {product.market && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              product.market === 'CZ' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                            }`}>
                              {product.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Current Price */}
                    <div className="w-36 text-right">
                      {currentPrice != null ? (
                        <div>
                          <span className="text-sm font-semibold text-gray-900">
                            {currentPrice.toLocaleString('cs-CZ')} CZK
                          </span>
                          {product.old_price != null && Number(product.old_price) !== currentPrice && (
                            <p className="text-xs text-gray-400 line-through">
                              {Number(product.old_price).toLocaleString('cs-CZ')} CZK
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">— CZK</span>
                      )}
                    </div>

                    {/* Margin */}
                    <div className="w-28 text-right">
                      {product.margin != null ? (
                        <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                          Number(product.margin) >= 20
                            ? 'bg-green-100 text-green-700'
                            : Number(product.margin) >= 10
                            ? 'bg-yellow-100 text-yellow-700'
                            : Number(product.margin) > 0
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {Number(product.margin).toFixed(1)} %
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>

                    {/* Hero Score */}
                    <div className="w-36 text-right">
                      {product.hero_score != null ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                product.hero_score >= 80 ? 'bg-green-500'
                                : product.hero_score >= 60 ? 'bg-yellow-400'
                                : product.hero_score >= 40 ? 'bg-orange-400'
                                : 'bg-red-400'
                              }`}
                              style={{ width: `${product.hero_score}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600">{product.hero_score}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="w-24 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {product.url_reference && (
                        <a
                          href={product.url_reference}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                          title="Otevřít na e-shopu"
                        >
                          <ExternalLink size={15} />
                        </a>
                      )}
                      <button
                        onClick={() => setConfirmDeleteId(product.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="Odebrat ze sledování"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Confirm Delete Row */}
                  {isConfirmDelete && (
                    <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 border-t border-red-100">
                      <p className="text-sm text-red-700 font-medium">
                        Odebrat <strong>{product.name}</strong> ze sledování? (Zůstane v katalogu produktů.)
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50"
                        >
                          Zrušit
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(product.id)}
                          disabled={deleteMutation.isPending}
                          className="px-3 py-1 text-sm text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
                        >
                          {deleteMutation.isPending ? 'Odebírám...' : 'Odebrat ze sledování'}
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

      {/* Bulk delete bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-4 z-50">
          <span className="text-sm">{selectedIds.size} produktů vybráno</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-400 hover:text-white"
          >
            Zrušit výběr
          </button>
        </div>
      )}
    </div>
  )
}
