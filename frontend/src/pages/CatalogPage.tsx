import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, CheckCircle, Package, ExternalLink, ChevronDown,
  ArrowUpDown, ArrowUp, ArrowDown, X, Eye
} from 'lucide-react'
import { apiClient, API_BASE_URL } from '@/api/client'
import { useMarketStore } from '@/store/market'

interface CompetitorUrlInfo {
  url: string
  name: string
  market: string
}

interface CatalogProduct {
  id: string
  name: string
  product_code?: string | null
  ean?: string
  category?: string
  manufacturer?: string
  price_without_vat?: number
  price_vat?: number
  purchase_price?: number
  vat_rate?: number
  quantity_in_stock?: number
  unit_of_measure: string
  market?: string
  thumbnail_url?: string
  url_reference?: string
  imported_from?: string
  is_active: boolean
  watched_product_id?: string
  competitor_urls?: CompetitorUrlInfo[]
  created_at: string
  imported_at: string
}

type SortField = 'name' | 'price_vat' | 'quantity_in_stock'
type SortDir = 'asc' | 'desc'

const FLAG: Record<string, string> = { CZ: '🇨🇿', SK: '🇸🇰' }

function formatPrice(price?: number | null, decimals = 2) {
  if (price == null) return null
  return Number(price).toLocaleString('cs-CZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export default function CatalogPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedManufacturer, setSelectedManufacturer] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [addedProducts, setAddedProducts] = useState<Set<string>>(new Set())
  const [addingId, setAddingId] = useState<string | null>(null)
  const [manufacturerOpen, setManufacturerOpen] = useState(false)

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const selectedMarket = useMarketStore((state) => state.selectedMarket)

  // Categories
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ['catalogCategories'],
    queryFn: async () => {
      const r = await fetch(`${API_BASE_URL}/catalog/categories`)
      if (!r.ok) return []
      return r.json()
    },
  })

  // Manufacturers
  const { data: manufacturers = [] } = useQuery<string[]>({
    queryKey: ['catalogManufacturers'],
    queryFn: async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/catalog/manufacturers`)
        if (!r.ok) return []
        return r.json()
      } catch {
        return []
      }
    },
  })

  // Products
  const { data: products = [], isLoading } = useQuery<CatalogProduct[]>({
    queryKey: ['catalogProducts', selectedCategory, selectedManufacturer, searchTerm, selectedMarket],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedCategory) params.append('category', selectedCategory)
      if (selectedManufacturer) params.append('manufacturer', selectedManufacturer)
      if (searchTerm) params.append('search', searchTerm)
      if (selectedMarket && selectedMarket !== 'ALL') params.append('market', selectedMarket)
      const qs = params.toString()
      const r = await fetch(`${API_BASE_URL}/catalog/products${qs ? `?${qs}` : ''}`)
      if (!r.ok) return []
      return r.json()
    },
  })

  // Sort
  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      let av: any, bv: any
      if (sortField === 'name') { av = a.name; bv = b.name }
      else if (sortField === 'price_vat') { av = a.price_vat ?? -1; bv = b.price_vat ?? -1 }
      else { av = a.quantity_in_stock ?? -1; bv = b.quantity_in_stock ?? -1 }

      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv, 'cs') : bv.localeCompare(av, 'cs')
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [products, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={13} className="text-gray-400" />
    return sortDir === 'asc'
      ? <ArrowUp size={13} className="text-blue-600" />
      : <ArrowDown size={13} className="text-blue-600" />
  }

  const handleAddToWatchlist = async (product: CatalogProduct) => {
    setAddingId(product.id)
    try {
      await apiClient.createProduct({
        name: product.name,
        sku: product.ean || `catalog-${product.id}`,
        category: product.category,
        catalog_product_id: product.id,
        ean: product.ean,
        thumbnail_url: product.thumbnail_url,
        url_reference: product.url_reference,
      })
      setAddedProducts(prev => new Set(prev).add(product.id))
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['catalogProducts'] })
      // Stay on this page, just show success state
    } catch {
      // Still mark as added even if error (probably already exists)
      setAddedProducts(prev => new Set(prev).add(product.id))
    } finally {
      setAddingId(null)
    }
  }

  const activeFiltersCount = [selectedCategory, selectedManufacturer].filter(Boolean).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Katalog produktů</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading ? 'Načítám...' : `${sorted.length} produktů · Vyber které chceš sledovat`}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {/* Row 1: Search + Manufacturer */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Název, EAN, kategorie, výrobce..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Manufacturer dropdown */}
          {manufacturers.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setManufacturerOpen(o => !o)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition ${
                  selectedManufacturer
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{selectedManufacturer || 'Výrobce'}</span>
                <ChevronDown size={14} className={manufacturerOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {manufacturerOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                  <button
                    onClick={() => { setSelectedManufacturer(null); setManufacturerOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${!selectedManufacturer ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                  >
                    Všichni výrobci
                  </button>
                  {manufacturers.map((m) => (
                    <button
                      key={m}
                      onClick={() => { setSelectedManufacturer(m); setManufacturerOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selectedManufacturer === m ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Clear filters */}
          {activeFiltersCount > 0 && (
            <button
              onClick={() => { setSelectedCategory(null); setSelectedManufacturer(null) }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition"
            >
              <X size={13} />
              Zrušit filtry ({activeFiltersCount})
            </button>
          )}
        </div>

        {/* Row 2: Category chips */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                selectedCategory === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Vše
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                title={cat}
                className={`px-3 py-1 rounded-full text-xs font-medium transition max-w-[200px] truncate ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.split('|').pop()?.trim() || cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product list */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          Načítám produkty...
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium mb-1">Žádné produkty nenalezeny</p>
          <p className="text-sm text-gray-400 mb-5">Zkuste jiný vyhledávací výraz nebo importujte produkty.</p>
          <button
            onClick={() => navigate('/import')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Importovat produkty
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div className="flex-1 min-w-0">
              <button
                onClick={() => handleSort('name')}
                className="flex items-center gap-1 hover:text-gray-700 transition"
              >
                Produkt <SortIcon field="name" />
              </button>
            </div>
            <div className="w-36 text-right">
              <button
                onClick={() => handleSort('price_vat')}
                className="flex items-center gap-1 ml-auto hover:text-gray-700 transition"
              >
                Cena s DPH <SortIcon field="price_vat" />
              </button>
            </div>
            <div className="w-44 text-right">Konkurence</div>
            <div className="w-28 text-right">
              <button
                onClick={() => handleSort('quantity_in_stock')}
                className="flex items-center gap-1 ml-auto hover:text-gray-700 transition"
              >
                Sklad <SortIcon field="quantity_in_stock" />
              </button>
            </div>
            <div className="w-36 text-right">Akce</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-50">
            {sorted.map((product) => {
              const isAdded = addedProducts.has(product.id)
              const isAdding = addingId === product.id
              const isWatched = !!product.watched_product_id
              const hasCompetitors = (product.competitor_urls?.length ?? 0) > 0
              const currency = product.market === 'SK' ? 'EUR' : 'Kč'

              return (
                <div
                  key={product.id}
                  className={`flex items-center px-4 py-3.5 hover:bg-gray-50 transition ${isWatched ? 'border-l-2 border-l-green-400' : ''}`}
                >
                  {/* Product info */}
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    {product.thumbnail_url ? (
                      <img
                        src={product.thumbnail_url}
                        alt={product.name}
                        className="w-10 h-10 object-contain rounded bg-gray-50 border flex-shrink-0"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-10 h-10 bg-blue-50 rounded border flex items-center justify-center flex-shrink-0">
                        <Package size={16} className="text-blue-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                        {isWatched && (
                          <span className="flex-shrink-0 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                            Sledován
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {product.product_code && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">#{product.product_code}</span>
                        )}
                        {product.ean && (
                          <span className="text-xs text-gray-400">{product.ean}</span>
                        )}
                        {product.manufacturer && (
                          <span className="text-xs text-gray-500">· {product.manufacturer}</span>
                        )}
                        {product.category && (
                          <span className="text-xs text-gray-400 truncate max-w-[180px]" title={product.category}>
                            · {product.category.split('|').pop()?.trim() || product.category}
                          </span>
                        )}
                        {product.market && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            product.market === 'CZ' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                          }`}>
                            {FLAG[product.market] || product.market} {product.market}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Price from XML feed */}
                  <div className="w-36 text-right flex-shrink-0">
                    {product.price_vat != null ? (
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatPrice(product.price_vat)} {currency}
                        </p>
                        {product.vat_rate != null && (
                          <p className="text-xs text-gray-400">
                            DPH {Number(product.vat_rate).toFixed(0)} %
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </div>

                  {/* Competitor URLs */}
                  <div className="w-44 flex-shrink-0 flex flex-col items-end gap-1">
                    {hasCompetitors ? (
                      product.competitor_urls!.map((cu) => (
                        <a
                          key={cu.url}
                          href={cu.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={cu.url}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline max-w-full"
                        >
                          <ExternalLink size={11} className="flex-shrink-0" />
                          <span className="truncate max-w-[140px]">{cu.name}</span>
                        </a>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>

                  {/* Stock */}
                  <div className="w-28 text-right flex-shrink-0">
                    {product.quantity_in_stock != null ? (
                      <span className={`text-sm font-medium ${
                        product.quantity_in_stock > 10
                          ? 'text-green-600'
                          : product.quantity_in_stock > 0
                          ? 'text-yellow-600'
                          : 'text-red-500'
                      }`}>
                        {product.quantity_in_stock} {product.unit_of_measure}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="w-36 flex-shrink-0 flex items-center justify-end gap-2">
                    {/* Link to own e-shop */}
                    {product.url_reference && (
                      <a
                        href={product.url_reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        title="Otevřít na e-shopu"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}

                    {/* View watched product detail */}
                    {isWatched && (
                      <button
                        onClick={() => navigate(`/products/${product.watched_product_id}`)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition"
                        title="Zobrazit sledovaný produkt"
                      >
                        <Eye size={14} />
                      </button>
                    )}

                    {/* Add to watchlist */}
                    {!isWatched && (
                      <button
                        onClick={() => handleAddToWatchlist(product)}
                        disabled={isAdded || isAdding}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isAdded
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isAdded ? (
                          <><CheckCircle size={12} /><span>Přidáno</span></>
                        ) : isAdding ? (
                          <span>Přidávám...</span>
                        ) : (
                          <><Plus size={12} /><span>Sledovat</span></>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
